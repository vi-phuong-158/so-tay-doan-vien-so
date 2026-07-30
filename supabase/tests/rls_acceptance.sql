begin;

select plan(29);

-- 1. Setup role helper
create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- user A = cccccccc-cccc-cccc-cccc-cccccccccccc (Org A, BRANCH_OFFICER)
-- user B = dddddddd-dddd-dddd-dddd-dddddddddddd (Org B, BRANCH_OFFICER)
-- sysadmin = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (SYSTEM_ADMIN, NULL scope)
-- youthadmin = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb (YOUTH_ADMIN, Org A)

-- 1. SYSTEM_ADMIN có scope NULL được tạo thành công
select results_eq(
  'select count(*)::integer from public.user_roles where user_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''::uuid and role_code = ''SYSTEM_ADMIN'' and scope_organization_id is null',
  ARRAY[1],
  'SYSTEM_ADMIN can have null scope'
);

-- 2. Không thể cấp trùng cùng role và scope
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code, scope_organization_id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'BRANCH_OFFICER', '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'duplicate key value violates unique constraint "user_roles_scope_unique"',
  'Cannot grant duplicate role in same scope'
);

-- Run tests as User A (Org A)
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

-- 3. User A should only see their own organization's report assignments
select results_eq(
  'select count(*)::integer from public.report_assignments',
  ARRAY[1],
  'User A should see only 1 report assignment for their organization'
);

-- 4. User A cannot update their own organization_id
select throws_ok(
  $$ update public.profiles set organization_id = '33333333-3333-3333-3333-333333333333'::uuid where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid $$,
  'new row violates row-level security policy for table "profiles"',
  'User A cannot change their own organization_id'
);

-- 5. User A cannot insert a role for themselves
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code, scope_organization_id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'SYSTEM_ADMIN', null) $$,
  'new row violates row-level security policy for table "user_roles"',
  'User A cannot grant SYSTEM_ADMIN to themselves'
);

-- Run tests as Sysadmin
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);

-- 6. Sysadmin can see all profiles
select results_eq(
  'select count(*)::integer from public.profiles',
  ARRAY[6],
  'Sysadmin can see all 6 profiles'
);

-- 7. Role có scope đơn vị A không quản lý được đơn vị B (Testing has_role_in_scope)
-- Sysadmin can manage anywhere
select results_eq(
  'select public.has_role_in_scope(''YOUTH_ADMIN'', ''33333333-3333-3333-3333-333333333333''::uuid)',
  ARRAY[true],
  'Sysadmin has YOUTH_ADMIN equivalent scope everywhere'
);

-- Switch to youthadmin (Org A)
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
-- 8. Youth admin can manage Org A
select results_eq(
  'select public.has_role_in_scope(''YOUTH_ADMIN'', ''11111111-1111-1111-1111-111111111111''::uuid)',
  ARRAY[true],
  'Youth Admin has scope in their own org'
);
-- 9. Youth admin cannot manage Org B (wait, their scope is 11111111 in seed, not 33333333)
select results_eq(
  'select public.has_role_in_scope(''YOUTH_ADMIN'', ''33333333-3333-3333-3333-333333333333''::uuid)',
  ARRAY[false],
  'Youth Admin does not have scope in another org'
);

-- 10. Youth admin cannot grant SYSTEM_ADMIN
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'SYSTEM_ADMIN') $$,
  'new row violates row-level security policy for table "user_roles"',
  'Youth Admin cannot grant SYSTEM_ADMIN'
);

-- Switch to Sysadmin to prepare Suspend/Archive users
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
update public.profiles set account_status = 'SUSPENDED' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid; -- suspend Youth Admin
update public.profiles set account_status = 'ARCHIVED' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid; -- archive Member

-- Switch to suspended Youth Admin
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);

