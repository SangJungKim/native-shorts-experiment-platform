-- Synthetic creator presentation is retired from V0. Existing local records are
-- retained for non-destructive migration but are no longer required or authored.

update public.posts p
set short_description = coalesce(nullif(c.profile_description, ''), p.short_description),
  description_source = 'post_short_description'
from public.creator_profiles c
where p.creator_profile_id = c.id
  and p.description_source = 'creator_profile_description';

alter table public.posts
alter column creator_profile_id drop not null;

alter table public.posts
add constraint posts_v0_description_source_check
check (description_source = 'post_short_description');

alter table public.publication_posts
alter column creator_profile_id drop not null,
alter column creator_display_name drop not null,
alter column creator_handle drop not null,
alter column creator_profile_description drop not null;

comment on table public.creator_profiles is
'Deprecated V0 prototype data retained non-destructively; not used for new authoring or participant presentation.';
comment on column public.posts.creator_profile_id is
'Deprecated optional legacy reference; new V0 Posts do not use synthetic creator profiles.';
