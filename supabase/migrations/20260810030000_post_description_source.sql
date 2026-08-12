-- A Post retains its own short description while allowing researchers to choose
-- which description source appears in the participant presentation.

create type public.description_source as enum ('post_short_description', 'creator_profile_description');

alter table public.posts
add column description_source public.description_source not null default 'post_short_description';

alter table public.publication_posts
add column description_source public.description_source not null default 'post_short_description',
add column presented_description text not null default '';

create or replace function public.duplicate_post(source_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_post public.posts%rowtype;
  duplicated_post_id uuid := extensions.gen_random_uuid();
  next_position integer;
begin
  select * into source_post from public.posts where id = source_post_id;
  if source_post.id is null or not public.owns_experiment(source_post.experiment_id) then
    raise exception 'Post not found or not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(source_post.condition_id::text, 0));
  select coalesce(max(position), -1) + 1 into next_position
  from public.posts where condition_id = source_post.condition_id;

  insert into public.posts (
    id, experiment_id, condition_id, creator_profile_id,
    original_youtube_url, youtube_video_id, video_duration_seconds,
    short_description, description_source, display_likes, display_shares, position
  ) values (
    duplicated_post_id, source_post.experiment_id, source_post.condition_id,
    source_post.creator_profile_id, source_post.original_youtube_url,
    source_post.youtube_video_id, source_post.video_duration_seconds,
    source_post.short_description, source_post.description_source,
    source_post.display_likes, source_post.display_shares, next_position
  );

  insert into public.seeded_comments (
    experiment_id, post_id, display_name, comment_text, display_likes, position
  )
  select experiment_id, duplicated_post_id, display_name, comment_text,
    display_likes, position
  from public.seeded_comments
  where post_id = source_post_id
  order by position;

  return duplicated_post_id;
end;
$$;

create or replace function public.duplicate_condition(source_condition_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  select coalesce(max(position), -1) + 1 into next_position
  from public.conditions where experiment_id = source_condition.experiment_id;

  insert into public.conditions (id, experiment_id, name, position)
  values (
    duplicated_condition_id,
    source_condition.experiment_id,
    source_condition.name || ' copy',
    next_position
  );

  for source_post in
    select * from public.posts
    where condition_id = source_condition_id
    order by position
  loop
    duplicated_post_id := extensions.gen_random_uuid();
    insert into public.posts (
      id, experiment_id, condition_id, creator_profile_id,
      original_youtube_url, youtube_video_id, video_duration_seconds,
      short_description, description_source, display_likes, display_shares, position
    ) values (
      duplicated_post_id, source_post.experiment_id, duplicated_condition_id,
      source_post.creator_profile_id, source_post.original_youtube_url,
      source_post.youtube_video_id, source_post.video_duration_seconds,
      source_post.short_description, source_post.description_source,
      source_post.display_likes, source_post.display_shares, source_post.position
    );

    insert into public.seeded_comments (
      experiment_id, post_id, display_name, comment_text, display_likes, position
    )
    select experiment_id, duplicated_post_id, display_name, comment_text,
      display_likes, position
    from public.seeded_comments
    where post_id = source_post.id
    order by position;
  end loop;

  return duplicated_condition_id;
end;
$$;
