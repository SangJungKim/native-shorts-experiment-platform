begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, aud, role, created_at, updated_at)
values (
  '23000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  now(),
  now()
);

insert into public.experiments (
  id, owner_id, name, session_mode, post_order_mode
) values (
  '33000000-0000-0000-0000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Random order test',
  'stimulus_controlled',
  'fixed'
);

insert into public.publication_snapshots (
  id, experiment_id, snapshot_number, experiment_name,
  experiment_description, session_mode, time_display, post_order_mode
) values (
  '73000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  1,
  'Random order test',
  '',
  'stimulus_controlled',
  'hidden',
  'fixed'
);

insert into public.publication_conditions (
  id, publication_snapshot_id, experiment_id, name, position, post_order_mode
) values (
  '73100000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'Condition',
  0,
  'per_participant_randomized'
);

insert into public.publication_posts (
  id, publication_snapshot_id, publication_condition_id, experiment_id,
  position, original_youtube_url, youtube_video_id, video_duration_seconds,
  short_description, display_likes, display_shares, creator_profile_id,
  creator_display_name, creator_handle, creator_profile_description
) values
  (
    '73200000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000001',
    '73100000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000001',
    0, 'https://www.youtube.com/shorts/aaaaaaaaaaa', 'aaaaaaaaaaa',
    10, '', 0, 0, '43000000-0000-0000-0000-000000000001', 'A', '@a', ''
  ),
  (
    '73200000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000001',
    '73100000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000001',
    1, 'https://www.youtube.com/shorts/bbbbbbbbbbb', 'bbbbbbbbbbb',
    10, '', 0, 0, '43000000-0000-0000-0000-000000000001', 'A', '@a', ''
  ),
  (
    '73200000-0000-0000-0000-000000000003',
    '73000000-0000-0000-0000-000000000001',
    '73100000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000001',
    2, 'https://www.youtube.com/shorts/ccccccccccc', 'ccccccccccc',
    10, '', 0, 0, '43000000-0000-0000-0000-000000000001', 'A', '@a', ''
  );

insert into public.participants (id)
values ('23000000-0000-0000-0000-000000000001');

insert into public.assignments (
  id, participant_id, experiment_id, publication_snapshot_id,
  publication_condition_id, random_draw, candidate_condition_count
) values (
  '83000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '73100000-0000-0000-0000-000000000001',
  0.4,
  1
);

insert into public.sessions (
  id, assignment_id, participant_id, experiment_id,
  publication_snapshot_id, publication_condition_id, started_at
) values (
  '93000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  '73100000-0000-0000-0000-000000000001',
  now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select * from public.materialize_session_post_order('93000000-0000-0000-0000-000000000001') $$,
  'the assigned participant can materialize its Post order'
);
select is((select count(*) from public.session_post_order), 3::bigint, 'every condition Post is included once');
select ok((select post_order_seed is not null from public.sessions), 'a randomized session retains its seed');
select is((select post_order_algorithm from public.sessions), 'sha256_seeded_v1', 'the algorithm version is retained');
select is(
  (select array_agg(presentation_position order by presentation_position) from public.session_post_order),
  array[0, 1, 2],
  'assigned presentation positions are contiguous'
);
select is(
  (select array_agg(configured_position order by configured_position) from public.session_post_order),
  array[0, 1, 2],
  'configured source positions remain auditable'
);

create temporary table first_seed as
select post_order_seed from public.sessions
where id = '93000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select * from public.materialize_session_post_order('93000000-0000-0000-0000-000000000001') $$,
  'materialization is safe to retry'
);
select is(
  (select post_order_seed from public.sessions where id = '93000000-0000-0000-0000-000000000001'),
  (select post_order_seed from first_seed),
  'a retry reuses the same realized order and seed'
);

select * from finish();
rollback;
