-- Keep a researcher-defined Post name separate from YouTube's video title.
-- Both values are snapshotted so published stimuli remain auditable.

alter table public.posts add column post_name text not null default '';
update public.posts set post_name = video_title where btrim(post_name) = '';
alter table public.posts add constraint posts_post_name_not_blank
  check (length(btrim(post_name)) between 1 and 200);

create function public.populate_post_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if btrim(new.post_name) = '' then
    select p.post_name into new.post_name
    from public.posts p
    where p.experiment_id = new.experiment_id
      and p.youtube_video_id = new.youtube_video_id
    order by p.updated_at desc limit 1;
    new.post_name := coalesce(
      nullif(btrim(new.post_name), ''),
      nullif(btrim(new.video_title), ''),
      new.youtube_video_id
    );
  end if;
  return new;
end;
$$;

create trigger zz_populate_post_name
before insert on public.posts
for each row execute function public.populate_post_name();

alter table public.publication_posts add column post_name text not null default '';

create function public.snapshot_publication_post_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if btrim(new.post_name) = '' and new.source_post_id is not null then
    select p.post_name into new.post_name
    from public.posts p where p.id = new.source_post_id;
  end if;
  return new;
end;
$$;

create trigger snapshot_publication_post_name
before insert on public.publication_posts
for each row execute function public.snapshot_publication_post_name();

comment on column public.posts.post_name is
'Researcher-defined label for identifying this Post, separate from YouTube video_title.';
comment on column public.publication_posts.post_name is
'Immutable snapshot of the researcher-defined Post label at publication time.';