-- 11. Suspended user không được dùng quyền quản trị (Cannot grant roles)
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code) values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'BRANCH_OFFICER') $$,
  'new row violates row-level security policy for table "user_roles"',
  'Suspended admin cannot grant roles'
);

-- 12. Suspended admin cannot read documents
select results_eq(
  'select count(*)::integer from public.documents',
  ARRAY[0],
  'Suspended admin cannot read documents'
);

-- Switch to archived Member
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);

-- 13. Archived user cannot read internal announcements
select results_eq(
  'select count(*)::integer from public.announcements',
  ARRAY[0],
  'Archived user cannot read internal announcements'
);

-- Reset statuses
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
update public.profiles set account_status = 'ACTIVE' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
update public.profiles set account_status = 'ACTIVE' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid;

-- Document visibility test (ORGANIZATION_ONLY & RESTRICTED)
-- Create ORGANIZATION_ONLY doc created by Officer A (Org A)
insert into public.documents (id, title, status, visibility_level, created_by) values ('88888888-8888-8888-8888-888888888888', 'Org Doc', 'PUBLISHED', 'ORGANIZATION_ONLY', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.document_chunks (id, document_id, chunk_index, content, content_hash, embedding, review_status) 
values ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', 1, 'Chunk', 'hash', array_fill(0, ARRAY[768])::real[]::vector(768), 'APPROVED');

-- Create RESTRICTED doc created by Officer A (Org A)
insert into public.documents (id, title, status, visibility_level, created_by) values ('99999999-9999-9999-9999-999999999999', 'Restricted Doc', 'PUBLISHED', 'RESTRICTED', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.document_chunks (id, document_id, chunk_index, content, content_hash, embedding, review_status) 
values ('66666666-6666-6666-6666-666666666666', '99999999-9999-9999-9999-999999999999', 1, 'Restricted Chunk', 'hash2', array_fill(0, ARRAY[768])::real[]::vector(768), 'APPROVED');

-- 14. Officer A (Org A) can see ORGANIZATION_ONLY doc
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  'select count(*)::integer from public.documents where id = ''88888888-8888-8888-8888-888888888888''::uuid',
  ARRAY[1],
  'User inside org can see ORGANIZATION_ONLY document'
);

-- 15. Officer A (Org A) CANNOT see RESTRICTED doc (only youth admin / sysadmin can)
select results_eq(
  'select count(*)::integer from public.documents where id = ''99999999-9999-9999-9999-999999999999''::uuid',
  ARRAY[0],
  'Normal user cannot see RESTRICTED document'
);

-- 16. RESTRICTED document is not returned by match_document_chunks for normal user
select results_eq(
  $$ select count(*)::integer from public.match_document_chunks(array_fill(0, ARRAY[768])::real[]::vector(768), 1) where document_id = '99999999-9999-9999-9999-999999999999'::uuid $$,
  ARRAY[0],
  'RESTRICTED chunk is not matched for normal user'
);

-- 17. Officer B (Org B) cannot see Officer A's ORGANIZATION_ONLY document
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
select results_eq(
  'select count(*)::integer from public.documents where id = ''88888888-8888-8888-8888-888888888888''::uuid',
  ARRAY[0],
  'User outside org cannot see ORGANIZATION_ONLY document'
);

-- 18. Officer B (Org B) cannot find chunks of Officer A's ORGANIZATION_ONLY document via vector search
select results_eq(
  $$ select count(*)::integer from public.match_document_chunks(array_fill(0, ARRAY[768])::real[]::vector(768), 1) where document_id = '88888888-8888-8888-8888-888888888888'::uuid $$,
  ARRAY[0],
  'User outside org cannot match chunks via RAG'
);

-- Run tests as anon
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);

-- 19. Anon cannot see users
select results_eq(
  'select count(*)::integer from public.profiles',
  ARRAY[0],
  'Anon cannot read profiles'
);

-- 20. Anon cannot read announcements
select results_eq(
  'select count(*)::integer from public.announcements',
  ARRAY[0],
  'Anon cannot read announcements'
);

