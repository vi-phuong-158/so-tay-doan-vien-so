-- Phase 4 · P4-01 acceptance — documents foundation: RLS, visibility ladder, write-path closure,
-- relation disclosure, Storage predicate and admin RPC transitions.
--
-- Fixtures use seed orgs/users:
--   Ban TN (parent) = 1111...   CĐA = 2222...   CĐB = 3333...
--   Youth Admin   = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN = parent of CĐA and CĐB)
--   Officer A     = cccccccc... (BRANCH_OFFICER, org CĐA)
--   Officer B     = dddddddd... (BRANCH_OFFICER, org CĐB)
--   Member        = eeeeeeee... (MEMBER, org CĐA)
--   Suspended     = 99999999... (SUSPENDED, org CĐA)
-- Test IDs A–M match docs/phase-4/00-baseline-documents-plan.md §7.

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
-- Fixtures — one document per (status, visibility) case under test.
-- =====================================================================================
insert into public.documents (
  id, title, document_number, document_type, issuing_authority, issued_date,
  status, visibility_level, owner_organization_id, created_by, storage_path
) values
  -- PUBLISHED + INTERNAL_YOUTH, owned by CĐA -> every active user may read (case A)
  ('d0000001-0000-0000-0000-000000000001', 'P4 Internal Youth', '01-P4', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'd0000001-0000-0000-0000-000000000001/source/a-guide.pdf'),
  -- PUBLISHED + ORGANIZATION_ONLY, owned by CĐA -> CĐA members + scoped admins only (cases B, F)
  ('d0000002-0000-0000-0000-000000000002', 'P4 Org Only A', '02-P4', 'Kế hoạch', 'Ban TN', current_date,
   'PUBLISHED', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'd0000002-0000-0000-0000-000000000002/source/b-plan.pdf'),
  -- DRAFT, owned by CĐA -> admins only (cases C, D)
  ('d0000003-0000-0000-0000-000000000003', 'P4 Draft', '03-P4', 'Hướng dẫn', 'Ban TN', current_date,
   'DRAFT', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null),
  -- PENDING_REVIEW -> not readable by end users (case E)
  ('d0000004-0000-0000-0000-000000000004', 'P4 Pending', '04-P4', 'Hướng dẫn', 'Ban TN', current_date,
   'PENDING_REVIEW', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null),
  -- PUBLISHED + RESTRICTED -> scoped admins only (case K)
  ('d0000005-0000-0000-0000-000000000005', 'P4 Restricted', '05-P4', 'Quy chế', 'Ban TN', current_date,
   'PUBLISHED', 'RESTRICTED', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'd0000005-0000-0000-0000-000000000005/source/e-restricted.pdf'),
  -- PUBLISHED + WITHDRAWN -> never readable by end users
  ('d0000006-0000-0000-0000-000000000006', 'P4 Withdrawn', '06-P4', 'Hướng dẫn', 'Ban TN', current_date,
   'WITHDRAWN', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null),
  -- PUBLISHED + PUBLIC owned by CĐB -> readable by everyone incl. CĐA users
  ('d0000007-0000-0000-0000-000000000007', 'P4 Public B', '07-P4', 'Biểu mẫu', 'Ban TN', current_date,
   'PUBLISHED', 'PUBLIC', '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null)
on conflict (id) do nothing;

-- Relations: public->internal (both readable by a member) and public->restricted (target hidden).
insert into public.document_relations (source_document_id, target_document_id, relation_type) values
  ('d0000001-0000-0000-0000-000000000001', 'd0000007-0000-0000-0000-000000000007', 'RELATED'),
  ('d0000001-0000-0000-0000-000000000001', 'd0000005-0000-0000-0000-000000000005', 'REPLACES')
on conflict do nothing;

-- =====================================================================================
-- Constraints (G2, G6) — invalid enum values are rejected at the database, not just in the UI.
-- =====================================================================================
select throws_ok(
  $$insert into public.documents (title, status, visibility_level, owner_organization_id)
    values ('bad visibility', 'DRAFT', 'SECRET_LEVEL', '22222222-2222-2222-2222-222222222222')$$,
  '23514',
  null,
  'documents.visibility_level rejects a value outside the four spec levels'
);

select throws_ok(
  $$insert into public.document_relations (source_document_id, target_document_id, relation_type)
    values ('d0000001-0000-0000-0000-000000000001', 'd0000007-0000-0000-0000-000000000007', 'INVENTED')$$,
  '23514',
  null,
  'document_relations.relation_type rejects an unknown relation type'
);

select throws_ok(
  $$insert into public.document_relations (source_document_id, target_document_id, relation_type)
    values ('d0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'RELATED')$$,
  '23514',
  null,
  'a document cannot be related to itself'
);

-- =====================================================================================
-- A. ACTIVE user reads PUBLISHED + INTERNAL_YOUTH
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select is(
  (select count(*)::integer from public.documents where id = 'd0000001-0000-0000-0000-000000000001'),
  1,
  'A: active member reads a PUBLISHED INTERNAL_YOUTH document'
);

-- =====================================================================================
-- B. Org member reads ORGANIZATION_ONLY of their own organization
-- =====================================================================================
select is(
  (select count(*)::integer from public.documents where id = 'd0000002-0000-0000-0000-000000000002'),
  1,
  'B: CĐA member reads an ORGANIZATION_ONLY document owned by CĐA'
);

-- =====================================================================================
-- D / E / K: end user cannot read DRAFT, PENDING_REVIEW, RESTRICTED or WITHDRAWN
-- =====================================================================================
select is(
  (select count(*)::integer from public.documents where id = 'd0000003-0000-0000-0000-000000000003'),
  0,
  'D: member cannot read a DRAFT document'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000004-0000-0000-0000-000000000004'),
  0,
  'E: member cannot read a PENDING_REVIEW document'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000005-0000-0000-0000-000000000005'),
  0,
  'K: member cannot read a RESTRICTED document they were not granted'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000006-0000-0000-0000-000000000006'),
  0,
  'member cannot read a WITHDRAWN document'
);

-- =====================================================================================
-- G / H: end user has no write path at all — grants revoked AND RLS denies
-- =====================================================================================
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'documents'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'G: authenticated holds no INSERT/UPDATE/DELETE grant on documents'
);
select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'document_relations'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'G: authenticated holds no INSERT/UPDATE/DELETE grant on document_relations'
);
select ok(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'documents'
     and grantee = 'authenticated' and privilege_type = 'SELECT') = 1,
  'G: authenticated keeps SELECT on documents (RLS is the read enforcement layer)'
);

