-- Milestone 4: atomic publication, study codes, anonymous participant
-- enrollment, persistent simple-random assignment, and session creation.

drop policy researcher_posts on public.posts;
create policy researcher_posts on public.posts
for all to authenticated using (public.owns_experiment(experiment_id))
with check (public.owns_experiment(experiment_id));

create or replace function public.publish_experiment(target_experiment_id uuid)
returns table (publication_snapshot_id uuid, study_code text)
language plpgsql security definer set search_path = '' as $$
declare
  source_experiment public.experiments%rowtype;
  next_snapshot_number integer;
  new_snapshot_id uuid := extensions.gen_random_uuid();
  new_code text;
  condition_row public.conditions%rowtype;
  post_row public.posts%rowtype;
  new_condition_id uuid;
  new_post_id uuid;
begin
  select * into source_experiment from public.experiments where id = target_experiment_id;
  if source_experiment.id is null or source_experiment.owner_id <> auth.uid() then
    raise exception 'Experiment not found or not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conditions where experiment_id = target_experiment_id) then
    raise exception 'Add at least one condition before publishing' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.conditions c
    where c.experiment_id = target_experiment_id
      and not exists (select 1 from public.posts p where p.condition_id = c.id)
  ) then
    raise exception 'Every condition must contain at least one Post' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_experiment_id::text, 1));
  select coalesce(max(snapshot_number), 0) + 1 into next_snapshot_number
  from public.publication_snapshots where experiment_id = target_experiment_id;

  insert into public.publication_snapshots (
    id, experiment_id, snapshot_number, experiment_name, experiment_description,
    session_mode, session_duration_seconds, time_display, post_order_mode
  ) values (
    new_snapshot_id, source_experiment.id, next_snapshot_number,
    source_experiment.name, source_experiment.description, source_experiment.session_mode,
    source_experiment.session_duration_seconds, 'hidden', 'fixed'
  );

  for condition_row in
    select * from public.conditions where experiment_id = target_experiment_id order by position
  loop
    new_condition_id := extensions.gen_random_uuid();
    insert into public.publication_conditions (
      id, publication_snapshot_id, experiment_id, source_condition_id,
      name, position, post_order_mode, time_display
    ) values (
      new_condition_id, new_snapshot_id, target_experiment_id, condition_row.id,
      condition_row.name, condition_row.position, condition_row.post_order_mode,
      case when source_experiment.session_mode = 'time_controlled'
        then condition_row.time_display else 'hidden' end
    );

    for post_row in
      select * from public.posts where condition_id = condition_row.id order by position
    loop
      new_post_id := extensions.gen_random_uuid();
      insert into public.publication_posts (
        id, publication_snapshot_id, publication_condition_id, experiment_id,
        source_post_id, position, original_youtube_url, youtube_video_id,
        video_duration_seconds, short_description, display_likes, display_shares,
        creator_profile_id, creator_display_name, creator_handle,
        creator_profile_description, creator_profile_image_path,
        description_source, presented_description
      ) values (
        new_post_id, new_snapshot_id, new_condition_id, target_experiment_id,
        post_row.id, post_row.position, post_row.original_youtube_url,
        post_row.youtube_video_id, post_row.video_duration_seconds, '',
        post_row.display_likes, post_row.display_shares, null, null, null, null,
        null, 'post_short_description', ''
      );

      insert into public.publication_seeded_comments (
        publication_snapshot_id, publication_post_id, display_name,
        comment_text, display_likes, position
      ) select new_snapshot_id, new_post_id, display_name, comment_text,
        display_likes, position from public.seeded_comments
        where post_id = post_row.id order by position;
    end loop;
  end loop;

  update public.study_codes set is_active = false, deactivated_at = now()
  where experiment_id = target_experiment_id and is_active;
  loop
    new_code := upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.study_codes where code = new_code);
  end loop;
  insert into public.study_codes (code, experiment_id, publication_snapshot_id)
  values (new_code, target_experiment_id, new_snapshot_id);
  update public.experiments set status = 'published', published_at = coalesce(published_at, now())
  where id = target_experiment_id;

  return query select new_snapshot_id, new_code;
