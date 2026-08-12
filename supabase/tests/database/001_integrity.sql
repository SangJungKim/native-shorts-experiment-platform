begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

select has_table('public', 'experiments', 'experiments table exists');
select has_table('public', 'publication_posts', 'immutable publication Post snapshots exist');
select has_table('public', 'assignments', 'assignments table exists');
select has_table('public', 'exposures', 'exposures table exists');
select has_table('public', 'behavior_events', 'append-only events table exists');

insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now());

insert into public.researcher_profiles (user_id)
values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

insert into public.experiments (id, owner_id, name, session_mode)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Experiment One',
    'stimulus_controlled'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Experiment Two',
    'stimulus_controlled'
  );

insert into public.creator_profiles (id, owner_id, experiment_id, display_name, handle)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Creator',
  '@creator'
);

insert into public.conditions (id, experiment_id, name, position)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Condition One',
    0
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'Condition Two',
    0
  );

insert into public.posts (
  id,
  experiment_id,
  condition_id,
  creator_profile_id,
  original_youtube_url,
  youtube_video_id,
  video_duration_seconds,
  position
)
values (
  '60000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'https://www.youtube.com/shorts/abcdefghijk?feature=share',
  'abcdefghijk',
  30,
  0
);

select throws_ok(
  $$
    insert into public.posts (
      experiment_id, condition_id, creator_profile_id, original_youtube_url,
      youtube_video_id, video_duration_seconds, position
    ) values (
      '30000000-0000-0000-0000-000000000002',
      '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'https://www.youtube.com/shorts/lmnopqrstuv', 'lmnopqrstuv', 30, 1
    )
  $$,
  '23503'
);

select throws_ok(
  $$
    insert into public.posts (
      experiment_id, condition_id, creator_profile_id, original_youtube_url,
      youtube_video_id, video_duration_seconds, position
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'https://www.youtube.com/shorts/lmnopqrstuv', 'lmnopqrstuv', 30, 0
    )
  $$,
  '23505'
);

insert into public.publication_snapshots (
  id, experiment_id, snapshot_number, experiment_name, experiment_description,
  session_mode, time_display
)
values (
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  1,
  'Experiment One',
  '',
  'stimulus_controlled',
  'hidden'
);

insert into public.publication_conditions (
  id, publication_snapshot_id, experiment_id, source_condition_id, name, position
)
values (
  '71000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'Condition One',
  0
);

insert into public.publication_posts (
  id, publication_snapshot_id, publication_condition_id, experiment_id,
  source_post_id, position, original_youtube_url, youtube_video_id,
  video_duration_seconds, short_description, display_likes, display_shares,
  creator_profile_id, creator_display_name, creator_handle,
  creator_profile_description
)
values (
  '72000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  0,
  'https://www.youtube.com/shorts/abcdefghijk?feature=share',
  'abcdefghijk',
  30,
  '',
  48000,
  100,
  '40000000-0000-0000-0000-000000000001',
  'Creator',
  '@creator',
  ''
);

select throws_ok(
  $$
    update public.publication_posts
    set original_youtube_url = 'https://example.invalid/replacement'
    where id = '72000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'publication snapshots are immutable',
  'published presentation snapshots cannot be overwritten'
);

update public.posts
set original_youtube_url = 'https://www.youtube.com/shorts/changedvalue'
where id = '60000000-0000-0000-0000-000000000001';

select is(
  (
    select original_youtube_url from public.publication_posts
    where id = '72000000-0000-0000-0000-000000000001'
  ),
  'https://www.youtube.com/shorts/abcdefghijk?feature=share',
  'ordinary authoring edits do not erase the published original URL'
);

insert into public.participants (id)
values ('20000000-0000-0000-0000-000000000001');

insert into public.assignments (
  id, participant_id, experiment_id, publication_snapshot_id,
  publication_condition_id, random_draw, candidate_condition_count
)
values (
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  0.25,
  1
);

select throws_ok(
  $$
    insert into public.assignments (
      participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, random_draw, candidate_condition_count
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      0.5,
      1
    )
  $$,
  '23505'
);

insert into public.sessions (
  id, assignment_id, participant_id, experiment_id, publication_snapshot_id,
  publication_condition_id, started_at
)
values (
  '90000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  now()
);

insert into public.exposures (
  id, session_id, participant_id, experiment_id, publication_snapshot_id,
  publication_condition_id, publication_post_id, presentation_position, exposure_number, started_at,
  start_session_elapsed_seconds
)
values (
  'a0000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  0,
  1,
  now(),
  0
);

select throws_ok(
  $$
    insert into public.exposures (
      id, session_id, participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, publication_post_id, presentation_position, exposure_number, started_at,
      start_session_elapsed_seconds
    ) values (
      'a0000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001',
      0, 1, now(), 0
    )
  $$,
  '23505'
);

select * from finish();
rollback;
