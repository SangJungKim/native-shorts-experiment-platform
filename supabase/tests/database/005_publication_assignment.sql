begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

insert into public.experiments (
  id, owner_id, name, session_mode, session_duration_seconds
) values (
  '35000000-0000-0000-0000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Publication test', 'time_controlled', 300
);
insert into public.creator_profiles (
  id, owner_id, experiment_id, display_name, handle, profile_description, profile_image_path
) values (
  '45000000-0000-0000-0000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '35000000-0000-0000-0000-000000000001',
  'Study Creator', 'studycreator', 'Configured profile',
  '11111111-1111-4111-8111-111111111111/profile.png'
);
insert into public.conditions (
  id, experiment_id, name, position, post_order_mode, time_display
) values
  ('55000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'A', 0, 'per_participant_randomized', 'progress_remaining'),
  ('55000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', 'B', 1, 'fixed', 'hidden');
insert into public.posts (
  id, experiment_id, condition_id, creator_profile_id, original_youtube_url,
  youtube_video_id, video_duration_seconds, display_likes, display_shares, position
) values
  ('65000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 'https://www.youtube.com/shorts/aaaaaaaaaaa?feature=share', 'aaaaaaaaaaa', 10, 12, 3, 0),
  ('65000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 'https://www.youtube.com/shorts/bbbbbbbbbbb', 'bbbbbbbbbbb', 11, 14, 4, 1),
  ('65000000-0000-0000-0000-000000000003', '35000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000001', 'https://www.youtube.com/shorts/ccccccccccc', 'ccccccccccc', 12, 16, 5, 0);
insert into public.seeded_comments (experiment_id, post_id, display_name, comment_text, position)
values ('35000000-0000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000001', 'Viewer', 'Comment', 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$ create temporary table published_result as select * from public.publish_experiment('35000000-0000-0000-0000-000000000001') $$,
  'an owner can publish a complete experiment atomically'
);
select is((select status::text from public.experiments where id = '35000000-0000-0000-0000-000000000001'), 'published', 'publication updates experiment status');
select matches((select study_code from published_result), '^[A-Z0-9]{8}$', 'publication creates an eight-character study code');
select is((select count(*) from public.publication_conditions where experiment_id = '35000000-0000-0000-0000-000000000001'), 2::bigint, 'all conditions are snapshotted');
select is((select count(*) from public.publication_posts where experiment_id = '35000000-0000-0000-0000-000000000001'), 3::bigint, 'all Posts are snapshotted');
select is((select count(*) from public.publication_seeded_comments psc join public.publication_posts pp on pp.id = psc.publication_post_id where pp.experiment_id = '35000000-0000-0000-0000-000000000001'), 1::bigint, 'seeded comments are snapshotted');
select is((select original_youtube_url from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), 'https://www.youtube.com/shorts/aaaaaaaaaaa?feature=share', 'the exact original URL is preserved');
select is((select time_display::text from public.publication_conditions where source_condition_id = '55000000-0000-0000-0000-000000000001'), 'progress_remaining', 'condition time display is snapshotted');
select is((select post_order_mode::text from public.publication_conditions where source_condition_id = '55000000-0000-0000-0000-000000000001'), 'per_participant_randomized', 'condition randomization is snapshotted');
select is((select creator_display_name from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), 'Study Creator', 'creator display name is snapshotted');
select is((select creator_handle from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), 'studycreator', 'creator handle is snapshotted');
select is((select creator_profile_image_path from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), '11111111-1111-4111-8111-111111111111/profile.png', 'creator image path is snapshotted');
select is((select video_title from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), 'aaaaaaaaaaa', 'researcher-readable video title is snapshotted');
select is((select post_name from public.publication_posts where source_post_id = '65000000-0000-0000-0000-000000000001'), 'aaaaaaaaaaa', 'researcher-defined Post name is snapshotted');

reset role;
insert into auth.users (id, aud, role, created_at, updated_at, is_anonymous)
values ('25000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now(), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ create temporary table joined_result as select * from public.join_study((select study_code from published_result)) $$,
  'an anonymous authenticated participant can join with the active code'
);
select is((select count(*) from public.assignments where participant_id = '25000000-0000-0000-0000-000000000001'), 1::bigint, 'joining creates exactly one assignment');
select is((select method::text from public.assignments where participant_id = '25000000-0000-0000-0000-000000000001'), 'simple_random', 'assignment records the simple-random method');
select is((select candidate_condition_count from public.assignments where participant_id = '25000000-0000-0000-0000-000000000001'), 2, 'assignment records the candidate condition count');
select is((select count(*) from public.sessions where participant_id = '25000000-0000-0000-0000-000000000001'), 1::bigint, 'joining creates one active session');
select is((select count(*) from public.session_post_order), (select count(*) from public.publication_posts where publication_condition_id = (select publication_condition_id from public.assignments)), 'joining materializes every assigned-condition Post');
select lives_ok(
  $$ select * from public.join_study((select study_code from published_result)) $$,
  'joining again is idempotent for an active participant'
);
select is((select count(*) from public.assignments where participant_id = '25000000-0000-0000-0000-000000000001'), 1::bigint, 'retrying does not change or duplicate the assignment');
create temporary table pre_interaction_display as
select pp.display_likes
from public.publication_posts pp
where pp.id = (select publication_post_id from public.session_post_order order by presentation_position limit 1);
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'post_activated', now(), 0) $$,
  'a participant can record an activated Post'
);
select is((select count(*) from public.behavior_events where session_id = (select session_id from joined_result) and event_type = 'post_activated'), 1::bigint, 'activation remains as an append-only event');
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'like', now(), 0) $$,
  'a participant can record a like through the trusted interaction function'
);
select ok((select liked from public.participant_post_state where session_id = (select session_id from joined_result)), 'participant like state is stored separately');
select is((select display_likes from public.publication_posts where id = (select publication_post_id from public.participant_post_state where session_id = (select session_id from joined_result))), (select display_likes from pre_interaction_display), 'liking does not mutate displayed likes');
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'unlike', now(), 0) $$,
  'a participant can unlike a Post'
);
select isnt((select liked from public.participant_post_state where session_id = (select session_id from joined_result)), true, 'unlike updates only participant state');
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'comments_opened', now(), 0) $$,
  'a participant can record opening comments'
);
select is((select comments_opened_count from public.participant_post_state where session_id = (select session_id from joined_result)), 1, 'comment openings are counted');
select lives_ok(
  $$ select public.submit_participant_comment((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'Anonymous viewer', 'Participant response', 2.5) $$,
  'a participant can submit a comment to an assigned Post'
);
select is((select count(*) from public.participant_comments where session_id = (select session_id from joined_result)), 1::bigint, 'participant comments are stored separately from seeded comments');
select is((select count(*) from public.behavior_events where session_id = (select session_id from joined_result) and event_type = 'comment_submitted'), 1::bigint, 'comment submission creates an append-only event');
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'share_tapped', now(), 0) $$,
  'a participant can record a share tap'
);
select ok((select share_tapped from public.participant_post_state where session_id = (select session_id from joined_result)), 'share state is stored separately');
select ok((select reposted from public.participant_post_state where session_id = (select session_id from joined_result)), 'current repost state is selected');
select lives_ok(
  $$ select public.record_participant_interaction((select session_id from joined_result), (select publication_post_id from public.session_post_order order by presentation_position limit 1), 'share_untapped', now(), 0) $$,
  'a participant can undo a repost'
);
select isnt((select reposted from public.participant_post_state where session_id = (select session_id from joined_result)), true, 'undo clears current repost state');
select ok((select share_tapped from public.participant_post_state where session_id = (select session_id from joined_result)), 'undo retains historical share-tapped state');
select is((select count(*) from public.behavior_events where session_id = (select session_id from joined_result)), 7::bigint, 'each interaction remains as an append-only event');
update public.sessions set status = 'completed', ended_at = now()
where participant_id = '25000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ select * from public.join_study((select study_code from published_result)) $$,
  '23505',
  'This participant has already completed this study',
  'a participant cannot re-enter a completed study'
);

reset role;
insert into auth.users (id, aud, role, created_at, updated_at, is_anonymous)
values ('25000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now(), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ create temporary table second_joined_result as select * from public.join_study((select study_code from published_result)) $$,
  'a second participant can hold an active session before deactivation'
);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$ select * from public.deactivate_experiment('35000000-0000-0000-0000-000000000001') $$,
  'the researcher can deactivate the whole study'
);
select is((select status::text from public.experiments where id = '35000000-0000-0000-0000-000000000001'), 'archived', 'deactivation archives the experiment without deleting it');
select isnt((select is_active from public.study_codes where code = (select study_code from published_result)), true, 'deactivation makes its study code unusable');
select is((select status::text from public.sessions where id = (select session_id from second_joined_result)), 'interrupted', 'deactivation interrupts an active participant session');

select * from finish();
rollback;
