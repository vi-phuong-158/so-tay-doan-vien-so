-- Phase 2 · P2-09 acceptance — exact-path cleanup of unfinalized staging objects.
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
  ('7f000001-0000-0000-0000-000000000001', 'Cleanup campaign', 'T', now() - interval '1 day', now() + interval '1 day', 'PUBLISHED')
on conflict (id) do nothing;

insert into public.report_assignments (id, campaign_id, organization_id, status) values
  ('7f000002-0000-0000-0000-000000000002', '7f000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'PENDING')
on conflict (id) do nothing;

-- Rehearsal-only second uploader in the same organization for C8.
insert into public.user_roles (user_id, role_code, scope_organization_id)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'BRANCH_OFFICER', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into storage.objects (bucket_id, name, owner) values
  ('report-submissions-private', '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f000002-0000-0000-0000-000000000002/staging/77777777-7777-4777-8777-777777777777-own.pdf', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('report-submissions-private', '7f000001-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/staging/88888888-8888-4888-8888-888888888888-other.pdf', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  ('report-submissions-private', '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/v1/99999999-9999-4999-8999-999999999999-non-staging.pdf', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('report-submissions-private', '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('report-submissions-private', '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-other-uploader.pdf', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('report-submissions-private', 'malformed/path', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
on conflict do nothing;

insert into public.report_submissions (id, assignment_id, version_number, submitted_by)
values ('7f000003-0000-0000-0000-000000000003', '7f000002-0000-0000-0000-000000000002', 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc')
on conflict (id) do nothing;

insert into public.report_submission_files (submission_id, storage_path, original_name, safe_name, size_bytes, uploaded_by)
values (
  '7f000003-0000-0000-0000-000000000003',
  '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf',
  'finalized.pdf', 'finalized.pdf', 10, 'cccccccc-cccc-cccc-cccc-cccccccccccc'
)
on conflict (storage_path) do nothing;

-- C1: own active officer may remove an unfinalized staged object.
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select lives_ok(
  $$ delete from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7f000002-0000-0000-0000-000000000002/staging/77777777-7777-4777-8777-777777777777-own.pdf' $$,
  'Owner can delete own unfinalized staging object'
);

-- C2: cross-org object is invisible and cannot be deleted.
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/staging/88888888-8888-4888-8888-888888888888-other.pdf' $$,
  array[0],
  'Officer cannot delete or observe another organization staging object'
);

-- C3: anonymous caller is denied.
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf' $$,
  array[0],
  'Anonymous caller cannot delete finalized staging-path object'
);

-- C4: suspended account is denied.
select set_auth_user('99999999-9999-9999-9999-999999999999');
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf' $$,
  array[0],
  'Suspended account cannot delete staging object'
);

-- C5: a finalized reference blocks deletion even though the path contains /staging/.
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select lives_ok(
  $$ delete from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf' $$,
  'Finalized staging-path object delete is evaluated without SQL exception'
);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-finalized.pdf' $$,
  array[1],
  'Finalized staging-path object is never cleaned'
);

-- C8: same-org officer cannot delete another uploader's object.
select lives_ok(
  $$ delete from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-other-uploader.pdf' $$,
  'Other uploader delete is evaluated without SQL exception'
);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/staging/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-other-uploader.pdf' $$,
  array[1],
  'Same-org officer cannot delete another uploader staging object'
);

-- C6: non-staging path is denied.
select lives_ok(
  $$ delete from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/v1/99999999-9999-4999-8999-999999999999-non-staging.pdf' $$,
  'Non-staging delete is evaluated without SQL exception'
);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7f000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/v1/99999999-9999-4999-8999-999999999999-non-staging.pdf' $$,
  array[1],
  'Non-staging object remains'
);

-- C7: malformed paths fail closed without leaking a SQL exception.
select lives_ok(
  $$ delete from storage.objects where name = 'malformed/path' $$,
  'Malformed staging path is fail-closed without SQL exception'
);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = 'malformed/path' $$,
  array[1],
  'Malformed path remains'
);

select * from finish();
rollback;
