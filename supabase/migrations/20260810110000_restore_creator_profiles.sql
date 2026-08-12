-- Restore researcher-configured creator presentation now that participant and
-- preview layouts mask YouTube's conflicting channel chrome.

create policy participant_assigned_creator_image_read on storage.objects
for select to authenticated using (
  bucket_id = 'creator-images'
  and exists (
    select 1
    from public.publication_posts pp
    join public.sessions s on s.publication_snapshot_id = pp.publication_snapshot_id
    where pp.creator_profile_image_path = name
      and s.participant_id = auth.uid()
  )
);

comment on table public.creator_profiles is
'Reusable researcher-configured creator identities presented in the participant feed.';
comment on column public.posts.creator_profile_id is
'Reusable creator profile assigned to this Post; required by publication validation.';

drop policy researcher_posts on public.posts;
create policy researcher_posts on public.posts
for all to authenticated
using (public.owns_experiment(experiment_id))
with check (public.owns_experiment(experiment_id) and public.owns_creator(creator_profile_id));

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
  creator_row public.creator_profiles%rowtype;
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
    select 1 from public.conditions c where c.experiment_id = target_experiment_id
      and not exists (select 1 from public.posts p where p.condition_id = c.id)
  ) then
    raise exception 'Every condition must contain at least one Post' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.posts p left join public.creator_profiles cp on cp.id = p.creator_profile_id
    where p.experiment_id = target_experiment_id
      and (cp.id is null or cp.owner_id <> source_experiment.owner_id)
  ) then
    raise exception 'Every Post must have a valid creator profile' using errcode = '22023';
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

  for condition_row in select * from public.conditions where experiment_id = target_experiment_id order by position loop
    new_condition_id := extensions.gen_random_uuid();
    insert into public.publication_conditions (
      id, publication_snapshot_id, experiment_id, source_condition_id,
      name, position, post_order_mode, time_display
    ) values (
      new_condition_id, new_snapshot_id, target_experiment_id, condition_row.id,
      condition_row.name, condition_row.position, condition_row.post_order_mode,
      case when source_experiment.session_mode = 'time_controlled' then condition_row.time_display else 'hidden' end
    );

    for post_row in select * from public.posts where condition_id = condition_row.id order by position loop
      select * into creator_row from public.creator_profiles where id = post_row.creator_profile_id;
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
        post_row.display_likes, post_row.display_shares, creator_row.id,
        creator_row.display_name, creator_row.handle, creator_row.profile_description,
        creator_row.profile_image_path, 'post_short_description', ''
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
