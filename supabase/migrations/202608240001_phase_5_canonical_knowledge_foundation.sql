-- Phase 5 / P5-R0: canonical knowledge foundation.
--
-- Canonical flow:
--   document -> document_version -> document_source -> knowledge_article
--   -> selective evidence (document_chunks) -> optional embedding.
--
-- This migration deliberately does not implement extraction, summarisation, embedding
-- generation, vector retrieval or ask-ai. It also deliberately does not create the
-- superseded knowledge_wikis / knowledge_wiki_versions model.

-- ============================================================================
-- 1. Keep publication state and ingestion state on separate axes
-- ============================================================================
alter table public.documents
  add column if not exists source_class text not null default 'CLASS_B_INTERNAL',
  add column if not exists ingestion_status text not null default 'NOT_STARTED',
  add column if not exists retrieval_enabled boolean not null default false,
  add column if not exists effect_state text,
  add column if not exists current_version_id uuid;

alter table public.documents drop constraint if exists documents_source_class_check;
alter table public.documents add constraint documents_source_class_check
  check (source_class in (
    'CLASS_A_PUBLIC_WEB',
    'CLASS_B_INTERNAL',
    'CLASS_C_LONG_REFERENCE',
    'CLASS_D_STRUCTURED_FORM',
    'CLASS_E_SUPERSEDED'
  ));

alter table public.documents drop constraint if exists documents_ingestion_status_check;
alter table public.documents add constraint documents_ingestion_status_check
  check (ingestion_status in (
    'NOT_STARTED', 'QUEUED', 'PROCESSING', 'AI_DRAFT_READY',
    'NEEDS_REPROCESS', 'FAILED', 'DONE'
  ));

alter table public.documents drop constraint if exists documents_effect_state_check;
alter table public.documents add constraint documents_effect_state_check
  check (effect_state is null or effect_state in (
    'CON_HIEU_LUC', 'HET_HIEU_LUC', 'BI_THAY_THE', 'SUA_DOI_BO_SUNG', 'CHUA_XAC_DINH'
  ));

comment on column public.documents.ingestion_status is
  'P5 ingestion lifecycle. It must never be used as the publication state or alter documents.status.';
comment on column public.documents.retrieval_enabled is
  'Document-level retrieval kill switch. Embeddings require this to be true.';
comment on column public.documents.effect_state is
  'Normalized retrieval-policy state; documents.effect_status remains the Phase 4 human field.';

create or replace function public.enforce_document_state_axis_separation()
returns trigger
language plpgsql
as $$
begin
  if (new.ingestion_status is distinct from old.ingestion_status
      or new.retrieval_enabled is distinct from old.retrieval_enabled)
     and new.status is distinct from old.status then
    raise exception
      'KNOWLEDGE_STATE_CANNOT_CHANGE_DOCUMENT_PUBLICATION_STATE'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_state_axis_separation on public.documents;
create trigger trg_documents_state_axis_separation
before update on public.documents
for each row execute function public.enforce_document_state_axis_separation();

-- ============================================================================
-- 2. Immutable canonical source versions and provider-neutral source locators
-- ============================================================================
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  version_number integer not null check (version_number > 0),
  content_hash text not null check (btrim(content_hash) <> ''),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  mime_type text,
  source_metadata jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  supersedes_version_id uuid references public.document_versions(id),
  is_current boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (not (source_metadata ?| array['access_token', 'refresh_token', 'client_secret', 'service_role_key', 'authorization']))
);

alter table public.documents
  drop constraint if exists documents_current_version_fk;
alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id);

create unique index if not exists uq_document_versions_current
  on public.document_versions (document_id)
  where is_current;

create table if not exists public.document_sources (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id),
  source_kind text not null check (source_kind in ('PRIMARY_FILE', 'OFFICIAL_URL', 'URL_SNAPSHOT')),
  provider_kind text not null check (provider_kind in ('SUPABASE_STORAGE', 'GOOGLE_DRIVE', 'HTTP')),
  storage_path text,
  external_file_id text,
  official_url text,
  snapshot_storage_path text,
  content_hash text check (content_hash is null or btrim(content_hash) <> ''),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  mime_type text,
  http_etag text,
  http_last_modified text,
  provider_metadata jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (provider_kind = 'SUPABASE_STORAGE' and storage_path is not null)
    or (provider_kind = 'GOOGLE_DRIVE' and external_file_id is not null)
    or (provider_kind = 'HTTP' and official_url is not null)
  ),
  check (not (provider_metadata ?| array['access_token', 'refresh_token', 'client_secret', 'service_role_key', 'authorization'])),
  check (source_kind <> 'URL_SNAPSHOT' or snapshot_storage_path is not null)
);

