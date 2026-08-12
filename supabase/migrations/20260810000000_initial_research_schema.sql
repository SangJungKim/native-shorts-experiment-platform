-- Milestone 2: research domain model, integrity constraints, and access control.
-- Editable authoring records are deliberately separate from immutable publication
-- and session snapshots so V0 can allow edits without rewriting observed context.

create extension if not exists pgcrypto with schema extensions;

create type public.experiment_status as enum ('draft', 'published', 'closed', 'archived');
create type public.session_mode as enum ('time_controlled', 'stimulus_controlled');
create type public.time_display_mode as enum (
  'hidden',
  'progress_only',
  'elapsed',
  'remaining',
  'progress_elapsed',
  'progress_remaining'
);
create type public.session_status as enum ('started', 'completed', 'interrupted');
create type public.assignment_method as enum ('simple_random');
create type public.exposure_end_reason as enum (
  'swipe_up',
  'swipe_down',
  'backgrounded',
  'session_completed',
  'session_timeout',
  'player_error',
  'connectivity_failure',
  'interrupted'
);
create type public.behavior_event_type as enum (
  'experiment_started',
  'experiment_completed',
  'experiment_interrupted',
  'post_activated',
  'swipe_up',
  'swipe_down',
  'like',
  'unlike',
  'comments_opened',
  'comments_closed',
  'share_tapped',
  'app_backgrounded',
  'app_foregrounded',
  'playback_error',
  'connectivity_failure'
);

create table public.researcher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.experiments (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.researcher_profiles(user_id),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '',
  status public.experiment_status not null default 'draft',
  session_mode public.session_mode not null,
  session_duration_seconds integer,
  time_display public.time_display_mode not null default 'hidden',
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (
    (session_mode = 'time_controlled' and session_duration_seconds > 0)
    or (session_mode = 'stimulus_controlled' and session_duration_seconds is null)
  ),
  check (session_mode = 'time_controlled' or time_display = 'hidden'),
  check ((status = 'draft' and published_at is null) or status <> 'draft')
);

create table public.creator_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.researcher_profiles(user_id),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  handle text not null check (length(btrim(handle)) between 1 and 120),
  profile_description text not null default '',
  profile_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, handle),
  check (profile_image_path is null or profile_image_path ~ '^[0-9a-fA-F-]{36}/')
);

create table public.conditions (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, experiment_id),
  unique (experiment_id, position)
);

create table public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  condition_id uuid not null,
  creator_profile_id uuid not null references public.creator_profiles(id),
  original_youtube_url text not null check (length(btrim(original_youtube_url)) > 0),
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_duration_seconds numeric(12, 3) not null check (video_duration_seconds > 0),
  short_description text not null default '',
  display_likes bigint not null default 0 check (display_likes >= 0),
  display_shares bigint not null default 0 check (display_shares >= 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, experiment_id),
  unique (condition_id, position),
  foreign key (condition_id, experiment_id)
    references public.conditions(id, experiment_id) on delete cascade
);

create table public.seeded_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null,
  post_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  comment_text text not null check (length(btrim(comment_text)) > 0),
  display_likes bigint check (display_likes >= 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, position),
  foreign key (post_id, experiment_id)
    references public.posts(id, experiment_id) on delete cascade
);

-- Each publication creates an immutable internal snapshot. This is an audit and
-- data-preservation mechanism, not a V0 researcher-facing versioning feature.
create table public.publication_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id),
  snapshot_number integer not null check (snapshot_number > 0),
  experiment_name text not null,
  experiment_description text not null,
  session_mode public.session_mode not null,
  session_duration_seconds integer,
  time_display public.time_display_mode not null,
  created_at timestamptz not null default now(),
  unique (id, experiment_id),
  unique (experiment_id, snapshot_number),
  check (
    (session_mode = 'time_controlled' and session_duration_seconds > 0)
    or (session_mode = 'stimulus_controlled' and session_duration_seconds is null)
  )
);

create table public.publication_conditions (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_snapshot_id uuid not null,
  experiment_id uuid not null,
  source_condition_id uuid,
  name text not null,
  position integer not null check (position >= 0),
  unique (id, publication_snapshot_id),
  unique (publication_snapshot_id, source_condition_id),
  unique (publication_snapshot_id, position),
  foreign key (publication_snapshot_id, experiment_id)
    references public.publication_snapshots(id, experiment_id) on delete restrict
  -- Source IDs are retained for audit even if editable authoring rows are deleted.
  -- The trusted publication function validates them before snapshot insertion.
);

