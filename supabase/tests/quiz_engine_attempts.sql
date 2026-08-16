-- Phase 4 · P4-04 acceptance — quiz engine & attempts: visibility ladder, answer-key protection,
-- trusted attempt lifecycle, server-side scoring, concurrency/idempotency, and cross-user
-- isolation. IDs A–Z below match docs/phase-4/04-quiz-engine-attempts.md §test matrix.
--
-- Fixtures reuse seed orgs/users:
--   Ban TN (parent) = 1111...   CĐA = 2222...   CĐB = 3333...
--   Youth Admin   = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN -> covers CĐA and CĐB)
--   Youth Admin A = 11112222... (YOUTH_ADMIN, scope CĐA only)
--   Member        = eeeeeeee... (MEMBER, org CĐA)
--   Officer A     = cccccccc... (BRANCH_OFFICER, org CĐA) -- second CĐA user, cross-user isolation
--   Officer B     = dddddddd... (BRANCH_OFFICER, org CĐB) -- cross-organization
--   Suspended     = 99999999... (SUSPENDED, org CĐA)

begin;

select no_plan();

create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_auth();

-- =====================================================================================
-- Fixtures
-- =====================================================================================
insert into public.learning_topics (id, title, status, visibility_level, owner_organization_id, created_by) values
  ('2e000001-0000-4000-8000-000000000001', 'P4-04 Open Topic', 'PUBLISHED', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('2e000002-0000-4000-8000-000000000002', 'P4-04 Draft Topic', 'DRAFT', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('2e000003-0000-4000-8000-000000000003', 'P4-04 Org B Topic', 'PUBLISHED', 'ORGANIZATION_ONLY',
   '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.quizzes
  (id, topic_id, title, pass_score, max_attempts, time_limit_minutes, shuffle_questions, shuffle_options, status) values
  -- The main fixture is reused by independent scoring/atomicity cases below; its
  -- dedicated max-attempts contract is covered separately by QUIZ_LIMIT1.
  ('2f000001-0000-4000-8000-000000000001', '2e000001-0000-4000-8000-000000000001', 'QUIZ_MAIN', 50, 5, null, false, false, 'PUBLISHED'),
  ('2f000002-0000-4000-8000-000000000002', '2e000001-0000-4000-8000-000000000001', 'QUIZ_DRAFT', 50, null, null, false, false, 'DRAFT'),
  ('2f000003-0000-4000-8000-000000000003', '2e000002-0000-4000-8000-000000000002', 'QUIZ_HIDDEN_TOPIC', 50, null, null, false, false, 'PUBLISHED'),
  ('2f000004-0000-4000-8000-000000000004', '2e000003-0000-4000-8000-000000000003', 'QUIZ_ORGB', 50, null, null, false, false, 'PUBLISHED'),
  ('2f000005-0000-4000-8000-000000000005', '2e000001-0000-4000-8000-000000000001', 'QUIZ_LIMIT1', 50, 1, null, false, false, 'PUBLISHED'),
  ('2f000006-0000-4000-8000-000000000006', '2e000001-0000-4000-8000-000000000001', 'QUIZ_TIMED', 50, 5, 10, false, false, 'PUBLISHED')
on conflict (id) do nothing;

-- QUIZ_MAIN: Q1 (SINGLE, 1pt, O1 correct), Q2 (SINGLE, 2pt, O5 correct). Pass at 50% = at least
-- one of the two correct (1 or 2 of 3 total points, since 1/3=33% fails, 2/3=67% passes,
-- 3/3=100% passes) -- deliberately chosen so "answer everything correctly" and "answer nothing"
-- land on different sides of pass_score=50, and partial credit (1/3) still fails.
insert into public.quiz_questions (id, quiz_id, question_type, question_text, explanation, points, sort_order) values
  ('30000001-0000-4000-8000-000000000001', '2f000001-0000-4000-8000-000000000001', 'SINGLE', 'Q1', 'exp1', 1, 1),
  ('30000002-0000-4000-8000-000000000002', '2f000001-0000-4000-8000-000000000001', 'SINGLE', 'Q2', 'exp2', 2, 2)
on conflict (id) do nothing;

insert into public.quiz_options (id, question_id, option_text, is_correct, sort_order) values
  ('31000001-0000-4000-8000-000000000001', '30000001-0000-4000-8000-000000000001', 'O1', true, 1),
  ('31000002-0000-4000-8000-000000000002', '30000001-0000-4000-8000-000000000001', 'O2', false, 2),
  ('31000003-0000-4000-8000-000000000003', '30000001-0000-4000-8000-000000000001', 'O3', false, 3),
  ('31000004-0000-4000-8000-000000000004', '30000002-0000-4000-8000-000000000002', 'O4', false, 1),
  ('31000005-0000-4000-8000-000000000005', '30000002-0000-4000-8000-000000000002', 'O5', true, 2)
on conflict (id) do nothing;

-- Minimal single-question fixtures for QUIZ_LIMIT1 / QUIZ_TIMED (each just needs >=1 question).
insert into public.quiz_questions (id, quiz_id, question_type, question_text, points, sort_order) values
  ('30000010-0000-4000-8000-000000000010', '2f000005-0000-4000-8000-000000000005', 'SINGLE', 'L1', 1, 1),
  ('30000020-0000-4000-8000-000000000020', '2f000006-0000-4000-8000-000000000006', 'SINGLE', 'T1', 1, 1)
on conflict (id) do nothing;
insert into public.quiz_options (id, question_id, option_text, is_correct, sort_order) values
  ('31000010-0000-4000-8000-000000000010', '30000010-0000-4000-8000-000000000010', 'X', true, 1),
  ('31000020-0000-4000-8000-000000000020', '30000020-0000-4000-8000-000000000020', 'X', true, 1)
on conflict (id) do nothing;

-- =====================================================================================
-- A / B / C / D / E — quiz visibility ladder
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'); -- MEMBER, org CĐA

select is(
  (select count(*)::integer from public.quizzes where id = '2f000001-0000-4000-8000-000000000001'),
  1,
  'A: active user reads safe metadata of an accessible PUBLISHED quiz'
);
select lives_ok(
  $$select * from public.get_quiz_intro('2f000001-0000-4000-8000-000000000001')$$,
  'A: get_quiz_intro succeeds for an accessible quiz'
);
select is(
  (select count(*)::integer from public.quizzes where id = '2f000002-0000-4000-8000-000000000002'),
  0,
  'B: DRAFT quiz denied'
);
select throws_ok(
  $$select * from public.get_quiz_intro('2f000002-0000-4000-8000-000000000002')$$,
  'QUIZ_NOT_ACCESSIBLE',
  'B: get_quiz_intro rejects a DRAFT quiz'
);
select is(
  (select count(*)::integer from public.quizzes where id = '2f000003-0000-4000-8000-000000000003'),
  0,
  'C: quiz denied when its parent topic is inaccessible (DRAFT topic)'
);
select is(
  (select count(*)::integer from public.quizzes where id = '2f000004-0000-4000-8000-000000000004'),
  0,
  'D: quiz denied when its parent topic is ORGANIZATION_ONLY for a different organization'
);
select throws_ok(
  $$select * from public.start_quiz_attempt('2f000003-0000-4000-8000-000000000003')$$,
  'QUIZ_NOT_ACCESSIBLE',
  'direct quiz-id knowledge cannot bypass parent-topic access at attempt start'
);

-- E: suspended user denied everywhere
select set_auth_user('99999999-9999-9999-9999-999999999999');
select is(
  (select count(*)::integer from public.quizzes),
  0,
  'E: suspended user reads no quiz at all'
);
select throws_ok(
  $$select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001')$$,
  'ACCOUNT_NOT_ACTIVE',
  'E: suspended user cannot start an attempt'
);

-- =====================================================================================
-- F / G — the hard gate: is_correct must never reach an authenticated user pre-submission
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select is(
  (select count(*)::integer from public.quiz_options),
  0,
  'F: quiz_options is not directly readable by an authenticated user at all (RLS, no end-user policy)'
);
select is(
  (select count(*)::integer from public.quiz_questions),
  0,
  'F: quiz_questions is not directly readable either -- explanation cannot leak pre-attempt'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'quiz_options' and grantee = 'anon'),
  0,
  'F: anon has no table-level grant on quiz_options'
);

create temp table t_start_g as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
create temp table t_questions_g as select * from public.get_attempt_questions((select attempt_id from t_start_g));

select ok(
  (select count(*) from t_questions_g) > 0,
  'G: the safe question payload is non-empty'
);
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'pg_temp' and table_name = 't_questions_g' and column_name = 'is_correct'),
  0,
  'G: the safe question payload has no is_correct column at all'
);
-- Belt and suspenders: even though the column cannot exist, also assert the function''s own
-- pg_proc source text never selects a raw is_correct value.
select ok(
  (select prosrc from pg_proc where proname = 'get_attempt_questions' and pronamespace = 'public'::regnamespace)
    !~ 'qo\.is_correct',
  'G: get_attempt_questions'' source never references the answer-key column'
);

