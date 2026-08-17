-- Phase 5 · P5-01 acceptance — knowledge schema, immutability, grants and RLS.
--
-- Fixtures reuse the seed orgs/users that every Phase 2–4 suite uses:
--   Ban TN (parent) = 1111...   CĐA = 2222...   CĐB = 3333...
--   System Admin    = aaaaaaaa... (SYSTEM_ADMIN, global)
--   Youth Admin     = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN = parent of CĐA and CĐB)
--   Youth Admin A   = 11112222... (YOUTH_ADMIN, scope CĐA ONLY -- used for escalation tests)
--   Officer A       = cccccccc... (BRANCH_OFFICER, CĐA)
--   Officer B       = dddddddd... (BRANCH_OFFICER, CĐB)
--   Member          = eeeeeeee... (MEMBER, CĐA)
--   Suspended       = 99999999... (SUSPENDED, CĐA)

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
-- Fixtures
-- =====================================================================================
insert into public.documents (
  id, title, document_number, document_type, issuing_authority, issued_date,
  status, visibility_level, owner_organization_id, created_by, source_class, retrieval_enabled
) values
  -- K1: PUBLISHED + INTERNAL_YOUTH owned by CĐA -> any active user may read
  ('c1000001-0000-0000-0000-000000000001', 'P5 Internal A', 'K01-P5', 'Hướng dẫn', 'Ban TN', current_date,
   'PUBLISHED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_B_INTERNAL', true),
  -- K2: PUBLISHED + ORGANIZATION_ONLY owned by CĐB -> CĐB members + scoped admins only
  ('c1000002-0000-0000-0000-000000000002', 'P5 Org Only B', 'K02-P5', 'Kế hoạch', 'Ban TN', current_date,
   'PUBLISHED', 'ORGANIZATION_ONLY', '33333333-3333-3333-3333-333333333333',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_B_INTERNAL', true),
  -- K3: PUBLISHED + RESTRICTED owned by CĐB -> scoped admins only
  ('c1000003-0000-0000-0000-000000000003', 'P5 Restricted B', 'K03-P5', 'Quy chế', 'Ban TN', current_date,
   'PUBLISHED', 'RESTRICTED', '33333333-3333-3333-3333-333333333333',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_B_INTERNAL', true),
  -- K4: DRAFT owned by CĐA -> curators only, never end users
  ('c1000004-0000-0000-0000-000000000004', 'P5 Draft A', 'K04-P5', 'Hướng dẫn', 'Ban TN', current_date,
   'DRAFT', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_A_PUBLIC_WEB', false)
on conflict (id) do nothing;

insert into public.document_versions (id, document_id, version_number, content_hash, mime_type, is_current, created_by) values
  ('c2000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001', 1, 'hash-k1-v1', 'application/pdf', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c2000002-0000-0000-0000-000000000002', 'c1000002-0000-0000-0000-000000000002', 1, 'hash-k2-v1', 'application/pdf', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c2000003-0000-0000-0000-000000000003', 'c1000003-0000-0000-0000-000000000003', 1, 'hash-k3-v1', 'application/pdf', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c2000004-0000-0000-0000-000000000004', 'c1000004-0000-0000-0000-000000000004', 1, 'hash-k4-v1', 'text/html', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.document_sources (id, document_version_id, source_kind, storage_path) values
  ('c3000001-0000-0000-0000-000000000001', 'c2000001-0000-0000-0000-000000000001', 'STORAGE_FILE', 'c1000001-0000-0000-0000-000000000001/source/k1.pdf'),
  ('c3000002-0000-0000-0000-000000000002', 'c2000002-0000-0000-0000-000000000002', 'STORAGE_FILE', 'c1000002-0000-0000-0000-000000000002/source/k2.pdf')
on conflict (id) do nothing;

insert into public.knowledge_wikis (id, document_id, slug, title, status, created_by) values
  ('c4000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001', 'p5-internal-a', 'Wiki nội bộ A', 'PUBLISHED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c4000002-0000-0000-0000-000000000002', 'c1000002-0000-0000-0000-000000000002', 'p5-org-only-b', 'Wiki CĐB', 'PUBLISHED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c4000003-0000-0000-0000-000000000003', 'c1000003-0000-0000-0000-000000000003', 'p5-restricted-b', 'Wiki hạn chế CĐB', 'PUBLISHED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('c4000004-0000-0000-0000-000000000004', 'c1000004-0000-0000-0000-000000000004', 'p5-draft-a', 'Wiki nháp A', 'PENDING_REVIEW', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.knowledge_wiki_versions (
  id, wiki_id, version_number, document_version_id, content, summary,
  review_status, generation_kind, provider, model, prompt_version,
  reviewed_by, reviewed_at, published_at
) values
  ('c5000001-0000-0000-0000-000000000001', 'c4000001-0000-0000-0000-000000000001', 1, 'c2000001-0000-0000-0000-000000000001',
   '{"tom_tat":"noi dung k1"}'::jsonb, 'Tóm tắt K1', 'APPROVED', 'HUMAN_EDITED', 'gemini', 'gemini-x', 'p1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now()),
  ('c5000002-0000-0000-0000-000000000002', 'c4000002-0000-0000-0000-000000000002', 1, 'c2000002-0000-0000-0000-000000000002',
   '{"tom_tat":"noi dung k2"}'::jsonb, 'Tóm tắt K2', 'APPROVED', 'AI_DRAFT', 'gemini', 'gemini-x', 'p1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now()),
  ('c5000003-0000-0000-0000-000000000003', 'c4000003-0000-0000-0000-000000000003', 1, 'c2000003-0000-0000-0000-000000000003',
   '{"tom_tat":"noi dung k3"}'::jsonb, 'Tóm tắt K3', 'APPROVED', 'AI_DRAFT', 'gemini', 'gemini-x', 'p1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), now()),
  -- Draft version of the not-yet-reviewed wiki: must never be visible to an end user.
  ('c5000004-0000-0000-0000-000000000004', 'c4000004-0000-0000-0000-000000000004', 1, 'c2000004-0000-0000-0000-000000000004',
   '{"tom_tat":"nhap k4"}'::jsonb, 'Tóm tắt K4', 'PENDING_REVIEW', 'AI_DRAFT', 'gemini', 'gemini-x', 'p1',
   null, null, null)
on conflict (id) do nothing;

update public.knowledge_wikis set current_published_version_id = 'c5000001-0000-0000-0000-000000000001' where id = 'c4000001-0000-0000-0000-000000000001';
update public.knowledge_wikis set current_published_version_id = 'c5000002-0000-0000-0000-000000000002' where id = 'c4000002-0000-0000-0000-000000000002';
update public.knowledge_wikis set current_published_version_id = 'c5000003-0000-0000-0000-000000000003' where id = 'c4000003-0000-0000-0000-000000000003';

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, content, content_hash,
  evidence_kind, selected_by, selected_reason, review_status, approved_by, approved_at, locator
) values
  ('c6000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001', 'c2000001-0000-0000-0000-000000000001',
   null, 'Điều 5 khoản 2: thời hạn nộp là 10 ngày.', 'ev-hash-k1', 'DEADLINE', 'HUMAN_SELECTED',
   'Thời hạn có hậu quả pháp lý', 'APPROVED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(),
   '{"dieu":5,"khoan":2}'::jsonb),
  ('c6000002-0000-0000-0000-000000000002', 'c1000002-0000-0000-0000-000000000002', 'c2000002-0000-0000-0000-000000000002',
   null, 'Nội dung chỉ dành cho CĐB.', 'ev-hash-k2', 'ARTICLE_CLAUSE', 'AI_SUGGESTED',
   'Quy phạm trực tiếp', 'APPROVED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), '{}'::jsonb),
  ('c6000003-0000-0000-0000-000000000003', 'c1000003-0000-0000-0000-000000000003', 'c2000003-0000-0000-0000-000000000003',
   null, 'Nội dung hạn chế CĐB.', 'ev-hash-k3', 'ARTICLE_CLAUSE', 'AI_SUGGESTED',
   'Quy phạm trực tiếp', 'APPROVED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), '{}'::jsonb),
  -- Pending evidence on an otherwise readable document: must stay hidden from end users.
  ('c6000004-0000-0000-0000-000000000004', 'c1000001-0000-0000-0000-000000000001', 'c2000001-0000-0000-0000-000000000001',
   null, 'Trích đoạn chưa duyệt.', 'ev-hash-k1-pending', 'QUOTE', 'AI_SUGGESTED',
   'Chờ duyệt', 'PENDING', null, null, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.knowledge_embeddings (
  id, target_kind, wiki_version_id, document_id, embedding_model, embedding_dimension, provider
) values
  ('c7000001-0000-0000-0000-000000000001', 'WIKI_VERSION', 'c5000001-0000-0000-0000-000000000001',
   'c1000001-0000-0000-0000-000000000001', 'text-embedding-004', 768, 'gemini')
on conflict (id) do nothing;

insert into public.ingestion_jobs (id, job_kind, document_id, document_version_id, idempotency_key) values
  ('c8000001-0000-0000-0000-000000000001', 'EXTRACT', 'c1000001-0000-0000-0000-000000000001',
   'c2000001-0000-0000-0000-000000000001', 'EXTRACT:c2000001:v1')
on conflict (id) do nothing;

insert into public.ingestion_events (id, job_id, event_type, detail) values
  ('c9000001-0000-0000-0000-000000000001', 'c8000001-0000-0000-0000-000000000001', 'QUEUED', '{"bytes":1024}'::jsonb)
on conflict (id) do nothing;

-- =====================================================================================
-- A. Schema shape
-- =====================================================================================
select has_table('public','document_versions','canonical version history table exists');
select has_table('public','document_sources','source/snapshot provenance table exists');
select has_table('public','knowledge_wikis','wiki identity table exists');
select has_table('public','knowledge_wiki_versions','wiki version table exists');
select has_table('public','knowledge_embeddings','embeddings are stored separately from evidence');
select has_table('public','ingestion_jobs','ingestion job table exists');
select has_table('public','ingestion_events','ingestion event table exists');
select has_table('public','ai_usage_quota','AI quota table exists');

select has_column('public','documents','source_class','documents carry a Phase 5 source class');
select has_column('public','documents','ingestion_status','documents carry an ingestion axis');
select has_column('public','documents','retrieval_enabled','documents carry a retrieval kill switch');
select has_column('public','documents','effect_state','documents carry a normalized effect state');
select has_column('public','documents','current_version_id','documents point at their current version');

-- Embeddings must be model-aware, not pinned to one provider's dimension.
select has_column('public','knowledge_embeddings','embedding_model','embeddings record their model');
select has_column('public','knowledge_embeddings','embedding_dimension','embeddings record their dimension');
select has_column('public','knowledge_embeddings','document_id','embeddings carry document_id so scope can be applied before ranking');

-- Evidence keeps intentional selection metadata, not just offsets.
select has_column('public','document_chunks','document_version_id','evidence is anchored to a source version');
select has_column('public','document_chunks','evidence_kind','evidence records what kind of excerpt it is');
select has_column('public','document_chunks','selected_by','evidence records who/what selected it');
select has_column('public','document_chunks','locator','evidence records a structured locator');
select hasnt_column('public','document_chunks','visibility_level','dead visibility_level column is gone');

-- Wiki provenance is provider-neutral.
select has_column('public','knowledge_wiki_versions','provider','wiki versions record the provider');
select has_column('public','knowledge_wiki_versions','prompt_version','wiki versions record the prompt version');
select has_column('public','knowledge_wiki_versions','document_version_id','wiki versions anchor to a source version');

-- Citation provenance can now name a document version, a wiki version or an evidence row.
select has_column('public','ai_message_sources','document_version_id','citations can name a document version');
select has_column('public','ai_message_sources','wiki_version_id','citations can name a wiki version');
select col_is_pk('public','ai_message_sources','id','ai_message_sources PK is a surrogate id, so chunk_id may be null');

-- =====================================================================================
-- B. Constraints and state machines
-- =====================================================================================
select throws_ok(
  $$ insert into public.knowledge_wikis (document_id, slug, title, status)
     values ('c1000001-0000-0000-0000-000000000001','bad-status','x','NOT_A_STATE') $$,
  '23514', null, 'wiki status is constrained to the approved lifecycle');

select throws_ok(
  $$ update public.documents set ingestion_status = 'NOT_A_STATE' where id = 'c1000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'ingestion_status is constrained');

select throws_ok(
  $$ insert into public.document_sources (document_version_id, source_kind)
     values ('c2000001-0000-0000-0000-000000000001','STORAGE_FILE') $$,
  '23514', null, 'a STORAGE_FILE source must carry a storage_path');

select throws_ok(
  $$ insert into public.document_sources (document_version_id, source_kind, official_url)
     values ('c2000004-0000-0000-0000-000000000004','URL_SNAPSHOT','https://example.gov.vn/a') $$,
  '23514', null, 'a URL_SNAPSHOT must carry a stored snapshot, not just a URL');

select throws_ok(
  $$ insert into public.document_versions (document_id, version_number, content_hash)
     values ('c1000001-0000-0000-0000-000000000001', 1, 'dup') $$,
  '23505', null, 'version numbers are unique per document');

select throws_ok(
  $$ insert into public.document_versions (document_id, version_number, content_hash, is_current)
     values ('c1000001-0000-0000-0000-000000000001', 2, 'hash-k1-v2', true) $$,
  '23505', null, 'only one version per document may be current');

select throws_ok(
  $$ insert into public.knowledge_embeddings (target_kind, wiki_version_id, evidence_id, document_id, embedding_model, embedding_dimension)
     values ('WIKI_VERSION','c5000001-0000-0000-0000-000000000001','c6000001-0000-0000-0000-000000000001',
             'c1000001-0000-0000-0000-000000000001','m',768) $$,
  '23514', null, 'an embedding targets exactly one entity');

select throws_ok(
  $$ insert into public.ingestion_jobs (job_kind, document_id, idempotency_key)
     values ('EXTRACT','c1000001-0000-0000-0000-000000000001','EXTRACT:c2000001:v1') $$,
  '23505', null, 'ingestion idempotency key prevents duplicate jobs');

-- =====================================================================================
-- C. Embedding publication gate — nothing unreviewed is ever indexed
-- =====================================================================================
select throws_ok(
  $$ insert into public.knowledge_embeddings (target_kind, wiki_version_id, document_id, embedding_model, embedding_dimension)
     values ('WIKI_VERSION','c5000004-0000-0000-0000-000000000004','c1000004-0000-0000-0000-000000000004','m',768) $$,
  '23514', null, 'a PENDING_REVIEW wiki version cannot be embedded');

select throws_ok(
  $$ insert into public.knowledge_embeddings (target_kind, evidence_id, document_id, embedding_model, embedding_dimension)
     values ('EVIDENCE','c6000004-0000-0000-0000-000000000004','c1000001-0000-0000-0000-000000000001','m',768) $$,
  '23514', null, 'PENDING evidence cannot be embedded');

-- The kill switch overrides everything, including an otherwise perfectly published wiki.
update public.documents set retrieval_enabled = false where id = 'c1000001-0000-0000-0000-000000000001';
select throws_ok(
  $$ insert into public.knowledge_embeddings (target_kind, wiki_version_id, document_id, embedding_model, embedding_dimension)
     values ('WIKI_VERSION','c5000001-0000-0000-0000-000000000001','c1000001-0000-0000-0000-000000000001','m2',768) $$,
  '23514', null, 'retrieval_enabled = false blocks embedding even for published knowledge');
update public.documents set retrieval_enabled = true where id = 'c1000001-0000-0000-0000-000000000001';

-- =====================================================================================
-- D. Immutability
-- =====================================================================================
select throws_ok(
  $$ update public.document_versions set content_hash = 'tampered' where id = 'c2000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'a document version checksum cannot be rewritten in place');

select lives_ok(
  $$ update public.document_versions set effective_to = current_date where id = 'c2000001-0000-0000-0000-000000000001' $$,
  'lifecycle metadata on a version may still be updated');

select throws_ok(
  $$ update public.knowledge_wiki_versions set content = '{"tom_tat":"sua trom"}'::jsonb
     where id = 'c5000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'an APPROVED wiki version cannot be silently edited');

select throws_ok(
  $$ update public.knowledge_wiki_versions set review_status = 'DRAFT'
     where id = 'c5000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'an APPROVED wiki version cannot be reopened');

select lives_ok(
  $$ update public.knowledge_wiki_versions set review_status = 'SUPERSEDED'
     where id = 'c5000003-0000-0000-0000-000000000003' $$,
  'an APPROVED wiki version may move forward to SUPERSEDED');

select throws_ok(
  $$ update public.document_chunks set content = 'sua trom' where id = 'c6000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'APPROVED evidence text cannot be edited in place');

select throws_ok(
  $$ update public.ingestion_events set event_type = 'X' where id = 'c9000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'ingestion events are append-only');

select throws_ok(
  $$ delete from public.ingestion_events where id = 'c9000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'ingestion events cannot be deleted');

-- Provenance used by a historical AI answer survives.
insert into public.ai_conversations (id, user_id, title) values
  ('ca000001-0000-0000-0000-000000000001','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Hỏi thử') on conflict do nothing;
insert into public.ai_messages (id, conversation_id, role, content) values
  ('cb000001-0000-0000-0000-000000000001','ca000001-0000-0000-0000-000000000001','assistant','Trả lời') on conflict do nothing;
insert into public.ai_message_sources (message_id, document_id, document_version_id, wiki_version_id, rank, source_kind) values
  ('cb000001-0000-0000-0000-000000000001','c1000001-0000-0000-0000-000000000001',
   'c2000001-0000-0000-0000-000000000001','c5000001-0000-0000-0000-000000000001', 1, 'REVIEWED_WIKI');

select throws_ok(
  $$ delete from public.knowledge_wiki_versions where id = 'c5000001-0000-0000-0000-000000000001' $$,
  '23503', null, 'a wiki version cited by a historical answer cannot be deleted');

select throws_ok(
  $$ delete from public.document_versions where id = 'c2000001-0000-0000-0000-000000000001' $$,
  '23503', null, 'a source version referenced by history cannot be deleted');

select lives_ok(
  $$ insert into public.ai_message_sources (message_id, rank, source_kind, document_id)
     values ('cb000001-0000-0000-0000-000000000001', 2, 'OFFICIAL_SOURCE', 'c1000001-0000-0000-0000-000000000001') $$,
  'a citation may name only a document, with no chunk -- the old PK made this impossible');

select throws_ok(
  $$ insert into public.ai_message_sources (message_id, rank, source_kind)
     values ('cb000001-0000-0000-0000-000000000001', 3, 'REVIEWED_WIKI') $$,
  '23514', null, 'a non-synthesis citation must point at something');

-- =====================================================================================
-- E. Phase 4 independence — the critical acceptance condition
-- =====================================================================================
select throws_ok(
  $$ update public.documents
        set ingestion_status = 'FAILED', status = 'WITHDRAWN'
      where id = 'c1000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'a knowledge-processing state change cannot also change documents.status');

select lives_ok(
  $$ update public.documents set ingestion_status = 'FAILED' where id = 'c1000001-0000-0000-0000-000000000001' $$,
  'ingestion may fail on its own');

select is(
  (select status from public.documents where id = 'c1000001-0000-0000-0000-000000000001'),
  'PUBLISHED',
  'a FAILED ingestion leaves the Phase 4 publication state untouched');

select lives_ok(
  $$ update public.documents set status = 'WITHDRAWN' where id = 'c1000004-0000-0000-0000-000000000004' $$,
  'the Phase 4 publication path still works on its own');
update public.documents set status = 'DRAFT' where id = 'c1000004-0000-0000-0000-000000000004';
update public.documents set ingestion_status = 'DONE' where id = 'c1000001-0000-0000-0000-000000000001';

-- =====================================================================================
-- F. Grants — least privilege
-- =====================================================================================
select table_privs_are('public','knowledge_embeddings','authenticated', ARRAY[]::text[],
  'authenticated has NO direct access to embeddings; retrieval must go through trusted code');
select table_privs_are('public','knowledge_embeddings','anon', ARRAY[]::text[],
  'anon has no access to embeddings');
select table_privs_are('public','knowledge_wiki_versions','authenticated', ARRAY['SELECT'],
  'wiki versions are read-only for clients');
select table_privs_are('public','document_versions','authenticated', ARRAY['SELECT'],
  'document versions are read-only for clients');
select table_privs_are('public','ingestion_jobs','authenticated', ARRAY['SELECT'],
  'ingestion jobs are read-only for clients');
select table_privs_are('public','ingestion_events','authenticated', ARRAY['SELECT'],
  'ingestion events are read-only for clients');
select table_privs_are('public','ai_usage_quota','authenticated', ARRAY['SELECT'],
  'quota is read-only for clients');
select table_privs_are('public','document_chunks','authenticated', ARRAY['SELECT'],
  'the legacy write grants on evidence are closed');
select table_privs_are('public','ai_message_sources','authenticated', ARRAY['SELECT'],
  'citations are server-authored: clients cannot write provenance');
select table_privs_are('public','ai_messages','authenticated', ARRAY['SELECT'],
  'clients cannot forge or edit AI messages');

-- =====================================================================================
-- G. RLS positive
-- =====================================================================================
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'); -- Member, CĐA
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'member reads a published wiki for an INTERNAL_YOUTH document');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wiki_versions where id = 'c5000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'member reads the approved published wiki version');
select results_eq(
  $$ select count(*)::integer from public.document_chunks where id = 'c6000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'member reads APPROVED evidence for a document they may access');
select results_eq(
  $$ select count(*)::integer from public.document_versions where id = 'c2000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'member reads the canonical version of an accessible document');

select reset_auth();
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); -- Youth Admin, scope Ban TN (parent)
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000004-0000-0000-0000-000000000004' $$,
  ARRAY[1], 'scoped curator sees an unpublished wiki they own -- review requires it');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wiki_versions where id = 'c5000004-0000-0000-0000-000000000004' $$,
  ARRAY[1], 'scoped curator sees a PENDING_REVIEW wiki version');
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs where id = 'c8000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'scoped curator reads ingestion jobs for their own documents');
select results_eq(
  $$ select count(*)::integer from public.ingestion_events where id = 'c9000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'scoped curator reads ingestion events for their own documents');
select results_eq(
  $$ select count(*)::integer from public.document_chunks where id = 'c6000004-0000-0000-0000-000000000004' $$,
  ARRAY[1], 'scoped curator sees PENDING evidence awaiting review');

-- =====================================================================================
-- H. RLS negative — cross-organization, suspended, anon, ordinary member
-- =====================================================================================
select reset_auth();
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'); -- Officer A (CĐA)
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000002-0000-0000-0000-000000000002' $$,
  ARRAY[0], 'org A user cannot read org B ORGANIZATION_ONLY wiki');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wiki_versions where id = 'c5000002-0000-0000-0000-000000000002' $$,
  ARRAY[0], 'org A user cannot read org B wiki version');
select results_eq(
  $$ select count(*)::integer from public.document_chunks where id = 'c6000002-0000-0000-0000-000000000002' $$,
  ARRAY[0], 'org A user cannot read org B evidence');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000003-0000-0000-0000-000000000003' $$,
  ARRAY[0], 'org A user cannot read org B RESTRICTED wiki');
select results_eq(
  $$ select count(*)::integer from public.document_chunks where id = 'c6000003-0000-0000-0000-000000000003' $$,
  ARRAY[0], 'org A user cannot read org B RESTRICTED evidence');
select results_eq(
  $$ select count(*)::integer from public.document_versions where id = 'c2000003-0000-0000-0000-000000000003' $$,
  ARRAY[0], 'org A user cannot read org B RESTRICTED source version');
select results_eq(
  $$ select count(*)::integer from public.document_chunks where id = 'c6000004-0000-0000-0000-000000000004' $$,
  ARRAY[0], 'an end user never sees PENDING evidence, even on a readable document');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000004-0000-0000-0000-000000000004' $$,
  ARRAY[0], 'an end user never sees an unpublished wiki');

-- Scoped admin must NOT be global admin.
select reset_auth();
select set_auth_user('11112222-3333-4444-5555-666677778888'); -- Youth Admin scoped to CĐA only
select is(
  (select public.can_manage_document_knowledge('c1000001-0000-0000-0000-000000000001')),
  true, 'CĐA-scoped admin may curate CĐA knowledge');
select is(
  (select public.can_manage_document_knowledge('c1000003-0000-0000-0000-000000000003')),
  false, 'CĐA-scoped admin may NOT curate CĐB knowledge -- admin scope is not global scope');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis where id = 'c4000003-0000-0000-0000-000000000003' $$,
  ARRAY[0], 'CĐA-scoped admin cannot read a CĐB RESTRICTED wiki');
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs $$,
  ARRAY[1], 'CĐA-scoped admin sees only ingestion jobs within their scope');

-- Suspended account: fail closed everywhere.
select reset_auth();
select set_auth_user('99999999-9999-9999-9999-999999999999');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wikis $$,
  ARRAY[0], 'suspended user reads no wiki at all');
select results_eq(
  $$ select count(*)::integer from public.knowledge_wiki_versions $$,
  ARRAY[0], 'suspended user reads no wiki version');
select results_eq(
  $$ select count(*)::integer from public.document_chunks $$,
  ARRAY[0], 'suspended user reads no evidence');
select results_eq(
  $$ select count(*)::integer from public.document_versions $$,
  ARRAY[0], 'suspended user reads no canonical version');
select results_eq(
  $$ select count(*)::integer from public.ai_usage_quota $$,
  ARRAY[0], 'suspended user reads no quota row');

-- Anonymous: denied.
select reset_auth();
select set_config('role','anon',true);
select set_config('request.jwt.claims','{}',true);
-- anon is denied one level earlier than authenticated: it holds no grant on the Phase 5 tables at
-- all, so the refusal is a privilege error rather than an empty result. Asserting the actual
-- mechanism, not a convenient approximation of it.
select throws_ok(
  $$ select count(*) from public.knowledge_wikis $$,
  '42501', null, 'anon has no privilege on wikis at all');
select throws_ok(
  $$ select count(*) from public.knowledge_wiki_versions $$,
  '42501', null, 'anon has no privilege on wiki versions at all');
select throws_ok(
  $$ select count(*) from public.document_versions $$,
  '42501', null, 'anon has no privilege on canonical versions at all');
select throws_ok(
  $$ select count(*) from public.document_chunks $$,
  '42501', null, 'anon has no privilege on evidence at all');
select table_privs_are('public','knowledge_wikis','anon', ARRAY[]::text[],
  'anon holds no privilege on knowledge_wikis');

-- Ordinary member cannot mutate curation/admin tables.
select reset_auth();
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  $$ insert into public.knowledge_wikis (document_id, slug, title) values
     ('c1000001-0000-0000-0000-000000000001','member-made','x') $$,
  '42501', null, 'ordinary member cannot create a wiki');
select throws_ok(
  $$ update public.knowledge_wiki_versions set summary = 'x' where id = 'c5000001-0000-0000-0000-000000000001' $$,
  '42501', null, 'ordinary member cannot edit a wiki version');
select throws_ok(
  $$ insert into public.document_chunks (document_id, content, content_hash) values
     ('c1000001-0000-0000-0000-000000000001','fake','h') $$,
  '42501', null, 'ordinary member cannot inject evidence');
select throws_ok(
  $$ insert into public.ingestion_jobs (job_kind, document_id, idempotency_key) values
     ('EXTRACT','c1000001-0000-0000-0000-000000000001','member-key') $$,
  '42501', null, 'ordinary member cannot queue ingestion work');
select throws_ok(
  $$ select count(*) from public.knowledge_embeddings $$,
  '42501', null, 'ordinary member cannot read embeddings at all');
select throws_ok(
  $$ insert into public.ai_message_sources (message_id, rank, source_kind, document_id) values
     ('cb000001-0000-0000-0000-000000000001', 9, 'OFFICIAL_SOURCE', 'c1000001-0000-0000-0000-000000000001') $$,
  '42501', null, 'ordinary member cannot forge answer provenance');

select reset_auth();
select * from finish();
rollback;
