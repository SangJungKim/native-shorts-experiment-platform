-- Editable Posts in an archived experiment no longer block creator-profile
-- archival. Publication snapshots retain the creator presentation used in data
-- collection, so historical interpretation does not depend on the live profile.

create or replace function public.prevent_assigned_creator_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1
    from public.posts p
    join public.experiments e on e.id = p.experiment_id
    where p.creator_profile_id = old.id
      and e.status <> 'archived'
  ) then
    raise exception 'Reassign Posts in active studies before deleting this creator profile'
      using errcode = '23503';
  end if;
  return new;
end;
$$;
