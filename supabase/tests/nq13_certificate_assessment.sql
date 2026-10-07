-- Test: nq13_certificate_assessment.sql
-- Covers database schema, privileges, RLS, public verification and data retention
-- for the NQ13 Assessment & Certificate features.
begin;

select plan(16);

-- 1. Table structure
select has_table('public', 'nq_certificates', 'public.nq_certificates table exists');
select has_table('public', 'nq_attempt_participants', 'public.nq_attempt_participants table exists');

-- 2. Schema and table privileges
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

-- 3. verify_nq_certificate grants
select ok(
  has_function_privilege('anon', 'public.verify_nq_certificate(text)', 'EXECUTE'),
  'anon has EXECUTE on verify_nq_certificate'
);

select ok(
  has_function_privilege('authenticated', 'public.verify_nq_certificate(text)', 'EXECUTE'),
  'authenticated has EXECUTE on verify_nq_certificate'
);

-- 4. nq_save_participant grants
select is(
  has_function_privilege('anon', 'public.nq_save_participant(uuid,text,text)', 'EXECUTE'),
  false,
  'anon cannot directly EXECUTE nq_save_participant'
);

select ok(
  has_function_privilege('authenticated', 'public.nq_save_participant(uuid,text,text)', 'EXECUTE'),
  'authenticated can EXECUTE nq_save_participant'
);

-- 5. Fixtures for verification and retention testing
insert into public.learning_topics (id, title, status, visibility_level, owner_organization_id, created_by)
values ('5e000001-0000-4000-8000-000000000001', 'NQ13 Test Topic', 'PUBLISHED', 'PUBLIC', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.quizzes (id, topic_id, title, pass_score, status)
values ('5f000001-0000-4000-8000-000000000001', '5e000001-0000-4000-8000-000000000001', 'NQ13 Test Quiz', 80, 'PUBLISHED')
on conflict (id) do nothing;

insert into public.nq_certificates(attempt_id, quiz_id, full_name, organization_name, certificate_code, score, correct_count, total_questions)
values (null, '5f000001-0000-4000-8000-000000000001', 'Nguyễn Thị Bích Ngọc', 'Đoàn Thanh niên CAT', 'NQ13-TESTCERT001', 80.00, 24, 30)
on conflict (certificate_code) do nothing;

-- 6. Functional verification of verify_nq_certificate as anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (public.verify_nq_certificate('NQ13-TESTCERT001')->>'valid')::boolean,
  true,
  'verify_nq_certificate validates authentic certificate under anon role'
);

select is(
  public.verify_nq_certificate('NQ13-TESTCERT001')->>'full_name',
  'Nguyễn Thị Bích Ngọc',
  'verify_nq_certificate returns full_name'
);

select is(
  (public.verify_nq_certificate('NQ13-TESTCERT001')->>'score')::numeric,
  80.00,
  'verify_nq_certificate returns score'
);

select is(
  (public.verify_nq_certificate('NQ13-NONEXISTENT')->>'valid')::boolean,
  false,
  'verify_nq_certificate rejects nonexistent certificate under anon role'
);

reset role;

-- 7. Retention test: deleting attempt sets attempt_id to NULL, certificate survives
insert into public.quiz_attempts (id, quiz_id, user_id, score, passed, attempt_number, submitted_at)
values ('5a000001-0000-4000-8000-000000000001', '5f000001-0000-4000-8000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 80.00, true, 99, now())
on conflict (id) do nothing;

insert into public.nq_certificates(attempt_id, quiz_id, full_name, organization_name, certificate_code, score, correct_count, total_questions)
values ('5a000001-0000-4000-8000-000000000001', '5f000001-0000-4000-8000-000000000001', 'Nguyễn Văn Test', 'Đoàn CAT', 'NQ13-RETAIN0001', 80.00, 24, 30)
on conflict (certificate_code) do nothing;

delete from public.quiz_attempts where id = '5a000001-0000-4000-8000-000000000001';

select ok(
  exists (select 1 from public.nq_certificates where certificate_code = 'NQ13-RETAIN0001' and attempt_id is null),
  'Certificate survives attempt deletion with attempt_id set to NULL'
);

select * from finish();
rollback;
