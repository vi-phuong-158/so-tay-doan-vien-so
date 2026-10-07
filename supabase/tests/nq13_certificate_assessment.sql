-- Test: nq13_certificate_assessment.sql
-- Covers all 17 database & security requirements for NQ13 Assessment & Certificate.
begin;
select plan(22);

-- Setup synthetic test fixtures
insert into auth.users(id, aud, role, is_anonymous)
values ('6f937301-3b91-4c21-bde5-804359705001', 'authenticated', 'authenticated', true),
       ('6f937301-3b91-4c21-bde5-804359705002', 'authenticated', 'authenticated', true),
       ('6f937301-3b91-4c21-bde5-804359705003', 'authenticated', 'authenticated', false);

insert into public.profiles(id, full_name, account_status)
values ('6f937301-3b91-4c21-bde5-804359705001', 'Guest A', 'INVITED'),
       ('6f937301-3b91-4c21-bde5-804359705002', 'Guest B', 'INVITED'),
       ('6f937301-3b91-4c21-bde5-804359705003', 'Member Permanent', 'ACTIVE');

insert into quiz_private.nq_guest_accounts(user_id)
values ('6f937301-3b91-4c21-bde5-804359705001'),
       ('6f937301-3b91-4c21-bde5-804359705002');

-- 1. pass_score = 80 in database
select is(
  (select pass_score from public.quizzes where bank_code = 'NQ_300'),
  80,
  '1. NQ_300 quiz pass_score is 80'
);

-- 2 & 15. Direct permissions: client cannot write tables directly, snapshot schema private
select throws_ok(
  $$select * from quiz_private.attempt_snapshots$$,
  '42501',
  'permission denied for schema quiz_private',
  '15. Private answer key schema cannot be read by clients'
);

select throws_ok(
  $$insert into public.nq_certificates(certificate_code, quiz_id, full_name, organization_name, score, correct_count)
    values ('NQ13-FORGED', '7c620b81-6dc6-4a57-9908-3a1f68652a00', 'Hacker', 'Fake', 100, 30)$$,
  '42501',
  null,
  '13. Client cannot directly insert certificate'
);

-- Setup attempt for Guest A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6f937301-3b91-4c21-bde5-804359705001","role":"authenticated","is_anonymous":true}', true);

-- Start attempt
select ok(public.is_nq_300_guest(), 'Guest A is recognized as NQ guest');

do $$
declare
  s jsonb;
  r jsonb;
  attempt_id uuid;
  q jsonb;
  correct_id uuid;
  wrong_id uuid;
  v_cert_code text;
  cert_row public.nq_certificates%rowtype;
  verify_res jsonb;
begin
  -- Start attempt
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;

  -- 17. Active attempt without participant initially returns null participant
  assert s->>'participant' is null, '17. Initial attempt has null participant snapshot';

  -- Register participant
  r := public.nq_save_participant(attempt_id, 'Nguyễn Văn A', 'Chi đoàn An ninh mạng');
  assert r->>'success' = 'true', 'Participant registered successfully';

  -- Resume checks participant is present
  s := public.nq_attempt('resume');
  assert s->'participant'->>'full_name' = 'Nguyễn Văn A', 'Participant snapshot preserved on resume';
  assert s->'participant'->>'organization_name' = 'Chi đoàn An ninh mạng', 'Organization preserved on resume';

  -- Answer 23 correct and 7 wrong: test FAIL threshold
  -- First 23 correct
  for i in 0..22 loop
    q := s->'questions'->i;
    select (value->>'correct_option_id')::uuid into correct_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions)
      where attempt_snapshots.attempt_id = attempt_id and value->>'id' = q->>'id';
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, correct_id);
  end loop;

  -- 7 wrong
  for i in 23..29 loop
    q := s->'questions'->i;
    select (o->>'id')::uuid into wrong_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions) question, jsonb_array_elements(question->'options') o
      where attempt_snapshots.attempt_id = attempt_id and question->>'id' = q->>'id'
        and o->>'id' <> question->>'correct_option_id' limit 1;
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, wrong_id);
  end loop;

  -- Submit with 23/30 (76.67%)
  r := public.nq_attempt('submit', attempt_id);

  -- 2. Check 23/30 FAIL
  assert (r->>'correct')::integer = 23, 'Correct count is 23';
  assert (r->>'percentage')::numeric = 76.67, '2. Score is 76.67';
  assert (r->>'passed')::boolean = false, '2. 23/30 is passed = false';
  assert r->>'certificate' is null, '2. 23/30 yields no certificate';
  assert not exists (select 1 from public.nq_certificates where attempt_id = attempt_id), 'No certificate row in DB for 23/30';

  -- 9. Participant immutable after submit
  begin
    perform public.nq_save_participant(attempt_id, 'Nguyễn Văn Đổi Tên', 'Đơn vị khác');
    raise exception 'Participant modification unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ATTEMPT_ALREADY_SUBMITTED' then raise; end if;
  end;