-- H: publishing is not reachable for a plain member even through the trusted RPC.
select throws_ok(
  $$select public.publish_document('d0000003-0000-0000-0000-000000000003')$$,
  'DOCUMENT_SCOPE_DENIED',
  'H: a member cannot publish a document through the admin RPC'
);
select throws_ok(
  $$select public.create_document_draft('member made this')$$,
  'DOCUMENT_SCOPE_DENIED',
  'a member cannot create a document draft'
);
select throws_ok(
  $$select public.update_document_metadata('d0000001-0000-0000-0000-000000000001', 'renamed by member')$$,
  'DOCUMENT_SCOPE_DENIED',
  'a member cannot edit document metadata'
);
select throws_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000001-0000-0000-0000-000000000001/source/evil.pdf')$$,
  'DOCUMENT_SCOPE_DENIED',
  'a member cannot attach a source file'
);

-- =====================================================================================
-- M: relations are visible only when BOTH endpoints are accessible
-- =====================================================================================
select is(
  (select count(*)::integer from public.document_relations
   where source_document_id = 'd0000001-0000-0000-0000-000000000001'),
  1,
  'M: member sees only the relation whose target is also readable (RESTRICTED target hidden)'
);
select is(
  (select target_document_id from public.document_relations
   where source_document_id = 'd0000001-0000-0000-0000-000000000001'),
  'd0000007-0000-0000-0000-000000000007'::uuid,
  'M: the visible relation is the PUBLIC one, not the RESTRICTED one'
);

-- =====================================================================================
-- F. Cross-organization isolation
-- =====================================================================================
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'); -- Officer B, org CĐB
select is(
  (select count(*)::integer from public.documents where id = 'd0000002-0000-0000-0000-000000000002'),
  0,
  'F: CĐB officer cannot read an ORGANIZATION_ONLY document owned by CĐA'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000001-0000-0000-0000-000000000001'),
  1,
  'F: INTERNAL_YOUTH remains cross-organization readable (isolation applies to ORGANIZATION_ONLY)'
);

-- =====================================================================================
-- J. Suspended account fails closed even for otherwise-public content
-- =====================================================================================
select set_auth_user('99999999-9999-9999-9999-999999999999');
select is(
  (select count(*)::integer from public.documents where id = 'd0000001-0000-0000-0000-000000000001'),
  0,
  'J: SUSPENDED account cannot read an INTERNAL_YOUTH document'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000007-0000-0000-0000-000000000007'),
  0,
  'J: SUSPENDED account cannot read even a PUBLIC document (is_active_user gate)'
);

-- =====================================================================================
-- C. Scoped content admin reads unpublished documents in scope
-- =====================================================================================
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); -- YOUTH_ADMIN, scope Ban TN
select is(
  (select count(*)::integer from public.documents where id = 'd0000003-0000-0000-0000-000000000003'),
  1,
  'C: scoped YOUTH_ADMIN reads a DRAFT document in scope'
);
select is(
  (select count(*)::integer from public.documents where id = 'd0000005-0000-0000-0000-000000000005'),
  1,
  'C: scoped YOUTH_ADMIN reads a RESTRICTED document in scope'
);

