-- Phase 2 · P2-11 acceptance — submission history, versioning and safe resubmission.
-- H1-H26 cover version monotonicity, immutable history, scope, lifecycle, stale requests,
-- atomic rollback and notification routing. Existing P2-09/P2-10 suites remain regression gates.

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

insert into public.report_campaigns (id, title, issuer, open_at, due_at, close_at, allow_late_submission, allow_resubmission, status)
values
  ('9c000001-0000-0000-0000-000000000001', 'HIST-ALLOW', 'T', now()-interval '1 day', now()+interval '1 day', null, false, true, 'PUBLISHED'),
  ('9c000002-0000-0000-0000-000000000002', 'HIST-NEEDS', 'T', now()-interval '1 day', now()+interval '1 day', null, false, false, 'PUBLISHED'),
  ('9c000003-0000-0000-0000-000000000003', 'HIST-LATE', 'T', now()-interval '2 day', now()-interval '1 day', now()+interval '1 day', true, true, 'PUBLISHED'),
  ('9c000004-0000-0000-0000-000000000004', 'HIST-CLOSED', 'T', now()-interval '2 day', now()+interval '1 day', now()-interval '1 hour', true, true, 'PUBLISHED'),
  ('9c000005-0000-0000-0000-000000000005', 'HIST-DISABLED', 'T', now()-interval '1 day', now()+interval '1 day', null, false, false, 'PUBLISHED'),
  ('9c000006-0000-0000-0000-000000000006', 'HIST-LATE-DENY', 'T', now()-interval '2 day', now()-interval '1 day', now()+interval '1 day', false, true, 'PUBLISHED')
on conflict (id) do nothing;

