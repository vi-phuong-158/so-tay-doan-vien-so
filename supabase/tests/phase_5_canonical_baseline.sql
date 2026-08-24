begin;

select plan(45);

create or replace function p5_set_auth_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function p5_reset_auth() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select has_table('public', 'document_versions', 'canonical document version table exists');
select has_table('public', 'document_sources', 'canonical document source table exists');
select has_table('public', 'knowledge_articles', 'knowledge_articles is the canonical reviewed model');
select has_table('public', 'knowledge_embeddings', 'secondary embeddings table exists');
select has_table('public', 'ingestion_jobs', 'ingestion job queue exists');
select has_table('public', 'ingestion_events', 'append-only ingestion events exist');
select hasnt_table('public', 'knowledge_wikis', 'superseded wiki model is not created');
select has_column('public', 'documents', 'current_version_id', 'documents point at a current version');
select has_column('public', 'knowledge_articles', 'revision_number', 'articles have explicit revision semantics');
select has_column('public', 'document_chunks', 'article_id', 'evidence is linked to a canonical article');
select has_column('public', 'document_chunks', 'locator', 'evidence carries a structured locator');
select has_column('public', 'knowledge_embeddings', 'embedding_model', 'embeddings are model-aware');
select has_column('public', 'knowledge_embeddings', 'embedding_dimension', 'embeddings are dimension-aware');
select has_column('public', 'ingestion_jobs', 'claim_token', 'jobs have lease ownership');

select table_privs_are('public', 'knowledge_embeddings', 'authenticated', ARRAY[]::text[],
  'authenticated cannot directly read or write the vector table');
select table_privs_are('public', 'ingestion_jobs', 'authenticated', ARRAY[]::text[],
  'authenticated cannot directly access the ingestion queue');
select function_privs_are('public', 'claim_ingestion_jobs', ARRAY['text', 'integer', 'integer'], 'anon', ARRAY[]::text[],
  'anon cannot claim ingestion jobs');
select function_privs_are('public', 'claim_ingestion_jobs', ARRAY['text', 'integer', 'integer'], 'authenticated', ARRAY[]::text[],
  'authenticated cannot claim ingestion jobs');

