begin;

select plan(12);

-- 1. Setup role helper
create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- Assume seed.sql is run before this test.
-- user A = cccccccc-cccc-cccc-cccc-cccccccccccc (Org A, BRANCH_OFFICER)
-- user B = dddddddd-dddd-dddd-dddd-dddddddddddd (Org B, BRANCH_OFFICER)
-- user Sysadmin = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (SYSTEM_ADMIN)
-- user youthadmin = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb (YOUTH_ADMIN)

-- Run tests as User A (Org A)
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

-- 1. User A should only see their own organization's report assignments
select results_eq(
  'select count(*)::integer from public.report_assignments',
  ARRAY[1],
  'User A should see only 1 report assignment for their organization'
);

-- 2. User A cannot see other profiles except their own (or those permitted, wait profiles policy says users read own profile unless admin)
select results_eq(
  'select count(*)::integer from public.profiles where id = ''dddddddd-dddd-dddd-dddd-dddddddddddd''::uuid',
  ARRAY[0],
  'User A should not see User B profile'
);

-- 3. User A cannot update their own organization_id (RLS update policy prevents changing org id)
select throws_ok(
  $$ update public.profiles set organization_id = '33333333-3333-3333-3333-333333333333'::uuid where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid $$,
  'new row violates row-level security policy for table "profiles"',
  'User A cannot change their own organization_id'
);

-- 4. User A cannot insert a role for themselves
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code, scope_organization_id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'SYSTEM_ADMIN', null) $$,
  'new row violates row-level security policy for table "user_roles"',
  'User A cannot grant SYSTEM_ADMIN to themselves'
);

-- Run tests as Sysadmin
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);

-- 5. Sysadmin can see all profiles
select results_eq(
  'select count(*)::integer from public.profiles',
  ARRAY[6],
  'Sysadmin can see all 6 profiles'
);

-- 6. Sysadmin can grant roles
select lives_ok(
  $$ insert into public.user_roles (user_id, role_code) values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'SYSTEM_ADMIN') $$,
  'Sysadmin can grant roles'
);

-- Run tests as anon
perform set_config('role', 'anon', true);
perform set_config('request.jwt.claims', '{}', true);

-- 7. Anon cannot see users
select results_eq(
  'select count(*)::integer from public.profiles',
  ARRAY[0],
  'Anon cannot read profiles'
);

-- 8. Anon cannot read announcements
select results_eq(
  'select count(*)::integer from public.announcements',
  ARRAY[0],
  'Anon cannot read announcements'
);

-- Test suspended user
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
update public.profiles set account_status = 'SUSPENDED' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid;

select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
-- 9. Suspended user cannot read published announcements
insert into public.announcements (title, content, status) values ('Test', 'Content', 'PUBLISHED');
select results_eq(
  'select count(*)::integer from public.announcements',
  ARRAY[0],
  'Suspended user cannot read published announcements'
);

-- Reset suspended user
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
update public.profiles set account_status = 'ACTIVE' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid;

select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
-- 10. Active user can read published announcements
select results_eq(
  'select count(*)::integer from public.announcements',
  ARRAY[1],
  'Active user can read published announcements'
);

-- 11. Youth Admin can see organization assignments
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
select results_eq(
  'select count(*)::integer from public.report_assignments',
  ARRAY[2],
  'Youth Admin can see all assignments'
);

-- 12. Youth admin cannot grant SYSTEM_ADMIN
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'SYSTEM_ADMIN') $$,
  'new row violates row-level security policy for table "user_roles"',
  'Youth Admin cannot grant SYSTEM_ADMIN'
);

select * from finish();
rollback;
