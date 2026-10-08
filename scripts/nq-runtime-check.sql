-- Run only on the verified project/local database. All fixtures roll back.
begin;
set local plpgsql.check_asserts = on;
-- Publication is temporary for acceptance; rollback restores the deployment gate.
update public.quizzes set status='PUBLISHED' where bank_code='NQ_300';
update public.learning_topics set status='PUBLISHED', visibility_level='PUBLIC' where id=(select topic_id from public.quizzes where bank_code='NQ_300');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values ('6f937301-3b91-4c21-bde5-804359703001','authenticated','authenticated','nq-sql-a@example.invalid','{}','{}'),
       ('6f937301-3b91-4c21-bde5-804359703002','authenticated','authenticated','nq-sql-b@example.invalid','{}','{}');
insert into auth.users(id,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data)
values ('6f937301-3b91-4c21-bde5-804359703003','authenticated','authenticated',true,'{"provider":"anonymous","providers":["anonymous"]}','{"purpose":"nq_quiz_guest"}'),
       ('6f937301-3b91-4c21-bde5-804359703005','authenticated','authenticated',true,'{"provider":"anonymous","providers":["anonymous"]}','{}');
insert into public.profiles(id,full_name,account_status)
values ('6f937301-3b91-4c21-bde5-804359703001','NQ acceptance A','ACTIVE'),
       ('6f937301-3b91-4c21-bde5-804359703002','NQ acceptance B','ACTIVE');

do $$
<<checks>>
declare s jsonb; r jsonb; q jsonb; option_id uuid; correct_id uuid; selected_option_id uuid; attempt_id uuid; old_id uuid;
  v_count integer; safe_questions jsonb; deadline text; bank uuid; guest_b_attempt uuid; action text;
  cert_attempt_id uuid; cert_code text;
