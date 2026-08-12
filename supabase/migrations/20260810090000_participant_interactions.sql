-- Milestone 5 interaction persistence. Exposure/viewed-time measurement is
-- intentionally deferred to the Milestone 6 timing state machine.

create or replace function public.record_participant_interaction(
  target_session_id uuid,
  target_publication_post_id uuid,
  target_event_type public.behavior_event_type,
  target_client_observed_at timestamptz,
  target_session_elapsed_seconds numeric default 0
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_session public.sessions%rowtype;
  event_id uuid := extensions.gen_random_uuid();
begin
  select s.* into target_session from public.sessions s where s.id = target_session_id;
  if target_session.id is null or target_session.participant_id <> auth.uid() then
    raise exception 'Session not found or not authorized' using errcode = '42501';
  end if;
  if target_session.status <> 'started' then
    raise exception 'Session is not active' using errcode = '22023';
  end if;
  if target_event_type not in ('like', 'unlike', 'comments_opened', 'comments_closed', 'share_tapped', 'swipe_up', 'swipe_down') then
    raise exception 'Unsupported participant interaction' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.publication_posts pp
    where pp.id = target_publication_post_id
      and pp.publication_snapshot_id = target_session.publication_snapshot_id
      and pp.publication_condition_id = target_session.publication_condition_id
  ) then
    raise exception 'Post does not belong to the assigned condition' using errcode = '23503';
  end if;

  insert into public.participant_post_state (
    session_id, participant_id, publication_snapshot_id,
    publication_condition_id, publication_post_id
  ) values (
    target_session.id, target_session.participant_id,
    target_session.publication_snapshot_id, target_session.publication_condition_id,
    target_publication_post_id
  ) on conflict (session_id, publication_post_id) do nothing;

  if target_event_type = 'like' then
    update public.participant_post_state set liked = true
    where session_id = target_session.id and publication_post_id = target_publication_post_id;
  elsif target_event_type = 'unlike' then
    update public.participant_post_state set liked = false
    where session_id = target_session.id and publication_post_id = target_publication_post_id;
  elsif target_event_type = 'share_tapped' then
    update public.participant_post_state set share_tapped = true
    where session_id = target_session.id and publication_post_id = target_publication_post_id;
  elsif target_event_type = 'comments_opened' then
    update public.participant_post_state
    set comments_opened_count = comments_opened_count + 1
    where session_id = target_session.id and publication_post_id = target_publication_post_id;
  end if;

  insert into public.behavior_events (
    id, session_id, participant_id, experiment_id, publication_snapshot_id,
    publication_condition_id, publication_post_id, event_type,
    client_observed_at, session_elapsed_seconds
  ) values (
    event_id, target_session.id, target_session.participant_id,
    target_session.experiment_id, target_session.publication_snapshot_id,
    target_session.publication_condition_id, target_publication_post_id,
    target_event_type, target_client_observed_at,
    greatest(coalesce(target_session_elapsed_seconds, 0), 0)
  );
  return event_id;
end;
$$;

revoke all on function public.record_participant_interaction(uuid, uuid, public.behavior_event_type, timestamptz, numeric) from public;
grant execute on function public.record_participant_interaction(uuid, uuid, public.behavior_event_type, timestamptz, numeric) to authenticated;
