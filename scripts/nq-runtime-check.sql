-- Run only on the verified project/local database. All fixtures roll back.
begin;
set local plpgsql.check_asserts = on;
-- Publication is temporary for acceptance; rollback restores the deployment gate.
update public.quizzes set status='PUBLISHED' where bank_code='NQ_300';
update public.learning_topics set status='PUBLISHED' where id=(select topic_id from public.quizzes where bank_code='NQ_300');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('6f937301-3b91-4c21-bde5-804359703001','authenticated','authenticated','nq-sql-a@example.invalid','{}','{}'),
       ('6f937301-3b91-4c21-bde5-804359703002','authenticated','authenticated','nq-sql-b@example.invalid','{}','{}');
insert into public.profiles(id,full_name,account_status)
values ('6f937301-3b91-4c21-bde5-804359703001','NQ acceptance A','ACTIVE'),
       ('6f937301-3b91-4c21-bde5-804359703002','NQ acceptance B','ACTIVE');

do $$
<<checks>>
declare s jsonb; r jsonb; q jsonb; option_id uuid; correct_id uuid; attempt_id uuid; old_id uuid;
  v_count integer; safe_questions jsonb; deadline text; bank uuid;
begin
  select id into bank from public.quizzes where bank_code='NQ_300';
  assert (select count(*) from public.quiz_questions where quiz_id=bank)=300, '300 questions';
  assert (select count(distinct question_number) from public.quiz_questions where quiz_id=bank)=300, '300 distinct numbers';
  assert not exists(select 1 from public.quiz_questions qq left join public.quiz_options o on o.question_id=qq.id
    where qq.quiz_id=bank group by qq.id having count(o.id)<>4 or count(distinct o.source_label)<>4
      or count(*) filter(where o.is_correct)<>1), 'Four labels and one correct key per question';
  assert not has_function_privilege('anon','public.nq_attempt(text,uuid,uuid,uuid)','EXECUTE'), 'Anonymous attempt denied';
  assert not has_function_privilege('anon','public.lookup_nq_questions(text,integer)','EXECUTE'), 'Anonymous lookup denied';
  assert not has_schema_privilege('authenticated','quiz_private','USAGE'), 'Private snapshot schema denied';
  assert not has_table_privilege('authenticated','public.quiz_attempts','UPDATE'), 'Direct attempt mutation denied';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703001","role":"authenticated"}',true);
  perform set_config('role','authenticated',true);
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  old_id := attempt_id;
  safe_questions := s->'questions';
  deadline := s->>'expires_at';
  assert jsonb_array_length(safe_questions)=30, '30 questions per attempt';
  assert (select count(distinct value->>'id') from jsonb_array_elements(safe_questions))=30, 'No repeated question';
  assert not exists(select 1 from jsonb_array_elements(safe_questions) item where (item->>'question_number')::integer not between 1 and 300), 'All source numbers in range';
  assert (s->>'expires_at')::timestamptz-(s->>'started_at')::timestamptz=interval '20 minutes', '20 minute deadline';
  assert s::text !~ 'correct|is_correct|answer_key|explanation', 'No key in attempt payload';
  assert (public.nq_attempt('start')->>'attempt_id')::uuid=attempt_id, 'Repeated start resumes';
  r := public.nq_attempt('resume');
  assert r->'questions'=safe_questions and r->>'expires_at'=deadline, 'Refresh preserves questions, options and deadline';
  q := safe_questions->0;
  perform set_config('role','postgres',true);
  select (value->>'correct_option_id')::uuid into correct_id from quiz_private.attempt_snapshots,
    jsonb_array_elements(questions) where attempt_snapshots.attempt_id=checks.attempt_id and value->>'id'=checks.q->>'id';
  perform set_config('role','authenticated',true);
  s := public.nq_attempt('answer',attempt_id,(q->>'id')::uuid,correct_id);
  assert s->'answers'->>(q->>'id')=correct_id::text, 'Autosave persisted';
  r := public.nq_attempt('resume');
  assert r->'answers'=s->'answers' and r->'questions'=safe_questions, 'Reload preserves answers';
  -- Second answer deliberately wrong, leaving 28 unanswered.
  q := safe_questions->1;
  perform set_config('role','postgres',true);
  select (o->>'id')::uuid into option_id from quiz_private.attempt_snapshots t,
    jsonb_array_elements(t.questions) question,jsonb_array_elements(question->'options') o
    where t.attempt_id=checks.attempt_id and question->>'id'=checks.q->>'id'
      and o->>'id'<>question->>'correct_option_id' limit 1;
  perform set_config('role','authenticated',true);
  perform public.nq_attempt('answer',attempt_id,(q->>'id')::uuid,option_id);
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703002","role":"authenticated"}',true);
  begin
    perform public.nq_attempt('answer',attempt_id,(q->>'id')::uuid,option_id);
    raise exception 'Cross-user mutation unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;
  begin
    perform public.nq_attempt('read',attempt_id);
    raise exception 'Cross-user read unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703001","role":"authenticated"}',true);
  r := public.nq_attempt('submit',attempt_id);
  assert (r->>'correct')::integer=1 and (r->>'wrong')::integer=1 and (r->>'unanswered')::integer=28, 'Correct grading and unanswered counts';
  assert (r->>'percentage')::numeric=3.33, 'Percentage uses 30 sampled questions';
  assert r->'questions'->0 ? 'correct_option_id', 'Review exposes grading key only after submit';
  assert (r->>'elapsed_seconds')::integer between 0 and 1200, 'Actual elapsed time';
  assert public.nq_attempt('submit',attempt_id)=r or
    public.nq_attempt('submit',attempt_id)->>'submitted_at'=r->>'submitted_at', 'Submit idempotent';
  begin
    perform public.nq_attempt('answer',attempt_id,(q->>'id')::uuid,option_id);
    raise exception 'Submitted attempt mutated';
  exception when raise_exception then
    if sqlerrm<>'ATTEMPT_ALREADY_SUBMITTED' then raise; end if;
  end;
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  assert attempt_id<>old_id and s->'questions'<>safe_questions, 'Retry creates a new randomly drawn attempt';
  perform set_config('role','postgres',true);
  update public.quiz_attempts set started_at=clock_timestamp()-interval '20 minutes 1 second' where id=attempt_id;
  update quiz_private.attempt_snapshots set expires_at=(select started_at+interval '20 minutes' from public.quiz_attempts where id=checks.attempt_id)
    where attempt_snapshots.attempt_id=checks.attempt_id;
  perform set_config('role','authenticated',true);
  q := s->'questions'->0;
  r := public.nq_attempt('answer',attempt_id,(q->>'id')::uuid,(q->'options'->0->>'id')::uuid);
  assert r->>'status'='EXPIRED' and (r->>'unanswered')::integer=30 and (r->>'elapsed_seconds')::integer=1200, 'Late answer rejected; expired attempt auto-finalized';
  assert public.nq_attempt('resume')->>'status'='EXPIRED', 'Reload cannot restart expired attempt';
  assert public.lookup_nq_questions('1')->0->>'question_number'='1', 'Lookup 1';
  assert public.lookup_nq_questions('300')->0->>'question_number'='300', 'Lookup 300';
  assert public.lookup_nq_questions('Câu 125')->0->>'question_number'='125', 'Lookup Câu 125';
  assert jsonb_array_length(public.lookup_nq_questions('công nghiệp'))>0, 'Keyword search';
  assert public.lookup_nq_questions('1')->0->>'correct_answer'='B', 'Lookup matches source answer';
  assert jsonb_array_length(public.lookup_nq_questions('1')->0->'options')=4, 'Lookup shows four options';
  perform set_config('role','postgres',true);
  assert (select count(*) from public.quiz_answers where quiz_answers.attempt_id=old_id)=30, 'Exactly 30 final answer rows';
end $$;
select 'NQ_RUNTIME_ASSERTIONS_PASS' as verdict;
rollback;