create table public.publication_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  experiment_id uuid not null,
  source_post_id uuid,
  position integer not null check (position >= 0),
  original_youtube_url text not null,
  youtube_video_id text not null,
  video_duration_seconds numeric(12, 3) not null check (video_duration_seconds > 0),
  short_description text not null,
  display_likes bigint not null check (display_likes >= 0),
  display_shares bigint not null check (display_shares >= 0),
  creator_profile_id uuid not null,
  creator_display_name text not null,
  creator_handle text not null,
  creator_profile_description text not null,
  creator_profile_image_path text,
  unique (id, publication_snapshot_id),
  unique (id, publication_snapshot_id, publication_condition_id),
  unique (publication_condition_id, position),
  foreign key (publication_condition_id, publication_snapshot_id)
    references public.publication_conditions(id, publication_snapshot_id) on delete restrict,
  foreign key (publication_snapshot_id, experiment_id)
    references public.publication_snapshots(id, experiment_id) on delete restrict
  -- Source IDs are retained for audit even if editable authoring rows are deleted.
  -- The trusted publication function validates them before snapshot insertion.
);

create table public.publication_seeded_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_snapshot_id uuid not null,
  publication_post_id uuid not null,
  display_name text not null,
  comment_text text not null,
  display_likes bigint check (display_likes >= 0),
  position integer not null check (position >= 0),
  unique (publication_post_id, position),
  foreign key (publication_post_id, publication_snapshot_id)
    references public.publication_posts(id, publication_snapshot_id) on delete restrict
);

create table public.study_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6,12}$'),
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  foreign key (publication_snapshot_id, experiment_id)
    references public.publication_snapshots(id, experiment_id) on delete restrict,
  check ((is_active and deactivated_at is null) or (not is_active))
);
create unique index one_active_study_code_per_experiment
  on public.study_codes (experiment_id) where is_active;

create table public.participants (
  id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete restrict,
  experiment_id uuid not null references public.experiments(id) on delete restrict,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  method public.assignment_method not null default 'simple_random',
  random_draw numeric(17, 16) not null check (random_draw >= 0 and random_draw < 1),
  candidate_condition_count integer not null check (candidate_condition_count > 0),
  assigned_at timestamptz not null default now(),
  unique (id, participant_id),
  unique (
    id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ),
  unique (participant_id, experiment_id),
  foreign key (publication_snapshot_id, experiment_id)
    references public.publication_snapshots(id, experiment_id) on delete restrict,
  foreign key (publication_condition_id, publication_snapshot_id)
    references public.publication_conditions(id, publication_snapshot_id) on delete restrict
);

create table public.sessions (
  id uuid primary key,
  assignment_id uuid not null,
  participant_id uuid not null,
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  status public.session_status not null default 'started',
  started_at timestamptz not null,
  ended_at timestamptz,
  session_elapsed_seconds numeric(14, 3) not null default 0 check (session_elapsed_seconds >= 0),
  interruption_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, participant_id),
  unique (id, participant_id, publication_snapshot_id),
  unique (id, participant_id, publication_snapshot_id, publication_condition_id),
  unique (id, participant_id, experiment_id, publication_snapshot_id),
  unique (
    id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ),
  foreign key (
    assignment_id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) references public.assignments(
    id,
    participant_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) on delete restrict,
  foreign key (publication_snapshot_id, experiment_id)
    references public.publication_snapshots(id, experiment_id) on delete restrict,
  foreign key (publication_condition_id, publication_snapshot_id)
    references public.publication_conditions(id, publication_snapshot_id) on delete restrict,
  check ((status = 'started' and ended_at is null) or (status <> 'started' and ended_at is not null)),
  check ((status = 'interrupted' and interruption_reason is not null) or status <> 'interrupted')
);
create unique index one_completed_session_per_participant_experiment
  on public.sessions (participant_id, experiment_id) where status = 'completed';
create unique index one_started_session_per_participant_experiment
  on public.sessions (participant_id, experiment_id) where status = 'started';

