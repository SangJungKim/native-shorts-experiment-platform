-- Permanent deletion is limited to never-published authoring experiments.
-- Published snapshots or participant records must remain auditable.

create function public.permanently_delete_unpublished_experiment(target_experiment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_experiment public.experiments%rowtype;
begin
  select * into target_experiment from public.experiments where id = target_experiment_id;
  if target_experiment.id is null or target_experiment.owner_id <> auth.uid() then
    raise exception 'Experiment not found or not authorized' using errcode = '42501';
  end if;
  if target_experiment.published_at is not null
    or exists (select 1 from public.publication_snapshots ps where ps.experiment_id = target_experiment_id)
    or exists (select 1 from public.sessions s where s.experiment_id = target_experiment_id)
  then
    raise exception 'Published or participant-bearing experiments cannot be permanently deleted; deactivate the study instead'
      using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_experiment_id::text, 4));
  delete from public.experiments where id = target_experiment_id;
end;
$$;

revoke all on function public.permanently_delete_unpublished_experiment(uuid) from public;
grant execute on function public.permanently_delete_unpublished_experiment(uuid) to authenticated;