begin
  select id into bank from public.quizzes where bank_code='NQ_300';
  assert (select pass_score from public.quizzes where id=bank)=80, 'Pass score is 80';
  assert (select count(*) from public.quiz_questions where quiz_id=bank)=300, '300 questions';
  assert (select count(distinct question_number) from public.quiz_questions where quiz_id=bank)=300, '300 distinct numbers';
  assert not exists(select 1 from public.quiz_questions qq left join public.quiz_options o on o.question_id=qq.id
    where qq.quiz_id=bank group by qq.id having count(o.id)<>4 or count(distinct o.source_label)<>4
      or count(*) filter(where o.is_correct)<>1), 'Four labels and one correct key per question';
  assert not has_function_privilege('anon','public.nq_attempt(text,uuid,uuid,uuid)','EXECUTE'), 'Anonymous attempt denied';
  assert not has_function_privilege('anon','public.lookup_nq_questions(text,integer)','EXECUTE'), 'Anonymous lookup denied';
  assert not has_schema_privilege('authenticated','quiz_private','USAGE'), 'Private snapshot schema denied';
  assert not has_table_privilege('authenticated','public.quiz_attempts','UPDATE'), 'Direct attempt mutation denied';
  assert not has_table_privilege('authenticated','public.nq_certificates','INSERT'), 'Client cannot issue certificates directly';
  assert not has_table_privilege('authenticated','public.nq_certificates','UPDATE'), 'Client cannot alter certificates directly';
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
  perform public.nq_save_participant(attempt_id, 'NQ acceptance A', 'Tổ an ninh số');
  r := public.nq_attempt('submit',attempt_id);
  assert (r->>'correct')::integer=1 and (r->>'wrong')::integer=1 and (r->>'unanswered')::integer=28, 'Correct grading and unanswered counts';
  assert (r->>'percentage')::numeric=3.33, 'Percentage uses 30 sampled questions';
  assert (r->>'passed')::boolean=false, '3.33% is FAIL';
  assert r->>'certificate' is null, 'No certificate on FAIL';
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
  assert exists(select 1 from cron.job where jobname='nq-quiz-guest-cleanup'), 'Guest accounts have bounded 30-day retention';
  assert not has_table_privilege('authenticated','public.quiz_questions','SELECT'), 'Guest Auth role cannot read question table';
  assert not has_table_privilege('authenticated','public.quiz_options','SELECT'), 'Guest Auth role cannot read answer-key table';
  assert not has_table_privilege('authenticated','quiz_private.nq_guest_accounts','SELECT'), 'Guest cannot read the cleanup registry';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703003","role":"authenticated","is_anonymous":true,"user_metadata":{"purpose":"nq_quiz_guest"}}',true);
  perform set_config('role','authenticated',true);
  perform public.ensure_nq_quiz_guest();
  assert public.is_nq_300_guest(), 'Only an anonymous session recorded in the NQ registry is treated as a guest';
  assert not public.is_active_user() and not public.has_role('MEMBER'), 'Guest session receives no active member role';
  assert exists(select 1 from public.profiles where id='6f937301-3b91-4c21-bde5-804359703003' and account_status='INVITED'), 'Guest profile satisfies the attempt FK but remains non-active';
  assert (select count(*) from public.learning_topics where id='7c620b81-6dc6-4a57-9908-3a1f68652a01')=1, 'Guest sees the published NQ topic';
  assert (select count(*) from public.quizzes where id=bank)=1, 'Guest sees NQ quiz metadata';
  assert not exists(select 1 from public.learning_topics where id<>'7c620b81-6dc6-4a57-9908-3a1f68652a01'), 'Guest cannot read other topic metadata';
  assert not exists(select 1 from public.quizzes where id<>bank), 'Guest cannot read other quiz metadata';
  assert not public.can_access_nq_300_guest_quiz('00000000-0000-0000-0000-000000000000'), 'Guest cannot access other quiz IDs';
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  assert jsonb_array_length(s->'questions')=30 and s::text !~ 'correct|is_correct|answer_key', 'Guest gets 30 questions without answer keys';
  assert public.nq_attempt('resume')->>'attempt_id'=attempt_id::text, 'Guest attempt resumes on the same anonymous session';
  q := s->'questions'->0;
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703005","role":"authenticated","is_anonymous":true}',true);
  perform public.ensure_nq_quiz_guest();
  guest_b_attempt := (public.nq_attempt('start')->>'attempt_id')::uuid;
  foreach action in array array['read','answer','submit'] loop
    begin
      perform public.nq_attempt(action,attempt_id,(q->>'id')::uuid,(q->'options'->0->>'id')::uuid);
      raise exception 'Guest B accessed Guest A attempt';
    exception when raise_exception then
      if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
    end;
  end loop;
  assert not exists(select 1 from public.quiz_attempts where id=attempt_id), 'Guest B cannot directly read Guest A attempt';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703003","role":"authenticated","is_anonymous":true}',true);
  foreach action in array array['read','answer','submit'] loop
    begin
      perform public.nq_attempt(action,guest_b_attempt,(q->>'id')::uuid,(q->'options'->0->>'id')::uuid);
      raise exception 'Guest A accessed Guest B attempt';
    exception when raise_exception then
      if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
    end;
  end loop;
  assert not exists(select 1 from public.quiz_attempts where id=guest_b_attempt), 'Guest A cannot directly read Guest B attempt';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703002","role":"authenticated"}',true);
  begin
    perform public.nq_attempt('read',attempt_id);
    raise exception 'Permanent user read a guest attempt';
  exception when raise_exception then
    if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703003","role":"authenticated","is_anonymous":true,"user_metadata":{"purpose":"nq_quiz_guest"}}',true);
  perform public.nq_save_participant(attempt_id, 'Guest NQ isolation', 'Chi đoàn kiểm thử');
  r := public.nq_attempt('submit',attempt_id);
  assert (r->>'unanswered')::integer=30 and r->'questions'->0 ? 'correct_option_id', 'Guest grading key appears only after submitting';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703005","role":"authenticated","is_anonymous":true}',true);
  begin
    perform public.nq_attempt('read',attempt_id);
    raise exception 'Guest B read Guest A completed review';
  exception when raise_exception then
    if sqlerrm<>'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703003","role":"authenticated","is_anonymous":true}',true);
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  for i in 0..23 loop
    q := s->'questions'->i;
    -- The answer key lives in quiz_private, which clients can never read: inspect it as postgres.
    perform set_config('role','postgres',true);
    select (value->>'correct_option_id')::uuid into correct_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions)
      where attempt_snapshots.attempt_id = checks.attempt_id and value->>'id' = checks.q->>'id';
    perform set_config('role','authenticated',true);
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, correct_id);
  end loop;
  begin
    perform public.nq_attempt('submit', attempt_id);
    raise exception 'Submit without a participant snapshot unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'PARTICIPANT_REQUIRED' then raise; end if;
  end;
  assert not exists(select 1 from public.quiz_attempts where id=checks.attempt_id and submitted_at is not null),
    'Submit without a participant snapshot does not finalize the attempt';
  assert not exists(select 1 from public.nq_certificates c where c.attempt_id=checks.attempt_id),
    'Submit without a participant snapshot does not issue a certificate';
  perform public.nq_save_participant(attempt_id, 'Guest Nguyễn Văn Đạt', 'Chi đoàn Cơ sở 1');
  r := public.nq_attempt('submit', attempt_id);
  assert (r->>'correct')::integer = 24 and (r->>'percentage')::numeric = 80.00
    and (r->>'passed')::boolean = true, '24/30 is exactly 80% and PASS';
  assert r->'certificate' is not null, 'Certificate issued on PASS';
  assert (r->'certificate'->>'code') ~ '^NQ13-[A-Z0-9]{8,32}$', 'Certificate code has the required format';
  assert r->'certificate'->>'full_name' = 'Guest Nguyễn Văn Đạt'
    and r->'certificate'->>'organization_name' = 'Chi đoàn Cơ sở 1', 'Certificate preserves participant snapshot';
  assert (r->'certificate'->>'score')::numeric = 80.00
    and (r->'certificate'->>'correct_count')::integer = 24
    and (r->'certificate'->>'total_questions')::integer = 30,
    'Certificate response includes its persisted score and boundaries';
  cert_attempt_id := attempt_id;
  cert_code := r->'certificate'->>'code';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('role','anon',true);
  q := public.verify_nq_certificate(cert_code);
  assert (q->>'valid')::boolean and q->>'status' = 'VALID'
    and q->>'full_name' = 'Guest Nguyễn Văn Đạt'
    and q->>'organization_name' = 'Chi đoàn Cơ sở 1'
    and (q->>'score')::numeric = 80.00 and q ? 'issued_at', 'Anonymous verification returns certificate facts';
  assert not (q ?| array['id','attempt_id','user_id','auth_uid','email','answers','raw_user_meta_data']),
    'Public verification omits internal identifiers and attempt data';
  perform set_config('request.jwt.claims','{"sub":"6f937301-3b91-4c21-bde5-804359703003","role":"authenticated","is_anonymous":true,"user_metadata":{"purpose":"nq_quiz_guest"}}',true);
  perform set_config('role','authenticated',true);
  s := public.nq_attempt('submit', cert_attempt_id);
  assert s->'certificate'->>'code' = cert_code, 'Repeated submit returns the same certificate';
  begin
    perform public.nq_save_participant(cert_attempt_id, 'Tampered Participant', 'Tampered Unit');
    raise exception 'Submitted participant was mutable';
  exception when raise_exception then
    if sqlerrm <> 'ATTEMPT_ALREADY_SUBMITTED' then raise; end if;
  end;
  perform set_config('role','postgres',true);
  assert (select count(*) from public.nq_certificates c where c.attempt_id = checks.cert_attempt_id) = 1,
    'A passing attempt has exactly one certificate row';
  perform set_config('role','authenticated',true);

  -- Start a fresh guest attempt and test the precise 23/30 fail boundary.
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  perform public.nq_save_participant(attempt_id, 'Guest Nguyễn Văn Đạt', 'Chi đoàn Cơ sở 1');
  for i in 0..29 loop
    q := s->'questions'->i;
    -- Read the fixture key only as postgres; all answer calls remain guest-authenticated.
    perform set_config('role','postgres',true);
    select (value->>'correct_option_id')::uuid into correct_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions)
      where attempt_snapshots.attempt_id = checks.attempt_id and value->>'id' = checks.q->>'id';
    perform set_config('role','authenticated',true);
    if i < 23 then
      selected_option_id := correct_id;
    else
      option_id := (q->'options'->0->>'id')::uuid;
      if option_id = correct_id then option_id := (q->'options'->1->>'id')::uuid; end if;
      selected_option_id := option_id;
    end if;
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, selected_option_id);
  end loop;
  r := public.nq_attempt('submit', attempt_id);
  assert (r->>'correct')::integer = 23 and (r->>'wrong')::integer = 7
    and (r->>'unanswered')::integer = 0, '23/30 records exactly 23 correct and 7 wrong';
  assert (r->>'percentage')::numeric = 76.67 and (r->>'passed')::boolean = false,
    '23/30 is exactly 76.67% and FAIL';
  assert r->>'certificate' is null, 'No certificate is returned on the 23/30 FAIL boundary';
  perform set_config('role','postgres',true);
  assert not exists(select 1 from public.nq_certificates c where c.attempt_id = checks.attempt_id),
    'No certificate row is issued on the 23/30 FAIL boundary';
  perform set_config('role','authenticated',true);

  -- A legacy attempt with no participant may expire and preserve its score, but never gets a certificate.
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;
  for i in 0..23 loop
    q := s->'questions'->i;
    perform set_config('role','postgres',true);
    select (value->>'correct_option_id')::uuid into correct_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions)
      where attempt_snapshots.attempt_id = checks.attempt_id and value->>'id' = checks.q->>'id';
    perform set_config('role','authenticated',true);
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, correct_id);
  end loop;
  perform set_config('role','postgres',true);
  update public.quiz_attempts set started_at=clock_timestamp()-interval '21 minutes' where id=attempt_id;
  update quiz_private.attempt_snapshots snapshot set expires_at=clock_timestamp()-interval '1 minute' where snapshot.attempt_id=checks.attempt_id;
  perform set_config('role','authenticated',true);
  r := public.nq_attempt('resume');
  assert r->>'status'='EXPIRED' and (r->>'passed')::boolean and (r->>'correct')::integer=24,
    'Legacy expiry finalizes accepted answers and preserves the passing result';
  assert r->>'certificate' is null,
    'Legacy expiry without participant snapshot returns no certificate';
  perform set_config('role','postgres',true);
  assert not exists(select 1 from public.nq_certificates c where c.attempt_id=checks.attempt_id),
    'Legacy expiry without participant snapshot writes no certificate';
  perform set_config('role','authenticated',true);

  assert public.lookup_nq_questions('1')->0->>'correct_answer'='B', 'Guest can use public source lookup';
  perform set_config('role','postgres',true);
  assert exists(select 1 from quiz_private.nq_guest_accounts where user_id='6f937301-3b91-4c21-bde5-804359703003'), 'NQ guest is added to the private retention registry';
  insert into auth.users(id,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data)
  values ('6f937301-3b91-4c21-bde5-804359703004','authenticated','authenticated',true,'{"provider":"anonymous","providers":["anonymous"]}','{}');
  update quiz_private.nq_guest_accounts set created_at=now()-interval '31 days'
    where user_id='6f937301-3b91-4c21-bde5-804359703003';
  insert into quiz_private.nq_guest_accounts(user_id,created_at)
  values ('6f937301-3b91-4c21-bde5-804359703001',now()-interval '31 days');
  -- Apply the cron predicate only to this transaction's disposable fixtures.
  delete from auth.users account using quiz_private.nq_guest_accounts guest
    where account.id=guest.user_id and account.is_anonymous is true
      and guest.created_at<now()-interval '30 days'
      and account.id in ('6f937301-3b91-4c21-bde5-804359703001','6f937301-3b91-4c21-bde5-804359703003','6f937301-3b91-4c21-bde5-804359703005');
  assert not exists(select 1 from auth.users where id='6f937301-3b91-4c21-bde5-804359703003'), 'Expired NQ guests are removed';
  assert exists(select 1 from auth.users where id='6f937301-3b91-4c21-bde5-804359703004'), 'Unregistered anonymous accounts are untouched';
  assert exists(select 1 from auth.users where id='6f937301-3b91-4c21-bde5-804359703001'), 'Registered permanent accounts are never removed';
  assert exists(select 1 from auth.users where id='6f937301-3b91-4c21-bde5-804359703005'), 'Recent registered guests retain their identity';
  assert exists(select 1 from public.nq_certificates c where c.certificate_code = checks.cert_code and c.attempt_id is null),
    'Certificate survives guest cleanup after its attempt is deleted';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('role','anon',true);
  q := public.verify_nq_certificate(cert_code);
  assert (q->>'valid')::boolean and q->>'full_name' = 'Guest Nguyễn Văn Đạt',
    'Retained certificate remains publicly verifiable after guest cleanup';
end $$;
select 'NQ_RUNTIME_ASSERTIONS_PASS' as verdict;
rollback;