comment on table public.document_sources is
  'Immutable provenance locators for a document version. Provider metadata is not a credential store.';

create index if not exists idx_document_versions_document
  on public.document_versions (document_id, version_number desc);
create index if not exists idx_document_sources_version
  on public.document_sources (document_version_id, created_at);

create or replace function public.enforce_document_source_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DOCUMENT_SOURCE_IS_IMMUTABLE' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_document_sources_immutable on public.document_sources;
create trigger trg_document_sources_immutable
before update or delete on public.document_sources
for each row execute function public.enforce_document_source_immutability();

-- ============================================================================
-- 3. Canonical reviewed knowledge articles; each row is one revision
-- ============================================================================
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  document_version_id uuid not null references public.document_versions(id),
  article_key text not null check (btrim(article_key) <> '' and length(article_key) <= 200),
  revision_number integer not null check (revision_number > 0),
  title text not null check (btrim(title) <> ''),
  summary text,
  content jsonb not null default '{}'::jsonb,
  content_text text,
  review_status text not null default 'DRAFT'
    check (review_status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  generation_kind text not null default 'HUMAN_AUTHORED'
    check (generation_kind in ('AI_DRAFT', 'HUMAN_EDITED', 'HUMAN_AUTHORED')),
  provider text,
  model text,
  prompt_version text,
  warnings jsonb not null default '[]'::jsonb,
  retrieval_enabled boolean not null default false,
  is_current boolean not null default true,
  supersedes_article_id uuid references public.knowledge_articles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_version_id, article_key, revision_number),
  check (review_status not in ('APPROVED', 'SUPERSEDED')
    or (reviewed_by is not null and reviewed_at is not null)),
  check (retrieval_enabled = false or review_status = 'APPROVED')
);

create unique index if not exists uq_knowledge_articles_current
  on public.knowledge_articles (document_id, article_key)
  where is_current;

comment on table public.knowledge_articles is
  'Canonical reviewed knowledge model. One source version may produce many article revisions.';
comment on column public.knowledge_articles.document_id is
  'Denormalized provenance key; enforced against document_version_id by trigger.';
comment on column public.knowledge_articles.retrieval_enabled is
  'Article-level retrieval opt-in; approval alone does not create an embedding.';

create or replace function public.enforce_knowledge_article_provenance()
returns trigger
language plpgsql
as $$
declare
  v_document_id uuid;
begin
  select document_id into v_document_id
    from public.document_versions where id = new.document_version_id;
  if v_document_id is null or v_document_id <> new.document_id then
    raise exception 'KNOWLEDGE_ARTICLE_PROVENANCE_MISMATCH' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_articles_provenance on public.knowledge_articles;
create trigger trg_knowledge_articles_provenance
before insert or update on public.knowledge_articles
for each row execute function public.enforce_knowledge_article_provenance();

-- ============================================================================
-- 4. Evolve document_chunks in place into selective evidence
-- ============================================================================
alter table public.document_chunks
  add column if not exists document_version_id uuid references public.document_versions(id),
  add column if not exists article_id uuid references public.knowledge_articles(id),
  add column if not exists evidence_kind text,
  add column if not exists selected_by text,
  add column if not exists selected_reason text,
  add column if not exists locator jsonb not null default '{}'::jsonb,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

alter table public.document_chunks alter column chunk_index drop not null;
alter table public.document_chunks drop constraint if exists document_chunks_document_id_content_hash_key;
alter table public.document_chunks drop constraint if exists document_chunks_evidence_kind_check;
alter table public.document_chunks add constraint document_chunks_evidence_kind_check
  check (evidence_kind is null or evidence_kind in (
    'ARTICLE_CLAUSE', 'DEADLINE', 'PROCEDURE_STEP', 'FORM_FIELD', 'DEFINITION', 'TABLE_ROW', 'QUOTE'
  ));
