-- Phase 4 · P4-02 acceptance — documents admin workflow: Storage write authorization,
-- orphan-cleanup invariant, detach guard, and the scoped admin read model.
--
-- Complements documents_foundation.sql (P4-01), which covers the read/visibility ladder. This
-- suite only adds what P4-02 introduces. Fixtures reuse the seed orgs/users:
--   Ban TN (parent) = 1111...   CĐA = 2222...   CĐB = 3333...
--   Youth Admin  = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN -> covers CĐA and CĐB)
--   Youth Admin A= 11112222... (YOUTH_ADMIN, scope CĐA only)
--   Member       = eeeeeeee... (MEMBER, org CĐA)
--   Officer B    = dddddddd... (BRANCH_OFFICER, org CĐB)
--   Suspended    = 99999999... (SUSPENDED, org CĐA)

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

-- Documents owned by CĐA and CĐB, so cross-scope admin isolation is testable.
insert into public.documents (id, title, status, visibility_level, owner_organization_id, created_by, storage_path) values
  ('da000001-0000-4000-8000-000000000001', 'P4-02 Draft A', 'DRAFT', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null),
  ('da000002-0000-4000-8000-000000000002', 'P4-02 Attached A', 'DRAFT', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'da000002-0000-4000-8000-000000000002/source/live-file.pdf'),
  ('da000003-0000-4000-8000-000000000003', 'P4-02 Published A', 'PUBLISHED', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'da000003-0000-4000-8000-000000000003/source/published-file.pdf'),
  ('da000004-0000-4000-8000-000000000004', 'P4-02 Draft B', 'DRAFT', 'INTERNAL_YOUTH',
   '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null)
on conflict (id) do nothing;

-- =====================================================================================
-- 1. New objects exist with the intended shape
-- =====================================================================================
select has_function('public', 'detach_document_source_file', ARRAY['uuid'],
  'detach_document_source_file exists');
select has_function('public', 'get_admin_documents',
  ARRAY['text','text','text','text','text','integer','integer','integer'],
  'get_admin_documents exists');

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('document admins upload source files',
                        'document admins clean up unattached source files',
                        'document admins read managed source files')),
  3,
  'P4-02 installs exactly the three documents-private write/admin-read policies'
);

-- No UPDATE policy on documents-private: an object is never overwritten in place, so a
-- replacement can never corrupt the file it replaces (same invariant as the report buckets).
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd = 'UPDATE'
     and qual like '%documents-private%'),
  0,
  'documents-private has no UPDATE policy -- objects are never overwritten in place'
);

-- =====================================================================================
-- 2. SECURITY DEFINER hygiene and grants for the new functions
-- =====================================================================================
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('detach_document_source_file', 'get_admin_documents')
     and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0,
  'every P4-02 SECURITY DEFINER function pins a search_path'
);
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('detach_document_source_file', 'get_admin_documents')
     and grantee = 'anon'),
  0,
  'anon cannot execute any P4-02 admin RPC'
);

-- =====================================================================================
-- 3. Normal member is denied every admin mutation
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select throws_ok(
  $$select public.detach_document_source_file('da000002-0000-4000-8000-000000000002')$$,
  'DOCUMENT_SCOPE_DENIED',
  'member cannot detach a source file'
);
select is(
  (select count(*)::integer from public.get_admin_documents()),
  0,
  'member sees zero rows through the admin read model (scoped by can_manage_document)'
);

-- =====================================================================================
-- 4. Suspended account fails closed on the admin surface
-- =====================================================================================
select set_auth_user('99999999-9999-9999-9999-999999999999');
select throws_ok(
  $$select public.get_admin_documents()$$,
  'ACCOUNT_NOT_ACTIVE',
  'suspended account cannot use the admin read model'
);
select throws_ok(
  $$select public.detach_document_source_file('da000002-0000-4000-8000-000000000002')$$,
  'ACCOUNT_NOT_ACTIVE',
  'suspended account cannot detach a source file'
);

-- =====================================================================================
-- 5. Cross-scope admin isolation
-- =====================================================================================
-- Youth Admin A is scoped to CĐA only, so CĐB's document must be invisible and unmanageable.
select set_auth_user('11112222-3333-4444-5555-666677778888');
select is(
  (select count(*)::integer from public.get_admin_documents()
   where id = 'da000004-0000-4000-8000-000000000004'),
  0,
  'CĐA-scoped admin does not see a CĐB document in the admin read model'
);
select is(
  (select count(*)::integer from public.get_admin_documents()
   where id = 'da000001-0000-4000-8000-000000000001'),
  1,
  'CĐA-scoped admin does see its own CĐA document'
);
select throws_ok(
  $$select public.detach_document_source_file('da000004-0000-4000-8000-000000000004')$$,
  'DOCUMENT_SCOPE_DENIED',
  'CĐA-scoped admin cannot detach a CĐB document source'
);