create table public.exposures (
  id uuid primary key,
  session_id uuid not null,
  participant_id uuid not null,
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  publication_post_id uuid not null,
  presentation_position integer not null check (presentation_position >= 0),
  exposure_number integer not null check (exposure_number > 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  viewed_seconds numeric(14, 3) not null default 0 check (viewed_seconds >= 0),
  start_session_elapsed_seconds numeric(14, 3) not null check (start_session_elapsed_seconds >= 0),
  end_session_elapsed_seconds numeric(14, 3),
  end_reason public.exposure_end_reason,
  created_at timestamptz not null default now(),
  unique (id, participant_id),
  unique (
    id,
    participant_id,
    session_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ),
  unique (participant_id, publication_post_id, exposure_number),
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
  )
    on delete restrict,
  foreign key (publication_post_id, publication_snapshot_id, publication_condition_id)
    references public.publication_posts(id, publication_snapshot_id, publication_condition_id)
    on delete restrict,
  check (
    (ended_at is null and end_session_elapsed_seconds is null and end_reason is null)
    or (ended_at is not null and end_session_elapsed_seconds is not null and end_reason is not null)
  ),
  check (ended_at is null or ended_at >= started_at),
  check (end_session_elapsed_seconds is null or end_session_elapsed_seconds >= start_session_elapsed_seconds)
);

create table public.behavior_events (
  id uuid primary key,
  session_id uuid not null,
  participant_id uuid not null,
  experiment_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  publication_post_id uuid,
  exposure_id uuid,
  event_type public.behavior_event_type not null,
  client_observed_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  session_elapsed_seconds numeric(14, 3) not null check (session_elapsed_seconds >= 0),
  schema_version integer not null default 1 check (schema_version > 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
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
  )
    on delete restrict,
  foreign key (publication_post_id, publication_snapshot_id, publication_condition_id)
    references public.publication_posts(id, publication_snapshot_id, publication_condition_id)
    on delete restrict,
  foreign key (
    exposure_id,
    participant_id,
    session_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) references public.exposures(
    id,
    participant_id,
    session_id,
    experiment_id,
    publication_snapshot_id,
    publication_condition_id
  ) on delete restrict
);

create table public.participant_post_state (
  session_id uuid not null,
  participant_id uuid not null,
  publication_snapshot_id uuid not null,
  publication_condition_id uuid not null,
  publication_post_id uuid not null,
  liked boolean not null default false,
  share_tapped boolean not null default false,
  comments_opened_count integer not null default 0 check (comments_opened_count >= 0),
  comment_panel_seconds numeric(14, 3) not null default 0 check (comment_panel_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, publication_post_id),
  foreign key (
    session_id,
    participant_id,
    publication_snapshot_id,
    publication_condition_id
  ) references public.sessions(
    id,
    participant_id,
    publication_snapshot_id,
    publication_condition_id
  )
    on delete restrict,
  foreign key (publication_post_id, publication_snapshot_id, publication_condition_id)
    references public.publication_posts(id, publication_snapshot_id, publication_condition_id)
    on delete restrict
);

create index experiments_owner_idx on public.experiments(owner_id);
create index creator_profiles_owner_idx on public.creator_profiles(owner_id);
create index conditions_experiment_idx on public.conditions(experiment_id, position);
create index posts_experiment_condition_idx on public.posts(experiment_id, condition_id, position);
create index publication_snapshots_experiment_idx on public.publication_snapshots(experiment_id);
create index publication_posts_condition_idx on public.publication_posts(publication_condition_id, position);
create index assignments_participant_idx on public.assignments(participant_id);
create index sessions_participant_experiment_idx on public.sessions(participant_id, experiment_id);
create index exposures_session_idx on public.exposures(session_id, started_at);
create index events_session_received_idx on public.behavior_events(session_id, server_received_at);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger experiments_updated_at before update on public.experiments
for each row execute function public.set_updated_at();
create trigger creator_profiles_updated_at before update on public.creator_profiles
for each row execute function public.set_updated_at();
create trigger conditions_updated_at before update on public.conditions
for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts
for each row execute function public.set_updated_at();
create trigger seeded_comments_updated_at before update on public.seeded_comments
for each row execute function public.set_updated_at();
create trigger sessions_updated_at before update on public.sessions
for each row execute function public.set_updated_at();
create trigger participant_post_state_updated_at before update on public.participant_post_state
for each row execute function public.set_updated_at();

create function public.reject_terminal_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'sessions' and old.status <> 'started' then
    raise exception 'terminal sessions are immutable';
  end if;
  if tg_table_name = 'exposures' and old.ended_at is not null then
    raise exception 'closed exposures are immutable';
  end if;
  return new;
end;
$$;

