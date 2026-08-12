-- Post-order randomization is configured per condition. Legacy experiment-level
-- values are copied into each condition so existing local work is preserved.

alter table public.conditions
add column post_order_mode public.post_order_mode not null default 'fixed';

update public.conditions c
set post_order_mode = e.post_order_mode
from public.experiments e
where e.id = c.experiment_id;

alter table public.publication_conditions
add column post_order_mode public.post_order_mode not null default 'fixed';

update public.publication_conditions pc
set post_order_mode = ps.post_order_mode
from public.publication_snapshots ps
where ps.id = pc.publication_snapshot_id;

create or replace function public.materialize_session_post_order(target_session_id uuid)
returns table (publication_post_id uuid, presentation_position integer)
language plpgsql security definer set search_path = '' as $$
declare
  target_session public.sessions%rowtype;
  selected_mode public.post_order_mode;
  generated_seed uuid;
begin
  select * into target_session from public.sessions where id = target_session_id;
  if target_session.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if auth.uid() <> target_session.participant_id and not public.owns_experiment(target_session.experiment_id) then
    raise exception 'Session not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_session.id::text, 0));
  if exists (select 1 from public.session_post_order where session_id = target_session.id) then
    return query select spo.publication_post_id, spo.presentation_position
      from public.session_post_order spo where spo.session_id = target_session.id order by spo.presentation_position;
    return;
  end if;
  select pc.post_order_mode into selected_mode from public.publication_conditions pc
    where pc.id = target_session.publication_condition_id;
  if selected_mode = 'per_participant_randomized' then
    generated_seed := extensions.gen_random_uuid();
    update public.sessions set post_order_mode = selected_mode, post_order_seed = generated_seed,
      post_order_algorithm = 'sha256_seeded_v1' where id = target_session.id;
    insert into public.session_post_order (
      session_id, participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, publication_post_id, configured_position, presentation_position
    ) select target_session.id, target_session.participant_id, target_session.experiment_id,
      target_session.publication_snapshot_id, target_session.publication_condition_id, pp.id, pp.position,
      row_number() over (order by extensions.digest(pp.id::text || generated_seed::text, 'sha256'), pp.id)::integer - 1
      from public.publication_posts pp where pp.publication_condition_id = target_session.publication_condition_id;
  else
    update public.sessions set post_order_mode = 'fixed', post_order_seed = null,
      post_order_algorithm = 'configured_position_v1' where id = target_session.id;
    insert into public.session_post_order (
      session_id, participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, publication_post_id, configured_position, presentation_position
    ) select target_session.id, target_session.participant_id, target_session.experiment_id,
      target_session.publication_snapshot_id, target_session.publication_condition_id, pp.id, pp.position,
      row_number() over (order by pp.position, pp.id)::integer - 1
      from public.publication_posts pp where pp.publication_condition_id = target_session.publication_condition_id;
  end if;
  return query select spo.publication_post_id, spo.presentation_position
    from public.session_post_order spo where spo.session_id = target_session.id order by spo.presentation_position;
end;
$$;

create or replace function public.duplicate_condition(source_condition_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source_condition public.conditions%rowtype;
  duplicated_condition_id uuid := extensions.gen_random_uuid();
  duplicated_post_id uuid;
  source_post record;
  next_position integer;
begin
  select * into source_condition from public.conditions where id = source_condition_id;
  if source_condition.id is null or not public.owns_experiment(source_condition.experiment_id) then
    raise exception 'Condition not found or not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(source_condition.experiment_id::text, 0));
  select coalesce(max(position), -1) + 1 into next_position from public.conditions
    where experiment_id = source_condition.experiment_id;
  insert into public.conditions (id, experiment_id, name, position, post_order_mode)
  values (duplicated_condition_id, source_condition.experiment_id,
    source_condition.name || ' copy', next_position, source_condition.post_order_mode);
  for source_post in select * from public.posts where condition_id = source_condition_id order by position loop
    duplicated_post_id := extensions.gen_random_uuid();
    insert into public.posts (
      id, experiment_id, condition_id, creator_profile_id, original_youtube_url,
      youtube_video_id, video_duration_seconds, short_description, description_source,
      display_likes, display_shares, position
    ) values (
      duplicated_post_id, source_post.experiment_id, duplicated_condition_id,
      source_post.creator_profile_id, source_post.original_youtube_url,
      source_post.youtube_video_id, source_post.video_duration_seconds,
      source_post.short_description, source_post.description_source,
      source_post.display_likes, source_post.display_shares, source_post.position
    );
    insert into public.seeded_comments (
      experiment_id, post_id, display_name, comment_text, display_likes, position
    ) select experiment_id, duplicated_post_id, display_name, comment_text, display_likes, position
      from public.seeded_comments where post_id = source_post.id order by position;
  end loop;
  return duplicated_condition_id;
end;
$$;

comment on column public.experiments.post_order_mode is
'Deprecated legacy default retained for migration; V0 authoring uses conditions.post_order_mode.';