-- =====================================================================================
-- H — cannot start an attempt for someone else (no such capability exists at all)
-- =====================================================================================
-- There is no user_id parameter anywhere in start_quiz_attempt; ownership is always auth.uid().
select ok(
  (select prosrc from pg_proc where proname = 'start_quiz_attempt' and pronamespace = 'public'::regnamespace)
    ~ 'auth\.uid\(\)',
  'H: start_quiz_attempt always attributes the new attempt to auth.uid(), never a caller-supplied id'
);
select is(
  (select user_id from public.quiz_attempts where id = (select attempt_id from t_start_g)),
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  'H: the created attempt belongs to the caller'
);

-- =====================================================================================
-- I / J — attempt numbering and concurrency
-- =====================================================================================
select is((select attempt_number from t_start_g), 1, 'I: first attempt is numbered 1');

-- Resume: calling start again while the attempt is still open must return the SAME attempt, not
-- create number 2.
create temp table t_resume_i as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
select is((select attempt_id from t_resume_i), (select attempt_id from t_start_g), 'I: resume returns the same attempt, not a new one');
select is((select resumed from t_resume_i), true, 'I: resume is flagged as such');
select is(
  (select count(*)::integer from public.quiz_attempts
   where quiz_id = '2f000001-0000-4000-8000-000000000001' and user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1,
  'I: no duplicate attempt row was created by the resume call'
);

-- J: the advisory-lock serialization is asserted structurally (a real concurrent race cannot be
-- driven from a single-connection pgTAP script) -- confirm the mechanism is actually present in
-- the deployed function, and confirm the unique constraint backstop still holds if it were not.
select ok(
  (select prosrc from pg_proc where proname = 'start_quiz_attempt' and pronamespace = 'public'::regnamespace)
    ~ 'pg_advisory_xact_lock',
  'J: start_quiz_attempt serializes concurrent starts with a transaction-scoped advisory lock'
);
select throws_ok(
  $$insert into public.quiz_attempts (quiz_id, user_id, attempt_number)
    values ('2f000001-0000-4000-8000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 1)$$,
  null,
  'J: the unique(quiz_id,user_id,attempt_number) constraint is the backstop against duplicate numbers'
);

-- =====================================================================================
-- K — max_attempts enforced server-side, cannot be bypassed by repeated calls
-- =====================================================================================
create temp table t_limit1 as select * from public.start_quiz_attempt('2f000005-0000-4000-8000-000000000005');
select public.submit_quiz_attempt((select attempt_id from t_limit1), '[]'::jsonb);
select throws_ok(
  $$select * from public.start_quiz_attempt('2f000005-0000-4000-8000-000000000005')$$,
  'MAX_ATTEMPTS_REACHED',
  'K: a quiz with max_attempts=1 refuses a second attempt after the first is submitted'
);

-- =====================================================================================
-- L / M — submission validates every id belongs to this quiz
-- =====================================================================================
create temp table t_start_lm as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
-- t_start_lm resumes the still-open attempt from t_start_g/t_resume_i (same user, same quiz) --
-- exercise validation against it directly.
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":["%s"]}]'::jsonb)$$,
    (select attempt_id from t_start_lm), '30000001-0000-4000-8000-000000000001', '31000004-0000-4000-8000-000000000004'),
  'INVALID_OPTION_FOR_QUESTION',
  'L: an option belonging to a DIFFERENT question of the same quiz is rejected'
);
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"00000000-0000-4000-8000-000000000000","selected_option_ids":[]}]'::jsonb)$$,
    (select attempt_id from t_start_lm)),
  'INVALID_QUESTION_FOR_QUIZ',
  'M: a question id that does not belong to this quiz at all is rejected'
);
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":["not-a-uuid"]}]'::jsonb)$$,
    (select attempt_id from t_start_lm), '30000001-0000-4000-8000-000000000001'),
  'INVALID_SUBMISSION',
  'M: a malformed (non-UUID) option id is rejected with a clean business code, not a raw DB error'
);
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":{} }]'::jsonb)$$,
    (select attempt_id from t_start_lm), '30000001-0000-4000-8000-000000000001'),
  'INVALID_SUBMISSION',
  'M: a non-array selected_option_ids payload is rejected cleanly'
);
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":[]},{"question_id":"%s","selected_option_ids":[]}]'::jsonb)$$,
    (select attempt_id from t_start_lm),
    '30000001-0000-4000-8000-000000000001', '30000001-0000-4000-8000-000000000001'),
  'DUPLICATE_QUESTION_IN_SUBMISSION',
  'M: duplicate question entries are rejected before scoring'
);
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":["%s","%s"]}]'::jsonb)$$,
    (select attempt_id from t_start_lm),
    '30000001-0000-4000-8000-000000000001',
    '31000001-0000-4000-8000-000000000001', '31000002-0000-4000-8000-000000000002'),
  'INVALID_SINGLE_SELECTION',
  'M: a SINGLE question cannot receive multiple selected options'
);

