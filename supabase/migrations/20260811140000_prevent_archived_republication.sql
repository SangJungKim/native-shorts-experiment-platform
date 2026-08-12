-- Archived studies cannot be republished through a direct RPC call.

create function public.prevent_archived_experiment_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.experiments e
    where e.id = new.experiment_id and e.status = 'archived'
  ) then
    raise exception 'Archived experiments cannot be republished' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger prevent_archived_experiment_publication
before insert on public.publication_snapshots
for each row execute function public.prevent_archived_experiment_publication();
