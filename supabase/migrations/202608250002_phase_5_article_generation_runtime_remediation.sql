-- P5-03R1: make the database runtime contract explicit.
-- This is a forward fix for the already-pushed P5-03 migration.

create or replace function public.persist_knowledge_article_draft(
  p_job_id uuid,
  p_claim_token uuid,
  p_article jsonb,
  p_evidence jsonb,
  p_generation_metadata jsonb,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ingestion_jobs%rowtype;
  v_attempt public.knowledge_generation_attempts%rowtype;
  v_doc public.documents%rowtype;
  v_article_id uuid;
  v_revision integer;
  v_is_current boolean;
  v_item jsonb;
  v_content text;
  v_page integer;
  v_hash text;
begin
  if p_job_id is null or p_claim_token is null or jsonb_typeof(p_article) <> 'object'
     or jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_generation_metadata, '{}'::jsonb)) <> 'object'
     or length(coalesce(p_generation_metadata, '{}'::jsonb)::text) > 4000 then
    raise exception 'INVALID_GENERATION_OUTPUT';
  end if;
  select * into v_job from public.ingestion_jobs
   where id = p_job_id and status = 'PROCESSING' and claim_token = p_claim_token
   for update;
  if not found then raise exception 'INGESTION_CLAIM_NOT_CURRENT'; end if;
  select * into v_attempt from public.knowledge_generation_attempts where job_id = p_job_id for update;
  if not found then raise exception 'GENERATION_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'SUCCEEDED' and v_attempt.article_id is not null then return v_attempt.article_id; end if;
  select * into v_doc from public.documents where id = v_job.document_id;
  if not found or not v_doc.ai_processing_allowed then raise exception 'EXTERNAL_AI_NOT_ALLOWED'; end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id and account_status = 'ACTIVE') then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if p_article->>'title' is null or btrim(p_article->>'title') = ''
     or p_article->>'summary' is null or btrim(p_article->>'summary') = ''
     or jsonb_typeof(p_article->'structured_content') <> 'object' then
    raise exception 'MODEL_INVALID_OUTPUT';
  end if;
  select coalesce(max(revision_number), 0) + 1 into v_revision
    from public.knowledge_articles
   where document_version_id = v_job.document_version_id
     and article_key = coalesce(nullif(v_job.payload->>'article_key', ''), 'overview');
  select not exists (
    select 1 from public.knowledge_articles
     where document_id = v_job.document_id and article_key = coalesce(nullif(v_job.payload->>'article_key', ''), 'overview') and is_current
  ) into v_is_current;
  insert into public.knowledge_articles (
    document_id, document_version_id, article_key, revision_number, title, summary, content, content_text,
    review_status, generation_kind, provider, model, prompt_version, warnings, retrieval_enabled,
    is_current, created_by
  ) values (
    v_job.document_id, v_job.document_version_id,
    coalesce(nullif(v_job.payload->>'article_key', ''), 'overview'), v_revision,
    left(btrim(p_article->>'title'), 500), left(btrim(p_article->>'summary'), 10000),
    jsonb_build_object('key_points', coalesce(p_article->'key_points', '[]'::jsonb), 'structured_content', p_article->'structured_content'),
    left(coalesce(p_article->>'content_text', p_article->>'summary'), 50000), 'PENDING_REVIEW', 'AI_DRAFT',
    p_generation_metadata->>'provider', p_generation_metadata->>'model', p_generation_metadata->>'prompt_version',
    coalesce(p_article->'warnings', '[]'::jsonb), false, v_is_current, p_actor_user_id
  ) returning id into v_article_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    v_content := btrim(coalesce(v_item->>'content', ''));
    v_page := nullif(v_item->'locator'->>'page', '')::integer;
    v_hash := coalesce(v_item->>'content_hash', '');
    if v_content = '' or v_page is null or v_hash <> encode(
      extensions.digest(convert_to(v_content, 'UTF8'), 'sha256'::text), 'hex'
    ) then
      raise exception 'EVIDENCE_NOT_FOUND';
    end if;
    if not exists (
      select 1 from public.document_extractions x, jsonb_array_elements(x.pages) page
       where x.document_version_id = v_job.document_version_id
         and (page->>'page')::integer = v_page
         and position(v_content in page->>'text') > 0
    ) then raise exception 'EVIDENCE_NOT_FOUND'; end if;
    insert into public.document_chunks (
      document_id, document_version_id, article_id, chunk_index, section_path, page_from, page_to,
      content, content_hash, review_status, visibility_level, evidence_kind, selected_by, selected_reason, locator
    ) values (
      v_job.document_id, v_job.document_version_id, v_article_id, null, null, v_page, v_page,
      v_content, v_hash, 'PENDING', v_doc.visibility_level,
      coalesce(v_item->>'evidence_kind', 'ARTICLE_CLAUSE'), 'AI_SUGGESTED', left(v_item->>'selected_reason', 500),
      coalesce(v_item->'locator', jsonb_build_object('page', v_page))
    );
  end loop;
  if not exists (select 1 from public.document_chunks where article_id = v_article_id) then
    raise exception 'EVIDENCE_REQUIRED';
  end if;
  update public.knowledge_generation_attempts
     set status = 'SUCCEEDED', article_id = v_article_id, provider = p_generation_metadata->>'provider',
         model = p_generation_metadata->>'model', prompt_version = p_generation_metadata->>'prompt_version',
         metadata = p_generation_metadata, updated_at = now()
   where id = v_attempt.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (p_actor_user_id, 'KNOWLEDGE_ARTICLE_GENERATED', 'knowledge_article', v_article_id,
    v_doc.owner_organization_id, jsonb_build_object('document_version_id', v_job.document_version_id,
      'article_key', v_attempt.article_key, 'generator_version', v_attempt.generator_version));
  return v_article_id;
end;
$$;

-- Reset table privileges completely before restoring the intentional read path.
revoke all on table public.knowledge_articles, public.document_chunks
  from public, anon, authenticated;
grant select on table public.knowledge_articles, public.document_chunks to authenticated;

-- Generation internals are backend-only, including the anonymous role explicitly.
revoke all on table public.document_extractions, public.knowledge_generation_attempts
  from public, anon, authenticated;
grant all on table public.document_extractions, public.knowledge_generation_attempts to service_role;