-- =====================================================================================
-- 6. Admin read model — validation and bounds
-- =====================================================================================
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); -- scope Ban TN, covers CĐA + CĐB

select throws_ok(
  $$select public.get_admin_documents(null, 'NOT_A_STATUS')$$,
  'INVALID_DOCUMENT_STATUS',
  'admin read model rejects an unknown status filter'
);
select throws_ok(
  $$select public.get_admin_documents(null, null, null, null, 'SECRET_LEVEL')$$,
  'INVALID_VISIBILITY_LEVEL',
  'admin read model rejects an unknown visibility filter'
);
select throws_ok(
  $$select public.get_admin_documents(null, null, null, null, null, 12)$$,
  'INVALID_DOCUMENT_YEAR',
  'admin read model rejects an out-of-range year'
);

-- Unlike the end-user path, the admin read model must expose unpublished documents.
select ok(
  (select count(*) from public.get_admin_documents(null, 'DRAFT')) >= 2,
  'admin read model returns DRAFT documents that can_access_document would hide'
);
select is(
  (select count(*)::integer from public.get_admin_documents(null, null, null, null, null, null, 1, 0)),
  1,
  'admin read model honours the limit'
);
select ok(
  (select total_count from public.get_admin_documents(null, null, null, null, null, null, 1, 0)) >= 4,
  'admin read model reports the full match count independently of the page size'
);
select is(
  (select count(*)::integer from public.get_admin_documents('P4-02 Published A')),
  1,
  'admin read model search matches on title'
);

-- =====================================================================================
-- 7. detach_document_source_file — guards and audit
-- =====================================================================================
-- A published document must not silently lose the file users are being pointed at.
select throws_ok(
  $$select public.detach_document_source_file('da000003-0000-4000-8000-000000000003')$$,
  'INVALID_DOCUMENT_TRANSITION',
  'a PUBLISHED document cannot have its source detached'
);
select is(
  (select storage_path from public.documents where id = 'da000003-0000-4000-8000-000000000003'),
  'da000003-0000-4000-8000-000000000003/source/published-file.pdf',
  'the failed detach left the published document''s storage_path untouched (no partial state)'
);

select throws_ok(
  $$select public.detach_document_source_file('da000001-0000-4000-8000-000000000001')$$,
  'DOCUMENT_HAS_NO_SOURCE',
  'detaching from a document with no source is rejected'
);

-- The happy path returns the path it cleared, so the caller can delete exactly that object.
select is(
  public.detach_document_source_file('da000002-0000-4000-8000-000000000002'),
  'da000002-0000-4000-8000-000000000002/source/live-file.pdf',
  'detach returns the storage path it cleared'
);
select is(
  (select storage_path from public.documents where id = 'da000002-0000-4000-8000-000000000002'),
  null,
  'detach clears storage_path on the row before any object is removed'
);

select reset_auth();
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'DOCUMENT_SOURCE_DETACHED'
     and entity_id = 'da000002-0000-4000-8000-000000000002'),
  1,
  'a successful detach writes exactly one audit row'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'DOCUMENT_SOURCE_DETACHED'
     and entity_id = 'da000003-0000-4000-8000-000000000003'),
  0,
  'the rejected detach on the published document wrote no audit row'
);

-- =====================================================================================
-- 8. Storage policy predicates -- authority is re-derived, never taken from the request
-- =====================================================================================
select ok(
  (select with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'document admins upload source files') like '%can_manage_document%',
  'upload policy re-derives authority from the document row via can_manage_document'
);
select ok(
  (select with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'document admins upload source files') like '%uuid_or_null%',
  'upload policy resolves the document id with uuid_or_null, so a malformed path fails closed'
);
select ok(
  (select with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'document admins upload source files') like '%source%',
  'upload policy pins the second path segment to source/, so objects cannot land anywhere else'
);

-- The cleanup policy must refuse to delete whatever storage_path currently points at. This is the
-- invariant that keeps a cleanup bug or a stale retry from destroying a live source file.
select ok(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'document admins clean up unattached source files') like '%storage_path is distinct from%',
  'cleanup policy cannot delete the currently attached file'
);

select * from finish();
rollback;
