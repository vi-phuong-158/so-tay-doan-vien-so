-- Phase 4 · P4-03 acceptance — learning topics & resources: visibility ladder, resource gating,
-- write closure, trusted mutations, external-URL safety and Storage predicates.
--
-- The shipped policies (202607300001) read `status='PUBLISHED'` and ignored `visibility_level`
-- entirely, so an ORGANIZATION_ONLY or RESTRICTED topic was readable by any active user. These
-- tests pin the corrected behaviour so it cannot regress.
--
-- Fixtures use seed orgs/users:
--   Ban TN (parent) = 1111...   CĐA = 2222...   CĐB = 3333...
--   Youth Admin   = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN -> covers CĐA and CĐB)
--   Youth Admin A = 11112222... (YOUTH_ADMIN, scope CĐA only)
--   Member        = eeeeeeee... (MEMBER, org CĐA)
--   Officer B     = dddddddd... (BRANCH_OFFICER, org CĐB)
--   Suspended     = 99999999... (SUSPENDED, org CĐA)
-- IDs A–O match docs/phase-4/03-learning-foundation.md.

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
-- Fixtures — one topic per (status, visibility) case.
-- =====================================================================================
insert into public.learning_topics
  (id, title, description, objectives, status, visibility_level, owner_organization_id, created_by) values
  ('1e000001-0000-4000-8000-000000000001', 'P4-03 Internal Published', 'd', 'o',
   'PUBLISHED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('1e000002-0000-4000-8000-000000000002', 'P4-03 Org Only A', 'd', 'o',
   'PUBLISHED', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('1e000003-0000-4000-8000-000000000003', 'P4-03 Draft', 'd', 'o',
   'DRAFT', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('1e000004-0000-4000-8000-000000000004', 'P4-03 Restricted', 'd', 'o',
   'PUBLISHED', 'RESTRICTED', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('1e000005-0000-4000-8000-000000000005', 'P4-03 Org Only B', 'd', 'o',
   'PUBLISHED', 'ORGANIZATION_ONLY', '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('1e000006-0000-4000-8000-000000000006', 'P4-03 Archived', 'd', 'o',
   'ARCHIVED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.learning_resources
  (id, topic_id, resource_type, title, content, external_url, storage_path, sort_order) values
  ('1f000001-0000-4000-8000-000000000001', '1e000001-0000-4000-8000-000000000001', 'TEXT', 'Bài đọc 1', 'noi dung', null, null, 2),
  ('1f000002-0000-4000-8000-000000000002', '1e000001-0000-4000-8000-000000000001', 'LINK', 'Video', null, 'https://example.test/video', null, 1),
  ('1f000003-0000-4000-8000-000000000003', '1e000001-0000-4000-8000-000000000001', 'DOCUMENT', 'Tài liệu', null, null,
   '1e000001-0000-4000-8000-000000000001/resources/aaa-tai-lieu.pdf', 3),
  ('1f000004-0000-4000-8000-000000000004', '1e000003-0000-4000-8000-000000000003', 'TEXT', 'Bài nháp', 'nhap', null, null, 1),
  ('1f000005-0000-4000-8000-000000000005', '1e000004-0000-4000-8000-000000000004', 'TEXT', 'Bài hạn chế', 'han che', null, null, 1)
on conflict (id) do nothing;

-- =====================================================================================
-- K. Dangerous external URL schemes are rejected by the database itself
-- =====================================================================================
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, external_url)
    values ('1e000001-0000-4000-8000-000000000001', 'LINK', 'xss', 'javascript:alert(1)')$$,
  '23514', null,
  'K: javascript: external_url is rejected by CHECK constraint'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, external_url)
    values ('1e000001-0000-4000-8000-000000000001', 'LINK', 'data', 'data:text/html;base64,PHNjcmlwdD4=')$$,
  '23514', null,
  'K: data: external_url is rejected'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, external_url)
    values ('1e000001-0000-4000-8000-000000000001', 'LINK', 'plain http', 'http://example.test/a')$$,
  '23514', null,
  'K: plain http external_url is rejected (https only)'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, external_url)
    values ('1e000001-0000-4000-8000-000000000001', 'LINK', 'scheme relative', '//evil.test/a')$$,
  '23514', null,
  'K: protocol-relative external_url is rejected'
);
select lives_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, external_url, sort_order)
    values ('1e000001-0000-4000-8000-000000000001', 'LINK', 'ok https', 'https://example.test/ok', 9)$$,
  'K: a plain https external_url is accepted'
);

