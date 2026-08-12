begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.experiments (
  id, owner_id, name, session_mode
) values (
  '32000000-0000-0000-0000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Authoring test',
  'stimulus_controlled'
);

insert into public.creator_profiles (
  id, owner_id, experiment_id, display_name, handle
) values (
  '42000000-0000-0000-0000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '32000000-0000-0000-0000-000000000001',
  'Creator',
  '@creator-test'
);
insert into public.creator_profiles (id, owner_id, experiment_id, display_name, handle)
values (
  '42000000-0000-0000-0000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '32000000-0000-0000-0000-000000000001',
  'Unused Creator', '@unused-creator-test'
);

insert into public.conditions (id, experiment_id, name, position, post_order_mode, time_display)
values (
  '52000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  'Condition A',
  0,
  'per_participant_randomized',
  'progress_remaining'
);

insert into public.posts (
  id, experiment_id, condition_id, creator_profile_id,
  original_youtube_url, youtube_video_id, video_duration_seconds,
  short_description, display_likes, display_shares, position
) values
  (
    '62000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    'https://www.youtube.com/shorts/abcdefghijk?feature=share',
    'abcdefghijk', 30, 'First', 100, 20, 0
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    '32000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    'https://www.youtube.com/shorts/lmnopqrstuv',
    'lmnopqrstuv', 40, 'Second', 200, 30, 1
  );

insert into public.seeded_comments (
  experiment_id, post_id, display_name, comment_text, display_likes, position
) values (
  '32000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'Viewer', 'Seeded comment', 12, 0
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select lives_ok(
  $$ select public.duplicate_post('62000000-0000-0000-0000-000000000001') $$,
  'an owner can duplicate a Post atomically'
);
select is(
  (
    select count(*) from public.posts
    where experiment_id = '32000000-0000-0000-0000-000000000001'
  ),
  3::bigint,
  'duplicate_post creates an independent Post row'
);
select is(
  (
    select count(*) from public.seeded_comments
    where experiment_id = '32000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'duplicate_post deep-copies seeded comments'
);
select is(
  (
    select count(*) from public.posts
    where original_youtube_url = 'https://www.youtube.com/shorts/abcdefghijk?feature=share'
  ),
  2::bigint,
  'duplicate_post preserves the exact original YouTube URL'
);
select lives_ok(
  $$ select public.duplicate_condition('52000000-0000-0000-0000-000000000001') $$,
  'an owner can duplicate a condition atomically'
);
select is(
  (
    select count(*) from public.conditions
    where experiment_id = '32000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'duplicate_condition creates an independent condition'
);
select is(
  (select post_order_mode::text from public.conditions where name = 'Condition A copy'),
  'per_participant_randomized',
  'duplicate_condition preserves its per-participant shuffle setting'
);
select is(
  (select time_display::text from public.conditions where name = 'Condition A copy'),
  'progress_remaining',
  'duplicate_condition preserves its participant time-display treatment'
);
select is(
  (
    select count(*) from public.posts
    where experiment_id = '32000000-0000-0000-0000-000000000001'
  ),
  6::bigint,
  'duplicate_condition deep-copies every Post'
);
select public.move_post('62000000-0000-0000-0000-000000000002', 'up');
select is(
  (select position from public.posts where id = '62000000-0000-0000-0000-000000000002'),
  0,
  'move_post persists deterministic ordering'
);
select throws_ok(
  $$ update public.creator_profiles set archived_at = now() where id = '42000000-0000-0000-0000-000000000001' $$,
  '23503',
  'Reassign Posts in active studies before deleting this creator profile',
  'an assigned creator profile cannot be deleted'
);
update public.experiments set status = 'archived'
where id = '32000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ update public.creator_profiles set archived_at = now() where id = '42000000-0000-0000-0000-000000000001' $$,
  'Posts in an archived experiment do not block creator-profile archival'
);
select ok(
  (select archived_at is not null from public.creator_profiles where id = '42000000-0000-0000-0000-000000000001'),
  'the creator remains retained with an archive timestamp'
);
select lives_ok(
  $$ update public.creator_profiles set archived_at = now() where id = '42000000-0000-0000-0000-000000000002' $$,
  'an unused creator profile can be soft-deleted'
);
select ok(
  (select archived_at is not null from public.creator_profiles where id = '42000000-0000-0000-0000-000000000002'),
  'soft-deleted creator profile remains retained with an archive timestamp'
);

select * from finish();
rollback;