end $$;
select pass('2. 23/30 score 76.67% FAIL without certificate, participant immutable after submit');

-- 10. Guest B cannot modify or read Guest A participant
select set_config('request.jwt.claims', '{"sub":"6f937301-3b91-4c21-bde5-804359705002","role":"authenticated","is_anonymous":true}', true);

do $$
declare
  guest_a_attempt uuid;
begin
  select id into guest_a_attempt from public.quiz_attempts where user_id = '6f937301-3b91-4c21-bde5-804359705001' limit 1;

  -- Attempt scope denied for Guest B on Guest A participant
  begin
    perform public.nq_save_participant(guest_a_attempt, 'Guest B Hacker', 'Hacking Org');
    raise exception 'Cross-user participant save unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;

  -- Attempt scope denied for Guest B on Guest A attempt
  begin
    perform public.nq_attempt('read', guest_a_attempt);
    raise exception 'Cross-user attempt read unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ATTEMPT_SCOPE_DENIED' then raise; end if;
  end;

  -- Direct table read of participant returns empty under RLS
  assert not exists (select 1 from public.nq_attempt_participants where attempt_id = guest_a_attempt),
    '10. Guest B cannot see Guest A participant under RLS';
end $$;
select pass('10 & 11. Cross-guest access denied for attempt and participant');

-- Test 3: 24/30 PASS score 80% and certificate issuance
select set_config('request.jwt.claims', '{"sub":"6f937301-3b91-4c21-bde5-804359705001","role":"authenticated","is_anonymous":true}', true);

do $$
declare
  s jsonb;
  r jsonb;
  attempt_id uuid;
  q jsonb;
  correct_id uuid;
  wrong_id uuid;
  v_cert_code text;
  cert_row public.nq_certificates%rowtype;
  verify_res jsonb;