-- Storage paths must sit under the owning topic's own prefix.
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, storage_path)
    values ('1e000001-0000-4000-8000-000000000001', 'DOCUMENT', 'wrong topic',
            '1e000002-0000-4000-8000-000000000002/resources/x.pdf')$$,
  '23514', null,
  'a resource cannot point at an object under a different topic prefix'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, storage_path)
    values ('1e000001-0000-4000-8000-000000000001', 'DOCUMENT', 'traversal',
            '1e000001-0000-4000-8000-000000000001/resources/../../etc/passwd')$$,
  '23514', null,
  'a traversal-shaped resource storage_path is rejected'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title)
    values ('1e000001-0000-4000-8000-000000000001', 'TEXT', 'empty payload')$$,
  '23514', null,
  'a resource with no content, file or link is rejected'
);
select throws_ok(
  $$insert into public.learning_resources (topic_id, resource_type, title, content)
    values ('1e000001-0000-4000-8000-000000000001', 'PODCAST', 'bad type', 'x')$$,
  '23514', null,
  'an unknown resource_type is rejected'
);

-- =====================================================================================
-- A / B / E: end-user visibility ladder
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'); -- MEMBER, org CĐA

select is(
  (select count(*)::integer from public.learning_topics where id = '1e000001-0000-4000-8000-000000000001'),
  1,
  'A: active member reads a PUBLISHED INTERNAL_YOUTH topic'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000002-0000-4000-8000-000000000002'),
  1,
  'A: member reads an ORGANIZATION_ONLY topic owned by their own organization'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000003-0000-4000-8000-000000000003'),
  0,
  'B: member cannot read a DRAFT topic'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000004-0000-4000-8000-000000000004'),
  0,
  'E: member cannot read a RESTRICTED topic'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000006-0000-4000-8000-000000000006'),
  0,
  'member cannot read an ARCHIVED topic'
);

-- =====================================================================================
-- F / G: resources follow their parent topic exactly
-- =====================================================================================
select is(
  (select count(*)::integer from public.learning_resources
   where topic_id = '1e000001-0000-4000-8000-000000000001'),
  4,
  'F: member sees every resource of the accessible topic (3 fixtures + 1 added above)'
);
select is(
  (select count(*)::integer from public.learning_resources
   where id = '1f000004-0000-4000-8000-000000000004'),
  0,
  'G: a DRAFT topic''s resource cannot be read directly by id'
);
select is(
  (select count(*)::integer from public.learning_resources
   where id = '1f000005-0000-4000-8000-000000000005'),
  0,
  'G: a RESTRICTED topic''s resource cannot be read directly by id'
);
select is(
  (select count(*)::integer from public.learning_resources),
  4,
  'F: an unfiltered resource scan still returns only the accessible topic''s resources'
);

-- =====================================================================================
-- H / I / J: no end-user write path at all
-- =====================================================================================
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'learning_topics'
     and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'H: neither authenticated nor anon holds a write grant on learning_topics'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'learning_resources'
     and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'I: neither authenticated nor anon holds a write grant on learning_resources'
);
select throws_ok(
  $$select public.create_learning_topic_draft('member made this')$$,
  'LEARNING_SCOPE_DENIED',
  'H: a member cannot create a topic through the trusted RPC'
);
select throws_ok(
  $$select public.update_learning_topic('1e000001-0000-4000-8000-000000000001', 'renamed')$$,
  'LEARNING_SCOPE_DENIED',
  'H: a member cannot edit topic metadata'
);
select throws_ok(
  $$select public.set_learning_topic_status('1e000003-0000-4000-8000-000000000003', 'PUBLISHED')$$,
  'LEARNING_SCOPE_DENIED',
  'J: a member cannot publish a topic'
);
select throws_ok(
  $$select public.upsert_learning_resource('1e000001-0000-4000-8000-000000000001', 'TEXT', 'x', 'y')$$,
  'LEARNING_SCOPE_DENIED',
  'I: a member cannot add a resource'
);
select throws_ok(
  $$select public.delete_learning_resource('1f000001-0000-4000-8000-000000000001')$$,
  'LEARNING_SCOPE_DENIED',
  'I: a member cannot delete a resource'
);

