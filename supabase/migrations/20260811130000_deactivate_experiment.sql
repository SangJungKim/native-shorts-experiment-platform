-- Research-safe study deletion: prevent new and continued participation while
-- retaining stimulus snapshots and participant records for audit/export.

create function public.deactivate_experiment(target_experiment_id uuid)
returns table (deactivated_code_count integer, interrupted_session_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  code_count integer;
  session_count integer;
begin
  if not public.owns_experiment(target_experiment_id) then
    raise exception 'Experiment not found or not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_experiment_id::text, 3));

  update public.study_codes
  set is_active = false, deactivated_at = coalesce(deactivated_at, now())
  where experiment_id = target_experiment_id and is_active;
  get diagnostics code_count = row_count;

  update public.sessions
  set status = 'interrupted', ended_at = now(),
      interruption_reason = 'study_deactivated_by_researcher'
  where experiment_id = target_experiment_id and status = 'started';
  get diagnostics session_count = row_count;

  update public.experiments set status = 'archived'
  where id = target_experiment_id;

  return query select code_count, session_count;
end;
$$;

revoke all on function public.deactivate_experiment(uuid) from public;
grant execute on function public.deactivate_experiment(uuid) to authenticated;