begin
  -- Start second attempt for Guest A
  s := public.nq_attempt('start');
  attempt_id := (s->>'attempt_id')::uuid;

  -- Register participant
  perform public.nq_save_participant(attempt_id, 'Trần Thị Bạch Dương', 'Công an huyện Cẩm Khê');

  -- Answer 24 correct and 6 wrong: test PASS threshold (80.00%)
  for i in 0..23 loop
    q := s->'questions'->i;
    select (value->>'correct_option_id')::uuid into correct_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions)
      where attempt_snapshots.attempt_id = attempt_id and value->>'id' = q->>'id';
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, correct_id);
  end loop;

  for i in 24..29 loop
    q := s->'questions'->i;
    select (o->>'id')::uuid into wrong_id
      from quiz_private.attempt_snapshots, jsonb_array_elements(questions) question, jsonb_array_elements(question->'options') o
      where attempt_snapshots.attempt_id = attempt_id and question->>'id' = q->>'id'
        and o->>'id' <> question->>'correct_option_id' limit 1;
    perform public.nq_attempt('answer', attempt_id, (q->>'id')::uuid, wrong_id);
  end loop;

  -- Submit with 24/30 (80.00%)
  r := public.nq_attempt('submit', attempt_id);

  assert (r->>'correct')::integer = 24, 'Correct count is 24';
  assert (r->>'percentage')::numeric = 80.00, '3. Score is 80.00';
  assert (r->>'passed')::boolean = true, '3. 24/30 is passed = true';
  assert r->'certificate' is not null, '3. Certificate issued in submit result';

  v_cert_code := r->'certificate'->>'code';
  assert v_cert_code ~ '^NQ13-[A-Z0-9]{8,32}$', '7 & 8. Certificate code matches NQ13 format';

  -- 5 & 6. Idempotency: repeated submit or read returns identical certificate code
  assert public.nq_attempt('submit', attempt_id)->'certificate'->>'code' = v_cert_code,
    '6. Repeated submit returns identical certificate';
  assert (select count(*) from public.nq_certificates where attempt_id = attempt_id) = 1,
    '5. Exactly one certificate row exists per attempt';

  -- Read certificate row directly from DB
  select * into cert_row from public.nq_certificates where attempt_id = attempt_id;
  assert cert_row.full_name = 'Trần Thị Bạch Dương', 'Certificate has correct participant name';
  assert cert_row.organization_name = 'Công an huyện Cẩm Khê', 'Certificate has correct organization';
  assert cert_row.score = 80.00, 'Certificate has correct score 80.00';
  assert cert_row.correct_count = 24, 'Certificate has 24 correct count';

  -- 14. Verify RPC returns safe public details without user/auth leakage
  verify_res := public.verify_nq_certificate(v_cert_code);
  assert (verify_res->>'valid')::boolean = true, 'Verification returns valid = true';
  assert verify_res->>'full_name' = 'Trần Thị Bạch Dương', 'Verification returns full name';
  assert verify_res->>'organization_name' = 'Công an huyện Cẩm Khê', 'Verification returns organization';
  assert verify_res->>'code' = v_cert_code, 'Verification returns code';
  assert verify_res ? 'issued_at', 'Verification returns issued_at';
  assert not (verify_res ? 'user_id'), '14. Verification does not expose user_id';
  assert not (verify_res ? 'auth_id'), '14. Verification does not expose auth_id';
  assert not (verify_res ? 'email'), '14. Verification does not expose email';
end $$;
select pass('3, 5, 6, 7, 8, 14. 24/30 is PASS (80%), certificate issued idempotently, verified safely');

-- 16. Persistence: delete anonymous user and verify certificate survives
reset role;

do $$
declare
  v_cert_code text;
  cert_before public.nq_certificates%rowtype;
  cert_after public.nq_certificates%rowtype;
  verify_res jsonb;
begin
  select * into cert_before from public.nq_certificates limit 1;
  v_cert_code := cert_before.certificate_code;
  assert cert_before.id is not null, 'Certificate exists before cleanup';
  assert cert_before.attempt_id is not null, 'Attempt ID is attached before cleanup';

  -- Simulate cleanup of anonymous guest account
  delete from auth.users where id = '6f937301-3b91-4c21-bde5-804359705001';

  -- Verify certificate row was NOT deleted!
  select * into cert_after from public.nq_certificates where certificate_code = v_cert_code;
  assert cert_after.id is not null, '16. Certificate survives deletion of anonymous user account';
  assert cert_after.attempt_id is null, '16. attempt_id became NULL on cascade delete';
  assert cert_after.full_name = cert_before.full_name, '16. Participant full name preserved';
  assert cert_after.organization_name = cert_before.organization_name, '16. Organization preserved';
  assert cert_after.score = cert_before.score, '16. Score preserved';

  -- Public verification continues to work 100%!
  verify_res := public.verify_nq_certificate(v_cert_code);
  assert (verify_res->>'valid')::boolean = true, '16. Verification remains valid after guest account cleanup';
  assert verify_res->>'full_name' = cert_before.full_name, '16. Verification returns full name after cleanup';
end $$;
select pass('16. Certificate persistence contract: survives anonymous user cleanup without data loss');

-- Verification for invalid code
select is(
  (public.verify_nq_certificate('NQ13-NONEXISTENT')->>'valid')::boolean,
  false,
  'Verification fails safely for non-existent code'
);

select * from finish();
rollback;