-- =====================================================================================
-- Admin write path — valid transitions, audit, and rejected transitions
-- =====================================================================================
select lives_ok(
  $$select public.publish_document('d0000003-0000-0000-0000-000000000003')$$,
  'scoped admin publishes a DRAFT document'
);
select is(
  (select status from public.documents where id = 'd0000003-0000-0000-0000-000000000003'),
  'PUBLISHED',
  'published document reaches PUBLISHED status'
);
select isnt(
  (select approved_by from public.documents where id = 'd0000003-0000-0000-0000-000000000003'),
  null,
  'publishing stamps approved_by'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'DOCUMENT_PUBLISHED' and entity_id = 'd0000003-0000-0000-0000-000000000003'),
  1,
  'publishing writes exactly one audit row'
);

-- Re-publishing an already-PUBLISHED document is rejected, not silently accepted.
select throws_ok(
  $$select public.publish_document('d0000003-0000-0000-0000-000000000003')$$,
  'INVALID_DOCUMENT_TRANSITION',
  'republishing an already PUBLISHED document is rejected'
);

select lives_ok(
  $$select public.withdraw_document('d0000003-0000-0000-0000-000000000003', 'superseded')$$,
  'scoped admin withdraws a PUBLISHED document'
);
select is(
  (select status from public.documents where id = 'd0000003-0000-0000-0000-000000000003'),
  'WITHDRAWN',
  'withdrawn document reaches WITHDRAWN status'
);

-- Draft creation defaults to DRAFT and is scoped to the admin's organization.
select lives_ok(
  $$select public.create_document_draft('P4 admin created', 'Hướng dẫn')$$,
  'scoped admin creates a document draft'
);
select is(
  (select count(*)::integer from public.documents where title = 'P4 admin created' and status = 'DRAFT'),
  1,
  'a newly created document starts in DRAFT, never PUBLISHED'
);

-- =====================================================================================
-- Source file attach — path anchoring, traversal and extension rules
-- =====================================================================================
select throws_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000002-0000-0000-0000-000000000002/source/other.pdf')$$,
  'INVALID_STORAGE_PATH',
  'a source path under a DIFFERENT document id is rejected'
);
select throws_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000001-0000-0000-0000-000000000001/source/../../etc/passwd')$$,
  'INVALID_STORAGE_PATH',
  'a traversal-shaped source path is rejected'
);
select throws_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000001-0000-0000-0000-000000000001/source/payload.exe')$$,
  'FILE_TYPE_NOT_ALLOWED',
  'a dangerous file extension is rejected'
);
select throws_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000001-0000-0000-0000-000000000001/source/huge.pdf', 104857600)$$,
  'FILE_TOO_LARGE',
  'an oversized file is rejected'
);
select lives_ok(
  $$select public.attach_document_source_file('d0000001-0000-0000-0000-000000000001',
      'd0000001-0000-0000-0000-000000000001/source/valid-guide.pdf', 1024)$$,
  'a valid source file under the document prefix is accepted'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action in ('DOCUMENT_SOURCE_ATTACHED', 'DOCUMENT_SOURCE_REPLACED')
     and entity_id = 'd0000001-0000-0000-0000-000000000001'),
  1,
  'attaching a source file writes exactly one audit row'
);

-- =====================================================================================
-- I / L. Storage predicate — knowing the path is not access, and malformed paths fail closed
-- =====================================================================================
select reset_auth();

-- The read policy for documents-private exists and is bound to can_access_document.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'active users read accessible document files'
  ),
  'documents-private read policy exists'
);
select ok(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'active users read accessible document files') like '%can_access_document%',
  'I: the Storage read policy defers to can_access_document, so knowing storage_path is not enough'
);
select ok(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'active users read accessible document files') like '%uuid_or_null%',
  'L: the Storage read policy uses uuid_or_null so a malformed path fails closed instead of raising'
);

-- The helper genuinely returns null (rather than raising) for traversal/garbage first segments,
-- which is what makes the policy above deny instead of erroring.
select is(public.uuid_or_null('..'), null, 'L: uuid_or_null returns null for a traversal segment');
select is(public.uuid_or_null('not-a-uuid'), null, 'L: uuid_or_null returns null for a non-uuid segment');

-- I: the underlying access helper itself denies for a user without rights.
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'); -- Officer B
select is(
  public.can_access_document('d0000002-0000-0000-0000-000000000002'),
  false,
  'I: can_access_document denies the CĐA-only document for a CĐB user, so its Storage object is unreachable'
);
select is(
  public.can_access_document('d0000005-0000-0000-0000-000000000005'),
  false,
  'I: can_access_document denies the RESTRICTED document for a non-granted user'
);

-- =====================================================================================
-- SECURITY DEFINER hygiene — every new function pins search_path
-- =====================================================================================
select reset_auth();
select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('can_manage_document', 'create_document_draft', 'update_document_metadata',
                       'publish_document', 'withdraw_document', 'attach_document_source_file')
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
     )),
  0,
  'every P4-01 SECURITY DEFINER function pins a search_path'
);

select is(
  (select count(*)::integer
   from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('create_document_draft', 'update_document_metadata', 'publish_document',
                          'withdraw_document', 'attach_document_source_file')
     and grantee = 'anon'),
  0,
  'anon cannot execute any P4-01 document write RPC'
);

select * from finish();
rollback;
