-- Correct the already-applied local version of submit_participant_comment so
-- its append-only behavior event receives the required explicit UUID.

create or replace function public.submit_participant_comment(
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
    extensions.gen_random_uuid(), target_session.id, target_session.participant_id,
    target_session.experiment_id, target_session.publication_snapshot_id,
    target_session.publication_condition_id, target_publication_post_id,
    'comment_submitted', now(), greatest(coalesce(target_session_elapsed_seconds, 0), 0)
  );

  return comment_id;
end;
$$;