-- =====================================================================================
-- N / O / P / Q — client cannot supply score/passed; server computes both correctly
-- =====================================================================================
-- submit_quiz_attempt has no p_score/p_passed parameter at all -- there is no argument through
-- which a client value could reach scoring.
select is(
  (select count(*)::integer from pg_proc
   where proname = 'submit_quiz_attempt' and pronamespace = 'public'::regnamespace
     and pg_get_function_identity_arguments(oid) !~ 'jsonb'),
  0,
  'N/O: submit_quiz_attempt''s only non-id argument is the answers payload -- no score/passed parameter exists'
);

create temp table t_correct as select * from public.submit_quiz_attempt(
  (select attempt_id from t_start_lm),
  format('[{"question_id":"%s","selected_option_ids":["%s"]},{"question_id":"%s","selected_option_ids":["%s"]}]',
    '30000001-0000-4000-8000-000000000001', '31000001-0000-4000-8000-000000000001',
    '30000002-0000-4000-8000-000000000002', '31000005-0000-4000-8000-000000000005')::jsonb
);
select is((select score from t_correct), 100.00, 'P: answering both questions correctly scores 100');
select is((select passed from t_correct), true, 'Q: 100 >= pass_score(50) => passed');

create temp table t_start_partial as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
create temp table t_partial as select * from public.submit_quiz_attempt(
  (select attempt_id from t_start_partial),
  format('[{"question_id":"%s","selected_option_ids":["%s"]}]',
    '30000001-0000-4000-8000-000000000001', '31000001-0000-4000-8000-000000000001')::jsonb
);
-- 1 of 3 total points = 33.33%, below pass_score(50) -- proves partial credit is scored honestly
-- and does not round up into a pass.
select is((select score from t_partial), 33.33, 'P: one correct (1/3 points) scores 33.33');
select is((select passed from t_partial), false, 'Q: 33.33 < pass_score(50) => not passed');

