-- Phase 2 · P2-04 acceptance — atomic submission finalize (create_report_submission_with_files).
-- Proves the RPC creates submission + files in one transaction (S7), binds file paths to the
-- assignment prefix and independently verifies finalized Storage objects. begin/rollback.
--   Officer A = cccccccc... (BRANCH_OFFICER, org CĐA 2222...)

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

-- Campaigns (open, in-time). CW1 happy; CW2 scope-invalid; CW3 terminal (ACCEPTED).
insert into public.report_campaigns (id, title, issuer, open_at, due_at, status) values
  ('7f000001-0000-0000-0000-000000000001','FIN1','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('7f000002-0000-0000-0000-000000000002','FIN2','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('7f000003-0000-0000-0000-000000000003','FIN3','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED')
on conflict (id) do nothing;

insert into storage.objects(bucket_id, name, owner, metadata) values
  ('report-submissions-private','7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f0000a1-0000-0000-0000-0000000000a1/v1/a-uuid.pdf','cccccccc-cccc-cccc-cccc-cccccccccccc','{"size":1024,"mimetype":"application/pdf"}'::jsonb),
  ('report-submissions-private','7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f0000a1-0000-0000-0000-0000000000a1/v1/b-uuid.xlsx','cccccccc-cccc-cccc-cccc-cccccccccccc','{"size":2048,"mimetype":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}'::jsonb)
on conflict do nothing;

insert into public.report_assignments (id, campaign_id, organization_id, status) values
  ('7f0000a1-0000-0000-0000-0000000000a1','7f000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','PENDING'),  -- AW1
  ('7f0000a2-0000-0000-0000-0000000000a2','7f000002-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','PENDING'),  -- AW2
  ('7f0000a3-0000-0000-0000-0000000000a3','7f000003-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','ACCEPTED')  -- AW3 (terminal)
on conflict (id) do nothing;

select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');

-- =====================================================================================
-- HAPPY PATH — submission + 2 files created atomically
-- =====================================================================================
select lives_ok(
  $$ select public.create_report_submission_with_files(
       '7f0000a1-0000-0000-0000-0000000000a1', 'tóm tắt', null,
       '[
         {"storage_path":"7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f0000a1-0000-0000-0000-0000000000a1/v1/a-uuid.pdf","original_name":"Bao cao.pdf","safe_name":"Bao-cao.pdf","mime_type":"application/pdf","size_bytes":1024},
         {"storage_path":"7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f0000a1-0000-0000-0000-0000000000a1/v1/b-uuid.xlsx","original_name":"Phu luc.xlsx","safe_name":"Phu-luc.xlsx","mime_type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","size_bytes":2048}
       ]'::jsonb, 1) $$,
  'W1 submission with files is created');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='7f0000a1-0000-0000-0000-0000000000a1' $$,
  ARRAY[1], 'W1 exactly one submission created');
select results_eq(
  $$ select count(*)::integer from public.report_submission_files f join public.report_submissions s on s.id=f.submission_id where s.assignment_id='7f0000a1-0000-0000-0000-0000000000a1' $$,
  ARRAY[2], 'W1 both file rows inserted atomically with the submission');
select results_eq(
  $$ select status from public.report_assignments where id='7f0000a1-0000-0000-0000-0000000000a1' $$,
  ARRAY['SUBMITTED'::text], 'W1 assignment advanced to SUBMITTED');
-- safe_name normalized on the backend path is stored verbatim; verify file bound to submission
select results_eq(
  $$ select size_bytes from public.report_submission_files f join public.report_submissions s on s.id=f.submission_id where s.assignment_id='7f0000a1-0000-0000-0000-0000000000a1' and f.storage_path like '%a-uuid.pdf' $$,
  ARRAY[1024::bigint], 'W1 file size persisted');