-- =====================================================================================
-- C: cross-organization isolation
-- =====================================================================================
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'); -- Officer B, org CĐB
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000002-0000-4000-8000-000000000002'),
  0,
  'C: CĐB user cannot read an ORGANIZATION_ONLY topic owned by CĐA'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000005-0000-4000-8000-000000000005'),
  1,
  'C: CĐB user can read their own organization''s ORGANIZATION_ONLY topic'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000001-0000-4000-8000-000000000001'),
  1,
  'C: INTERNAL_YOUTH stays cross-organization readable'
);

-- =====================================================================================
-- D: suspended account fails closed
-- =====================================================================================
select set_auth_user('99999999-9999-9999-9999-999999999999');
select is(
  (select count(*)::integer from public.learning_topics),
  0,
  'D: SUSPENDED account reads no topic at all'
);
select is(
  (select count(*)::integer from public.learning_resources),
  0,
  'D: SUSPENDED account reads no resource at all'
);
select throws_ok(
  $$select public.create_learning_topic_draft('suspended attempt')$$,
  'ACCOUNT_NOT_ACTIVE',
  'D: SUSPENDED account cannot invoke a trusted mutation'
);

-- =====================================================================================
-- M: admin scope isolation
-- =====================================================================================
select set_auth_user('11112222-3333-4444-5555-666677778888'); -- YOUTH_ADMIN scoped to CĐA only
select throws_ok(
  $$select public.update_learning_topic('1e000005-0000-4000-8000-000000000005', 'x')$$,
  'LEARNING_SCOPE_DENIED',
  'M: a CĐA-scoped admin cannot edit a CĐB topic'
);
select throws_ok(
  $$select public.set_learning_topic_status('1e000005-0000-4000-8000-000000000005', 'ARCHIVED')$$,
  'LEARNING_SCOPE_DENIED',
  'M: a CĐA-scoped admin cannot archive a CĐB topic'
);
select is(
  (select count(*)::integer from public.learning_topics where id = '1e000003-0000-4000-8000-000000000003'),
  1,
  'a scoped admin can see their own organization''s DRAFT topic'
);

-- =====================================================================================
-- N / O: trusted mutations audit exactly once, failures leave nothing behind
-- =====================================================================================
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); -- YOUTH_ADMIN, scope Ban TN

select lives_ok(
  $$select public.set_learning_topic_status('1e000003-0000-4000-8000-000000000003', 'PUBLISHED')$$,
  'scoped admin publishes a DRAFT topic'
);
select is(
  (select status from public.learning_topics where id = '1e000003-0000-4000-8000-000000000003'),
  'PUBLISHED',
  'the published topic reaches PUBLISHED'
);
-- Republishing an already-PUBLISHED topic is not a valid transition.
select throws_ok(
  $$select public.set_learning_topic_status('1e000003-0000-4000-8000-000000000003', 'PUBLISHED')$$,
  'INVALID_TOPIC_TRANSITION',
  'republishing an already PUBLISHED topic is rejected'
);
select throws_ok(
  $$select public.set_learning_topic_status('1e000003-0000-4000-8000-000000000003', 'DRAFT')$$,
  'INVALID_TOPIC_TRANSITION',
  'a topic cannot be moved back to DRAFT'
);

