-- P5-03: deterministic source extraction -> reviewed knowledge article draft.
-- This migration adds only the missing execution/review boundaries. The canonical
-- knowledge_articles and document_chunks tables remain the source of truth.

alter table public.documents
  add column if not exists ai_processing_allowed boolean not null default false;

comment on column public.documents.ai_processing_allowed is
  'Explicit external-AI eligibility. False is fail-closed; this is not a publication or retrieval flag.';

alter table public.ingestion_jobs drop constraint if exists ingestion_jobs_job_kind_check;
alter table public.ingestion_jobs add constraint ingestion_jobs_job_kind_check
  check (job_kind in (
    'SOURCE_READY', 'SNAPSHOT_REFRESH', 'ARTICLE_DRAFT', 'EVIDENCE_REVIEW',
    'EMBEDDING_REFRESH', 'EXTRACT_DOCUMENT'
  ));

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  document_version_id uuid not null unique references public.document_versions(id),
  source_id uuid not null references public.document_sources(id),
  source_byte_hash text not null check (btrim(source_byte_hash) <> ''),
  normalized_content_hash text not null check (btrim(normalized_content_hash) <> ''),
  extractor text not null check (length(btrim(extractor)) between 1 and 120),
  extractor_version text not null check (length(btrim(extractor_version)) between 1 and 120),
  page_count integer not null check (page_count > 0),
  pages jsonb not null check (jsonb_typeof(pages) = 'array' and length(pages::text) <= 600000),
  structure jsonb not null default '{}'::jsonb check (jsonb_typeof(structure) = 'object'),
  normalized_text text not null check (length(normalized_text) between 1 and 500000),
  created_at timestamptz not null default now(),
  unique (document_version_id, source_byte_hash)
);

comment on table public.document_extractions is
  'Private, deterministic extraction artifact. It is never an end-user or client write model.';

create index if not exists idx_document_extractions_source
  on public.document_extractions (document_id, document_version_id);

create table if not exists public.knowledge_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ingestion_jobs(id),
  document_id uuid not null references public.documents(id),
  document_version_id uuid not null references public.document_versions(id),
  article_key text not null check (length(btrim(article_key)) between 1 and 200),
  generator_version text not null check (length(btrim(generator_version)) between 1 and 160),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 500),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  article_id uuid references public.knowledge_articles(id),
  provider text,
  model text,
  prompt_version text,
  metadata jsonb not null default '{}'::jsonb check (length(metadata::text) <= 4000),
  error_code text,
  last_error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_generation_attempts_document
  on public.knowledge_generation_attempts (document_id, document_version_id, article_key, created_at desc);

drop trigger if exists trg_knowledge_generation_attempts_updated_at on public.knowledge_generation_attempts;
create trigger trg_knowledge_generation_attempts_updated_at
before update on public.knowledge_generation_attempts
for each row execute function public.set_updated_at();

-- The baseline grants table DML to authenticated for historical setup compatibility. P5-03
-- closes that client-write path; the Edge Function and trusted RPCs use service_role only.
revoke insert, update, delete on table public.knowledge_articles, public.document_chunks from authenticated;
grant select on table public.knowledge_articles, public.document_chunks to authenticated;

alter table public.document_extractions enable row level security;
alter table public.knowledge_generation_attempts enable row level security;
revoke all on table public.document_extractions, public.knowledge_generation_attempts from public, anon, authenticated;
grant all on table public.document_extractions, public.knowledge_generation_attempts to service_role;