end;
$$;

create or replace function public.join_study(target_code text)
returns table (
  participant_id uuid, experiment_id uuid, publication_snapshot_id uuid,
  publication_condition_id uuid, condition_name text, assignment_id uuid,
  session_id uuid, session_mode public.session_mode,
  session_duration_seconds integer, time_display public.time_display_mode,
  post_order_mode public.post_order_mode
)
language plpgsql security definer set search_path = '' as $$
declare
  normalized_code text := upper(btrim(target_code));
  code_row public.study_codes%rowtype;
  snapshot_row public.publication_snapshots%rowtype;
  existing_assignment public.assignments%rowtype;
  selected_condition public.publication_conditions%rowtype;
  active_session public.sessions%rowtype;
  generated_session_id uuid;
  draw_value numeric(17,16);
  condition_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into code_row from public.study_codes where code = normalized_code and is_active;
  if code_row.code is null then raise exception 'Study code is invalid or inactive' using errcode = 'P0002'; end if;
  select * into snapshot_row from public.publication_snapshots where id = code_row.publication_snapshot_id;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || code_row.experiment_id::text, 2));
  insert into public.participants (id) values (auth.uid()) on conflict (id) do nothing;

  if exists (
    select 1 from public.sessions s where s.participant_id = auth.uid()
      and s.experiment_id = code_row.experiment_id and s.status = 'completed'
  ) then
    raise exception 'This participant has already completed this study' using errcode = '23505';
  end if;

  select a.* into existing_assignment from public.assignments a
  where a.participant_id = auth.uid() and a.experiment_id = code_row.experiment_id;
  if existing_assignment.id is null then
    select count(*) into condition_count from public.publication_conditions pc
    where pc.publication_snapshot_id = code_row.publication_snapshot_id;
    if condition_count = 0 then raise exception 'Published study has no conditions' using errcode = '22023'; end if;
    draw_value := least(random()::numeric(17,16), 0.9999999999999999);
    select pc.* into selected_condition from public.publication_conditions pc
    where pc.publication_snapshot_id = code_row.publication_snapshot_id
    order by pc.position, pc.id offset floor(draw_value * condition_count)::integer limit 1;
    insert into public.assignments (
      participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, random_draw, candidate_condition_count
    ) values (
      auth.uid(), code_row.experiment_id, code_row.publication_snapshot_id,
      selected_condition.id, draw_value, condition_count
    ) returning * into existing_assignment;
  else
    select * into selected_condition from public.publication_conditions
    where id = existing_assignment.publication_condition_id;
    select * into snapshot_row from public.publication_snapshots
    where id = existing_assignment.publication_snapshot_id;
  end if;

  select s.* into active_session from public.sessions s where s.participant_id = auth.uid()
    and s.experiment_id = code_row.experiment_id and s.status = 'started';
  if active_session.id is null then
    generated_session_id := extensions.gen_random_uuid();
    insert into public.sessions (
      id, assignment_id, participant_id, experiment_id,
      publication_snapshot_id, publication_condition_id, started_at
    ) values (
      generated_session_id, existing_assignment.id, auth.uid(), existing_assignment.experiment_id,
      existing_assignment.publication_snapshot_id, existing_assignment.publication_condition_id, now()
    ) returning * into active_session;
    perform public.materialize_session_post_order(active_session.id);
  end if;

  return query select auth.uid(), existing_assignment.experiment_id,
    existing_assignment.publication_snapshot_id, existing_assignment.publication_condition_id,
    selected_condition.name, existing_assignment.id, active_session.id,
    snapshot_row.session_mode, snapshot_row.session_duration_seconds,
    selected_condition.time_display, selected_condition.post_order_mode;
end;
$$;

revoke all on function public.publish_experiment(uuid) from public;
grant execute on function public.publish_experiment(uuid) to authenticated;
revoke all on function public.join_study(text) from public;
grant execute on function public.join_study(text) to authenticated;
