begin;

select plan(43);

create or replace function p5_03_set_auth_user(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function p5_03_reset_auth() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select has_table('public', 'document_extractions', 'private extraction artifacts exist');
select has_table('public', 'knowledge_generation_attempts', 'generation attempts provide audit/idempotency');
select has_column('public', 'documents', 'ai_processing_allowed', 'external AI eligibility is explicit');
select table_privs_are('public', 'document_extractions', 'authenticated', ARRAY[]::text[], 'clients cannot read extraction artifacts');
select table_privs_are('public', 'knowledge_generation_attempts', 'authenticated', ARRAY[]::text[], 'clients cannot read generation internals');
select table_privs_are('public', 'knowledge_articles', 'authenticated', ARRAY['SELECT'], 'clients cannot write generated articles');
select table_privs_are('public', 'document_chunks', 'authenticated', ARRAY['SELECT'], 'clients cannot write evidence');
select table_privs_are('public', 'document_extractions', 'anon', ARRAY[]::text[], 'anonymous clients cannot read extraction artifacts');
select table_privs_are('public', 'knowledge_generation_attempts', 'anon', ARRAY[]::text[], 'anonymous clients cannot read generation internals');
select table_privs_are('public', 'knowledge_articles', 'anon', ARRAY[]::text[], 'anonymous clients cannot read generated articles');
select table_privs_are('public', 'document_chunks', 'anon', ARRAY[]::text[], 'anonymous clients cannot read evidence');
select table_privs_are('public', 'ingestion_jobs', 'authenticated', ARRAY[]::text[], 'clients cannot read generation jobs');
select table_privs_are('public', 'ingestion_jobs', 'anon', ARRAY[]::text[], 'anonymous clients cannot read generation jobs');
select function_privs_are('public', 'queue_knowledge_article_generation', ARRAY['uuid','text','text','uuid'], 'authenticated', ARRAY[]::text[], 'queue is backend-only');
select function_privs_are('public', 'persist_knowledge_article_draft', ARRAY['uuid','uuid','jsonb','jsonb','jsonb','uuid'], 'authenticated', ARRAY[]::text[], 'article persistence is backend-only');
select function_privs_are('public', 'review_knowledge_article', ARRAY['uuid','text','text'], 'authenticated', ARRAY['EXECUTE'], 'review uses a trusted RPC');
select function_privs_are('public', 'set_document_ai_processing_allowed', ARRAY['uuid','boolean'], 'authenticated', ARRAY['EXECUTE'], 'AI eligibility uses a trusted RPC');
select function_privs_are('public', 'set_document_retrieval_enabled', ARRAY['uuid','boolean'], 'authenticated', ARRAY['EXECUTE'], 'document retrieval uses a trusted RPC');
select function_privs_are('public', 'set_knowledge_article_retrieval_enabled', ARRAY['uuid','boolean'], 'authenticated', ARRAY['EXECUTE'], 'article retrieval uses a trusted RPC');
select function_privs_are('public', 'search_published_knowledge', ARRAY['text','integer'], 'authenticated', ARRAY['EXECUTE'], 'retrieval is callable only by authenticated users');
select function_privs_are('public', 'search_published_knowledge', ARRAY['text','integer'], 'anon', ARRAY[]::text[], 'anonymous callers cannot invoke retrieval');
select results_eq(
  $$
    select count(*)::integer
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('documents', 'document_versions', 'document_sources', 'knowledge_articles',
                         'document_chunks', 'knowledge_embeddings', 'ai_message_sources',
                         'ingestion_jobs', 'ingestion_events')
       and p.proname <> 'set_updated_at'
       and not t.tgisinternal
       and has_function_privilege('public', p.oid, 'EXECUTE')
  $$,
  ARRAY[0], 'P5 trigger functions are not executable by PUBLIC'
);
select results_eq(
  $$
    select count(*)::integer
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('documents', 'document_versions', 'document_sources', 'knowledge_articles',
                         'document_chunks', 'knowledge_embeddings', 'ai_message_sources',
                         'ingestion_jobs', 'ingestion_events')
       and p.proname <> 'set_updated_at'
       and not t.tgisinternal
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  ARRAY[0], 'P5 trigger functions are not executable by anon'
);
select results_eq(
  $$
    select count(*)::integer
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('documents', 'document_versions', 'document_sources', 'knowledge_articles',
                         'document_chunks', 'knowledge_embeddings', 'ai_message_sources',
                         'ingestion_jobs', 'ingestion_events')
       and p.proname <> 'set_updated_at'
       and not t.tgisinternal
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  ARRAY[0], 'P5 trigger functions are not executable by authenticated'
);
select results_eq(
  $$
    select count(*)::integer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('queue_knowledge_article_generation', 'set_document_ai_processing_allowed',
                         'claim_specific_ingestion_job', 'persist_document_extraction',
                         'persist_knowledge_article_draft', 'review_knowledge_article')
       and p.prosecdef
       and p.proconfig @> array['search_path=public']
  $$,
  ARRAY[6], 'P5-03 SECURITY DEFINER functions pin search_path'
);

select p5_03_reset_auth();
insert into public.documents (id, title, status, visibility_level, owner_organization_id, created_by, ai_processing_allowed)
values ('f7000000-0000-0000-0000-000000000001', 'P5-03 synthetic source', 'PUBLISHED', 'ORGANIZATION_ONLY',
  '22222222-2222-2222-2222-222222222222', '11112222-3333-4444-5555-666677778888', false);
insert into public.document_versions (id, document_id, version_number, content_hash, mime_type, created_by)
values ('f8000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 1,
  encode(extensions.digest(convert_to('p5-03-source-bytes', 'UTF8'), 'sha256'::text), 'hex'), 'text/plain', '11112222-3333-4444-5555-666677778888');
insert into public.document_sources (id, document_version_id, source_kind, provider_kind, storage_path, content_hash)
values ('f9000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'PRIMARY_FILE', 'SUPABASE_STORAGE',
  'f7000000-0000-0000-0000-000000000001/source/fixture.txt', encode(extensions.digest(convert_to('p5-03-source-bytes', 'UTF8'), 'sha256'::text), 'hex'));
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs
      where source_id = 'f9000000-0000-0000-0000-000000000001'::uuid and job_kind = 'SOURCE_READY' $$,
  ARRAY[1], 'source insert continues to run the internal ingestion trigger'
);
select public.set_current_document_version('f7000000-0000-0000-0000-000000000001'::uuid, 'f8000000-0000-0000-0000-000000000001'::uuid);