alter table public.document_chunks drop constraint if exists document_chunks_selected_by_check;
alter table public.document_chunks add constraint document_chunks_selected_by_check
  check (selected_by is null or selected_by in ('AI_SUGGESTED', 'HUMAN_SELECTED', 'QUERY_DRIVEN'));
alter table public.document_chunks drop constraint if exists document_chunks_p5_shape_check;
alter table public.document_chunks add constraint document_chunks_p5_shape_check
  check ((document_version_id is null and article_id is null)
    or (document_version_id is not null and article_id is not null));
alter table public.document_chunks drop constraint if exists document_chunks_approved_provenance_check;
alter table public.document_chunks add constraint document_chunks_approved_provenance_check
  check (document_version_id is null
    or review_status <> 'APPROVED'
    or (approved_by is not null and approved_at is not null and selected_by is not null));

create unique index if not exists uq_document_chunks_p5_evidence_identity
  on public.document_chunks (article_id, content_hash, evidence_kind)
  where article_id is not null;

comment on table public.document_chunks is
  'Selective evidence excerpts. P5 rows are anchored to one article/source version; legacy rows remain for Phase 1-4 compatibility.';
comment on column public.document_chunks.embedding is
  'Legacy compatibility only. New retrieval embeddings belong in knowledge_embeddings.';
comment on column public.document_chunks.locator is
  'Structured evidence locator; may contain page, section, paragraph, dieu, khoan or diem.';

-- ============================================================================
-- 5. Secondary, model-aware embeddings; no client table access
-- ============================================================================
create table if not exists public.knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('ARTICLE', 'EVIDENCE')),
  article_id uuid references public.knowledge_articles(id),
  evidence_id uuid references public.document_chunks(id),
  document_id uuid not null references public.documents(id),
  document_version_id uuid not null references public.document_versions(id),
  embedding vector,
  embedding_model text not null check (btrim(embedding_model) <> ''),
  embedding_dimension integer not null check (embedding_dimension > 0),
  provider text not null check (btrim(provider) <> ''),
  embedding_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((target_kind = 'ARTICLE' and article_id is not null and evidence_id is null)
    or (target_kind = 'EVIDENCE' and article_id is null and evidence_id is not null))
);

comment on table public.knowledge_embeddings is
  'Secondary retrieval aid only. It is never a source of truth and is backend-only.';

create index if not exists idx_knowledge_embeddings_scope
  on public.knowledge_embeddings (document_id, document_version_id, is_active);

create or replace function public.enforce_embedding_publication_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_version_id uuid;
  v_allowed boolean := false;
begin
  if new.embedding is not null and vector_dims(new.embedding) <> new.embedding_dimension then
    raise exception 'EMBEDDING_DIMENSION_MISMATCH' using errcode = 'check_violation';
  end if;

  if new.target_kind = 'ARTICLE' then
    select a.document_id, a.document_version_id,
           a.review_status = 'APPROVED' and a.retrieval_enabled and d.retrieval_enabled
      into v_document_id, v_version_id, v_allowed
      from public.knowledge_articles a
      join public.documents d on d.id = a.document_id
     where a.id = new.article_id;
  else
    select e.document_id, e.document_version_id,
           e.review_status = 'APPROVED'
           and a.review_status = 'APPROVED'
           and a.retrieval_enabled
           and d.retrieval_enabled
      into v_document_id, v_version_id, v_allowed
      from public.document_chunks e
      join public.knowledge_articles a on a.id = e.article_id
      join public.documents d on d.id = e.document_id
     where e.id = new.evidence_id;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'EMBEDDING_REQUIRES_APPROVED_RETRIEVAL_ENABLED_TARGET'
      using errcode = 'check_violation';
  end if;
  if new.document_id <> v_document_id or new.document_version_id <> v_version_id then
    raise exception 'EMBEDDING_PROVENANCE_MISMATCH' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_embeddings_publication_gate on public.knowledge_embeddings;
create trigger trg_knowledge_embeddings_publication_gate
before insert or update on public.knowledge_embeddings
for each row execute function public.enforce_embedding_publication_gate();

