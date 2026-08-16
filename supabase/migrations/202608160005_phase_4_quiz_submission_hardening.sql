-- P4-04 forward-fix: serialize start/resume after taking the advisory lock and
-- reject malformed/ambiguous answer payloads before any answer row is written.

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns table(
  attempt_id uuid,
  quiz_id uuid,
  attempt_number integer,
  started_at timestamptz,
  expires_at timestamptz,
  resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz record;
  topic record;
  v_existing public.quiz_attempts%rowtype;
  v_expires timestamptz;
  v_count integer;
  v_next integer;
  v_new public.quiz_attempts%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_access_quiz(p_quiz_id) then raise exception 'QUIZ_NOT_ACCESSIBLE'; end if;

  select * into quiz from public.quizzes where id = p_quiz_id;
  if quiz.status <> 'PUBLISHED' then raise exception 'QUIZ_NOT_PUBLISHED'; end if;

  select * into topic from public.learning_topics where id = quiz.topic_id;
  if topic.close_at is not null and topic.close_at <= now() then
    raise exception 'TOPIC_CLOSED';
  end if;

  if not exists (select 1 from public.quiz_questions qq where qq.quiz_id = p_quiz_id) then
    raise exception 'QUIZ_HAS_NO_QUESTIONS';
  end if;

  -- Lock before looking for an active attempt. A concurrent request that waited here
  -- must re-read the committed row and resume it instead of allocating another slot.
  perform pg_advisory_xact_lock(hashtext(p_quiz_id::text || auth.uid()::text));

  select * into v_existing from public.quiz_attempts a
  where a.quiz_id = p_quiz_id and a.user_id = auth.uid() and a.submitted_at is null
  order by a.attempt_number desc limit 1
  for update;

  if found then
    v_expires := case when quiz.time_limit_minutes is null then null
      else v_existing.started_at + make_interval(mins => quiz.time_limit_minutes) end;
    if v_expires is null or v_expires > now() then
      return query select v_existing.id, v_existing.quiz_id, v_existing.attempt_number,
        v_existing.started_at, v_expires, true;
      return;
    end if;
  end if;

  select count(*)::integer into v_count
  from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.user_id = auth.uid();
  if quiz.max_attempts is not null and v_count >= quiz.max_attempts then
    raise exception 'MAX_ATTEMPTS_REACHED';
  end if;

  select coalesce(max(a.attempt_number), 0) + 1 into v_next
  from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.user_id = auth.uid();

  insert into public.quiz_attempts (quiz_id, user_id, attempt_number)
  values (p_quiz_id, auth.uid(), v_next)
  returning * into v_new;

  v_expires := case when quiz.time_limit_minutes is null then null
    else v_new.started_at + make_interval(mins => quiz.time_limit_minutes) end;

  return query select v_new.id, v_new.quiz_id, v_new.attempt_number, v_new.started_at, v_expires, false;
end $$;

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns table(
  attempt_id uuid,
  score numeric,
  passed boolean,
  submitted_at timestamptz,
  attempt_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.quiz_attempts%rowtype;
  quiz record;
  v_expires timestamptz;
  v_total_points numeric := 0;
  v_earned numeric := 0;
  v_score numeric;
  v_passed boolean;
  item jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_seen_questions uuid[] := '{}';
  q record;
  v_correct uuid[];
  v_is_correct boolean;
  v_points numeric;
  v_option_payload jsonb;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'INVALID_SUBMISSION';
  end if;

  select * into attempt from public.quiz_attempts a where a.id = p_attempt_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if attempt.user_id <> auth.uid() then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;
  if attempt.submitted_at is not null then raise exception 'ATTEMPT_ALREADY_SUBMITTED'; end if;

  select * into quiz from public.quizzes where id = attempt.quiz_id;
  if quiz.time_limit_minutes is not null then
    v_expires := attempt.started_at + make_interval(mins => quiz.time_limit_minutes);
    if now() >= v_expires then raise exception 'ATTEMPT_EXPIRED'; end if;
  end if;

  -- Validate the whole payload before scoring or inserting any answer row. The explicit JSON
  -- shape checks turn malformed objects/scalars into one stable business error instead of leaking
  -- jsonb_array_elements/UUID cast errors. Duplicate question entries are ambiguous and rejected.
  begin
    for item in select value from jsonb_array_elements(p_answers) as elements(value)
    loop
      if jsonb_typeof(item) <> 'object'
        or not (item ? 'question_id')
        or jsonb_typeof(item->'question_id') <> 'string'
      then
        raise exception 'INVALID_SUBMISSION';
      end if;

      v_question_id := (item->>'question_id')::uuid;
      if v_question_id = any(v_seen_questions) then
        raise exception 'DUPLICATE_QUESTION_IN_SUBMISSION';
      end if;
      v_seen_questions := array_append(v_seen_questions, v_question_id);

      if not exists (
        select 1 from public.quiz_questions qq
        where qq.id = v_question_id and qq.quiz_id = attempt.quiz_id
      ) then
        raise exception 'INVALID_QUESTION_FOR_QUIZ';
      end if;

      v_option_payload := item->'selected_option_ids';
      if v_option_payload is null then
        v_option_payload := '[]'::jsonb;
      elsif jsonb_typeof(v_option_payload) <> 'array' then
        raise exception 'INVALID_SUBMISSION';
      end if;

      select coalesce(array_agg(distinct option_id order by option_id), '{}')
        into v_selected
      from (
        select value::uuid as option_id
        from jsonb_array_elements_text(v_option_payload) as option_values(value)
      ) selected;

      if exists (
        select 1 from unnest(v_selected) as sel(id)
        where not exists (
          select 1 from public.quiz_options qo
          where qo.id = sel.id and qo.question_id = v_question_id
        )
      ) then
        raise exception 'INVALID_OPTION_FOR_QUESTION';
      end if;

      if exists (
        select 1 from public.quiz_questions qq
        where qq.id = v_question_id and qq.question_type = 'SINGLE'
          and cardinality(v_selected) > 1
      ) then
        raise exception 'INVALID_SINGLE_SELECTION';
      end if;
    end loop;
  exception
    when invalid_text_representation or invalid_parameter_value then
      raise exception 'INVALID_SUBMISSION';
  end;

  for q in select * from public.quiz_questions qq where qq.quiz_id = attempt.quiz_id
  loop
    select coalesce(array_agg(qo.id order by qo.id), '{}') into v_correct
    from public.quiz_options qo where qo.question_id = q.id and qo.is_correct = true;

    select coalesce(array_agg(distinct option_id order by option_id), '{}') into v_selected
    from (
      select option_value::uuid as option_id
      from jsonb_array_elements(p_answers) elem,
        jsonb_array_elements_text(coalesce(elem->'selected_option_ids', '[]'::jsonb))
          as selected_values(option_value)
      where (elem->>'question_id')::uuid = q.id
    ) selected;
    v_selected := coalesce(v_selected, '{}');

    v_is_correct := (v_selected = v_correct);
    v_points := case when v_is_correct then q.points else 0 end;

    insert into public.quiz_answers (attempt_id, question_id, selected_option_ids, is_correct, awarded_points)
    values (p_attempt_id, q.id, v_selected, v_is_correct, v_points);

    v_total_points := v_total_points + q.points;
    v_earned := v_earned + v_points;
  end loop;

  v_score := case when v_total_points > 0 then round((v_earned / v_total_points) * 100, 2) else 0 end;
  v_passed := v_score >= quiz.pass_score;

  update public.quiz_attempts
  set score = v_score, passed = v_passed, submitted_at = now()
  where id = p_attempt_id
  returning * into attempt;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'QUIZ_ATTEMPT_SUBMITTED', 'quiz_attempt', p_attempt_id,
    (select owner_organization_id from public.learning_topics where id = quiz.topic_id),
    jsonb_build_object('quiz_id', attempt.quiz_id, 'score', v_score, 'passed', v_passed,
      'attempt_number', attempt.attempt_number));

  return query select attempt.id, attempt.score, attempt.passed, attempt.submitted_at, attempt.attempt_number;
end $$;

