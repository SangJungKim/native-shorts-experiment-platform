-- Scope creator profiles to one experiment. Profiles shared by existing Posts
-- are copied per experiment, preserving every assignment and stored image path.

alter table public.creator_profiles add column experiment_id uuid;
alter table public.creator_profiles drop constraint creator_profiles_owner_id_handle_key;

do $$
declare
  profile_row public.creator_profiles%rowtype;
  experiment_row record;
  first_experiment_id uuid;
  copied_profile_id uuid;
begin
  for profile_row in select * from public.creator_profiles loop
    first_experiment_id := null;
    for experiment_row in
      select distinct p.experiment_id
      from public.posts p
      where p.creator_profile_id = profile_row.id
      order by p.experiment_id
    loop
      if first_experiment_id is null then
        first_experiment_id := experiment_row.experiment_id;
        update public.creator_profiles set experiment_id = first_experiment_id
        where id = profile_row.id;
      else
        copied_profile_id := extensions.gen_random_uuid();
        insert into public.creator_profiles (
          id, owner_id, experiment_id, display_name, handle,
          profile_description, profile_image_path, created_at, updated_at, archived_at
        ) values (
          copied_profile_id, profile_row.owner_id, experiment_row.experiment_id,
          profile_row.display_name, profile_row.handle, profile_row.profile_description,
          profile_row.profile_image_path, profile_row.created_at, profile_row.updated_at,
          profile_row.archived_at
        );
        update public.posts set creator_profile_id = copied_profile_id
        where creator_profile_id = profile_row.id
          and experiment_id = experiment_row.experiment_id;
      end if;
    end loop;

    if first_experiment_id is null then
      select e.id into first_experiment_id
      from public.experiments e
      where e.owner_id = profile_row.owner_id
      order by (e.status <> 'archived') desc, e.updated_at desc
      limit 1;
      if first_experiment_id is null then
        delete from public.creator_profiles where id = profile_row.id;
      else
        update public.creator_profiles set experiment_id = first_experiment_id
        where id = profile_row.id;
      end if;
    end if;
  end loop;
end;
$$;

alter table public.creator_profiles alter column experiment_id set not null;
alter table public.creator_profiles
  add constraint creator_profiles_experiment_owner_fk
  foreign key (experiment_id, owner_id) references public.experiments(id, owner_id) on delete cascade;
alter table public.creator_profiles
  add constraint creator_profiles_experiment_handle_key unique (experiment_id, handle);
alter table public.creator_profiles
  add constraint creator_profiles_id_experiment_key unique (id, experiment_id);
alter table public.posts
  add constraint posts_creator_experiment_fk
  foreign key (creator_profile_id, experiment_id)
  references public.creator_profiles(id, experiment_id);

drop index active_creator_profiles_owner_idx;
create index active_creator_profiles_experiment_idx
on public.creator_profiles (experiment_id, display_name)
where archived_at is null;

comment on column public.creator_profiles.experiment_id is
'The single experiment that owns this reusable-within-experiment creator profile.';
