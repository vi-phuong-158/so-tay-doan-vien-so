begin;

-- Require participant identity before a normal submit can finalize and issue a certificate.
-- Expired legacy attempts may still finalize from their accepted answers, but issuance remains
-- conditional on the immutable participant snapshot in the RPC below.
create or replace function public.nq_attempt(
  p_action text,
  p_attempt_id uuid default null,
  p_question_id uuid default null,
  p_option_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bank public.quizzes%rowtype;
  attempt public.quiz_attempts%rowtype;
  state quiz_private.attempt_snapshots%rowtype;
  payload jsonb;
  question jsonb;
  v_questions jsonb;
  v_correct integer := 0;
  v_answered integer := 0;
  v_selected uuid;
  v_number integer;
  v_now timestamptz;
  v_score numeric(5,2);
  v_passed boolean;
  v_participant public.nq_attempt_participants%rowtype;
  v_cert public.nq_certificates%rowtype;
  v_cert_code text;
begin
  if auth.uid() is null or (not public.is_active_user() and not public.is_nq_300_guest()) then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  if p_action is null or p_action not in ('resume','start','answer','submit','read') then
    raise exception 'INVALID_SUBMISSION';
  end if;

  select * into bank from public.quizzes where bank_code = 'NQ_300';
  if bank.id is null or (public.is_nq_300_guest() and not public.can_access_nq_300_guest_quiz(bank.id)) or (not public.is_nq_300_guest() and not public.can_access_quiz(bank.id)) then
    raise exception 'QUIZ_NOT_ACCESSIBLE';
  end if;

  -- Serializes start, autosave and finalize across tabs and concurrent requests.
  perform pg_advisory_xact_lock(hashtext(bank.id::text || auth.uid()::text));

  if p_attempt_id is not null then
    select * into attempt from public.quiz_attempts where id = p_attempt_id for update;
    if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
    if attempt.user_id <> auth.uid() or attempt.quiz_id <> bank.id then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;
  elsif p_action in ('start','resume') then
    select * into attempt from public.quiz_attempts
      where quiz_id = bank.id and user_id = auth.uid() order by attempt_number desc limit 1 for update;
  else
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  v_now := clock_timestamp();

  if p_action = 'start' and (attempt.id is null or attempt.submitted_at is not null) then
    if bank.status <> 'PUBLISHED' then raise exception 'QUIZ_NOT_PUBLISHED'; end if;
    if exists (select 1 from public.learning_topics where id = bank.topic_id and close_at <= v_now) then raise exception 'TOPIC_CLOSED'; end if;
    if (select count(*) from public.quiz_questions where quiz_id = bank.id and question_number is not null) <> 300 then
      raise exception 'QUIZ_BANK_INCOMPLETE';
    end if;
    select coalesce(max(attempt_number), 0) + 1 into v_number from public.quiz_attempts
      where quiz_id = bank.id and user_id = auth.uid();
    insert into public.quiz_attempts(quiz_id,user_id,attempt_number,started_at)
      values(bank.id,auth.uid(),v_number,v_now) returning * into attempt;
    select jsonb_agg(jsonb_build_object('id', q.id, 'question_number',q.question_number,
      'text',q.question_text,'correct_option_id',(select o.id from public.quiz_options o where o.question_id=q.id and o.is_correct),
      'options',(select jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text) order by random())
        from public.quiz_options o where o.question_id=q.id)) order by q.draw)
      into v_questions
      from (select qq.*, random() as draw from public.quiz_questions qq
        where qq.quiz_id=bank.id and qq.question_number is not null order by draw limit 30) q;
    if exists (select 1 from jsonb_array_elements(v_questions) q
      where q->>'correct_option_id' is null or jsonb_array_length(q->'options') <> 4) then raise exception 'QUIZ_BANK_INCOMPLETE'; end if;
    insert into quiz_private.attempt_snapshots(attempt_id,expires_at,questions)
      values(attempt.id,v_now + interval '20 minutes',v_questions);
  end if;

  if attempt.id is null then return null; end if;

  select * into state from quiz_private.attempt_snapshots where attempt_id=attempt.id for update;
  if state.attempt_id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;

  v_now := clock_timestamp();

  if p_action = 'answer' and attempt.submitted_at is not null then raise exception 'ATTEMPT_ALREADY_SUBMITTED'; end if;

  if p_action = 'answer' and v_now < state.expires_at then
    select q into question from jsonb_array_elements(state.questions) q where q->>'id'=p_question_id::text;
    if question is null then raise exception 'INVALID_QUESTION_FOR_QUIZ'; end if;
    if p_option_id is not null and not exists (select 1 from jsonb_array_elements(question->'options') o where o->>'id'=p_option_id::text) then
      raise exception 'INVALID_OPTION_FOR_QUESTION';
    end if;
    state.answers := jsonb_set(state.answers, array[p_question_id::text], to_jsonb(coalesce(p_option_id::text,'')));
    update quiz_private.attempt_snapshots set answers=state.answers where attempt_id=attempt.id;
  end if;

  -- Late traffic cannot save new answers. Any read/start/submit lazily finalizes at the
  -- immutable deadline using answers already accepted by the server, even after reconnect.
  -- Explicit submission before the deadline requires a valid participant snapshot.
  -- Deadline finalization remains available for legacy attempts; certificate issuance below
  -- still requires a participant row, so an expired legacy attempt cannot get a certificate.
  if attempt.submitted_at is null
    and p_action = 'submit'
    and v_now < state.expires_at
    and not exists (
      select 1 from public.nq_attempt_participants p
      where p.attempt_id = attempt.id
        and length(btrim(p.full_name)) between 2 and 120
        and length(btrim(p.organization_name)) between 2 and 180
    ) then
    raise exception 'PARTICIPANT_REQUIRED';
  end if;
  if attempt.submitted_at is null and (p_action='submit' or v_now >= state.expires_at) then
    for question in select value from jsonb_array_elements(state.questions) loop
      v_selected := nullif(state.answers->>(question->>'id'),'')::uuid;
      if v_selected is not null then v_answered := v_answered + 1; end if;
      if v_selected::text = question->>'correct_option_id' then v_correct := v_correct + 1; end if;
      insert into public.quiz_answers(attempt_id,question_id,selected_option_ids,is_correct,awarded_points)
        values(attempt.id,(question->>'id')::uuid,
          case when v_selected is null then '{}'::uuid[] else array[v_selected] end,
          coalesce(v_selected::text=question->>'correct_option_id',false),
          case when v_selected::text=question->>'correct_option_id' then 1 else 0 end);
    end loop;

    -- Strict 80% passing boundary: 24/30 is 80.00% (PASS), 23/30 is 76.67% (FAIL)
    v_score := round(v_correct::numeric / 30 * 100, 2);
    v_passed := (v_correct >= 24);

    update public.quiz_attempts
      set submitted_at = least(v_now, state.expires_at),
          score = v_score,
          passed = v_passed
      where id = attempt.id
      returning * into attempt;

    state.status := case when v_now >= state.expires_at then 'EXPIRED' else 'SUBMITTED' end;
    update quiz_private.attempt_snapshots set status=state.status where attempt_id=attempt.id;

    -- Auto-issue certificate if passed and participant snapshot exists
    if v_passed then
      select * into v_participant from public.nq_attempt_participants where attempt_id = attempt.id;
      if v_participant.attempt_id is not null then
        select * into v_cert from public.nq_certificates where attempt_id = attempt.id;
        if v_cert.id is null then
          v_cert_code := 'NQ13-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
          insert into public.nq_certificates(
            certificate_code, attempt_id, quiz_id, full_name, organization_name,
            score, correct_count, total_questions, issued_at
          ) values (
            v_cert_code, attempt.id, bank.id, v_participant.full_name, v_participant.organization_name,
            v_score, v_correct, 30, least(v_now, state.expires_at)
          ) on conflict (attempt_id) do nothing
          returning * into v_cert;

          if v_cert.id is null then
            select * into v_cert from public.nq_certificates where attempt_id = attempt.id;
          end if;
        end if;
      end if;
    end if;
  end if;

  if attempt.submitted_at is not null then
    select count(*) filter(where is_correct), count(*) filter(where cardinality(selected_option_ids)>0)
      into v_correct, v_answered from public.quiz_answers where attempt_id=attempt.id;
    select * into v_participant from public.nq_attempt_participants where attempt_id = attempt.id;
    select * into v_cert from public.nq_certificates where attempt_id = attempt.id;
  else
    select * into v_participant from public.nq_attempt_participants where attempt_id = attempt.id;
  end if;

  select jsonb_agg(case when attempt.submitted_at is null then q - 'correct_option_id' else q end order by ord)
    into payload from jsonb_array_elements(state.questions) with ordinality as e(q,ord);

  return jsonb_build_object(
    'attempt_id', attempt.id,
    'started_at', attempt.started_at,
    'expires_at', state.expires_at,
    'server_now', clock_timestamp(),
    'status', state.status,
    'submitted_at', attempt.submitted_at,
    'questions', payload,
    'answers', state.answers,
    'participant', case when v_participant.attempt_id is not null
      then jsonb_build_object('full_name', v_participant.full_name, 'organization_name', v_participant.organization_name)
      else null end
  ) || case when attempt.submitted_at is null then '{}'::jsonb else
    jsonb_build_object(
      'correct', v_correct,
      'wrong', v_answered - v_correct,
      'unanswered', 30 - v_answered,
      'percentage', attempt.score,
      'passed', attempt.passed,
      'pass_score', 80,
      'elapsed_seconds', floor(extract(epoch from attempt.submitted_at - attempt.started_at)),
      'certificate', case when v_cert.id is not null then jsonb_build_object(
        'code', v_cert.certificate_code,
        'issued_at', v_cert.issued_at,
        'full_name', v_cert.full_name,
        'organization_name', v_cert.organization_name,
        'score', v_cert.score,
        'correct_count', v_cert.correct_count,
        'total_questions', v_cert.total_questions
      ) else null end
    ) end;
end $$;

revoke all on function public.nq_attempt(text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.nq_attempt(text,uuid,uuid,uuid) to authenticated;

commit;