-- ============================================================================
-- 6. Citation shape: trusted code writes provenance, clients cannot fabricate it
-- ============================================================================
alter table public.ai_message_sources drop constraint if exists ai_message_sources_pkey;
alter table public.ai_message_sources
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists document_version_id uuid references public.document_versions(id),
  add column if not exists article_id uuid references public.knowledge_articles(id),
  add column if not exists evidence_id uuid references public.document_chunks(id),
  add column if not exists source_id uuid references public.document_sources(id),
  add column if not exists source_kind text;
alter table public.ai_message_sources alter column id set not null;
alter table public.ai_message_sources add primary key (id);
alter table public.ai_message_sources alter column document_id drop not null;
alter table public.ai_message_sources alter column chunk_id drop not null;
alter table public.ai_message_sources drop constraint if exists ai_message_sources_p5_kind_check;
alter table public.ai_message_sources add constraint ai_message_sources_p5_kind_check
  check (source_kind is null or source_kind in ('DOCUMENT_SOURCE', 'ARTICLE', 'EVIDENCE'));
alter table public.ai_message_sources drop constraint if exists ai_message_sources_p5_target_check;
alter table public.ai_message_sources add constraint ai_message_sources_p5_target_check
  check (
    (source_kind is null and (document_id is not null or chunk_id is not null))
    or (source_kind = 'DOCUMENT_SOURCE' and source_id is not null
      and article_id is null and evidence_id is null)
    or (source_kind = 'ARTICLE' and article_id is not null
      and source_id is null and evidence_id is null)
    or (source_kind = 'EVIDENCE' and evidence_id is not null
      and source_id is null and article_id is null)
  );

create unique index if not exists uq_ai_message_sources_rank_p5
  on public.ai_message_sources (message_id, rank);

create or replace function public.enforce_ai_source_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_version_id uuid;
begin
  if new.source_kind = 'DOCUMENT_SOURCE' then
    select v.document_id, v.id into v_document_id, v_version_id
      from public.document_sources s
      join public.document_versions v on v.id = s.document_version_id
     where s.id = new.source_id;
  elsif new.source_kind = 'ARTICLE' then
    select document_id, document_version_id into v_document_id, v_version_id
      from public.knowledge_articles where id = new.article_id;
  elsif new.source_kind = 'EVIDENCE' then
    select document_id, document_version_id into v_document_id, v_version_id
      from public.document_chunks where id = new.evidence_id;
  else
    return new;
  end if;

  if v_document_id is null or v_version_id is null then
    raise exception 'AI_SOURCE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if new.document_id is not null and new.document_id <> v_document_id then
    raise exception 'AI_SOURCE_DOCUMENT_MISMATCH' using errcode = 'check_violation';
  end if;
  if new.document_version_id is not null and new.document_version_id <> v_version_id then
    raise exception 'AI_SOURCE_VERSION_MISMATCH' using errcode = 'check_violation';
  end if;
  new.document_id := v_document_id;
  new.document_version_id := v_version_id;
  return new;
end;
$$;

drop trigger if exists trg_ai_message_sources_provenance on public.ai_message_sources;
create trigger trg_ai_message_sources_provenance
before insert or update on public.ai_message_sources
for each row execute function public.enforce_ai_source_provenance();

-- ============================================================================
-- 7. Immutability and provenance guards
-- ============================================================================
create or replace function public.enforce_document_version_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.document_id is distinct from old.document_id
     or new.version_number is distinct from old.version_number
     or new.content_hash is distinct from old.content_hash
     or new.byte_size is distinct from old.byte_size
     or new.mime_type is distinct from old.mime_type
     or new.source_metadata is distinct from old.source_metadata
     or new.effective_from is distinct from old.effective_from
     or new.effective_to is distinct from old.effective_to
     or new.supersedes_version_id is distinct from old.supersedes_version_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'DOCUMENT_VERSION_IS_IMMUTABLE' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_versions_immutable on public.document_versions;
create trigger trg_document_versions_immutable
before update on public.document_versions
for each row execute function public.enforce_document_version_immutability();

create or replace function public.prevent_referenced_version_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.knowledge_articles where document_version_id = old.id)
     or exists (select 1 from public.document_chunks where document_version_id = old.id)
     or exists (select 1 from public.ai_message_sources where document_version_id = old.id)
     or exists (select 1 from public.knowledge_embeddings where document_version_id = old.id) then
    raise exception 'DOCUMENT_VERSION_REFERENCED_BY_HISTORY' using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_document_versions_no_delete_referenced on public.document_versions;