select throws_ok(
  $$ select public.queue_knowledge_article_generation('f8000000-0000-0000-0000-000000000001'::uuid, 'overview', 'p5-03-generator-v1', '11112222-3333-4444-5555-666677778888'::uuid) $$,
  'EXTERNAL_AI_NOT_ALLOWED', 'AI generation is fail-closed until explicit eligibility is enabled'
);
update public.documents set ai_processing_allowed = true where id = 'f7000000-0000-0000-0000-000000000001'::uuid;

select public.queue_knowledge_article_generation('f8000000-0000-0000-0000-000000000001'::uuid, 'overview', 'p5-03-generator-v1', '11112222-3333-4444-5555-666677778888'::uuid) is not null;
select results_eq(
  $$ select count(*)::integer from public.ingestion_jobs where document_version_id = 'f8000000-0000-0000-0000-000000000001'::uuid and job_kind = 'ARTICLE_DRAFT' $$,
  ARRAY[1], 'same version/profile creates one logical generation job'
);
select public.queue_knowledge_article_generation('f8000000-0000-0000-0000-000000000001'::uuid, 'overview', 'p5-03-generator-v1', '11112222-3333-4444-5555-666677778888'::uuid) is not null;
select results_eq(
  $$ select count(*)::integer from public.knowledge_generation_attempts where document_version_id = 'f8000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1], 'retrying the same profile does not create a duplicate attempt'
);

select results_eq(
  $$ select count(*)::integer from public.document_extractions $$,
  ARRAY[0], 'no extraction artifact exists before extraction succeeds'
);
select public.persist_document_extraction(
  'f9000000-0000-0000-0000-000000000001'::uuid,
  encode(extensions.digest(convert_to('p5-03-source-bytes', 'UTF8'), 'sha256'::text), 'hex'), 'normalized-fixture-hash', 'deterministic-text', 'p5-03-deterministic-v1',
  '[{"page":1,"text":"Điều 1. Hạn 15 ngày."}]'::jsonb, '{"sections":[]}'::jsonb, 'Điều 1. Hạn 15 ngày.'
) is not null;
select results_eq('select count(*)::integer from public.document_extractions', ARRAY[1], 'successful extraction is stored privately');
select throws_ok(
  $$ select public.persist_document_extraction('f9000000-0000-0000-0000-000000000001'::uuid, 'tampered', 'hash', 'extractor', 'v1', '[{"page":1,"text":"x"}]'::jsonb, '{}'::jsonb, 'x') $$,
  'SOURCE_CHECKSUM_MISMATCH', 'historical source checksum cannot be silently updated'
);

