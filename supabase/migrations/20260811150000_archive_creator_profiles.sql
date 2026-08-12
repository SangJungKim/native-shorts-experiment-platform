-- Creator deletion is archival so historical stimulus presentation remains
-- interpretable and stored profile images are not removed from snapshots.

alter table public.creator_profiles add column archived_at timestamptz;

create index active_creator_profiles_owner_idx
on public.creator_profiles (owner_id, display_name)
where archived_at is null;

comment on column public.creator_profiles.archived_at is
'Soft-deletion timestamp. Archived profiles cannot be newly assigned but remain for historical publication interpretation.';

create function public.prevent_assigned_creator_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.posts p where p.creator_profile_id = old.id
  ) then
    raise exception 'Reassign Posts before deleting this creator profile' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger prevent_assigned_creator_archive
before update of archived_at on public.creator_profiles
for each row execute function public.prevent_assigned_creator_archive();

create or replace function public.owns_creator(target_creator_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.creator_profiles c
    where c.id = target_creator_id and c.owner_id = auth.uid() and c.archived_at is null
  );
$$;