create or replace function public.queue_knowledge_article_generation(
  p_document_version_id uuid,
  p_article_key text,
  p_generator_version text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id uuid;
  v_org_id uuid;
  v_source_id uuid;
  v_job_id uuid;
  v_key text;
begin
  if p_document_version_id is null or p_requested_by is null
     or p_article_key is null or length(btrim(p_article_key)) not between 1 and 200
     or p_generator_version is null or length(btrim(p_generator_version)) not between 1 and 160 then
    raise exception 'INVALID_GENERATION_REQUEST';
  end if;

  select d.id, d.owner_organization_id into v_doc_id, v_org_id
    from public.document_versions v
    join public.documents d on d.id = v.document_id
   where v.id = p_document_version_id
     and d.ai_processing_allowed
     and d.source_class <> 'CLASS_E_SUPERSEDED';
  if v_doc_id is null then raise exception 'EXTERNAL_AI_NOT_ALLOWED'; end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_requested_by and p.account_status = 'ACTIVE'
  ) then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists (
    select 1 from public.user_roles r
     where r.user_id = p_requested_by
       and (r.role_code = 'SYSTEM_ADMIN'
         or (r.role_code = 'YOUTH_ADMIN' and (r.scope_organization_id is null or r.scope_organization_id = v_org_id
           or public.is_organization_in_scope(r.scope_organization_id, v_org_id))))
  ) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;

  select s.id into v_source_id
    from public.document_sources s
   where s.document_version_id = p_document_version_id
     and s.source_kind = 'PRIMARY_FILE'
   order by s.created_at, s.id limit 1;
  if v_source_id is null then raise exception 'SOURCE_NOT_FOUND'; end if;

  v_key := format('article:%s:%s:%s', p_document_version_id, btrim(p_article_key), btrim(p_generator_version));
  insert into public.ingestion_jobs (
    job_kind, document_id, document_version_id, source_id, idempotency_key, requested_by,
    payload
  ) values (
    'ARTICLE_DRAFT', v_doc_id, p_document_version_id, v_source_id, v_key, p_requested_by,
    jsonb_build_object('article_key', btrim(p_article_key), 'generator_version', btrim(p_generator_version))
  ) on conflict (idempotency_key) do nothing returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from public.ingestion_jobs where idempotency_key = v_key;
  else
    insert into public.ingestion_events(job_id, event_type, detail)
    values (v_job_id, 'QUEUED', jsonb_build_object('job_kind', 'ARTICLE_DRAFT', 'stage', 'GENERATION_QUEUED'));
  end if;

  insert into public.knowledge_generation_attempts (
    job_id, document_id, document_version_id, article_key, generator_version,
    idempotency_key, created_by
  ) values (
    v_job_id, v_doc_id, p_document_version_id, btrim(p_article_key), btrim(p_generator_version),
    v_key, p_requested_by
  ) on conflict (idempotency_key) do nothing;
  return v_job_id;
end;
$$;

revoke all on function public.queue_knowledge_article_generation(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.queue_knowledge_article_generation(uuid, text, text, uuid) to service_role;

create or replace function public.set_document_ai_processing_allowed(
  p_document_id uuid,
  p_allowed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_doc.owner_organization_id) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;
  update public.documents set ai_processing_allowed = coalesce(p_allowed, false), updated_by = auth.uid(), updated_at = now()
   where id = p_document_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'DOCUMENT_AI_PROCESSING_POLICY_UPDATED', 'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('ai_processing_allowed', v_doc.ai_processing_allowed),
    jsonb_build_object('ai_processing_allowed', coalesce(p_allowed, false)));
  return true;
end;
$$;

revoke all on function public.set_document_ai_processing_allowed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_document_ai_processing_allowed(uuid, boolean) to authenticated;

create or replace function public.claim_specific_ingestion_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns setof public.ingestion_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or btrim(p_worker_id) = ''
     or length(p_worker_id) > 100 or p_lease_seconds not between 30 and 900 then
    raise exception 'INVALID_INGESTION_CLAIM';
  end if;
  return query
  with claimed as (
    update public.ingestion_jobs
       set status = 'PROCESSING', attempt_count = attempt_count + 1,
           claim_token = gen_random_uuid(), worker_id = p_worker_id,
           claimed_at = v_now, started_at = v_now,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds), updated_at = v_now
     where id = p_job_id and status in ('PENDING', 'RETRY')
       and scheduled_at <= v_now and coalesce(next_attempt_at, v_now) <= v_now
     returning *
  ), logged as (
    insert into public.ingestion_events(job_id, event_type, detail)
    select id, 'CLAIMED', jsonb_build_object('attempt', attempt_count, 'worker_id', p_worker_id)
      from claimed returning job_id
  )
  select claimed.* from claimed;
end;
$$;

revoke all on function public.claim_specific_ingestion_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_specific_ingestion_job(uuid, text, integer) to service_role;

