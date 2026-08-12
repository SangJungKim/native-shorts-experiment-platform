-- Participant-written comments are observed behavior, not seeded stimulus data.
-- V0 returns them only to their author so one participant cannot alter another
-- participant's experimental stimulus.

alter type public.behavior_event_type add value if not exists 'comment_submitted' after 'comments_closed';

create table public.participant_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null,
  participant_id uuid not null,
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  publication_post_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  comment_text text not null check (length(btrim(comment_text)) between 1 and 5000),
  session_elapsed_seconds numeric(12, 3) not null default 0 check (session_elapsed_seconds >= 0),
  created_at timestamptz not null default now(),
  foreign key (session_id, participant_id) references public.sessions(id, participant_id) on delete restrict,
  foreign key (publication_post_id, publication_snapshot_id, publication_condition_id)
    references public.publication_posts(id, publication_snapshot_id, publication_condition_id) on delete restrict
);

create index participant_comments_session_post_idx
on public.participant_comments (session_id, publication_post_id, created_at);

alter table public.participant_comments enable row level security;
grant select on public.participant_comments to authenticated;

create policy participant_own_comment_read on public.participant_comments
for select to authenticated using (participant_id = auth.uid());

create policy researcher_participant_comment_read on public.participant_comments
for select to authenticated using (public.owns_experiment(experiment_id));

create function public.submit_participant_comment(
  target_session_id uuid,
  target_publication_post_id uuid,
  target_display_name text,
  target_comment_text text,
  target_session_elapsed_seconds numeric default 0
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target_session public.sessions%rowtype;
  comment_id uuid := extensions.gen_random_uuid();
begin
  select * into target_session from public.sessions where id = target_session_id;
  if target_session.id is null or target_session.participant_id <> auth.uid() then
    raise exception 'Session not found or not authorized' using errcode = '42501';
  end if;
  if target_session.status <> 'started' then
    raise exception 'Session is not active' using errcode = '22023';
  end if;
  if length(btrim(coalesce(target_display_name, ''))) not between 1 and 120 then
    raise exception 'Display name must contain 1 to 120 characters' using errcode = '22023';
  end if;
  if length(btrim(coalesce(target_comment_text, ''))) not between 1 and 5000 then
    raise exception 'Comment must contain 1 to 5000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.publication_posts pp
    where pp.id = target_publication_post_id
      and pp.publication_snapshot_id = target_session.publication_snapshot_id
      and pp.publication_condition_id = target_session.publication_condition_id
  ) then
    raise exception 'Post does not belong to the assigned condition' using errcode = '23503';
  end if;

  insert into public.participant_comments (
    id, session_id, participant_id, experiment_id, publication_snapshot_id,
    publication_condition_id, publication_post_id, display_name, comment_text,
    session_elapsed_seconds
  ) values (
    comment_id, target_session.id, target_session.participant_id,
    target_session.experiment_id, target_session.publication_snapshot_id,
    target_session.publication_condition_id, target_publication_post_id,
    btrim(target_display_name), btrim(target_comment_text),
    greatest(coalesce(target_session_elapsed_seconds, 0), 0)
  );

  insert into public.behavior_events (
    id, session_id, participant_id, experiment_id, publication_snapshot_id,
    publication_condition_id, publication_post_id, event_type,
    client_observed_at, session_elapsed_seconds
  ) values (
    extensions.gen_random_uuid(), target_session.id, target_session.participant_id, target_session.experiment_id,
    target_session.publication_snapshot_id, target_session.publication_condition_id,
    target_publication_post_id, 'comment_submitted', now(),
    greatest(coalesce(target_session_elapsed_seconds, 0), 0)
  );

  return comment_id;
end;
$$;

revoke all on function public.submit_participant_comment(uuid, uuid, text, text, numeric) from public;
grant execute on function public.submit_participant_comment(uuid, uuid, text, text, numeric) to authenticated;

comment on table public.participant_comments is
'Participant-authored behavior stored separately from researcher-seeded comments; V0 comments are visible only to their author and researchers.';
