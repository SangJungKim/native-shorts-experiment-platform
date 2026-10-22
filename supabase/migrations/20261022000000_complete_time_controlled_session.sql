-- Complete a time-controlled participant session exactly once when its finite
-- attention budget is exhausted. The operation is retry-safe: a client that
-- misses the first response can call it again without duplicating events.

create or replace function public.complete_time_controlled_session(
  target_session_id uuid,
  target_session_elapsed_seconds numeric,
  target_client_observed_at timestamptz default now()
)
returns public.session_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.sessions%rowtype;
  target_mode public.session_mode;
  target_duration integer;
begin
  select s.*
  into target_session
  from public.sessions s
  where s.id = target_session_id
  for update;

  if target_session.id is null or target_session.participant_id <> auth.uid() then
    raise exception 'Session not found or not authorized' using errcode = '42501';
  end if;

  select ps.session_mode, ps.session_duration_seconds
  into target_mode, target_duration
  from public.publication_snapshots ps
  where ps.id = target_session.publication_snapshot_id;

  if target_session.status = 'completed' then
    return target_session.status;
  end if;
  if target_session.status <> 'started' then
    raise exception 'Session is not active' using errcode = '22023';
  end if;
  if target_mode <> 'time_controlled' or target_duration is null then
    raise exception 'Only time-controlled sessions can be completed by time budget' using errcode = '22023';
  end if;
  if coalesce(target_session_elapsed_seconds, 0) < target_duration then
    raise exception 'Session time budget has not been exhausted' using errcode = '22023';
  end if;

  insert into public.behavior_events (
    id, session_id, participant_id, experiment_id, publication_snapshot_id,
    publication_condition_id, event_type, client_observed_at,
    session_elapsed_seconds, payload
  ) values (
    extensions.gen_random_uuid(), target_session.id, target_session.participant_id,
    target_session.experiment_id, target_session.publication_snapshot_id,
    target_session.publication_condition_id, 'experiment_completed',
    coalesce(target_client_observed_at, now()), target_duration,
    jsonb_build_object('reason', 'time_budget_exhausted')
  );

  update public.sessions
  set status = 'completed',
      ended_at = now(),
      session_elapsed_seconds = target_duration,
      interruption_reason = null
  where id = target_session.id;

  return 'completed'::public.session_status;
end;
$$;

revoke all on function public.complete_time_controlled_session(uuid, numeric, timestamptz) from public;
grant execute on function public.complete_time_controlled_session(uuid, numeric, timestamptz) to authenticated;