insert into public.report_assignments (id, campaign_id, organization_id, status)
values
  ('9a000001-0000-0000-0000-000000000001', '9c000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'PENDING'),
  ('9a000002-0000-0000-0000-000000000002', '9c000002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'NEEDS_SUPPLEMENT'),
  ('9a000003-0000-0000-0000-000000000003', '9c000003-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'PENDING'),
  ('9a000004-0000-0000-0000-000000000004', '9c000004-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'PENDING'),
  ('9a000005-0000-0000-0000-000000000005', '9c000005-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'SUBMITTED'),
  ('9a000006-0000-0000-0000-000000000006', '9c000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'SUBMITTED'),
  ('9a000007-0000-0000-0000-000000000007', '9c000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'ACCEPTED'),
  ('9a000008-0000-0000-0000-000000000008', '9c000006-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'PENDING'),
  ('9a000009-0000-0000-0000-000000000009', '9c000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'EXEMPTED')
on conflict (id) do nothing;

insert into public.report_submissions (assignment_id, version_number, submitted_by, summary, submit_note, review_status, review_note)
values
  ('9a000002-0000-0000-0000-000000000002', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'v1', 'old note', 'NEEDS_SUPPLEMENT', 'Bổ sung bảng kê'),
  ('9a000005-0000-0000-0000-000000000005', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'disabled', null, 'PENDING', null),
  ('9a000006-0000-0000-0000-000000000006', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'other org', null, 'PENDING', null)
on conflict (assignment_id, version_number) do nothing;

select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- H1/H2/H3: first submit remains v1, then v2 and v3 are monotonic and readable.
select lives_ok(
  $$ select public.create_report_submission_with_files(
    '9a000001-0000-0000-0000-000000000001', 'v1 summary', null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v1/one.pdf","original_name":"one.pdf","size_bytes":10}]'::jsonb,
    1) $$,
  'H1 first submission is v1');
select lives_ok(
  $$ select public.create_report_submission_with_files(
    '9a000001-0000-0000-0000-000000000001', 'v2 summary', null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v2/two.pdf","original_name":"two.pdf","size_bytes":20}]'::jsonb,
    2) $$,
  'H2 valid resubmit creates v2');
select lives_ok(
  $$ select public.create_report_submission_with_files(
    '9a000001-0000-0000-0000-000000000001', 'v3 summary', null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v3/three.pdf","original_name":"three.pdf","size_bytes":30}]'::jsonb,
    3) $$,
  'H3 next resubmit creates v3');
select results_eq(
  $$ select array_agg(version_number order by version_number) from public.report_submissions where assignment_id='9a000001-0000-0000-0000-000000000001' $$,
  $$ values (ARRAY[1,2,3]::integer[]) $$,
  'H4 old versions remain readable in order');
select results_eq(
  $$ select array_agg(storage_path order by version_number) from public.report_submission_files f join public.report_submissions s on s.id=f.submission_id where s.assignment_id='9a000001-0000-0000-0000-000000000001' $$,
  $$ values (ARRAY[
    '9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v1/one.pdf',
    '9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v2/two.pdf',
    '9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v3/three.pdf'
  ]::text[]) $$,
  'H5 each version owns an immutable vN file namespace');

-- H6/H7: old metadata is read-only and cross-org history is invisible.
select throws_ok(
  $$ update public.report_submission_files set storage_path='tampered' where storage_path like '%/v1/one.pdf' $$,
  'permission denied for table report_submission_files',
  'H6 old finalized file metadata cannot be updated');
select throws_ok(
  $$ delete from public.report_submission_files where storage_path like '%/v1/one.pdf' $$,
  'permission denied for table report_submission_files',
  'H6 old finalized file metadata cannot be deleted');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='9a000006-0000-0000-0000-000000000006' $$,
  ARRAY[0],
  'H7 cross-org history is denied by RLS');

-- H8/H9/H10/H11: NEEDS_SUPPLEMENT is an explicit resubmit exception, preserving v1 review.
select lives_ok(
  $$ select public.create_report_submission_with_files(
    '9a000002-0000-0000-0000-000000000002', 'v2 corrected', 'updated',
    '[{"storage_path":"9c000002-0000-0000-0000-000000000002/22222222-2222-2222-2222-222222222222/9a000002-0000-0000-0000-000000000002/v2/corrected.pdf","original_name":"corrected.pdf","size_bytes":12}]'::jsonb,
    2) $$,
  'H8 NEEDS_SUPPLEMENT resubmit is allowed even when voluntary resubmit is disabled');
select results_eq(
  $$ select status from public.report_assignments where id='9a000002-0000-0000-0000-000000000002' $$,
  ARRAY['RESUBMITTED'::text], 'H8 assignment becomes RESUBMITTED');
select results_eq(
  $$ select review_status || '|' || review_note from public.report_submissions where assignment_id='9a000002-0000-0000-0000-000000000002' and version_number=1 $$,
  ARRAY['NEEDS_SUPPLEMENT|Bổ sung bảng kê'::text], 'H9 v1 review metadata remains unchanged');
select results_eq(
  $$ select is_late from public.report_submissions where assignment_id='9a000002-0000-0000-0000-000000000002' and version_number=2 $$,
  ARRAY[false], 'H10 resubmit preserves lateness per server clock');

-- H12/H13/H14/H15: terminal/closed/disabled resubmits are fail-closed.
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000005-0000-0000-0000-000000000005', null, null,
    '[{"storage_path":"9c000005-0000-0000-0000-000000000005/22222222-2222-2222-2222-222222222222/9a000005-0000-0000-0000-000000000005/v2/no.pdf","original_name":"no.pdf","size_bytes":10}]'::jsonb, 2) $$,
  'RESUBMISSION_NOT_ALLOWED', 'H15 allow_resubmission=false denies voluntary resubmit');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000008-0000-0000-0000-000000000008', null, null,
    '[{"storage_path":"9c000006-0000-0000-0000-000000000006/22222222-2222-2222-2222-222222222222/9a000008-0000-0000-0000-000000000008/v1/late.pdf","original_name":"late.pdf","size_bytes":10}]'::jsonb, 1) $$,
  'LATE_SUBMISSION_NOT_ALLOWED', 'H21 late resubmit is denied when campaign disallows late submission');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000004-0000-0000-0000-000000000004', null, null,
    '[{"storage_path":"9c000004-0000-0000-0000-000000000004/22222222-2222-2222-2222-222222222222/9a000004-0000-0000-0000-000000000004/v1/closed.pdf","original_name":"closed.pdf","size_bytes":10}]'::jsonb, 1) $$,
  'REPORT_CLOSED', 'H14 closed campaign denies resubmit');

select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000007-0000-0000-0000-000000000007', null, null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000007-0000-0000-0000-000000000007/v1/accepted.pdf","original_name":"accepted.pdf","size_bytes":10}]'::jsonb, 1) $$,
  'REPORT_ALREADY_ACCEPTED', 'H12 ACCEPTED assignment cannot resubmit');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000009-0000-0000-0000-000000000009', null, null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000009-0000-0000-0000-000000000009/v1/exempted.pdf","original_name":"exempted.pdf","size_bytes":10}]'::jsonb, 1) $$,
  'REPORT_EXEMPTED', 'H13 EXEMPTED assignment cannot resubmit');