create temp table p5_03_claim on commit drop as
  select * from public.claim_specific_ingestion_job(
    (select id from public.ingestion_jobs where document_version_id = 'f8000000-0000-0000-0000-000000000001'::uuid and job_kind = 'ARTICLE_DRAFT'), 'p5-03-test-worker', 300
  );
select results_eq('select count(*)::integer from p5_03_claim', ARRAY[1], 'generation job has an explicit lease');
select public.persist_knowledge_article_draft(
  (select id from p5_03_claim), (select claim_token from p5_03_claim),
  '{"title":"Bản nháp synthetic","summary":"Hạn 15 ngày","key_points":["Hạn 15 ngày"],"structured_content":{}}'::jsonb,
  jsonb_build_array(jsonb_build_object('content','Điều 1. Hạn 15 ngày.','content_hash',encode(extensions.digest(convert_to('Điều 1. Hạn 15 ngày.', 'UTF8'), 'sha256'::text),'hex'),'locator',jsonb_build_object('page',1),'evidence_kind','DEADLINE','selected_reason','fixture')),
  '{"provider":"FAKE","model":"synthetic-fake-v1","prompt_version":"knowledge_article_v1"}'::jsonb,
  '11112222-3333-4444-5555-666677778888'::uuid
) is not null;
select results_eq($$ select count(*)::integer from public.knowledge_articles where review_status = 'PENDING_REVIEW' $$, ARRAY[1], 'generated article is reviewable, never auto-approved');
select results_eq($$ select count(*)::integer from public.document_chunks where article_id is not null and review_status = 'PENDING' $$, ARRAY[1], 'evidence is selective and initially pending');
select results_eq(
  $$ select content_hash from public.document_chunks where article_id is not null $$,
  $$ select encode(extensions.digest(convert_to('Điều 1. Hạn 15 ngày.', 'UTF8'), 'sha256'::text), 'hex') $$,
  'database evidence hash is explicit UTF-8 SHA-256'
);
select public.complete_ingestion_job((select id from p5_03_claim), (select claim_token from p5_03_claim), '{"article_id":"f0000000-0000-0000-0000-000000000001"}'::jsonb);

select p5_03_set_auth_user('11112222-3333-4444-5555-666677778888'::uuid);
select public.review_knowledge_article((select id from public.knowledge_articles where document_id = 'f7000000-0000-0000-0000-000000000001'::uuid), 'APPROVE', 'Đã đối chiếu source');
select results_eq($$ select count(*)::integer from public.knowledge_articles where document_id = 'f7000000-0000-0000-0000-000000000001'::uuid and review_status = 'APPROVED' $$, ARRAY[1], 'scoped admin can approve a complete article');
select results_eq($$ select count(*)::integer from public.document_chunks where article_id = (select id from public.knowledge_articles where document_id = 'f7000000-0000-0000-0000-000000000001'::uuid) and review_status = 'APPROVED' $$, ARRAY[1], 'approval atomically approves linked evidence');
select lives_ok(
  $$ select public.set_document_retrieval_enabled('f7000000-0000-0000-0000-000000000001'::uuid, true) $$,
  'scoped admin can enable published document retrieval'
);
select lives_ok(
  $$ select public.set_knowledge_article_retrieval_enabled((select id from public.knowledge_articles where document_id = 'f7000000-0000-0000-0000-000000000001'::uuid), true) $$,
  'scoped admin can enable approved current article retrieval'
);
select p5_03_set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select results_eq(
  $$ select count(*)::integer from public.search_published_knowledge('Hạn 15 ngày', 8) $$,
  ARRAY[1], 'same-organization member retrieves approved source evidence'
);
select p5_03_set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
select results_eq(
  $$ select count(*)::integer from public.search_published_knowledge('Hạn 15 ngày', 8) $$,
  ARRAY[0], 'cross-organization user cannot retrieve source evidence'
);
select p5_03_set_auth_user('11112222-3333-4444-5555-666677778888'::uuid);
select throws_ok(
  $$ update public.knowledge_articles set content = '{"tampered":true}'::jsonb where document_id = 'f7000000-0000-0000-0000-000000000001'::uuid $$,
  'permission denied for table knowledge_articles', 'authenticated clients cannot edit generated content directly'
);
select p5_03_reset_auth();

select finish();
rollback;
