begin;
select plan(14);

create or replace function p5_rag_auth(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;
create or replace function p5_rag_reset() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select function_privs_are('public', 'search_published_knowledge', ARRAY['text','integer'], 'anon', ARRAY[]::text[], 'anonymous caller cannot invoke lexical retrieval');
select function_privs_are('public', 'search_semantic_knowledge', ARRAY['vector','text','integer','real'], 'anon', ARRAY[]::text[], 'anonymous caller cannot invoke semantic retrieval');

select p5_rag_reset();
insert into public.documents (id, title, status, visibility_level, owner_organization_id, created_by, retrieval_enabled)
values
  ('f7100000-0000-0000-0000-000000000001', 'RAG-ALPHA-726', 'PUBLISHED', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', '11112222-3333-4444-5555-666677778888', true),
  ('f7100000-0000-0000-0000-000000000002', 'Restricted semantic answer', 'PUBLISHED', 'ORGANIZATION_ONLY', '33333333-3333-3333-3333-333333333333', '11112222-3333-4444-5555-666677778888', true),
  ('f7100000-0000-0000-0000-000000000003', 'Withdrawn source', 'WITHDRAWN', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', '11112222-3333-4444-5555-666677778888', true),
  ('f7100000-0000-0000-0000-000000000004', 'Stale version source', 'PUBLISHED', 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222', '11112222-3333-4444-5555-666677778888', true);

insert into public.document_versions (id, document_id, version_number, content_hash, is_current, created_by)
values
  ('f8100000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 1, 'rag-v1', true, '11112222-3333-4444-5555-666677778888'),
  ('f8100000-0000-0000-0000-000000000002', 'f7100000-0000-0000-0000-000000000002', 1, 'restricted-v1', true, '11112222-3333-4444-5555-666677778888'),
  ('f8100000-0000-0000-0000-000000000003', 'f7100000-0000-0000-0000-000000000003', 1, 'withdrawn-v1', true, '11112222-3333-4444-5555-666677778888'),
  ('f8100000-0000-0000-0000-000000000004', 'f7100000-0000-0000-0000-000000000004', 1, 'stale-v1', false, '11112222-3333-4444-5555-666677778888'),
  ('f8100000-0000-0000-0000-000000000005', 'f7100000-0000-0000-0000-000000000004', 2, 'stale-v2', true, '11112222-3333-4444-5555-666677778888');

update public.documents set current_version_id = case id
  when 'f7100000-0000-0000-0000-000000000001'::uuid then 'f8100000-0000-0000-0000-000000000001'::uuid
  when 'f7100000-0000-0000-0000-000000000002'::uuid then 'f8100000-0000-0000-0000-000000000002'::uuid
  when 'f7100000-0000-0000-0000-000000000003'::uuid then 'f8100000-0000-0000-0000-000000000003'::uuid
  else 'f8100000-0000-0000-0000-000000000005'::uuid end;

insert into public.knowledge_articles (
  id, document_id, document_version_id, article_key, revision_number, title, summary, content,
  content_text, review_status, retrieval_enabled, is_current, reviewed_by, reviewed_at, created_by
) values
  ('f4100000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'main', 1, 'Hạn nộp hồ sơ', 'RAG-ALPHA-726', '{}', 'Hồ sơ phải được gửi trước 17 giờ 30 ngày 31 tháng 12 năm 2026.', 'APPROVED', true, true, '11112222-3333-4444-5555-666677778888', now(), '11112222-3333-4444-5555-666677778888'),
  ('f4100000-0000-0000-0000-000000000002', 'f7100000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'pending', 1, 'Pending review', 'same vector', '{}', 'Pending semantic content.', 'PENDING_REVIEW', false, true, null, null, '11112222-3333-4444-5555-666677778888'),
  ('f4100000-0000-0000-0000-000000000003', 'f7100000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 'main', 1, 'Private answer', 'same vector', '{}', 'User is not permitted to see this semantic answer.', 'APPROVED', true, true, '11112222-3333-4444-5555-666677778888', now(), '11112222-3333-4444-5555-666677778888'),
  ('f4100000-0000-0000-0000-000000000004', 'f7100000-0000-0000-0000-000000000003', 'f8100000-0000-0000-0000-000000000003', 'main', 1, 'Withdrawn answer', 'same vector', '{}', 'Withdrawn content.', 'APPROVED', true, true, '11112222-3333-4444-5555-666677778888', now(), '11112222-3333-4444-5555-666677778888'),
  ('f4100000-0000-0000-0000-000000000005', 'f7100000-0000-0000-0000-000000000004', 'f8100000-0000-0000-0000-000000000004', 'old-version', 1, 'Old version answer', 'same vector', '{}', 'Old version content.', 'APPROVED', true, true, '11112222-3333-4444-5555-666677778888', now(), '11112222-3333-4444-5555-666677778888');

insert into public.document_chunks (
  id, document_id, document_version_id, article_id, content, content_hash, locator,
  review_status, visibility_level, selected_by, approved_by, approved_at, embedding, embedding_model
) values
  ('f5100000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'f4100000-0000-0000-0000-000000000001', 'Hồ sơ phải được gửi trước 17 giờ 30 ngày 31 tháng 12 năm 2026.', 'evidence-1', '{"page":1}'::jsonb, 'APPROVED', 'ORGANIZATION_ONLY', 'HUMAN_SELECTED', '11112222-3333-4444-5555-666677778888', now(), array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001'),
  ('f5100000-0000-0000-0000-000000000002', 'f7100000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'f4100000-0000-0000-0000-000000000002', 'Pending semantic content.', 'evidence-2', '{"page":2}'::jsonb, 'PENDING', 'ORGANIZATION_ONLY', 'AI_SUGGESTED', null, null, array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001'),
  ('f5100000-0000-0000-0000-000000000003', 'f7100000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 'f4100000-0000-0000-0000-000000000003', 'User is not permitted to see this semantic answer.', 'evidence-3', '{"page":1}'::jsonb, 'APPROVED', 'ORGANIZATION_ONLY', 'HUMAN_SELECTED', '11112222-3333-4444-5555-666677778888', now(), array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001'),
  ('f5100000-0000-0000-0000-000000000004', 'f7100000-0000-0000-0000-000000000003', 'f8100000-0000-0000-0000-000000000003', 'f4100000-0000-0000-0000-000000000004', 'Withdrawn content.', 'evidence-4', '{"page":1}'::jsonb, 'APPROVED', 'ORGANIZATION_ONLY', 'HUMAN_SELECTED', '11112222-3333-4444-5555-666677778888', now(), array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001'),
  ('f5100000-0000-0000-0000-000000000005', 'f7100000-0000-0000-0000-000000000004', 'f8100000-0000-0000-0000-000000000004', 'f4100000-0000-0000-0000-000000000005', 'Old version content.', 'evidence-5', '{"page":1}'::jsonb, 'APPROVED', 'ORGANIZATION_ONLY', 'HUMAN_SELECTED', '11112222-3333-4444-5555-666677778888', now(), array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001');

select throws_ok(
  $$ update public.document_chunks set embedding_model = 'models/different-space' where id = 'f5100000-0000-0000-0000-000000000001'::uuid $$,
  'APPROVED_EVIDENCE_IS_IMMUTABLE', 'approved evidence cannot be retagged into a different vector space'
);

select p5_rag_auth('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select results_eq(
  $$ select evidence_id from public.search_published_knowledge('RAG-ALPHA-726', 8) where exact_match $$,
  $$ values ('f5100000-0000-0000-0000-000000000001'::uuid) $$,
  'exact identifier lexical retrieval returns the expected evidence'
);
select results_eq(
  $$ select evidence_id from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.99) $$,
  $$ values ('f5100000-0000-0000-0000-000000000001'::uuid) $$,
  'semantic paraphrase retrieves the expected published evidence directly'
);
select results_eq(
  $$ select document_id, document_version_id, title, locator from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.99) $$,
  $$ values ('f7100000-0000-0000-0000-000000000001'::uuid, 'f8100000-0000-0000-0000-000000000001'::uuid, 'Hạn nộp hồ sơ'::text, '{"page":1}'::jsonb) $$,
  'semantic result retains document, version, title and locator citation metadata'
);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(-0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.55) $$,
  ARRAY[0], 'low-similarity false semantic matches are rejected'
);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where evidence_id = 'f5100000-0000-0000-0000-000000000002'::uuid $$,
  ARRAY[0], 'pending review evidence is excluded even with a perfect vector match'
);
select p5_rag_reset();
update public.knowledge_articles set retrieval_enabled = false where id = 'f4100000-0000-0000-0000-000000000001'::uuid;
select p5_rag_auth('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where evidence_id = 'f5100000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[0], 'retrieval-disabled articles are excluded'
);
select p5_rag_reset();
update public.knowledge_articles set retrieval_enabled = true where id = 'f4100000-0000-0000-0000-000000000001'::uuid;
select p5_rag_auth('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid);
select results_eq(
  $$ select count(*)::integer from public.search_published_knowledge('RAG-ALPHA-726', 8) $$,
  ARRAY[0], 'unauthorized user cannot retrieve lexical evidence'
);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where document_id = 'f7100000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[0], 'a document outside this user scope never appears in semantic results'
);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where document_id = 'f7100000-0000-0000-0000-000000000002'::uuid $$,
  ARRAY[1], 'the same semantic candidate is retrievable by a user authorized for its organization'
);
select p5_rag_auth('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where document_id = 'f7100000-0000-0000-0000-000000000003'::uuid $$,
  ARRAY[0], 'withdrawn document vector is not retrievable'
);
select results_eq(
  $$ select count(*)::integer from public.search_semantic_knowledge(array_fill(0.25::real, ARRAY[768])::vector(768), 'models/gemini-embedding-001', 8, 0.5) where document_id = 'f7100000-0000-0000-0000-000000000004'::uuid $$,
  ARRAY[0], 'evidence from a non-current document version is not retrievable'
);

select finish();
rollback;
