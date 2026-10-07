-- Test: nq13_certificate_assessment.sql
-- Covers database & security requirements for NQ13 Assessment & Certificate.
begin;
select no_plan();

-- Helper functions
create or replace function set_auth_guest(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', true)::text, true);
end $$;

create or replace function reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_auth();

-- Setup fixtures
insert into auth.users(id, aud, role, is_anonymous)
values ('6f937301-3b91-4c21-bde5-804359705001', 'authenticated', 'authenticated', true),
       ('6f937301-3b91-4c21-bde5-804359705002', 'authenticated', 'authenticated', true)
on conflict (id) do nothing;

insert into public.profiles(id, full_name, account_status)
values ('6f937301-3b91-4c21-bde5-804359705001', 'Guest A', 'INVITED'),
       ('6f937301-3b91-4c21-bde5-804359705002', 'Guest B', 'INVITED')
on conflict (id) do nothing;

insert into quiz_private.nq_guest_accounts(user_id)
values ('6f937301-3b91-4c21-bde5-804359705001'),
       ('6f937301-3b91-4c21-bde5-804359705002')
on conflict (user_id) do nothing;

-- 1. pass_score = 80
select is(
  (select pass_score from public.quizzes where bank_code = 'NQ_300'),
  80,
  'NQ_300 quiz pass_score is 80'
);

-- 2. Schema and permissions
select ok(
  has_table_privilege('authenticated', 'public.nq_certificates', 'SELECT'),
  'authenticated has SELECT privilege on nq_certificates'
);

select is(
  has_table_privilege('authenticated', 'public.nq_certificates', 'INSERT'),
  false,
  'authenticated cannot directly INSERT into nq_certificates'
);

select is(
  has_table_privilege('authenticated', 'public.nq_certificates', 'UPDATE'),
  false,
  'authenticated cannot directly UPDATE nq_certificates'
);

select is(
  has_table_privilege('authenticated', 'public.nq_attempt_participants', 'INSERT'),
  false,
  'authenticated cannot directly INSERT into nq_attempt_participants'
);

select is(
  has_schema_privilege('authenticated', 'quiz_private', 'USAGE'),
  false,
  'authenticated has no USAGE on quiz_private schema'
);

-- 3. verify_nq_certificate execute grant
select ok(
  has_function_privilege('anon', 'public.verify_nq_certificate(text)', 'EXECUTE'),
  'anon has EXECUTE on verify_nq_certificate'
);

select ok(
  has_function_privilege('authenticated', 'public.verify_nq_certificate(text)', 'EXECUTE'),
  'authenticated has EXECUTE on verify_nq_certificate'
);

-- 4. Test RPC execution under guest role
select set_auth_guest('6f937301-3b91-4c21-bde5-804359705001'::uuid);

-- Start attempt
select ok(
  (public.nq_attempt('start')->>'attempt_id') is not null,
  'Guest A starts NQ attempt successfully'
);

-- Register participant
select ok(
  (public.nq_save_participant(
    (public.nq_attempt('resume')->>'attempt_id')::uuid,
    'Nguyễn Văn A',
    'Chi đoàn An ninh mạng'
  )->>'success') = 'true',
  'Guest A registers participant successfully'
);

-- Verify participant snapshot is preserved on resume
select is(
  public.nq_attempt('resume')->'participant'->>'full_name',
  'Nguyễn Văn A',
  'Participant full_name is preserved on resume'
);

select is(
  public.nq_attempt('resume')->'participant'->>'organization_name',
  'Chi đoàn An ninh mạng',
  'Participant organization_name is preserved on resume'
);

-- Submit attempt (0 answers = 0% FAIL)
select is(
  public.nq_attempt('submit', (public.nq_attempt('resume')->>'attempt_id')::uuid)->>'passed',
  'false',
  'Unanswered submission is passed = false'
);

select is(
  public.nq_attempt('resume')->>'certificate',
  null,
  'Failed submission yields no certificate'
);

-- Verify participant cannot be modified after submit
select throws_ok(
  $$select public.nq_save_participant((public.nq_attempt('resume')->>'attempt_id')::uuid, 'Tên Mới', 'Đơn vị Mới')$$,
  'P0001',
  'ATTEMPT_ALREADY_SUBMITTED',
  'Participant cannot be modified after submit'
);

-- Cross-guest denial: Guest B cannot modify Guest A participant
select set_auth_guest('6f937301-3b91-4c21-bde5-804359705002'::uuid);

select throws_ok(
  $$select public.nq_save_participant('6f937301-3b91-4c21-bde5-804359705001'::uuid, 'Hacker', 'Fake Org')$$,
  'P0001',
  'ATTEMPT_NOT_FOUND',
  'Guest B cannot modify Guest A participant'
);

-- 5. Test Pass & Certificate Issuance via helper / second attempt
-- Switch to postgres to seed a passing attempt
select reset_auth();

do $$
begin
  -- Insert synthetic completed attempt for Guest A that passed (24/30 = 80%)
  insert into public.quiz_attempts(id, quiz_id, user_id, score, passed, started_at, submitted_at)
  values ('6f937301-3b91-4c21-bde5-804359705099', '7c620b81-6dc6-4a57-9908-3a1f68652a00', '6f937301-3b91-4c21-bde5-804359705001', 80.00, true, now() - interval '10 minutes', now())
  on conflict (id) do nothing;

  -- Insert participant
  insert into public.nq_attempt_participants(attempt_id, user_id, full_name, organization_name)
  values ('6f937301-3b91-4c21-bde5-804359705099', '6f937301-3b91-4c21-bde5-804359705001', 'Nguyễn Thị Bích Ngọc', 'Đoàn Thanh niên CAT')
  on conflict (attempt_id) do nothing;

  -- Insert certificate
  insert into public.nq_certificates(attempt_id, quiz_id, user_id, certificate_code, full_name, organization_name, score, correct_count, total_questions)
  values ('6f937301-3b91-4c21-bde5-804359705099', '7c620b81-6dc6-4a57-9908-3a1f68652a00', '6f937301-3b91-4c21-bde5-804359705001', 'NQ13-TESTPASSED01', 'Nguyễn Thị Bích Ngọc', 'Đoàn Thanh niên CAT', 80.00, 24, 30)
  on conflict (certificate_code) do nothing;
end $$;

-- Public verification test as anon
select reset_auth();
perform set_config('role', 'anon', true);
perform set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (public.verify_nq_certificate('NQ13-TESTPASSED01')->>'valid')::boolean,
  true,
  'verify_nq_certificate validates authentic certificate'
);

select is(
  public.verify_nq_certificate('NQ13-TESTPASSED01')->>'full_name',
  'Nguyễn Thị Bích Ngọc',
  'verify_nq_certificate returns full_name'
);

select is(
  (public.verify_nq_certificate('NQ13-TESTPASSED01')->>'score')::numeric,
  80.00,
  'verify_nq_certificate returns score'
);

select is(
  (public.verify_nq_certificate('NQ13-NONEXISTENT')->>'valid')::boolean,
  false,
  'verify_nq_certificate rejects nonexistent certificate'
);

-- Retention survival test: deleting attempt sets attempt_id to NULL, certificate survives
select reset_auth();

delete from public.quiz_attempts where id = '6f937301-3b91-4c21-bde5-804359705099';

select ok(
  exists (select 1 from public.nq_certificates where certificate_code = 'NQ13-TESTPASSED01' and attempt_id is null),
  'Certificate survives attempt deletion with attempt_id set to NULL'
);

select * from finish();
rollback;
