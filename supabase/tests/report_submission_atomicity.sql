-- Phase 2 · P2-02 acceptance — atomic report submission workflow.
-- Verifies the hardened create_report_submission RPC and the closure of the direct-INSERT
-- bypass (S1/C3). Runs inside a transaction and rolls back. Uses seed org/profile fixtures:
--   Officer A = cccccccc... (BRANCH_OFFICER, org CĐA 2222...)
--   Officer B = dddddddd... (BRANCH_OFFICER, org CĐB 3333...)
--   Member    = eeeeeeee... (MEMBER, org CĐA 2222...)
--   Innovation= ffffffff... (INNOVATION_MEMBER, org Ban TN 1111...)

begin;

select no_plan();

-- ---- Auth helpers (scoped to this test file) ---------------------------------------
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

-- ---- Fixtures (created as postgres; time windows are relative to transaction now()) --
select reset_auth();

-- Campaigns. Columns: open_at, due_at, close_at, allow_late_submission, allow_resubmission
insert into public.report_campaigns (id, title, issuer, open_at, due_at, close_at, allow_late_submission, allow_resubmission, status) values
  ('7c000001-0000-0000-0000-000000000001','OPEN','T', now()-interval '1 day', now()+interval '1 day', null,               false, true,  'PUBLISHED'),
  ('7c000002-0000-0000-0000-000000000002','NOTOPEN','T', now()+interval '1 day', now()+interval '2 day', null,           false, true,  'PUBLISHED'),
  ('7c000003-0000-0000-0000-000000000003','LATEOFF','T', now()-interval '2 day', now()-interval '1 day', null,           false, true,  'PUBLISHED'),
  ('7c000004-0000-0000-0000-000000000004','LATEON','T',  now()-interval '2 day', now()-interval '1 day', now()+interval '1 day', true, true, 'PUBLISHED'),
  ('7c000005-0000-0000-0000-000000000005','LATEON2','T', now()-interval '2 day', now()-interval '1 day', now()+interval '1 day', true, true, 'PUBLISHED'),
  ('7c000006-0000-0000-0000-000000000006','HARDCL','T',  now()-interval '3 day', now()-interval '2 day', now()-interval '1 day', true, true, 'PUBLISHED'),
  ('7c000007-0000-0000-0000-000000000007','NORESUB','T', now()-interval '1 day', now()+interval '1 day', null,           false, false, 'PUBLISHED'),
  ('7c000008-0000-0000-0000-000000000008','NORESUB2','T',now()-interval '1 day', now()+interval '1 day', null,           false, false, 'PUBLISHED'),
  ('7c000009-0000-0000-0000-000000000009','TERMACC','T', now()-interval '1 day', now()+interval '1 day', null,           false, true,  'PUBLISHED'),
  ('7c00000a-0000-0000-0000-00000000000a','TERMEXE','T', now()-interval '1 day', now()+interval '1 day', null,           false, true,  'PUBLISHED'),
  ('7c00000b-0000-0000-0000-00000000000b','SUSP','T',    now()-interval '1 day', now()+interval '1 day', null,           false, true,  'PUBLISHED'),
  ('7c00000c-0000-0000-0000-00000000000c','ROLE','T',    now()-interval '1 day', now()+interval '1 day', null,           false, true,  'PUBLISHED')
on conflict (id) do nothing;

