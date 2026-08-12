-- Qualify table columns that share names with join_study output columns.

create or replace function public.join_study(target_code text)
returns table (
  participant_id uuid, experiment_id uuid, publication_snapshot_id uuid,
  publication_condition_id uuid, condition_name text, assignment_id uuid,
  session_id uuid, session_mode public.session_mode,
  session_duration_seconds integer, time_display public.time_display_mode,
  post_order_mode public.post_order_mode
)
language plpgsql security definer set search_path = '' as $$
declare
  normalized_code text := upper(btrim(target_code));
  code_row public.study_codes%rowtype;
  snapshot_row public.publication_snapshots%rowtype;
  existing_assignment public.assignments%rowtype;
  selected_condition public.publication_conditions%rowtype;
  active_session public.sessions%rowtype;
  generated_session_id uuid;
  draw_value numeric(17,16);
  condition_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select sc.* into code_row from public.study_codes sc where sc.code = normalized_code and sc.is_active;
  if code_row.code is null then raise exception 'Study code is invalid or inactive' using errcode = 'P0002'; end if;
  select ps.* into snapshot_row from public.publication_snapshots ps where ps.id = code_row.publication_snapshot_id;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || code_row.experiment_id::text, 2));
  insert into public.participants (id) values (auth.uid()) on conflict (id) do nothing;
  if exists (
    select 1 from public.sessions s where s.participant_id = auth.uid()
      and s.experiment_id = code_row.experiment_id and s.status = 'completed'
  ) then
    raise exception 'This participant has already completed this study' using errcode = '23505';
  end if;
  select a.* into existing_assignment from public.assignments a
  where a.participant_id = auth.uid() and a.experiment_id = code_row.experiment_id;
  if existing_assignment.id is null then
    select count(*) into condition_count from public.publication_conditions pc
    where pc.publication_snapshot_id = code_row.publication_snapshot_id;
    if condition_count = 0 then raise exception 'Published study has no conditions' using errcode = '22023'; end if;
    draw_value := least(random()::numeric(17,16), 0.9999999999999999);
    select pc.* into selected_condition from public.publication_conditions pc
    where pc.publication_snapshot_id = code_row.publication_snapshot_id
    order by pc.position, pc.id offset floor(draw_value * condition_count)::integer limit 1;
    insert into public.assignments (
      participant_id, experiment_id, publication_snapshot_id,
      publication_condition_id, random_draw, candidate_condition_count
    ) values (
      auth.uid(), code_row.experiment_id, code_row.publication_snapshot_id,
      selected_condition.id, draw_value, condition_count
    ) returning * into existing_assignment;
  else
    select pc.* into selected_condition from public.publication_conditions pc
    where pc.id = existing_assignment.publication_condition_id;
    select ps.* into snapshot_row from public.publication_snapshots ps
    where ps.id = existing_assignment.publication_snapshot_id;
  end if;
  select s.* into active_session from public.sessions s where s.participant_id = auth.uid()
    and s.experiment_id = code_row.experiment_id and s.status = 'started';
  if active_session.id is null then
    generated_session_id := extensions.gen_random_uuid();
    insert into public.sessions (
      id, assignment_id, participant_id, experiment_id,
      publication_snapshot_id, publication_condition_id, started_at
    ) values (
      generated_session_id, existing_assignment.id, auth.uid(), existing_assignment.experiment_id,
      existing_assignment.publication_snapshot_id, existing_assignment.publication_condition_id, now()
    ) returning * into active_session;
    perform public.materialize_session_post_order(active_session.id);
  end if;
  return query select auth.uid(), existing_assignment.experiment_id,
    existing_assignment.publication_snapshot_id, existing_assignment.publication_condition_id,
    selected_condition.name, existing_assignment.id, active_session.id,
    snapshot_row.session_mode, snapshot_row.session_duration_seconds,
    selected_condition.time_display, selected_condition.post_order_mode;
end;
$$;