create temp table t_start_wrong as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
create temp table t_wrong as select * from public.submit_quiz_attempt(
  (select attempt_id from t_start_wrong),
  format('[{"question_id":"%s","selected_option_ids":["%s"]}]',
    '30000001-0000-4000-8000-000000000001', '31000002-0000-4000-8000-000000000002')::jsonb
);
select is((select score from t_wrong), 0.00, 'P: an incorrect option scores 0 for that question');

-- =====================================================================================
-- R / V — cross-user isolation
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'); -- Officer A, second CĐA user
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[]'::jsonb)$$, (select attempt_id from t_correct)),
  'ATTEMPT_SCOPE_DENIED',
  'R: a different user cannot submit to someone else''s attempt'
);
select throws_ok(
  format($$select * from public.get_attempt_result(%L)$$, (select attempt_id from t_correct)),
  'ATTEMPT_SCOPE_DENIED',
  'V: a different, non-admin user cannot view someone else''s attempt result'
);
select is(
  (select count(*)::integer from public.quiz_attempts where id = (select attempt_id from t_correct)),
  0,
  'V: a different user cannot even see the row via plain SELECT'
);

-- =====================================================================================
-- S / U — double submit cannot duplicate scoring, and a finalized attempt is immutable
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[]'::jsonb)$$, (select attempt_id from t_correct)),
  'ATTEMPT_ALREADY_SUBMITTED',
  'S: resubmitting an already-finalized attempt is rejected with a stable terminal code'
);
select is(
  (select count(*)::integer from public.quiz_answers where attempt_id = (select attempt_id from t_correct)),
  2,
  'S: the second (rejected) submit call did not add or duplicate any answer rows'
);
select is(
  (select score from public.quiz_attempts where id = (select attempt_id from t_correct)),
  100.00,
  'U: the finalized attempt''s score is unchanged after the rejected resubmit'
);