-- O: a rejected mutation must not have written anything durable.
select throws_ok(
  $$select public.update_learning_topic('1e000001-0000-4000-8000-000000000001', 'ok', null, null,
      '2026-09-01T00:00:00Z'::timestamptz, '2026-08-01T00:00:00Z'::timestamptz)$$,
  'INVALID_TOPIC_WINDOW',
  'O: an invalid open/close window is rejected'
);
select is(
  (select title from public.learning_topics where id = '1e000001-0000-4000-8000-000000000001'),
  'P4-03 Internal Published',
  'O: the rejected update left the title unchanged (no partial write)'
);

select throws_ok(
  $$select public.upsert_learning_resource('1e000001-0000-4000-8000-000000000001', 'LINK', 'bad',
      null, null, 'javascript:alert(1)')$$,
  'INVALID_EXTERNAL_URL',
  'O: the RPC rejects a dangerous URL before touching the table'
);
select is(
  (select count(*)::integer from public.learning_resources
   where topic_id = '1e000001-0000-4000-8000-000000000001'),
  4,
  'O: the rejected resource insert added no row'
);

select lives_ok(
  $$select public.upsert_learning_resource('1e000001-0000-4000-8000-000000000001', 'TEXT',
      'Bài mới', 'noi dung moi', null, null, 5)$$,
  'scoped admin adds a resource'
);

select reset_auth();
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'LEARNING_TOPIC_PUBLISHED' and entity_id = '1e000003-0000-4000-8000-000000000003'),
  1,
  'N: publishing writes exactly one audit row'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'LEARNING_RESOURCE_CREATED' and entity_type = 'learning_resource'),
  1,
  'N: adding a resource writes exactly one audit row'
);
select is(
  (select count(*)::integer from public.audit_logs where action = 'LEARNING_TOPIC_UPDATED'),
  0,
  'O: the rejected topic update wrote no audit row'
);

-- =====================================================================================
-- L: Storage predicates — knowing a path is not access, malformed paths fail closed
-- =====================================================================================
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'active users read accessible learning files'),
  'L: the learning bucket read policy exists (it had none before -- deny-all)'
);
select ok(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and policyname = 'active users read accessible learning files') like '%can_access_learning_topic%',
  'L: the learning read policy defers to can_access_learning_topic'
);
select ok(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and policyname = 'active users read accessible learning files') like '%uuid_or_null%',
  'L: a malformed learning object path fails closed instead of raising'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and cmd = 'UPDATE' and qual like '%learning-resources-private%'),
  0,
  'the learning bucket has no UPDATE policy -- objects are never overwritten in place'
);

select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'); -- Officer B
select is(
  public.can_access_learning_topic('1e000002-0000-4000-8000-000000000002'),
  false,
  'L: can_access_learning_topic denies the CĐA-only topic for a CĐB user, so its objects are unreachable'
);
select is(
  public.can_access_learning_topic('1e000004-0000-4000-8000-000000000004'),
  false,
  'L: can_access_learning_topic denies a RESTRICTED topic for a non-admin'
);

-- =====================================================================================
-- Privilege regression: anon must be able to EVALUATE the learning storage policies
-- =====================================================================================
select reset_auth();
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('can_access_learning_topic', 'can_manage_learning_topic')
     and grantee = 'anon'),
  2,
  'anon can execute both learning access helpers, so storage policies deny instead of raising'
);
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select count(*) from storage.objects where bucket_id = 'learning-resources-private'$$,
  'anon can evaluate the learning bucket policies without an exception'
);
select is(
  (select count(*)::integer from public.learning_topics),
  0,
  'anon reads zero learning topics (fail closed)'
);
select reset_auth();

-- =====================================================================================
-- SECURITY DEFINER hygiene
-- =====================================================================================
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('can_access_learning_topic', 'can_manage_learning_topic',
                       'create_learning_topic_draft', 'update_learning_topic',
                       'set_learning_topic_status', 'upsert_learning_resource',
                       'delete_learning_resource')
     and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0,
  'every P4-03 SECURITY DEFINER function pins a search_path'
);
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name in ('create_learning_topic_draft', 'update_learning_topic',
                          'set_learning_topic_status', 'upsert_learning_resource',
                          'delete_learning_resource')
     and grantee = 'anon'),
  0,
  'anon cannot execute any P4-03 learning mutation RPC'
);

select * from finish();
rollback;