create trigger trg_document_versions_no_delete_referenced
before delete on public.document_versions
for each row execute function public.prevent_referenced_version_delete();

create or replace function public.enforce_document_current_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
begin
  if new.current_version_id is null then return new; end if;
  select document_id into v_document_id
    from public.document_versions
   where id = new.current_version_id and is_current;
  if v_document_id is null or v_document_id <> new.id then
    raise exception 'DOCUMENT_CURRENT_VERSION_MISMATCH' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_current_version on public.documents;
create trigger trg_documents_current_version
before insert or update of current_version_id on public.documents
for each row execute function public.enforce_document_current_version();

create or replace function public.set_current_document_version(p_document_id uuid, p_version_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.document_versions
     where id = p_version_id and document_id = p_document_id
  ) then
    raise exception 'DOCUMENT_VERSION_NOT_FOUND';
  end if;
  update public.document_versions set is_current = false where document_id = p_document_id;
  update public.document_versions set is_current = true where id = p_version_id;
  update public.documents set current_version_id = p_version_id where id = p_document_id;
  return true;
end;
$$;

revoke all on function public.set_current_document_version(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_current_document_version(uuid, uuid) to service_role;

create or replace function public.enforce_knowledge_article_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.review_status in ('APPROVED', 'SUPERSEDED') then
    if new.document_id is distinct from old.document_id
       or new.document_version_id is distinct from old.document_version_id
       or new.article_key is distinct from old.article_key
       or new.revision_number is distinct from old.revision_number
       or new.title is distinct from old.title
       or new.summary is distinct from old.summary
       or new.content is distinct from old.content
       or new.content_text is distinct from old.content_text
       or new.generation_kind is distinct from old.generation_kind
       or new.provider is distinct from old.provider
       or new.model is distinct from old.model
       or new.prompt_version is distinct from old.prompt_version
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'APPROVED_KNOWLEDGE_ARTICLE_IS_IMMUTABLE' using errcode = 'check_violation';
    end if;
    if old.review_status = 'SUPERSEDED' and new.review_status <> 'SUPERSEDED' then
      raise exception 'SUPERSEDED_KNOWLEDGE_ARTICLE_CANNOT_REOPEN' using errcode = 'check_violation';
    end if;
    if old.review_status = 'APPROVED' and new.review_status not in ('APPROVED', 'SUPERSEDED') then
      raise exception 'APPROVED_KNOWLEDGE_ARTICLE_CANNOT_REOPEN' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_articles_immutable on public.knowledge_articles;
create trigger trg_knowledge_articles_immutable
before update on public.knowledge_articles
for each row execute function public.enforce_knowledge_article_immutability();

create or replace function public.enforce_evidence_provenance()
returns trigger
language plpgsql
as $$
declare
  v_article_document_id uuid;
  v_article_version_id uuid;
begin
  if new.document_version_id is null then return new; end if;
  if jsonb_typeof(new.locator) <> 'object'
     or not (new.locator ? 'page' or new.locator ? 'section' or new.locator ? 'paragraph'
             or new.locator ? 'dieu' or new.locator ? 'khoan' or new.locator ? 'diem') then
    raise exception 'EVIDENCE_LOCATOR_REQUIRED' using errcode = 'check_violation';
  end if;
  select document_id, document_version_id
    into v_article_document_id, v_article_version_id
    from public.knowledge_articles where id = new.article_id;
  if v_article_document_id is null
     or v_article_document_id <> new.document_id
     or v_article_version_id <> new.document_version_id then
    raise exception 'EVIDENCE_PROVENANCE_MISMATCH' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_chunks_evidence_provenance on public.document_chunks;
create trigger trg_document_chunks_evidence_provenance
before insert or update on public.document_chunks
for each row execute function public.enforce_evidence_provenance();

create or replace function public.enforce_evidence_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.document_version_id is not null and old.review_status = 'APPROVED' then
    if new.document_id is distinct from old.document_id
       or new.document_version_id is distinct from old.document_version_id
       or new.article_id is distinct from old.article_id
       or new.content is distinct from old.content
       or new.content_hash is distinct from old.content_hash
       or new.locator is distinct from old.locator
       or new.selected_by is distinct from old.selected_by
       or new.selected_reason is distinct from old.selected_reason
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.embedding is distinct from old.embedding then
      raise exception 'APPROVED_EVIDENCE_IS_IMMUTABLE' using errcode = 'check_violation';
    end if;
    if new.review_status <> 'APPROVED' then
      raise exception 'APPROVED_EVIDENCE_CANNOT_REOPEN' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_chunks_evidence_immutable on public.document_chunks;
create trigger trg_document_chunks_evidence_immutable
before update on public.document_chunks
for each row execute function public.enforce_evidence_immutability();

create or replace function public.prevent_referenced_evidence_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.ai_message_sources where evidence_id = old.id or chunk_id = old.id)
     or exists (select 1 from public.knowledge_embeddings where evidence_id = old.id) then
    raise exception 'EVIDENCE_REFERENCED_BY_HISTORY' using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_document_chunks_no_delete_referenced on public.document_chunks;