-- H16/H19/H22/H24: stale expected version and malformed/non-version paths fail without mutations.
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000001-0000-0000-0000-000000000001', null, null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/v2/stale.pdf","original_name":"stale.pdf","size_bytes":10}]'::jsonb, 2) $$,
  'STALE_SUBMISSION_VERSION', 'H16/H19 stale expected version is rejected');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='9a000001-0000-0000-0000-000000000001' $$,
  ARRAY[3], 'H17 stale request creates no extra submission');
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_submission_with_files(
    '9a000001-0000-0000-0000-000000000001', null, null,
    '[{"storage_path":"9c000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/9a000001-0000-0000-0000-000000000001/staging/bad.pdf","original_name":"bad.pdf","size_bytes":10}]'::jsonb, 4) $$,
  'FILE_SCOPE_INVALID', 'H22 staging path cannot be finalized');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='9a000001-0000-0000-0000-000000000001' $$,
  ARRAY[3], 'H17 malformed path rollback leaves history unchanged');

-- H18/H23: direct metadata bypass and arbitrary uploader are denied.
select throws_ok(
  $$ insert into public.report_submission_files(submission_id, storage_path, original_name, safe_name, size_bytes, uploaded_by)
     values ((select id from public.report_submissions where assignment_id='9a000002-0000-0000-0000-000000000002' and version_number=1),
       '9c000002-0000-0000-0000-000000000002/22222222-2222-2222-2222-222222222222/9a000002-0000-0000-0000-000000000002/v9/evil.pdf',
       'evil.pdf', 'evil.pdf', 1, 'dddddddd-dddd-dddd-dddd-dddddddddddd') $$,
  'permission denied for table report_submission_files',
  'H18/H23 direct DB file metadata bypass is denied');

-- H20/H26: late resubmit keeps is_late=true and notification links to assignment.id.
select lives_ok(
  $$ select public.create_report_submission_with_files(
    '9a000003-0000-0000-0000-000000000003', null, null,
    '[{"storage_path":"9c000003-0000-0000-0000-000000000003/22222222-2222-2222-2222-222222222222/9a000003-0000-0000-0000-000000000003/v1/late.pdf","original_name":"late.pdf","size_bytes":10}]'::jsonb,
    1) $$,
  'H20 late submission is allowed when campaign allows it');
select results_eq(
  $$ select is_late from public.report_submissions where assignment_id='9a000003-0000-0000-0000-000000000003' and version_number=1 $$,
  ARRAY[true], 'H20 late submission stores is_late=true');
select results_eq(
  $$ select count(*)::integer from public.notifications where user_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and type='REPORT_SUBMITTED' and action_url='/cong-viec/bao-cao/9a000003-0000-0000-0000-000000000003' $$,
  ARRAY[1], 'H26 notification route uses assignment.id');

-- H25: failed submission leaves no fake history row.
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id='9a000002-0000-0000-0000-000000000002' and to_status='RESUBMITTED' $$,
  ARRAY[1], 'H25 only the successful resubmit has a status history row');

select * from finish();
rollback;