-- 21. Verify storage bucket privacy
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  'select public from storage.buckets where id = ''documents-private''',
  ARRAY[false],
  'documents-private bucket is not public (fail-closed)'
);

-- Recursive scope test
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid); -- Youth Admin (Ban Thanh niên)
-- 22. Youth Admin Ban Thanh nien CAN read assignments for Chi Doan A (because of recursive scope)
select results_eq(
  'select count(*)::integer from public.report_assignments where organization_id = ''22222222-2222-2222-2222-222222222222''::uuid',
  ARRAY[1],
  'YOUTH_ADMIN TĐ can read report_assignments of descendant CĐA'
);

-- Negative tests for YOUTH_ADMIN scope limitation
select set_auth_user('gggggggg-gggg-gggg-gggg-gggggggggggg'::uuid); -- Youth Admin A (Org A)

-- 23. YOUTH_ADMIN Org A cannot update profile of User B (Org B)
select throws_ok(
  $$ update public.profiles set full_name = 'Hacked' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid $$,
  'new row violates row-level security policy for table "profiles"',
  'YOUTH_ADMIN Org A cannot modify profile in Org B'
);

-- 24. YOUTH_ADMIN Org A cannot read report_assignments for Org B
select results_eq(
  'select count(*)::integer from public.report_assignments where organization_id = ''33333333-3333-3333-3333-333333333333''::uuid',
  ARRAY[0],
  'YOUTH_ADMIN Org A cannot read report_assignments of Org B'
);

-- 25. YOUTH_ADMIN Org A cannot insert role for User B (Org B) in scope Org B
select throws_ok(
  $$ insert into public.user_roles (user_id, role_code, scope_organization_id) values ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'MEMBER', '33333333-3333-3333-3333-333333333333'::uuid) $$,
  'new row violates row-level security policy for table "user_roles"',
  'YOUTH_ADMIN Org A cannot grant roles for scope Org B'
);

-- 26. YOUTH_ADMIN Org A CANNOT read ORGANIZATION_ONLY doc of Org B
-- First, User B creates a doc
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
insert into public.documents (id, title, status, visibility_level, created_by, owner_organization_id) values ('55555555-5555-5555-5555-555555555555', 'Org B Doc', 'PUBLISHED', 'ORGANIZATION_ONLY', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333');

-- Youth Admin A tries to read it
select set_auth_user('gggggggg-gggg-gggg-gggg-gggggggggggg'::uuid);
select results_eq(
  'select count(*)::integer from public.documents where id = ''55555555-5555-5555-5555-555555555555''::uuid',
  ARRAY[0],
  'YOUTH_ADMIN Org A cannot read ORGANIZATION_ONLY document of Org B'
);

-- Storage Tests
-- Create mock objects in documents-private
select set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid); -- sysadmin
insert into storage.objects (bucket_id, name, owner) values ('documents-private', '88888888-8888-8888-8888-888888888888/file.pdf', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

-- 27. User A (Org A) CAN read their org's doc object
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  'select count(*)::integer from storage.objects where name = ''88888888-8888-8888-8888-888888888888/file.pdf''',
  ARRAY[1],
  'User A can read object belonging to Org A document'
);

-- 28. User B (Org B) CANNOT read Org A's doc object
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
select results_eq(
  'select count(*)::integer from storage.objects where name = ''88888888-8888-8888-8888-888888888888/file.pdf''',
  ARRAY[0],
  'User B cannot read object belonging to Org A document'
);

-- 29. Suspended user CANNOT read any objects
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid); -- Suspend Youth Admin
update public.profiles set account_status = 'SUSPENDED' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
select results_eq(
  'select count(*)::integer from storage.objects where name = ''88888888-8888-8888-8888-888888888888/file.pdf''',
  ARRAY[0],
  'Suspended user cannot read storage objects'
);

select * from finish();
rollback;
