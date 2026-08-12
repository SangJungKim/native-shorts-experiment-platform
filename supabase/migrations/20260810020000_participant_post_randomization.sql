-- Per-participant Post ordering contract. Session creation will call the
-- materialization function during Milestone 4 after authoritative assignment.

create type public.post_order_mode as enum ('fixed', 'per_participant_randomized');

alter table public.experiments
add column post_order_mode public.post_order_mode not null default 'fixed';

alter table public.publication_snapshots
add column post_order_mode public.post_order_mode not null default 'fixed';

alter table public.sessions
add column post_order_mode public.post_order_mode not null default 'fixed',
add column post_order_seed uuid,
add column post_order_algorithm text not null default 'configured_position_v1',
add constraint sessions_post_order_provenance_check check (
  (
    post_order_mode = 'fixed'
    and post_order_seed is null
    and post_order_algorithm = 'configured_position_v1'
  )
  or (
    post_order_mode = 'per_participant_randomized'
    and post_order_seed is not null
    and post_order_algorithm = 'sha256_seeded_v1'
  )
);

create table public.session_post_order (
  session_id uuid not null,
  participant_id uuid not null,
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  publication_post_id uuid not null,
  configured_position integer not null check (configured_position >= 0),
  presentation_position integer not null check (presentation_position >= 0),
  created_at timestamptz not null default now(),
  primary key (session_id, publication_post_id),
  unique (session_id, presentation_position),
  foreign key (
    session_id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) references public.sessions(
    id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) on delete restrict,
  foreign key (publication_post_id, publication_snapshot_id, publication_condition_id)
    references public.publication_posts(id, publication_snapshot_id, publication_condition_id)
    on delete restrict
);

create index session_post_order_participant_idx
on public.session_post_order(participant_id, session_id, presentation_position);

alter table public.session_post_order enable row level security;
grant select, insert, update, delete on public.session_post_order to authenticated;

create policy participant_session_post_order_read on public.session_post_order
for select to authenticated using (participant_id = auth.uid());
create policy researcher_session_post_order_read on public.session_post_order
for select to authenticated using (public.owns_experiment(experiment_id));

create function public.materialize_session_post_order(target_session_id uuid)
returns table (publication_post_id uuid, presentation_position integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.sessions%rowtype;
  selected_mode public.post_order_mode;
  generated_seed uuid;
begin
  select * into target_session
  from public.sessions
  where id = target_session_id;

  if target_session.id is null then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if auth.uid() <> target_session.participant_id
    and not public.owns_experiment(target_session.experiment_id) then
    raise exception 'Session not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_session.id::text, 0));

  if exists (select 1 from public.session_post_order spo where spo.session_id = target_session.id) then
    return query
    select spo.publication_post_id, spo.presentation_position
    from public.session_post_order spo
    where spo.session_id = target_session.id
    order by spo.presentation_position;
    return;
  end if;

  select ps.post_order_mode into selected_mode
  from public.publication_snapshots ps
  where ps.id = target_session.publication_snapshot_id;

  if selected_mode = 'per_participant_randomized' then
    generated_seed := extensions.gen_random_uuid();
    update public.sessions
    set post_order_mode = selected_mode,
      post_order_seed = generated_seed,
      post_order_algorithm = 'sha256_seeded_v1'
    where id = target_session.id;

    insert into public.session_post_order (
      session_id, participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, publication_post_id, configured_position,
      presentation_position
    )
    select
      target_session.id,
      target_session.participant_id,
      target_session.experiment_id,
      target_session.publication_snapshot_id,
      target_session.publication_condition_id,
      pp.id,
      pp.position,
      row_number() over (
        order by extensions.digest(pp.id::text || generated_seed::text, 'sha256'), pp.id
      )::integer - 1
    from public.publication_posts pp
    where pp.publication_condition_id = target_session.publication_condition_id;
  else
    update public.sessions
    set post_order_mode = 'fixed',
      post_order_seed = null,
      post_order_algorithm = 'configured_position_v1'
    where id = target_session.id;

    insert into public.session_post_order (
      session_id, participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, publication_post_id, configured_position,
      presentation_position
    )
    select
      target_session.id,
      target_session.participant_id,
      target_session.experiment_id,
      target_session.publication_snapshot_id,
      target_session.publication_condition_id,
      pp.id,
      pp.position,
      row_number() over (order by pp.position, pp.id)::integer - 1
    from public.publication_posts pp
    where pp.publication_condition_id = target_session.publication_condition_id;
  end if;

  return query
  select spo.publication_post_id, spo.presentation_position
  from public.session_post_order spo
  where spo.session_id = target_session.id
  order by spo.presentation_position;
end;
$$;

revoke all on function public.materialize_session_post_order(uuid) from public;
grant execute on function public.materialize_session_post_order(uuid) to authenticated;
