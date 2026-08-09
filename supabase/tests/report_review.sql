-- Phase 2 · P2-05 acceptance — review_report_assignment authorization & state machine.
-- Verifies scope (S3), transition guards (S4), reason requirements, and review_status sync (C4).
-- begin/rollback. Seed users:
--   Youth Admin A = 11112222-3333-4444-5555-666677778888 (YOUTH_ADMIN, scope CĐA 2222)
--   Youth Admin TĐ= bbbbbbbb... (YOUTH_ADMIN, scope Ban TN 1111 = parent of CĐA)
--   System Admin  = aaaaaaaa... (SYSTEM_ADMIN)
--   Member        = eeeeeeee... (MEMBER, CĐA)
--   Officer A     = cccccccc... (BRANCH_OFFICER, CĐA)
--   Officer B     = dddddddd... (BRANCH_OFFICER, CĐB 3333)

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

insert into public.report_campaigns (id, title, issuer, open_at, due_at, status) values
  ('8c000001-0000-0000-0000-000000000001','RV1','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('8c000002-0000-0000-0000-000000000002','RV2','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('8c000003-0000-0000-0000-000000000003','RV3','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('8c000004-0000-0000-0000-000000000004','RV4','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('8c000005-0000-0000-0000-000000000005','RV5','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('8c000006-0000-0000-0000-000000000006','RV6','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED')
on conflict (id) do nothing;

insert into public.report_assignments (id, campaign_id, organization_id, status) values
  ('8a000001-0000-0000-0000-000000000001','8c000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','SUBMITTED'), -- AV_SUB
  ('8a0000b1-0000-0000-0000-0000000000b1','8c000001-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','SUBMITTED'), -- AV_SUBB (Org B)
  ('8a000002-0000-0000-0000-000000000002','8c000002-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','SUBMITTED'), -- AV_SUB2
  ('8a000003-0000-0000-0000-000000000003','8c000003-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','PENDING'),   -- AV_PEND
  ('8a000004-0000-0000-0000-000000000004','8c000004-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','ACCEPTED'),  -- AV_ACC
  ('8a000005-0000-0000-0000-000000000005','8c000005-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','SUBMITTED'), -- AV_SUB3
  ('8a000006-0000-0000-0000-000000000006','8c000006-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222','PENDING')    -- AV_PEND2
on conflict (id) do nothing;

insert into public.report_submissions (assignment_id, version_number, submitted_by, review_status) values
  ('8a000001-0000-0000-0000-000000000001', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PENDING'),
  ('8a0000b1-0000-0000-0000-0000000000b1', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'PENDING'),
  ('8a000002-0000-0000-0000-000000000002', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PENDING'),
  ('8a000005-0000-0000-0000-000000000005', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'PENDING')
on conflict do nothing;

-- =====================================================================================
-- HAPPY: ACCEPT (Youth Admin scoped to the org) + review_status sync (C4)
-- =====================================================================================
select set_auth_user('11112222-3333-4444-5555-666677778888');
select lives_ok(
  $$ select public.review_report_assignment('8a000001-0000-0000-0000-000000000001','ACCEPTED',null) $$,
  'H-ACCEPT youth admin (in scope) accepts a submitted report');
select results_eq(
  $$ select status from public.report_assignments where id='8a000001-0000-0000-0000-000000000001' $$,
  ARRAY['ACCEPTED'::text], 'H-ACCEPT assignment status becomes ACCEPTED');
select results_eq(
  $$ select review_status from public.report_submissions where assignment_id='8a000001-0000-0000-0000-000000000001' and version_number=1 $$,
  ARRAY['ACCEPTED'::text], 'H-ACCEPT latest submission review_status synced (C4)');
select results_eq(
  $$ select (reviewed_by = '11112222-3333-4444-5555-666677778888') from public.report_submissions where assignment_id='8a000001-0000-0000-0000-000000000001' and version_number=1 $$,
  ARRAY[true], 'H-ACCEPT reviewed_by recorded');
select isnt_empty(
  $$ select 1 from public.report_status_history where assignment_id='8a000001-0000-0000-0000-000000000001' and to_status='ACCEPTED' $$,
  'H-ACCEPT status history row written');

-- =====================================================================================
-- HAPPY: NEEDS_SUPPLEMENT (System Admin) with reason
-- =====================================================================================
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok(
  $$ select public.review_report_assignment('8a000002-0000-0000-0000-000000000002','NEEDS_SUPPLEMENT','Bổ sung số liệu') $$,
  'H-NEEDS system admin requests supplement with a reason');
select results_eq(
  $$ select status from public.report_assignments where id='8a000002-0000-0000-0000-000000000002' $$,
  ARRAY['NEEDS_SUPPLEMENT'::text], 'H-NEEDS assignment becomes NEEDS_SUPPLEMENT');
select results_eq(
  $$ select review_status from public.report_submissions where assignment_id='8a000002-0000-0000-0000-000000000002' and version_number=1 $$,
  ARRAY['NEEDS_SUPPLEMENT'::text], 'H-NEEDS submission review_status synced');

-- =====================================================================================
-- HAPPY: EXEMPT (Youth Admin of parent org — recursive scope) with reason
-- =====================================================================================
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select lives_ok(
  $$ select public.review_report_assignment('8a000003-0000-0000-0000-000000000003','EXEMPTED','Đơn vị mới thành lập') $$,
  'H-EXEMPT parent-scope youth admin exempts a pending unit');
select results_eq(
  $$ select status from public.report_assignments where id='8a000003-0000-0000-0000-000000000003' $$,
  ARRAY['EXEMPTED'::text], 'H-EXEMPT assignment becomes EXEMPTED');
select results_eq(
  $$ select exempt_reason from public.report_assignments where id='8a000003-0000-0000-0000-000000000003' $$,
  ARRAY['Đơn vị mới thành lập'::text], 'H-EXEMPT exempt_reason stored');

-- =====================================================================================
-- SCOPE DENIED: Youth Admin of CĐA cannot review a CĐB assignment
-- =====================================================================================
select set_auth_user('11112222-3333-4444-5555-666677778888');
select throws_ok(
  $$ select public.review_report_assignment('8a0000b1-0000-0000-0000-0000000000b1','ACCEPTED',null) $$,
  'ASSIGNMENT_SCOPE_DENIED',
  'SCOPE youth admin CĐA cannot review CĐB assignment');

-- =====================================================================================
-- ROLE DENIED: MEMBER and BRANCH_OFFICER cannot review
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  $$ select public.review_report_assignment('8a000005-0000-0000-0000-000000000005','ACCEPTED',null) $$,
  'ASSIGNMENT_SCOPE_DENIED',
  'ROLE member cannot review');
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.review_report_assignment('8a000005-0000-0000-0000-000000000005','ACCEPTED',null) $$,
  'ASSIGNMENT_SCOPE_DENIED',
  'ROLE branch officer cannot review');

-- =====================================================================================
-- TRANSITION GUARDS
-- =====================================================================================
select set_auth_user('11112222-3333-4444-5555-666677778888');
-- Accept a PENDING assignment (no submission) -> invalid
select throws_ok(
  $$ select public.review_report_assignment('8a000006-0000-0000-0000-000000000006','ACCEPTED',null) $$,
  'INVALID_REPORT_TRANSITION',
  'TR accept without a submission is denied');
-- Exempt a SUBMITTED assignment -> invalid (exempt only from PENDING/OVERDUE)
select throws_ok(
  $$ select public.review_report_assignment('8a000005-0000-0000-0000-000000000005','EXEMPTED','x') $$,
  'INVALID_REPORT_TRANSITION',
  'TR exempt a submitted assignment is denied');
-- NEEDS_SUPPLEMENT without reason -> reason required
select throws_ok(
  $$ select public.review_report_assignment('8a000005-0000-0000-0000-000000000005','NEEDS_SUPPLEMENT',null) $$,
  'REASON_REQUIRED',
  'TR needs-supplement requires a reason');
-- Exempt without reason -> reason required
select throws_ok(
  $$ select public.review_report_assignment('8a000006-0000-0000-0000-000000000006','EXEMPTED',null) $$,
  'REASON_REQUIRED',
  'TR exempt requires a reason');
-- Review a terminal (ACCEPTED) assignment -> already accepted
select throws_ok(
  $$ select public.review_report_assignment('8a000004-0000-0000-0000-000000000004','ACCEPTED',null) $$,
  'REPORT_ALREADY_ACCEPTED',
  'TR reviewing an ACCEPTED assignment is denied');

-- =====================================================================================
-- PRIVILEGE
-- =====================================================================================
select reset_auth();
select function_privs_are(
  'public','review_report_assignment', ARRAY['uuid','text','text'], 'authenticated', ARRAY['EXECUTE'],
  'authenticated can EXECUTE review_report_assignment');
select function_privs_are(
  'public','review_report_assignment', ARRAY['uuid','text','text'], 'anon', ARRAY[]::text[],
  'anon cannot EXECUTE review_report_assignment');

select * from finish();
rollback;