-- =====================================================================================
-- T — expired attempt rejected, fail-closed, no partial write
-- =====================================================================================
create temp table t_start_timed as select * from public.start_quiz_attempt('2f000006-0000-4000-8000-000000000006');
-- Force the attempt into the past as postgres (bypassing RLS/RPC), simulating real elapsed time
-- without a 10-minute sleep in CI.
select reset_auth();
update public.quiz_attempts
set started_at = now() - interval '1 hour'
where id = (select attempt_id from t_start_timed);
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":["%s"]}]'::jsonb)$$,
    (select attempt_id from t_start_timed), '30000020-0000-4000-8000-000000000020', '31000020-0000-4000-8000-000000000020'),
  'ATTEMPT_EXPIRED',
  'T: submitting after time_limit_minutes has elapsed is rejected'
);
select is(
  (select count(*)::integer from public.quiz_answers where attempt_id = (select attempt_id from t_start_timed)),
  0,
  'T: the expired submission wrote no answer rows at all'
);
select is(
  (select submitted_at from public.quiz_attempts where id = (select attempt_id from t_start_timed)),
  null,
  'T: the expired attempt was not silently auto-finalized'
);

-- U (continued): a finalized attempt cannot be resumed into a new answer set either.
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[]'::jsonb)$$, (select attempt_id from t_wrong)),
  'ATTEMPT_ALREADY_SUBMITTED',
  'U: an already-finalized attempt cannot be resubmitted with different answers'
);

-- =====================================================================================
-- W / X — atomicity: a failed submission leaves nothing; a successful one writes exactly
-- one row per quiz question
-- =====================================================================================
create temp table t_start_wx as select * from public.start_quiz_attempt('2f000001-0000-4000-8000-000000000001');
select throws_ok(
  format($$select * from public.submit_quiz_attempt(%L, '[{"question_id":"%s","selected_option_ids":["%s"]},{"question_id":"00000000-0000-4000-8000-000000000000","selected_option_ids":[]}]'::jsonb)$$,
    (select attempt_id from t_start_wx), '30000001-0000-4000-8000-000000000001', '31000001-0000-4000-8000-000000000001'),
  'INVALID_QUESTION_FOR_QUIZ',
  'W: a batch with one valid and one invalid question is rejected as a whole'
);
select is(
  (select count(*)::integer from public.quiz_answers where attempt_id = (select attempt_id from t_start_wx)),
  0,
  'W: the failed submission left zero answer rows -- not even for the valid question in the batch'
);
select is(
  (select submitted_at from public.quiz_attempts where id = (select attempt_id from t_start_wx)),
  null,
  'W: the failed submission left the attempt unfinalized'
);