select p5_reset_auth();
insert into public.documents (
  id, title, status, visibility_level, created_by, owner_organization_id
) values (
  'f1000000-0000-0000-0000-000000000001', 'P5 Canonical Fixture', 'PUBLISHED',
  'ORGANIZATION_ONLY', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222'
);
insert into public.document_versions (
  id, document_id, version_number, content_hash, mime_type, created_by
) values (
  'f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
  1, 'sha256-fixture-v1', 'text/plain', 'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
insert into public.document_sources (
  id, document_version_id, source_kind, provider_kind, external_file_id, content_hash
) values (
  'f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001',
  'PRIMARY_FILE', 'GOOGLE_DRIVE', 'drive-source-fixture-1', 'sha256-fixture-v1'
);
select public.set_current_document_version(
  'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001'
);

select results_eq(
  $$ select count(*)::integer from public.documents
      where id = 'f1000000-0000-0000-0000-000000000001'::uuid
        and current_version_id = 'f2000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1], 'a document has exactly one selected current version'
);
select throws_ok(
  $$ update public.document_versions set content_hash = 'tampered'
      where id = 'f2000000-0000-0000-0000-000000000001'::uuid $$,
  'DOCUMENT_VERSION_IS_IMMUTABLE', 'document version history cannot be edited in place'
);
select throws_ok(
  $$ update public.document_sources set external_file_id = 'changed'
      where id = 'f3000000-0000-0000-0000-000000000001'::uuid $$,
  'DOCUMENT_SOURCE_IS_IMMUTABLE', 'document source provenance cannot be edited in place'
);
select throws_ok(
  $$ insert into public.knowledge_articles (
       document_id, document_version_id, article_key, revision_number, title
     ) values (
       'f1000000-0000-0000-0000-000000000002'::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid, 'mismatch', 1, 'Mismatch'
     ) $$,
  'KNOWLEDGE_ARTICLE_PROVENANCE_MISMATCH', 'article cannot point at a version from another document'
);

insert into public.knowledge_articles (
  id, document_id, document_version_id, article_key, revision_number, title, summary, content,
  content_text, review_status, is_current, created_by
) values (
  'f4000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001', 'overview', 1, 'Draft overview', 'Draft summary',
  '{"kind":"draft"}'::jsonb, 'Draft content', 'DRAFT', false,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
select results_eq(
  $$ select count(*)::integer from public.knowledge_articles where id = 'f4000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1], 'a draft article can be staged for review'
);

insert into public.knowledge_articles (
  id, document_id, document_version_id, article_key, revision_number, title, summary, content,
  content_text, review_status, retrieval_enabled, is_current, reviewed_by, reviewed_at, created_by
) values (
  'f4000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001', 'overview', 2, 'Approved overview', 'Approved summary',
  '{"kind":"approved"}'::jsonb, 'Approved content', 'APPROVED', false, true,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
select results_eq(
  $$ select count(*)::integer from public.knowledge_articles
      where id = 'f4000000-0000-0000-0000-000000000002'::uuid and review_status = 'APPROVED' $$,
  ARRAY[1], 'approved article records a reviewer and immutable revision'
);
select throws_ok(
  $$ update public.knowledge_articles set content = '{"tampered":true}'::jsonb
      where id = 'f4000000-0000-0000-0000-000000000002'::uuid $$,
  'APPROVED_KNOWLEDGE_ARTICLE_IS_IMMUTABLE', 'approved article content cannot be edited in place'
);
select throws_ok(
  $$ update public.knowledge_articles set review_status = 'DRAFT'
      where id = 'f4000000-0000-0000-0000-000000000002'::uuid $$,
  'APPROVED_KNOWLEDGE_ARTICLE_CANNOT_REOPEN', 'approved article cannot be reopened'
);

insert into public.document_chunks (
  id, document_id, document_version_id, article_id, chunk_index, content, content_hash,
  evidence_kind, selected_by, selected_reason, locator, review_status
) values (
  'f5000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000002',
  null, 'Evidence paragraph', 'sha256-evidence-1', 'ARTICLE_CLAUSE', 'HUMAN_SELECTED',
  'fixture', '{"page":1,"section":"1"}'::jsonb, 'PENDING'
);
select results_eq(
  $$ select count(*)::integer from public.document_chunks
      where id = 'f5000000-0000-0000-0000-000000000001'::uuid and review_status = 'PENDING' $$,
  ARRAY[1], 'draft evidence is stored but not yet retrievable'
);
update public.document_chunks
   set review_status = 'APPROVED', approved_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
       approved_at = now()
 where id = 'f5000000-0000-0000-0000-000000000001'::uuid;
select results_eq(
  $$ select count(*)::integer from public.document_chunks
      where id = 'f5000000-0000-0000-0000-000000000001'::uuid and review_status = 'APPROVED' $$,
  ARRAY[1], 'evidence approval records provenance and reviewer metadata'
);
select throws_ok(
  $$ update public.document_chunks set content = 'tampered evidence'
      where id = 'f5000000-0000-0000-0000-000000000001'::uuid $$,
  'APPROVED_EVIDENCE_IS_IMMUTABLE', 'approved evidence cannot be edited in place'
);

select p5_set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  $$ select count(*)::integer from public.knowledge_articles
      where id = 'f4000000-0000-0000-0000-000000000002'::uuid $$,
  ARRAY[1], 'an in-scope active user reads approved knowledge'
);
select p5_set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
select results_eq(
  $$ select count(*)::integer from public.knowledge_articles
      where document_id = 'f1000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[0], 'a different organization cannot read the article'
);
select p5_reset_auth();
update public.profiles set account_status = 'SUSPENDED'
 where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
select p5_set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  $$ select count(*)::integer from public.knowledge_articles
      where document_id = 'f1000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[0], 'a suspended user cannot read knowledge'
);
select p5_reset_auth();
update public.profiles set account_status = 'ACTIVE'
 where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;

select throws_ok(
  $$ insert into public.knowledge_embeddings (
       target_kind, article_id, document_id, document_version_id, embedding_model,
       embedding_dimension, provider
     ) values (
       'ARTICLE', 'f4000000-0000-0000-0000-000000000002'::uuid,
       'f1000000-0000-0000-0000-000000000001'::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid, 'fixture-model', 3, 'fixture'
     ) $$,
  'EMBEDDING_REQUIRES_APPROVED_RETRIEVAL_ENABLED_TARGET',
  'embedding requires both approved knowledge and retrieval opt-in'
);
update public.documents set retrieval_enabled = true
 where id = 'f1000000-0000-0000-0000-000000000001'::uuid;
insert into public.knowledge_embeddings (
  target_kind, article_id, document_id, document_version_id, embedding_model,
  embedding_dimension, provider
) values (
  'ARTICLE', 'f4000000-0000-0000-0000-000000000002'::uuid,
  'f1000000-0000-0000-0000-000000000001'::uuid,
  'f2000000-0000-0000-0000-000000000001'::uuid, 'fixture-model', 3, 'fixture'
);
select results_eq(
  $$ select count(*)::integer from public.knowledge_embeddings
      where article_id = 'f4000000-0000-0000-0000-000000000002'::uuid $$,
  ARRAY[1], 'approved retrieval-enabled article may receive a secondary embedding'
);
select p5_set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok(
  $$ insert into public.knowledge_embeddings (
       target_kind, article_id, document_id, document_version_id, embedding_model,
       embedding_dimension, provider
     ) values (
       'ARTICLE', 'f4000000-0000-0000-0000-000000000002'::uuid,
       'f1000000-0000-0000-0000-000000000001'::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid, 'fixture-model', 3, 'fixture'
     ) $$,
  'permission denied for table knowledge_embeddings',
  'authenticated users cannot fabricate or read embeddings'
);
select p5_reset_auth();

select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs
      where source_id = 'f3000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1], 'source insertion queues one idempotent ingestion job'
);
select public.queue_ingestion_for_source('f3000000-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs
      where source_id = 'f3000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1], 'repeated source trigger does not duplicate the job'
);

