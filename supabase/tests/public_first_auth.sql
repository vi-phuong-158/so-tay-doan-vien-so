begin;

select plan(13);

create or replace function public_first_set_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

create or replace function public_first_reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

select public_first_reset();
insert into public.documents (id, title, status, visibility_level, created_by, owner_organization_id, retrieval_enabled)
values
  ('f8100000-0000-0000-0000-000000000001', 'Public AI document', 'PUBLISHED', 'PUBLIC', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', true),
  ('f8100000-0000-0000-0000-000000000002', 'Internal AI document', 'PUBLISHED', 'INTERNAL_YOUTH', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', true),
  ('f8100000-0000-0000-0000-000000000003', 'Draft public document', 'DRAFT', 'PUBLIC', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', false);

insert into public.learning_topics (id, title, status, visibility_level, owner_organization_id, created_by)
values
  ('f8200000-0000-0000-0000-000000000001', 'Public topic', 'PUBLISHED', 'PUBLIC', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('f8200000-0000-0000-0000-000000000002', 'Internal topic', 'PUBLISHED', 'INTERNAL_YOUTH', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.learning_resources (topic_id, resource_type, title, content)
values
  ('f8200000-0000-0000-0000-000000000001', 'TEXT', 'Public resource', 'Public content'),
  ('f8200000-0000-0000-0000-000000000002', 'TEXT', 'Internal resource', 'Internal content');

insert into public.innovation_projects (id, title, slug, project_status, visibility_level, publish_status, created_by)
values
  ('f8300000-0000-0000-0000-000000000001', 'Public project', 'public-project-f810', 'COMPLETED', 'PUBLIC', 'PUBLISHED', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('f8300000-0000-0000-0000-000000000002', 'Internal project', 'internal-project-f810', 'COMPLETED', 'INTERNAL_YOUTH', 'PUBLISHED', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('f8300000-0000-0000-0000-000000000003', 'Draft project', 'draft-project-f810', 'DRAFT', 'PUBLIC', 'DRAFT', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

select public_first_set_anon();
select results_eq($$select title from public.documents where id like 'f810%' order by id$$,
  array['Public AI document'], 'anon reads only published PUBLIC documents');
select results_eq($$select title from public.learning_topics where id like 'f820%' order by id$$,
  array['Public topic'], 'anon reads only published PUBLIC topics');
select results_eq($$select title from public.learning_resources order by title$$,
  array['Public resource'], 'anon cannot infer resources of hidden topics');
select results_eq($$select title from public.innovation_projects where id like 'f830%' order by id$$,
  array['Public project'], 'anon reads only published PUBLIC innovation projects');
select table_privs_are('public', 'quiz_options', 'anon', array[]::text[], 'anon cannot read quiz answer options');
select is((select count(*)::integer from storage.objects where bucket_id in ('documents-private', 'learning-resources-private')), 0,
  'anon cannot list objects in private content buckets');
select function_privs_are('public', 'consume_public_ai_quota', array['text', 'integer'], 'anon', array[]::text[],
  'anon cannot reset or inspect public AI quota');
select function_privs_are('public', 'search_public_knowledge', array['text', 'integer'], 'anon', array['EXECUTE'],
  'anon can call the fixed public retrieval function');

select public_first_reset();
insert into public.document_versions (id, document_id, version_number, content_hash, mime_type, created_by)
values
  ('f8400000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 1, 'public-f810-hash', 'text/plain', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('f8400000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 1, 'internal-f810-hash', 'text/plain', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.knowledge_articles (id, document_id, document_version_id, article_key, revision_number, title, content, content_text, review_status, retrieval_enabled, is_current, reviewed_by, reviewed_at, created_by)
values
  ('f8500000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'f8400000-0000-0000-0000-000000000001', 'public', 1, 'Public retrieval', '{}'::jsonb, 'priority phrase', 'APPROVED', true, true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('f8500000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 'f8400000-0000-0000-0000-000000000002', 'internal', 1, 'Internal retrieval', '{}'::jsonb, 'priority phrase priority phrase priority phrase', 'APPROVED', true, true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.document_chunks (id, document_id, document_version_id, article_id, content, content_hash, evidence_kind, selected_by, selected_reason, locator, review_status, approved_by, approved_at)
values
  ('f8600000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'f8400000-0000-0000-0000-000000000001', 'f8500000-0000-0000-0000-000000000001', 'priority phrase', 'public-evidence-f810', 'ARTICLE_CLAUSE', 'HUMAN_SELECTED', 'fixture', '{"page":1}'::jsonb, 'APPROVED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now()),
  ('f8600000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 'f8400000-0000-0000-0000-000000000002', 'f8500000-0000-0000-0000-000000000002', 'priority phrase priority phrase priority phrase', 'internal-evidence-f810', 'ARTICLE_CLAUSE', 'HUMAN_SELECTED', 'fixture', '{"page":1}'::jsonb, 'APPROVED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

select public_first_set_anon();
select results_eq($$select document_id from public.search_public_knowledge('priority phrase', 8)$$,
  array['f8100000-0000-0000-0000-000000000001'::uuid],
  'private evidence cannot outrank and leak through public AI retrieval');
select is((select count(*)::integer from public.search_public_knowledge('internal retrieval', 8)), 0,
  'public AI returns no fallback source when only internal knowledge matches');

select public_first_reset();
select is((select public from storage.buckets where id = 'documents-private'), false, 'documents bucket remains private');
select is((select public from storage.buckets where id = 'learning-resources-private'), false, 'learning resources bucket remains private');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'anon reads published public documents'),
  'public document policy is explicit and narrow');
select * from finish();
rollback;