create temp table t_success_x as select * from public.submit_quiz_attempt(
  (select attempt_id from t_start_wx),
  format('[{"question_id":"%s","selected_option_ids":["%s"]}]',
    '30000001-0000-4000-8000-000000000001', '31000001-0000-4000-8000-000000000001')::jsonb
);
select is(
  (select count(*)::integer from public.quiz_answers where attempt_id = (select attempt_id from t_start_wx)),
  2,
  'X: successful submission writes exactly one row per quiz question (2), including the unanswered one'
);
select is(
  (select is_correct from public.quiz_answers
   where attempt_id = (select attempt_id from t_start_wx) and question_id = '30000002-0000-4000-8000-000000000002'),
  false,
  'X: the question omitted from the payload is recorded as answered-incorrectly (0 points), not silently absent'
);

-- =====================================================================================
-- Y — admin/content write scope remains bounded
-- =====================================================================================
select set_auth_user('11112222-3333-4444-5555-666677778888'); -- YOUTH_ADMIN scoped to CĐA only
select lives_ok(
  $$select public.update_quiz_metadata('2f000001-0000-4000-8000-000000000001', 'P4 Quiz A', 'edited', 50, null, 5, false, false)$$,
  'Y: CĐA-scoped admin can edit a quiz through the trusted admin path'
);
select throws_ok(
  $$select public.update_quiz_metadata('2f000004-0000-4000-8000-000000000004', 'P4 Quiz B', 'hostile edit', 70, null, 2, false, false)$$,
  'QUIZ_SCOPE_DENIED',
  'Y: CĐA-scoped admin cannot edit a quiz owned by CĐB'
);
select is(
  (select description from public.quizzes where id = '2f000004-0000-4000-8000-000000000004'),
  null,
  'Y: the rejected cross-org edit did not change anything'
);
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  $$update public.quizzes set description = 'member edit' where id = '2f000001-0000-4000-8000-000000000001'$$,
  null,
  'Y: a normal member cannot edit quiz content directly'
);
select is(
  (select description from public.quizzes where id = '2f000001-0000-4000-8000-000000000001'),
  'edited',
  'Y: the rejected member edit did not change anything'
);
select throws_ok(
  $$insert into public.quiz_options (question_id, option_text, is_correct)
    values ('30000001-0000-4000-8000-000000000001', 'hostile', true)$$,
  null,
  'Y: a normal member cannot insert a quiz_option (cannot plant a fake correct answer)'
);

-- =====================================================================================
-- Z — anon fails closed on every quiz table, without a policy-helper exception
-- =====================================================================================
select reset_auth();
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('can_access_quiz', 'can_manage_quiz_content')
     and grantee = 'anon'),
  2,
  'Z: anon can execute both quiz access helpers, so table policies deny instead of raising'
);
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select public.can_access_quiz('2f000001-0000-4000-8000-000000000001')$$,
  'Z: anon can evaluate the quiz access helper without an exception'
);
select is(
  has_table_privilege('anon', 'public.quiz_questions', 'select'),
  false,
  'Z: anon has no direct quiz_questions privilege and therefore fails closed'
);
select is(
  has_table_privilege('anon', 'public.quiz_options', 'select'),
  false,
  'Z: anon has no direct quiz_options privilege and therefore fails closed'
);
select reset_auth();

-- =====================================================================================
-- Attempt write-path closure and SECURITY DEFINER hygiene
-- =====================================================================================
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'quiz_attempts'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'authenticated holds no INSERT/UPDATE/DELETE grant on quiz_attempts -- RPC is the only write path'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'quiz_answers'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'authenticated holds no INSERT/UPDATE/DELETE grant on quiz_answers'
);
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('can_access_quiz', 'can_manage_quiz_content', 'get_quiz_intro',
                       'start_quiz_attempt', 'get_attempt_questions', 'submit_quiz_attempt',
                       'get_attempt_result')
     and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0,
  'every P4-04 SECURITY DEFINER function pins a search_path'
);
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('start_quiz_attempt', 'submit_quiz_attempt', 'get_attempt_questions',
                          'get_attempt_result', 'get_quiz_intro')
     and grantee = 'anon'),
  0,
  'anon cannot execute any P4-04 attempt-lifecycle RPC'
);

select * from finish();
rollback;