create trigger terminal_sessions_immutable before update on public.sessions
for each row execute function public.reject_terminal_record_mutation();
create trigger closed_exposures_immutable before update on public.exposures
for each row execute function public.reject_terminal_record_mutation();

-- Snapshot rows are append-only even for privileged API clients. Migration owners
-- can still manage them explicitly when administering the database.
create function public.reject_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'publication snapshots are immutable';
end;
$$;

create trigger publication_snapshots_immutable before update or delete on public.publication_snapshots
for each row execute function public.reject_snapshot_mutation();
create trigger publication_conditions_immutable before update or delete on public.publication_conditions
for each row execute function public.reject_snapshot_mutation();
create trigger publication_posts_immutable before update or delete on public.publication_posts
for each row execute function public.reject_snapshot_mutation();
create trigger publication_seeded_comments_immutable before update or delete on public.publication_seeded_comments
for each row execute function public.reject_snapshot_mutation();

create function public.owns_experiment(target_experiment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiments e
    where e.id = target_experiment_id and e.owner_id = auth.uid()
  );
$$;

create function public.owns_creator(target_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.creator_profiles c
    where c.id = target_creator_id and c.owner_id = auth.uid()
  );
$$;

create function public.is_assigned_participant(
  target_participant_id uuid,
  target_experiment_id uuid,
  target_publication_snapshot_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() = target_participant_id and exists (
    select 1 from public.assignments a
    where a.participant_id = target_participant_id
      and a.experiment_id = target_experiment_id
      and a.publication_snapshot_id = target_publication_snapshot_id
  );
$$;

revoke all on function public.owns_experiment(uuid) from public;
grant execute on function public.owns_experiment(uuid) to authenticated;
revoke all on function public.owns_creator(uuid) from public;
grant execute on function public.owns_creator(uuid) to authenticated;
revoke all on function public.is_assigned_participant(uuid, uuid, uuid) from public;
grant execute on function public.is_assigned_participant(uuid, uuid, uuid) to authenticated;

alter table public.researcher_profiles enable row level security;
alter table public.experiments enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.conditions enable row level security;
alter table public.posts enable row level security;
alter table public.seeded_comments enable row level security;
alter table public.publication_snapshots enable row level security;
alter table public.publication_conditions enable row level security;
alter table public.publication_posts enable row level security;
alter table public.publication_seeded_comments enable row level security;
alter table public.study_codes enable row level security;
alter table public.participants enable row level security;
alter table public.assignments enable row level security;
alter table public.sessions enable row level security;
alter table public.exposures enable row level security;
alter table public.behavior_events enable row level security;
alter table public.participant_post_state enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.researcher_profiles,
  public.experiments,
  public.creator_profiles,
  public.conditions,
  public.posts,
  public.seeded_comments,
  public.publication_snapshots,
  public.publication_conditions,
  public.publication_posts,
  public.publication_seeded_comments,
  public.study_codes,
  public.participants,
  public.assignments,
  public.sessions,
  public.exposures,
  public.behavior_events,
  public.participant_post_state
to authenticated;

create policy researcher_profile_self_read on public.researcher_profiles
for select to authenticated using (user_id = auth.uid());

create policy researcher_experiments on public.experiments
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy researcher_creators on public.creator_profiles
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy researcher_conditions on public.conditions
for all to authenticated using (public.owns_experiment(experiment_id))
with check (public.owns_experiment(experiment_id));
create policy researcher_posts on public.posts
for all to authenticated using (public.owns_experiment(experiment_id))
with check (public.owns_experiment(experiment_id) and public.owns_creator(creator_profile_id));
create policy researcher_seeded_comments on public.seeded_comments
for all to authenticated using (public.owns_experiment(experiment_id))
with check (public.owns_experiment(experiment_id));

create policy researcher_publication_snapshots on public.publication_snapshots
for select to authenticated using (public.owns_experiment(experiment_id));
create policy researcher_publication_conditions on public.publication_conditions
for select to authenticated using (public.owns_experiment(experiment_id));
create policy researcher_publication_posts on public.publication_posts
for select to authenticated using (public.owns_experiment(experiment_id));
create policy researcher_publication_comments on public.publication_seeded_comments
for select to authenticated using (
  exists (
    select 1 from public.publication_posts pp
    where pp.id = publication_post_id and public.owns_experiment(pp.experiment_id)
  )
);
create policy researcher_study_codes on public.study_codes
for select to authenticated using (public.owns_experiment(experiment_id));

create policy participant_self on public.participants
for select to authenticated using (id = auth.uid());
create policy participant_assignment_self on public.assignments
for select to authenticated using (participant_id = auth.uid());
create policy researcher_assignment_read on public.assignments
for select to authenticated using (public.owns_experiment(experiment_id));

create policy participant_publication_snapshot_read on public.publication_snapshots
for select to authenticated using (
  public.is_assigned_participant(auth.uid(), experiment_id, id)
);
create policy participant_publication_condition_read on public.publication_conditions
for select to authenticated using (
  public.is_assigned_participant(auth.uid(), experiment_id, publication_snapshot_id)
  and exists (
    select 1 from public.assignments a
    where a.participant_id = auth.uid()
      and a.publication_condition_id = publication_conditions.id
  )
);
create policy participant_publication_post_read on public.publication_posts
for select to authenticated using (
  public.is_assigned_participant(auth.uid(), experiment_id, publication_snapshot_id)
  and exists (
    select 1 from public.assignments a
    where a.participant_id = auth.uid()
      and a.publication_condition_id = publication_condition_id
  )
);
create policy participant_publication_comment_read on public.publication_seeded_comments
for select to authenticated using (
  exists (
    select 1
    from public.publication_posts pp
    join public.assignments a
      on a.publication_snapshot_id = pp.publication_snapshot_id
     and a.publication_condition_id = pp.publication_condition_id
    where pp.id = publication_post_id and a.participant_id = auth.uid()
  )
);

create policy participant_session_read on public.sessions
for select to authenticated using (participant_id = auth.uid());
create policy participant_session_insert on public.sessions
for insert to authenticated with check (
  participant_id = auth.uid()
  and public.is_assigned_participant(participant_id, experiment_id, publication_snapshot_id)
);
create policy participant_session_update on public.sessions
for update to authenticated
using (participant_id = auth.uid())
with check (
  participant_id = auth.uid()
  and public.is_assigned_participant(participant_id, experiment_id, publication_snapshot_id)
);
create policy researcher_session_read on public.sessions
for select to authenticated using (public.owns_experiment(experiment_id));

create policy participant_exposure_read on public.exposures
for select to authenticated using (participant_id = auth.uid());
create policy participant_exposure_insert on public.exposures
for insert to authenticated with check (
  participant_id = auth.uid()
  and public.is_assigned_participant(participant_id, experiment_id, publication_snapshot_id)
);
create policy participant_exposure_update on public.exposures
for update to authenticated
using (participant_id = auth.uid())
with check (
  participant_id = auth.uid()
  and public.is_assigned_participant(participant_id, experiment_id, publication_snapshot_id)
);
create policy researcher_exposure_read on public.exposures
for select to authenticated using (public.owns_experiment(experiment_id));

create policy participant_events on public.behavior_events
for insert to authenticated with check (
  participant_id = auth.uid()
  and public.is_assigned_participant(participant_id, experiment_id, publication_snapshot_id)
);
create policy participant_event_read on public.behavior_events
for select to authenticated using (participant_id = auth.uid());
create policy researcher_event_read on public.behavior_events
for select to authenticated using (public.owns_experiment(experiment_id));

create policy participant_post_state_access on public.participant_post_state
for all to authenticated
using (participant_id = auth.uid())
with check (
  participant_id = auth.uid()
  and exists (
    select 1 from public.sessions s
    where s.id = session_id and s.participant_id = auth.uid()
  )
);
create policy researcher_post_state_read on public.participant_post_state
for select to authenticated using (
  exists (
    select 1 from public.sessions s
    where s.id = session_id and public.owns_experiment(s.experiment_id)
  )
);

-- Participant creation and assignment are intentionally service/RPC-only. Milestone
-- 4 will add the atomic simple-random assignment function after publication rules
-- are implemented; clients cannot choose a condition by direct table insertion.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-images',
  'creator-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy researcher_creator_image_read on storage.objects
for select to authenticated using (
  bucket_id = 'creator-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.researcher_profiles rp where rp.user_id = auth.uid()
  )
);
create policy researcher_creator_image_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'creator-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.researcher_profiles rp where rp.user_id = auth.uid()
  )
);
create policy researcher_creator_image_update on storage.objects
for update to authenticated
using (
  bucket_id = 'creator-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.researcher_profiles rp where rp.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'creator-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.researcher_profiles rp where rp.user_id = auth.uid()
  )
);
create policy researcher_creator_image_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'creator-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.researcher_profiles rp where rp.user_id = auth.uid()
  )
);
