begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now()),
  ('21000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('21000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now());

insert into public.researcher_profiles (user_id)
values
  ('11000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000002');

insert into public.experiments (id, owner_id, name, session_mode)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'Owned Experiment',
    'stimulus_controlled'
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000002',
    'Other Experiment',
    'stimulus_controlled'
  );

insert into public.conditions (id, experiment_id, name, position)
values
  ('51000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'Owned', 0),
  ('51000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'Other', 0);

insert into public.publication_snapshots (
  id, experiment_id, snapshot_number, experiment_name, experiment_description,
  session_mode, time_display
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    1, 'Owned Experiment', '', 'stimulus_controlled', 'hidden'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000002',
    1, 'Other Experiment', '', 'stimulus_controlled', 'hidden'
  );

insert into public.publication_conditions (
  id, publication_snapshot_id, experiment_id, source_condition_id, name, position
)
values
  (
    '71100000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001', 'Owned', 0
  ),
  (
    '71100000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000002', 'Other', 0
  );

insert into public.participants (id)
values
  ('21000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000002');

insert into public.assignments (
  id, participant_id, experiment_id, publication_snapshot_id,
  publication_condition_id, random_draw, candidate_condition_count
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '71100000-0000-0000-0000-000000000001', 0.2, 1
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    '71100000-0000-0000-0000-000000000002', 0.8, 1
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

select results_eq(
  $$ select name from public.experiments order by name $$,
  $$ values ('Owned Experiment'::text) $$,
  'a researcher reads only owned experiments'
);
select results_eq(
  $$ select name from public.conditions order by name $$,
  $$ values ('Owned'::text) $$,
  'a researcher reads only conditions in owned experiments'
);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  'a researcher reads assignments only for owned experiments'
);

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.assignments),
  1::bigint,
  'a participant reads only its own assignment'
);
select is(
  (select count(*) from public.publication_snapshots),
  1::bigint,
  'a participant reads only its assigned publication snapshot'
);
select is(
  (select count(*) from public.publication_conditions),
  1::bigint,
  'a participant reads only conditions in its assigned publication snapshot'
);
select is(
  (select count(*) from public.experiments),
  0::bigint,
  'a participant cannot read editable experiment authoring records'
);
select throws_ok(
  $$
    insert into public.assignments (
      participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, random_draw, candidate_condition_count
    ) values (
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002',
      '71000000-0000-0000-0000-000000000002',
      '71100000-0000-0000-0000-000000000002', 0.5, 1
    )
  $$,
  '42501'
);

select * from finish();
rollback;