create or replace function public.persist_document_extraction(
  p_source_id uuid,
  p_source_byte_hash text,
  p_normalized_content_hash text,
  p_extractor text,
  p_extractor_version text,
  p_pages jsonb,
  p_structure jsonb,
  p_normalized_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id uuid;
  v_version_id uuid;
  v_expected_hash text;
  v_id uuid;
  v_page_count integer;
begin
  if p_source_id is null or p_source_byte_hash is null or p_normalized_content_hash is null
     or jsonb_typeof(p_pages) <> 'array' or jsonb_typeof(coalesce(p_structure, '{}'::jsonb)) <> 'object'
     or p_normalized_text is null or length(p_normalized_text) not between 1 and 500000 then
    raise exception 'INVALID_EXTRACTION_ARTIFACT';
  end if;
  select v.document_id, v.id, v.content_hash into v_doc_id, v_version_id, v_expected_hash
    from public.document_sources s join public.document_versions v on v.id = s.document_version_id
   where s.id = p_source_id;
  if v_version_id is null then raise exception 'SOURCE_NOT_FOUND'; end if;
  if v_expected_hash <> p_source_byte_hash then raise exception 'SOURCE_CHECKSUM_MISMATCH'; end if;
  select id into v_id from public.document_extractions where document_version_id = v_version_id;
  if v_id is not null then return v_id; end if;
  v_page_count := jsonb_array_length(p_pages);
  if v_page_count < 1 then raise exception 'EXTRACTION_EMPTY'; end if;
  insert into public.document_extractions (
    document_id, document_version_id, source_id, source_byte_hash, normalized_content_hash,
    extractor, extractor_version, page_count, pages, structure, normalized_text
  ) values (
    v_doc_id, v_version_id, p_source_id, p_source_byte_hash, p_normalized_content_hash,
    btrim(p_extractor), btrim(p_extractor_version), v_page_count, p_pages,
    coalesce(p_structure, '{}'::jsonb), p_normalized_text
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.persist_document_extraction(uuid, text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.persist_document_extraction(uuid, text, text, text, text, jsonb, jsonb, text) to service_role;

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
    if v_content = '' or v_page is null or v_hash <> encode(digest(v_content, 'sha256'), 'hex') then
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

revoke all on function public.persist_knowledge_article_draft(uuid, uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.persist_knowledge_article_draft(uuid, uuid, jsonb, jsonb, jsonb, uuid) to service_role;

create or replace function public.review_knowledge_article(
  p_article_id uuid,
  p_action text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article public.knowledge_articles%rowtype;
  v_doc public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_action not in ('APPROVE', 'REJECT', 'REQUEST_REGENERATION') then raise exception 'INVALID_REVIEW_ACTION'; end if;
  select * into v_article from public.knowledge_articles where id = p_article_id for update;
  if not found then raise exception 'KNOWLEDGE_ARTICLE_NOT_FOUND'; end if;
  select * into v_doc from public.documents where id = v_article.document_id;
  if not public.can_manage_document(v_doc.owner_organization_id) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;
  if v_article.review_status not in ('DRAFT', 'PENDING_REVIEW', 'REJECTED') then raise exception 'INVALID_REVIEW_TRANSITION'; end if;
  if p_action = 'APPROVE' then
    if not exists (select 1 from public.document_chunks where article_id = p_article_id)
       or exists (select 1 from public.document_chunks where article_id = p_article_id and review_status = 'REJECTED') then
      raise exception 'ARTICLE_EVIDENCE_INCOMPLETE';
    end if;
    update public.knowledge_articles old
       set is_current = false, review_status = case when old.review_status = 'APPROVED' then 'SUPERSEDED' else old.review_status end
     where old.document_id = v_article.document_id and old.article_key = v_article.article_key
       and old.id <> v_article.id and old.is_current;
    update public.document_chunks
       set review_status = 'APPROVED', approved_by = auth.uid(), approved_at = now()
     where article_id = p_article_id and review_status = 'PENDING';
    update public.knowledge_articles
       set review_status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = left(coalesce(p_review_note, ''), 2000), is_current = true, updated_at = now()
     where id = p_article_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
    values (auth.uid(), 'KNOWLEDGE_ARTICLE_APPROVED', 'knowledge_article', p_article_id, v_doc.owner_organization_id,
      jsonb_build_object('review_note', left(coalesce(p_review_note, ''), 500)));
  else
    update public.knowledge_articles
       set review_status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = left(coalesce(p_review_note, ''), 2000), updated_at = now()
     where id = p_article_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
    values (auth.uid(), case when p_action = 'REJECT' then 'KNOWLEDGE_ARTICLE_REJECTED' else 'KNOWLEDGE_ARTICLE_REGENERATION_REQUESTED' end,
      'knowledge_article', p_article_id, v_doc.owner_organization_id,
      jsonb_build_object('review_note', left(coalesce(p_review_note, ''), 500)));
  end if;
  return true;
end;
$$;

revoke all on function public.review_knowledge_article(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_knowledge_article(uuid, text, text) to authenticated;