-- =====================================================================================
-- FILE SCOPE + ATOMICITY — a file outside the assignment prefix rolls the whole call back
-- =====================================================================================
select throws_ok(
  $$ select public.create_report_submission_with_files(
       '7f0000a2-0000-0000-0000-0000000000a2', null, null,
       '[{"storage_path":"7f000002-0000-0000-0000-000000000002/33333333-3333-3333-3333-333333333333/7f0000a2-0000-0000-0000-0000000000a2/v1/evil.pdf","original_name":"x.pdf","safe_name":"x.pdf","mime_type":"application/pdf","size_bytes":10}]'::jsonb, 1) $$,
  'FILE_SCOPE_INVALID',
  'W2 file outside the assignment prefix is rejected');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='7f0000a2-0000-0000-0000-0000000000a2' $$,
  ARRAY[0], 'W2 atomicity: no submission left behind after file rejection (S7)');

-- =====================================================================================
-- FILE REQUIRED — empty array rejected, nothing created
-- =====================================================================================
select throws_ok(
  $$ select public.create_report_submission_with_files('7f0000a2-0000-0000-0000-0000000000a2', null, null, '[]'::jsonb, 1) $$,
  'FILE_REQUIRED',
  'W3 empty file list is rejected');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='7f0000a2-0000-0000-0000-0000000000a2' $$,
  ARRAY[0], 'W3 no submission created for empty file list');

-- =====================================================================================
-- INNER LIFECYCLE FAILURE PROPAGATES — terminal assignment, whole call rolls back
-- =====================================================================================
select throws_ok(
  $$ select public.create_report_submission_with_files(
       '7f0000a3-0000-0000-0000-0000000000a3', null, null,
       '[{"storage_path":"7f000003-0000-0000-0000-000000000003/22222222-2222-2222-2222-222222222222/7f0000a3-0000-0000-0000-0000000000a3/v1/ok.pdf","original_name":"ok.pdf","safe_name":"ok.pdf","mime_type":"application/pdf","size_bytes":10}]'::jsonb, 1) $$,
  'REPORT_ALREADY_ACCEPTED',
  'W4 wrapper propagates inner lifecycle errors (ACCEPTED terminal)');
select results_eq(
  $$ select count(*)::integer from public.report_submission_files f join public.report_submissions s on s.id=f.submission_id where s.assignment_id='7f0000a3-0000-0000-0000-0000000000a3' $$,
  ARRAY[0], 'W4 no files written when the inner submission is rejected');

-- =====================================================================================
-- PRIVILEGE — only the expected-version overload is public to authenticated callers
-- =====================================================================================
select reset_auth();
select function_privs_are(
  'public','create_report_submission_with_files', ARRAY['uuid','text','text','jsonb'], 'authenticated', ARRAY[]::text[],
  'authenticated cannot execute the legacy no-version overload');
select function_privs_are(
  'public','create_report_submission_with_files', ARRAY['uuid','text','text','jsonb'], 'anon', ARRAY[]::text[],
  'anon cannot EXECUTE create_report_submission_with_files');
select function_privs_are(
  'public','create_report_submission_with_files', ARRAY['uuid','text','text','jsonb','integer'], 'authenticated', ARRAY['EXECUTE'],
  'authenticated can execute only the expected-version overload');

select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_submission_with_files(
       '7f0000a2-0000-0000-0000-0000000000a2', null, null,
       '[{"storage_path":"7f000002-0000-0000-0000-000000000002/22222222-2222-2222-2222-222222222222/7f0000a2-0000-0000-0000-0000000000a2/v1/missing.pdf","original_name":"missing.pdf","safe_name":"missing.pdf","mime_type":"application/pdf","size_bytes":10}]'::jsonb, 1) $$,
  'STORAGE_OBJECT_NOT_FOUND',
  'W5 direct RPC cannot finalize nonexistent Storage metadata');
select results_eq(
  $$ select count(*)::integer from public.report_submissions where assignment_id='7f0000a2-0000-0000-0000-0000000000a2' $$,
  ARRAY[0], 'W5 missing object failure rolls back submission and status');

select * from finish();
rollback;