create temp table p5_claim on commit drop as
  select * from public.claim_ingestion_jobs('p5-test-worker', 1, 60);
select results_eq('select count(*)::integer from p5_claim', ARRAY[1], 'claim returns one leased job');
create temp table p5_second_claim on commit drop as
  select * from public.claim_ingestion_jobs('p5-second-worker', 1, 60);
select results_eq('select count(*)::integer from p5_second_claim', ARRAY[0], 'a second worker cannot claim the same lease');
select results_eq(
  $$ select public.complete_ingestion_job(
       (select id from p5_claim), '00000000-0000-0000-0000-000000000000'::uuid
     ) $$,
  ARRAY[false], 'a stale or wrong claim token cannot complete a job'
);
select results_eq(
  $$ select public.complete_ingestion_job((select id from p5_claim), (select claim_token from p5_claim)) $$,
  ARRAY[true], 'the current owner can complete a job'
);
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs
      where id = (select id from p5_claim) and status = 'SUCCEEDED' $$,
  ARRAY[1], 'completed jobs are terminal and no longer leased'
);
select throws_ok(
  $$ update public.ingestion_events set detail = '{"tampered":true}'::jsonb
      where job_id = (select id from p5_claim) $$,
  'INGESTION_EVENTS_APPEND_ONLY', 'ingestion events cannot be edited'
);

select table_privs_are('public', 'ai_message_sources', 'authenticated', ARRAY['SELECT'],
  'authenticated can only read their own citations');
select p5_set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok(
  $$ insert into public.ai_message_sources (message_id, rank, source_kind, article_id)
      values ('f6000000-0000-0000-0000-000000000001'::uuid, 1, 'ARTICLE',
        'f4000000-0000-0000-0000-000000000002'::uuid) $$,
  'permission denied for table ai_message_sources',
  'authenticated clients cannot fabricate AI provenance rows'
);

select finish();
rollback;