create trigger trg_document_chunks_no_delete_referenced
before delete on public.document_chunks
for each row execute function public.prevent_referenced_evidence_delete();

-- ============================================================================
-- 8. RLS and grants
-- ============================================================================
alter table public.document_versions enable row level security;
alter table public.document_sources enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.knowledge_embeddings enable row level security;

drop policy if exists "p5 readers read accessible document versions" on public.document_versions;
create policy "p5 readers read accessible document versions" on public.document_versions
for select using (
  public.can_access_document(document_id)
  or exists (
    select 1 from public.documents d
    where d.id = document_id and public.can_manage_document(d.owner_organization_id)
  )
);

drop policy if exists "p5 readers read accessible document sources" on public.document_sources;
create policy "p5 readers read accessible document sources" on public.document_sources
for select using (
  exists (
    select 1 from public.document_versions v
    where v.id = document_version_id
      and (public.can_access_document(v.document_id)
        or exists (select 1 from public.documents d
          where d.id = v.document_id and public.can_manage_document(d.owner_organization_id)))
  )
);

drop policy if exists "p5 users read approved knowledge articles" on public.knowledge_articles;
create policy "p5 users read approved knowledge articles" on public.knowledge_articles
for select using (public.is_active_user() and review_status = 'APPROVED'
  and public.can_access_document(document_id));

drop policy if exists "p5 content admins manage knowledge articles" on public.knowledge_articles;
create policy "p5 content admins manage knowledge articles" on public.knowledge_articles
for all using (
  exists (select 1 from public.documents d
    where d.id = document_id and public.can_manage_document(d.owner_organization_id))
) with check (
  exists (select 1 from public.documents d
    where d.id = document_id and public.can_manage_document(d.owner_organization_id))
);

drop policy if exists "content admins read chunks" on public.document_chunks;
drop policy if exists "content admins manage chunks" on public.document_chunks;
drop policy if exists "p5 users read approved evidence" on public.document_chunks;
create policy "p5 users read approved evidence" on public.document_chunks
for select using (
  public.is_active_user()
  and review_status = 'APPROVED'
  and public.can_access_document(document_id)
  and (article_id is null or exists (
    select 1 from public.knowledge_articles a
    where a.id = article_id and a.review_status = 'APPROVED'
  ))
);

drop policy if exists "p5 content admins manage evidence" on public.document_chunks;
create policy "p5 content admins manage evidence" on public.document_chunks
for all using (
  exists (select 1 from public.documents d
    where d.id = document_id and public.can_manage_document(d.owner_organization_id))
) with check (
  exists (select 1 from public.documents d
    where d.id = document_id and public.can_manage_document(d.owner_organization_id))
);

revoke all on table public.document_versions, public.document_sources from public, anon;
revoke insert, update, delete on table public.document_versions, public.document_sources from authenticated;
grant select on table public.document_versions, public.document_sources to authenticated;

revoke all on table public.knowledge_embeddings from public, anon, authenticated;

revoke insert, update, delete on table public.ai_message_sources from anon, authenticated;
grant select on table public.ai_message_sources to authenticated;

revoke delete on table public.document_chunks from authenticated;
grant select, insert, update on table public.document_chunks to authenticated;

grant select, insert, update on table public.knowledge_articles to authenticated;
revoke delete on table public.knowledge_articles from authenticated;