-- Assignments. org CĐA = 2222..., org CĐB = 3333...
insert into public.report_assignments (id, campaign_id, organization_id, status) values
  ('7a000001-0000-0000-0000-000000000001','7c000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_OPEN
  ('7a000002-0000-0000-0000-000000000002','7c000001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','PENDING'),          -- A_XORG (Org B)
  ('7a000003-0000-0000-0000-000000000003','7c000002-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_NOTOPEN
  ('7a000004-0000-0000-0000-000000000004','7c000003-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_LATEOFF
  ('7a000005-0000-0000-0000-000000000005','7c000004-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_LATEON (initial late)
  ('7a000006-0000-0000-0000-000000000006','7c000005-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','NEEDS_SUPPLEMENT'), -- A_LATEON_NS
  ('7a000007-0000-0000-0000-000000000007','7c000006-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_HARDCL
  ('7a000008-0000-0000-0000-000000000008','7c000007-0000-0000-0000-000000000007','22222222-2222-2222-2222-222222222222','SUBMITTED'),        -- A_NORESUB_SUB
  ('7a000009-0000-0000-0000-000000000009','7c000008-0000-0000-0000-000000000008','22222222-2222-2222-2222-222222222222','NEEDS_SUPPLEMENT'), -- A_NORESUB_NS
  ('7a00000a-0000-0000-0000-00000000000a','7c000009-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','ACCEPTED'),         -- A_ACC
  ('7a00000b-0000-0000-0000-00000000000b','7c00000a-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','EXEMPTED'),         -- A_EXE
  ('7a00000c-0000-0000-0000-00000000000c','7c00000b-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','PENDING'),          -- A_SUSP
  ('7a00000d-0000-0000-0000-00000000000d','7c00000c-0000-0000-0000-00000000000c','22222222-2222-2222-2222-222222222222','PENDING')           -- A_ROLE
on conflict (id) do nothing;

-- Pre-existing version 1 submissions for assignments that must be at "resubmission" stage.
insert into public.report_submissions (assignment_id, version_number, submitted_by, is_late) values
  ('7a000006-0000-0000-0000-000000000006', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false),  -- A_LATEON_NS
  ('7a000008-0000-0000-0000-000000000008', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false),  -- A_NORESUB_SUB
  ('7a000009-0000-0000-0000-000000000009', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false)   -- A_NORESUB_NS
on conflict do nothing;

-- =====================================================================================
-- HAPPY PATH + VERSIONING
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- T1: initial submit -> version 1, SUBMITTED, is_late=false
select lives_ok(
  $$ select public.create_report_submission('7a000001-0000-0000-0000-000000000001','tóm tắt','ghi chú') $$,
  'T1 Officer A can submit initial version'
);
select results_eq(
  $$ select version_number from public.report_submissions where assignment_id='7a000001-0000-0000-0000-000000000001' order by version_number desc limit 1 $$,
  ARRAY[1], 'T1 first version_number = 1');
select results_eq(
  $$ select status from public.report_assignments where id='7a000001-0000-0000-0000-000000000001' $$,
  ARRAY['SUBMITTED'::text], 'T1 assignment becomes SUBMITTED');
select results_eq(
  $$ select is_late from public.report_submissions where assignment_id='7a000001-0000-0000-0000-000000000001' and version_number=1 $$,
  ARRAY[false], 'T1 in-time submission is not late');

-- T2: voluntary resubmit (allow_resubmission=true) -> version 2, RESUBMITTED
select lives_ok(
  $$ select public.create_report_submission('7a000001-0000-0000-0000-000000000001') $$,
  'T2 Officer A can resubmit when allowed');
select results_eq(
  $$ select max(version_number)::integer from public.report_submissions where assignment_id='7a000001-0000-0000-0000-000000000001' $$,
  ARRAY[2], 'T2 next version_number = 2');
select results_eq(
  $$ select status from public.report_assignments where id='7a000001-0000-0000-0000-000000000001' $$,
  ARRAY['RESUBMITTED'::text], 'T2 assignment becomes RESUBMITTED');

-- T16: status history recorded the PENDING->SUBMITTED transition in the same transaction
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id='7a000001-0000-0000-0000-000000000001' and to_status='SUBMITTED' and changed_by='cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  ARRAY[1], 'T16 status history row created for submission');

-- =====================================================================================
-- CONCURRENCY / UNIQUENESS (RPT-V02/V06)
-- =====================================================================================
-- Structural guarantee: FOR UPDATE on the assignment row serializes concurrent callers and
-- unique(assignment_id, version_number) is the backstop. Prove the backstop rejects a
-- duplicate version (as would occur if two callers ever computed the same version_number).
select reset_auth();
select throws_ok(
  $$ insert into public.report_submissions (assignment_id, version_number, submitted_by) values ('7a000001-0000-0000-0000-000000000001', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'duplicate key value violates unique constraint "report_submissions_assignment_id_version_number_key"',
  'T3 duplicate (assignment_id, version_number) is rejected by unique constraint');

-- =====================================================================================
-- ISOLATION & DIRECT-INSERT BYPASS (S1)
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- T4: Officer A cannot submit an assignment belonging to Org B
select throws_ok(
  $$ select public.create_report_submission('7a000002-0000-0000-0000-000000000002') $$,
  'ASSIGNMENT_SCOPE_DENIED',
  'T4 cross-organization submission is denied');

-- T5: authenticated BRANCH_OFFICER cannot INSERT into report_submissions directly (bypass closed)
select throws_ok(
  $$ insert into public.report_submissions (assignment_id, version_number, submitted_by) values ('7a000001-0000-0000-0000-000000000001', 99, 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'permission denied for table report_submissions',
  'T5 direct INSERT into report_submissions is denied (permission)');

-- No end-user role may write report_assignments directly; status changes flow only through the
-- controlled RPCs (P2-05 revoked UPDATE from authenticated). The status stays unchanged.
select throws_ok(
  $$ update public.report_assignments set status='ACCEPTED' where id='7a000001-0000-0000-0000-000000000001' $$,
  'permission denied for table report_assignments',
  'T5b direct UPDATE of report_assignments is denied for authenticated');
select results_eq(
  $$ select status from public.report_assignments where id='7a000001-0000-0000-0000-000000000001' $$,
  ARRAY['RESUBMITTED'::text], 'T5b assignment status unchanged after denied direct UPDATE');

-- =====================================================================================
-- TERMINAL STATES (D1/D2)
-- =====================================================================================
select throws_ok(
  $$ select public.create_report_submission('7a00000a-0000-0000-0000-00000000000a') $$,
  'REPORT_ALREADY_ACCEPTED',
  'T6 submit into ACCEPTED assignment is denied');
select throws_ok(
  $$ select public.create_report_submission('7a00000b-0000-0000-0000-00000000000b') $$,
  'REPORT_EXEMPTED',
  'T7 submit into EXEMPTED assignment is denied');

-- =====================================================================================
-- SERVER TIME RULES (D5)
-- =====================================================================================
-- T8: before open_at
select throws_ok(
  $$ select public.create_report_submission('7a000003-0000-0000-0000-000000000003') $$,
  'REPORT_NOT_OPEN',
  'T8 submit before open_at is denied');

-- T9: after due, allow_late=false
select throws_ok(
  $$ select public.create_report_submission('7a000004-0000-0000-0000-000000000004') $$,
  'LATE_SUBMISSION_NOT_ALLOWED',
  'T9 late submission denied when allow_late=false');

-- T10: after due, allow_late=true, before close -> LATE_SUBMITTED, is_late=true
select lives_ok(
  $$ select public.create_report_submission('7a000005-0000-0000-0000-000000000005') $$,
  'T10 late submission allowed within late window');
select results_eq(
  $$ select status from public.report_assignments where id='7a000005-0000-0000-0000-000000000005' $$,
  ARRAY['LATE_SUBMITTED'::text], 'T10 initial late submission labels assignment LATE_SUBMITTED');
select results_eq(
  $$ select is_late from public.report_submissions where assignment_id='7a000005-0000-0000-0000-000000000005' and version_number=1 $$,
  ARRAY[true], 'T10 submission flagged is_late=true');

-- T11: after close_at -> denied even though allow_late=true (D5 hard close)
select throws_ok(
  $$ select public.create_report_submission('7a000007-0000-0000-0000-000000000007') $$,
  'REPORT_CLOSED',
  'T11 submission after close_at is denied regardless of allow_late');

-- =====================================================================================
-- C1 / D4 — NEEDS_SUPPLEMENT after due keeps RESUBMITTED, marks is_late
-- =====================================================================================
select lives_ok(
  $$ select public.create_report_submission('7a000006-0000-0000-0000-000000000006') $$,
  'T12 resubmit after NEEDS_SUPPLEMENT within late window is allowed');
select results_eq(
  $$ select max(version_number)::integer from public.report_submissions where assignment_id='7a000006-0000-0000-0000-000000000006' $$,
  ARRAY[2], 'T12 resubmission creates version 2');
select results_eq(
  $$ select status from public.report_assignments where id='7a000006-0000-0000-0000-000000000006' $$,
  ARRAY['RESUBMITTED'::text], 'T12 assignment stays RESUBMITTED (not overwritten to LATE_SUBMITTED)');
select results_eq(
  $$ select is_late from public.report_submissions where assignment_id='7a000006-0000-0000-0000-000000000006' and version_number=2 $$,
  ARRAY[true], 'T12 late resubmission still flagged is_late=true');

-- =====================================================================================
-- RESUBMISSION POLICY (allow_resubmission)
-- =====================================================================================
-- T13: voluntary resubmit blocked when allow_resubmission=false and not NEEDS_SUPPLEMENT
select throws_ok(
  $$ select public.create_report_submission('7a000008-0000-0000-0000-000000000008') $$,
  'RESUBMISSION_NOT_ALLOWED',
  'T13 voluntary resubmit denied when allow_resubmission=false');

-- T14: NEEDS_SUPPLEMENT resubmit allowed even when allow_resubmission=false
select lives_ok(
  $$ select public.create_report_submission('7a000009-0000-0000-0000-000000000009') $$,
  'T14 admin-requested resubmit allowed despite allow_resubmission=false');
select results_eq(
  $$ select status from public.report_assignments where id='7a000009-0000-0000-0000-000000000009' $$,
  ARRAY['RESUBMITTED'::text], 'T14 assignment becomes RESUBMITTED');

-- =====================================================================================
-- ROLE ENFORCEMENT
-- =====================================================================================
-- R1: MEMBER cannot submit
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  $$ select public.create_report_submission('7a00000d-0000-0000-0000-00000000000d') $$,
  'REPORT_ROLE_DENIED',
  'R1 MEMBER cannot submit reports');

-- R3: INNOVATION_MEMBER cannot submit
select set_auth_user('ffffffff-ffff-ffff-ffff-ffffffffffff');
select throws_ok(
  $$ select public.create_report_submission('7a00000d-0000-0000-0000-00000000000d') $$,
  'REPORT_ROLE_DENIED',
  'R3 INNOVATION_MEMBER cannot submit reports');

-- =====================================================================================
-- SUSPENDED ACCOUNT (fail-closed)
-- =====================================================================================
select reset_auth();
update public.profiles set account_status='SUSPENDED' where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_submission('7a00000c-0000-0000-0000-00000000000c') $$,
  'ACCOUNT_NOT_ACTIVE',
  'T15 suspended officer cannot submit (fail-closed)');
select reset_auth();
update public.profiles set account_status='ACTIVE' where id='cccccccc-cccc-cccc-cccc-cccccccccccc';

-- =====================================================================================
-- PRIVILEGE ASSERTIONS (S1 defense-in-depth)
-- =====================================================================================
-- Behavioural denial of direct INSERT is already proven by T5 (SQLSTATE 42501).
-- Assert the controlled RPC is executable by authenticated but not anon.
select function_privs_are(
  'public','create_report_submission', ARRAY['uuid','text','text'], 'authenticated', ARRAY['EXECUTE'],
  'authenticated can EXECUTE create_report_submission');
select function_privs_are(
  'public','create_report_submission', ARRAY['uuid','text','text'], 'anon', ARRAY[]::text[],
  'anon cannot EXECUTE create_report_submission');

select * from finish();
rollback;
