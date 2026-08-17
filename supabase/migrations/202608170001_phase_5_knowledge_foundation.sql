-- =====================================================================================
-- Phase 5 · P5-01 — Knowledge schema + RLS
-- =====================================================================================
-- Implements the data foundation for the architecture accepted in P5-00
-- (docs/phase-5/02-ai-rag-architecture.md):
--
--     Canonical Source  ->  Reviewed Wiki  ->  Selective Evidence  ->  (secondary) Embeddings
--
-- It deliberately does NOT implement extraction, Gemini calls, embedding generation, Wiki
-- generation, retrieval ranking or ask-ai. Those are P5-02..P5-06. Nothing here calls an
-- external service, and no row in any new table is populated by this migration.
--
-- What already exists and is NOT rebuilt here (see docs/phase-5/01-existing-work-audit.md §5):
--   * public.documents             -- canonical metadata, 7-state publication machine, RLS,
--                                     the P4-01/P4-02 admin RPCs and audit trail.
--   * public.can_access_document(uuid), can_manage_document(uuid), is_active_user(),
--     current_org_id(), has_role(), has_role_in_scope(), uuid_or_null()
--                                  -- the accepted authorization model. Phase 5 anchors to it
--                                     and does NOT introduce a second one.
--   * bucket documents-private + its Storage policies (P4-01/P4-02).
--   * public.document_chunks, ai_conversations, ai_messages, ai_message_sources, ai_feedback
--                                  -- present since 202607300001, all at 0 rows, never written to.
--
-- Two legacy Edge Functions (supabase/functions/ask-ai, process-document) are NOT accepted
-- implementations (P5-00). This migration is deliberately shaped for their replacement: it never
-- gives a client a write path into knowledge content, and it never lets a knowledge-processing
-- state change touch documents.status.
-- =====================================================================================

-- =====================================================================================
-- 1. documents: knowledge-side columns, kept strictly separate from Phase 4 publication state
-- =====================================================================================
-- documents.status is the Phase 4 PUBLICATION state machine and is accepted behaviour. The Phase 5
-- ingestion lifecycle is a SEPARATE axis. Reusing documents.status for ingestion is exactly the
-- defect audited in docs/phase-5/01-existing-work-audit.md §3.4, where the legacy process-document
-- pushed a PUBLISHED document back to PENDING_REVIEW -- silently removing it from every end user,
-- because can_access_document() requires status = 'PUBLISHED'.

alter table public.documents
  add column if not exists source_class text not null default 'CLASS_B_INTERNAL',
  add column if not exists ingestion_status text not null default 'NOT_STARTED',
  add column if not exists retrieval_enabled boolean not null default false,
  -- Machine-readable effect state. documents.effect_status stays untouched: it is a FREE-TEXT
  -- field that the accepted P4-02 admin UI writes verbatim (src/pages/AdminDocuments.jsx renders a
  -- plain <input>, and src/lib/documentDisplay.mjs classifies it by Vietnamese substring match).
  -- Constraining it would break accepted Phase 4 behaviour, so Phase 5 adds its own normalized
  -- column instead of rewriting Phase 4 semantics. See docs/phase-5/08-p5-01-implementation.md.
  add column if not exists effect_state text;

alter table public.documents drop constraint if exists documents_source_class_check;
alter table public.documents add constraint documents_source_class_check
  check (source_class in (
    'CLASS_A_PUBLIC_WEB',      -- public official web source; URL + mandatory snapshot
    'CLASS_B_INTERNAL',        -- internal approved upload; private original
    'CLASS_C_LONG_REFERENCE',  -- book / long training material; per-chapter wikis
    'CLASS_D_STRUCTURED_FORM', -- form / checklist / table; field-schema extraction
    'CLASS_E_SUPERSEDED'       -- retained for history, excluded from default retrieval
  ));

alter table public.documents drop constraint if exists documents_ingestion_status_check;
alter table public.documents add constraint documents_ingestion_status_check
  check (ingestion_status in ('NOT_STARTED','QUEUED','PROCESSING','AI_DRAFT_READY','NEEDS_REPROCESS','FAILED','DONE'));

alter table public.documents drop constraint if exists documents_effect_state_check;
alter table public.documents add constraint documents_effect_state_check
  check (effect_state is null or effect_state in ('CON_HIEU_LUC','HET_HIEU_LUC','BI_THAY_THE','SUA_DOI_BO_SUNG','CHUA_XAC_DINH'));

comment on column public.documents.ingestion_status is
  'Phase 5 knowledge-ingestion axis. NEVER a substitute for documents.status (Phase 4 publication). '
  'A failed ingestion must not change document visibility.';
comment on column public.documents.retrieval_enabled is
  'Hard kill switch. While false, no knowledge unit of this document may be embedded or retrieved, '
  'regardless of wiki/evidence state. Enforced by trigger on knowledge_embeddings.';
comment on column public.documents.effect_state is
  'Normalized, machine-readable effect state for retrieval policy (Class E). documents.effect_status '
  'remains the free-text human field owned by the Phase 4 admin UI.';

-- Structural guarantee for the P5-00 acceptance condition "a knowledge-processing state change
-- cannot withdraw/change documents.status": the two axes may never move in the same statement.
create or replace function public.enforce_document_state_axis_separation()
returns trigger language plpgsql as $$
begin
  if (new.ingestion_status is distinct from old.ingestion_status
      or new.retrieval_enabled is distinct from old.retrieval_enabled)
     and new.status is distinct from old.status then
    raise exception
      'KNOWLEDGE_STATE_CANNOT_CHANGE_DOCUMENT_PUBLICATION_STATE: ingestion/retrieval fields and documents.status must not change in the same statement (% -> %)',
      old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_documents_state_axis_separation on public.documents;
create trigger trg_documents_state_axis_separation
  before update on public.documents
  for each row execute function public.enforce_document_state_axis_separation();

-- =====================================================================================
-- 2. Layer 1 — canonical source versions (immutable) and their sources/snapshots
-- =====================================================================================
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_hash text not null,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  mime_type text,
  -- Metadata frozen at the moment this version was registered, so a later edit of documents.*
  -- never silently rewrites what a published Wiki was reviewed against.
  source_metadata jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  supersedes_version_id uuid references public.document_versions(id),
  is_current boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

-- Exactly one current version per document, enforced by the database rather than by code.
create unique index if not exists uq_document_versions_current
  on public.document_versions (document_id) where is_current;

alter table public.documents
  add column if not exists current_version_id uuid references public.document_versions(id);

create table if not exists public.document_sources (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  source_kind text not null check (source_kind in ('STORAGE_FILE','OFFICIAL_URL','URL_SNAPSHOT')),
  storage_path text,
  official_url text,
  snapshot_storage_path text,
  content_hash text,
  http_etag text,
  http_last_modified text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  -- Each kind must actually carry its own locator. Fail closed on half-populated provenance.
  check (source_kind <> 'STORAGE_FILE'  or storage_path is not null),
  check (source_kind <> 'OFFICIAL_URL'  or official_url is not null),
  check (source_kind <> 'URL_SNAPSHOT'  or (official_url is not null and snapshot_storage_path is not null))
);

comment on table public.document_sources is
  'Provenance locators for one canonical version. For CLASS_A_PUBLIC_WEB the reviewed snapshot is '
  'mandatory (P5-00 D5/D6): answers are never produced by fetching a URL at runtime.';

-- =====================================================================================
-- 3. Layer 2 — reviewed Knowledge Wiki
-- =====================================================================================
create table if not exists public.knowledge_wikis (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  slug text not null unique,
  title text not null,
  -- Set only by publish; NULL means nothing of this wiki is retrievable.
  current_published_version_id uuid,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PROCESSING','AI_DRAFT_READY','PENDING_REVIEW','APPROVED',
                      'PUBLISHED','NEEDS_REPROCESS','FAILED','WITHDRAWN')),
  chapter_key text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One wiki per document, EXCEPT CLASS_C_LONG_REFERENCE which is deliberately chaptered
-- (a single summary of a whole textbook is useless for retrieval -- P5-00 Class C).
create unique index if not exists uq_knowledge_wikis_single_per_document
  on public.knowledge_wikis (document_id)
  where chapter_key is null;
create unique index if not exists uq_knowledge_wikis_chapter
  on public.knowledge_wikis (document_id, chapter_key)
  where chapter_key is not null;

create table if not exists public.knowledge_wiki_versions (
  id uuid primary key default gen_random_uuid(),
  wiki_id uuid not null references public.knowledge_wikis(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  -- A Wiki version is always anchored to exactly one canonical source version. This is the single
  -- most important provenance link in Phase 5: it is what lets a historical AI answer still say
  -- which text it was actually derived from.
  document_version_id uuid not null references public.document_versions(id),
  content jsonb not null default '{}'::jsonb,
  content_text text,
  summary text,
  review_status text not null default 'DRAFT'
    check (review_status in ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','SUPERSEDED')),
  generation_kind text not null default 'AI_DRAFT'
    check (generation_kind in ('AI_DRAFT','HUMAN_EDITED','HUMAN_AUTHORED')),
  -- Provider-neutral by design (P5-00 PART O): nothing here is Gemini-specific, so switching or
  -- A/B-testing a model never requires a schema change.
  provider text,
  model text,
  prompt_version text,
  generated_at timestamptz,
  warnings jsonb not null default '[]'::jsonb,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wiki_id, version_number),
  -- An approved/published version must name its reviewer. Provenance is not optional.
  check (review_status not in ('APPROVED','SUPERSEDED') or (reviewed_by is not null and reviewed_at is not null))
);

alter table public.knowledge_wikis
  drop constraint if exists knowledge_wikis_current_published_version_fk;
alter table public.knowledge_wikis
  add constraint knowledge_wikis_current_published_version_fk
  foreign key (current_published_version_id) references public.knowledge_wiki_versions(id);

comment on table public.knowledge_wiki_versions is
  'Reviewed, structured knowledge. Primary retrieval unit (P5-00 D3). APPROVED/SUPERSEDED rows are '
  'immutable -- corrections create a new version, they never rewrite history.';

-- =====================================================================================
-- 4. Layer 3 — selective evidence (refactor of document_chunks, NOT a replacement table)
-- =====================================================================================
-- PART L decision: evolve in place (option A). The table is at 0 rows, so evolving costs no data
-- migration, and creating a parallel table would leave a dead one behind that a later agent would
-- reasonably mistake for live schema.
--
-- Backward compatibility is a hard constraint: supabase/tests/rls_acceptance.sql (accepted Phase 1/4
-- coverage) inserts (id, document_id, chunk_index, content, content_hash, embedding, review_status)
-- and calls match_document_chunks(). Those columns and that function are therefore PRESERVED here.
-- Removing them belongs with the P5-05 retrieval rewrite that also updates that test -- dropping
-- them now would mean deleting accepted coverage to make a migration pass, which CLAUDE.md forbids.

alter table public.document_chunks
  add column if not exists document_version_id uuid references public.document_versions(id),
  add column if not exists wiki_version_id uuid references public.knowledge_wiki_versions(id),
  add column if not exists evidence_kind text,
  add column if not exists selected_by text,
  add column if not exists selected_reason text,
  add column if not exists locator jsonb not null default '{}'::jsonb,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;

-- Selective evidence has no dense sequence, unlike wall-to-wall chunking.
alter table public.document_chunks alter column chunk_index drop not null;

alter table public.document_chunks drop constraint if exists document_chunks_evidence_kind_check;
alter table public.document_chunks add constraint document_chunks_evidence_kind_check
  check (evidence_kind is null or evidence_kind in
    ('ARTICLE_CLAUSE','DEADLINE','PROCEDURE_STEP','FORM_FIELD','DEFINITION','TABLE_ROW','QUOTE'));

alter table public.document_chunks drop constraint if exists document_chunks_selected_by_check;
alter table public.document_chunks add constraint document_chunks_selected_by_check
  check (selected_by is null or selected_by in ('AI_SUGGESTED','HUMAN_SELECTED','QUERY_DRIVEN'));

-- Approved evidence must record who approved it and why it was selected at all.
--
-- Scoped to Phase 5 evidence, identified by being anchored to a document_version. Legacy rows
-- predate that anchor, and supabase/tests/rls_acceptance.sql (accepted coverage) inserts
-- APPROVED chunks in the old shape; an unconditional constraint would break that test, and
-- deleting accepted coverage to make a migration pass is forbidden by CLAUDE.md rule 7.
-- P5-05 makes document_version_id NOT NULL when the legacy path goes, and the check becomes
-- universal at that point.
alter table public.document_chunks drop constraint if exists document_chunks_approved_provenance_check;
alter table public.document_chunks add constraint document_chunks_approved_provenance_check
  check (
    document_version_id is null
    or review_status <> 'APPROVED'
    or (approved_by is not null and approved_at is not null and selected_by is not null)
  );

-- The old unique(document_id, content_hash) made any document containing two identical paragraphs
-- (routine in forms and tables) fail the whole insert -- audit §3.5. Version + kind scoped instead.
alter table public.document_chunks drop constraint if exists document_chunks_document_id_content_hash_key;
create unique index if not exists uq_document_chunks_evidence_identity
  on public.document_chunks (document_version_id, content_hash, evidence_kind)
  where document_version_id is not null;

-- visibility_level was a dead security field: no policy and no function ever read it, while
-- process-document dutifully wrote it (audit §3.8). A column that looks like an access control but
-- is not one is worse than none. Access is derived from the owning document, full stop.
-- Safe to drop: no test, service or policy references it.
alter table public.document_chunks drop column if exists visibility_level;

comment on table public.document_chunks is
  'Phase 5 selective EVIDENCE (P5-00 D1/D4): purposefully chosen excerpts, not wall-to-wall chunks. '
  'Not every paragraph becomes a row. Authorization derives from the parent document only.';
comment on column public.document_chunks.embedding is
  'DEPRECATED. Superseded by public.knowledge_embeddings, which is model- and dimension-aware. '
  'Retained only because match_document_chunks() and supabase/tests/rls_acceptance.sql still '
  'reference it; both are replaced in P5-05, which removes this column with its test update.';
comment on column public.document_chunks.locator is
  'Structured position within the source: {dieu, khoan, diem, page, paragraph}. Enables exact '
  'section lookup ("khoan 2 dieu 5") without vector search.';

-- =====================================================================================
-- 5. Embeddings — separated from evidence content, model-aware
-- =====================================================================================
create table if not exists public.knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('WIKI_VERSION','WIKI_SECTION','EVIDENCE')),
  wiki_version_id uuid references public.knowledge_wiki_versions(id) on delete cascade,
  evidence_id uuid references public.document_chunks(id) on delete cascade,
  section_key text,
  -- Denormalized on purpose: it lets a retrieval function narrow candidates by permission BEFORE
  -- the ranking operator runs, instead of ranking globally and filtering afterwards. That ordering
  -- is the fix for audit §3.7 and the P5-00 rule that authorization precedes retrieval.
  document_id uuid not null references public.documents(id) on delete cascade,
  embedding_model text not null,
  embedding_dimension integer not null check (embedding_dimension > 0),
  provider text,
  embedding_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Exactly one target.
  check (
    (target_kind in ('WIKI_VERSION','WIKI_SECTION') and wiki_version_id is not null and evidence_id is null)
    or (target_kind = 'EVIDENCE' and evidence_id is not null and wiki_version_id is null)
  ),
  check (target_kind <> 'WIKI_SECTION' or section_key is not null)
);

-- The vector column itself is intentionally added without a fixed dimension at table level, so a
-- second model can be indexed alongside the first during a migration instead of forcing a
-- destructive schema change (P5-00 PART O). Per-model partial indexes come in P5-05, when real
-- cardinality is known -- deliberately NOT guessing ivfflat/hnsw parameters now.
alter table public.knowledge_embeddings add column if not exists embedding vector;

comment on table public.knowledge_embeddings is
  'Secondary index over published knowledge. Never a source of truth. Rows may exist only for '
  'published/approved targets of a retrieval-enabled document -- enforced by trigger, not by code.';

-- Invariant I1 of docs/phase-5/02-ai-rag-architecture.md, enforced in the database so that no
-- future worker, however written, can index unreviewed content.
create or replace function public.enforce_embedding_publication_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_enabled boolean;
  v_ok boolean;
begin
  select d.retrieval_enabled into v_enabled from public.documents d where d.id = new.document_id;
  if not coalesce(v_enabled, false) then
    raise exception 'EMBEDDING_REQUIRES_RETRIEVAL_ENABLED_DOCUMENT' using errcode = 'check_violation';
  end if;

  if new.target_kind in ('WIKI_VERSION','WIKI_SECTION') then
    select (wv.review_status = 'APPROVED' and wv.published_at is not null
            and w.status = 'PUBLISHED' and w.document_id = new.document_id)
      into v_ok
      from public.knowledge_wiki_versions wv
      join public.knowledge_wikis w on w.id = wv.wiki_id
     where wv.id = new.wiki_version_id;
    if not coalesce(v_ok, false) then
      raise exception 'EMBEDDING_REQUIRES_PUBLISHED_WIKI_VERSION' using errcode = 'check_violation';
    end if;
  else
    select (e.review_status = 'APPROVED' and e.document_id = new.document_id)
      into v_ok
      from public.document_chunks e
     where e.id = new.evidence_id;
    if not coalesce(v_ok, false) then
      raise exception 'EMBEDDING_REQUIRES_APPROVED_EVIDENCE' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_knowledge_embeddings_publication_gate on public.knowledge_embeddings;
create trigger trg_knowledge_embeddings_publication_gate
  before insert or update on public.knowledge_embeddings
  for each row execute function public.enforce_embedding_publication_gate();

-- =====================================================================================
-- 6. Ingestion jobs / events — schema foundation only, no worker
-- =====================================================================================
-- Shape follows public.email_queue, which has already survived a live rehearsal (P3-02/P3-08):
-- status + attempt_count + idempotency_key + lease. Reusing a proven lifecycle beats inventing one.
create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null check (job_kind in ('EXTRACT','ANALYZE','EMBED','SNAPSHOT_REFRESH','STALENESS_CHECK')),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  wiki_version_id uuid references public.knowledge_wiki_versions(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  -- Makes re-running a step safe: same (kind, version, tool version) never queues twice.
  idempotency_key text not null unique,
  scheduled_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ingestion_jobs(id) on delete cascade,
  event_type text not null,
  -- Deliberately NOT a place for document text. PART P: store hashes, sizes, error codes and token
  -- counts; never mirror sensitive content into an operational log.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ingestion_events is
  'Append-only operational trail for ingestion. Must not contain verbatim document content.';

-- =====================================================================================
-- 7. AI provenance — make document/version/wiki/evidence citation actually expressible
-- =====================================================================================
-- Old shape: primary key (message_id, document_id, chunk_id) with chunk_id NULLABLE. PostgreSQL
-- forbids NULL in a primary key, so in practice EVERY citation was forced to have a chunk_id --
-- i.e. citing a reviewed Wiki or a document as a whole was impossible (audit §3.9). The table is at
-- 0 rows, so this is a pure shape fix with no data to migrate.
alter table public.ai_message_sources drop constraint if exists ai_message_sources_pkey;
alter table public.ai_message_sources add column if not exists id uuid not null default gen_random_uuid();
alter table public.ai_message_sources add primary key (id);

alter table public.ai_message_sources
  add column if not exists document_version_id uuid references public.document_versions(id),
  add column if not exists wiki_version_id uuid references public.knowledge_wiki_versions(id),
  add column if not exists source_kind text;

-- Dropping the primary key does NOT drop the NOT NULL that PostgreSQL implied for its columns.
-- Without these two lines the shape fix above is cosmetic and document-level or wiki-level
-- citation stays impossible -- which is the whole defect being repaired here.
alter table public.ai_message_sources alter column document_id drop not null;
alter table public.ai_message_sources alter column chunk_id drop not null;

alter table public.ai_message_sources drop constraint if exists ai_message_sources_source_kind_check;
alter table public.ai_message_sources add constraint ai_message_sources_source_kind_check
  check (source_kind is null or source_kind in
    ('OFFICIAL_SOURCE','REVIEWED_WIKI','EVIDENCE_EXCERPT','AI_SYNTHESIS'));

-- A citation must point at something. AI_SYNTHESIS is the one kind allowed to stand alone, because
-- it is precisely the label for "no source backs this" (P5-00 PART E).
alter table public.ai_message_sources drop constraint if exists ai_message_sources_target_check;
alter table public.ai_message_sources add constraint ai_message_sources_target_check
  check (
    source_kind = 'AI_SYNTHESIS'
    or document_id is not null or document_version_id is not null
    or wiki_version_id is not null or chunk_id is not null
  );

create unique index if not exists uq_ai_message_sources_rank
  on public.ai_message_sources (message_id, rank);

alter table public.ai_messages
  add column if not exists provider text,
  add column if not exists prompt_version text,
  add column if not exists retrieval_strategy text,
  add column if not exists refusal_reason text,
  add column if not exists source_count integer not null default 0 check (source_count >= 0);

alter table public.ai_messages drop constraint if exists ai_messages_retrieval_strategy_check;
alter table public.ai_messages add constraint ai_messages_retrieval_strategy_check
  check (retrieval_strategy is null or retrieval_strategy in
    ('EXACT_ID','SECTION_LOOKUP','METADATA_FILTER','WIKI_SEMANTIC','EVIDENCE_VECTOR','HYBRID','NONE'));

-- docs/brain/01-architecture.md describes "requireUser + quota" but no quota store ever existed.
create table if not exists public.ai_usage_quota (
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  questions_used integer not null default 0 check (questions_used >= 0),
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  limit_questions integer not null default 50 check (limit_questions >= 0),
  limit_tokens bigint not null default 500000 check (limit_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- =====================================================================================
-- 8. Immutability — history is appended, never rewritten
-- =====================================================================================
-- Same principle already proven for submitted reports (docs/brain/03-decisions.md [2026-07-30]):
-- an accepted record is evidence, and evidence that can be edited in place is not evidence.

create or replace function public.enforce_document_version_immutability()
returns trigger language plpgsql as $$
begin
  if new.document_id is distinct from old.document_id
     or new.version_number is distinct from old.version_number
     or new.content_hash is distinct from old.content_hash
     or new.byte_size is distinct from old.byte_size
     or new.mime_type is distinct from old.mime_type
     or new.source_metadata is distinct from old.source_metadata
     or new.supersedes_version_id is distinct from old.supersedes_version_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'DOCUMENT_VERSION_IS_IMMUTABLE: register a new version instead of editing %', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_document_versions_immutable on public.document_versions;
create trigger trg_document_versions_immutable
  before update on public.document_versions
  for each row execute function public.enforce_document_version_immutability();

-- A source version that anything was reviewed against cannot be deleted, ever: doing so would
-- orphan the provenance of every historical AI answer derived from it.
create or replace function public.prevent_referenced_version_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.knowledge_wiki_versions wv where wv.document_version_id = old.id)
     or exists (select 1 from public.ai_message_sources s where s.document_version_id = old.id) then
    raise exception 'DOCUMENT_VERSION_REFERENCED_BY_HISTORY: withdraw it instead of deleting %', old.id
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_document_versions_no_delete_referenced on public.document_versions;
create trigger trg_document_versions_no_delete_referenced
  before delete on public.document_versions
  for each row execute function public.prevent_referenced_version_delete();

create or replace function public.enforce_wiki_version_immutability()
returns trigger language plpgsql as $$
begin
  if old.review_status in ('APPROVED','SUPERSEDED') then
    if new.content is distinct from old.content
       or new.content_text is distinct from old.content_text
       or new.summary is distinct from old.summary
       or new.document_version_id is distinct from old.document_version_id
       or new.provider is distinct from old.provider
       or new.model is distinct from old.model
       or new.prompt_version is distinct from old.prompt_version
       or new.generation_kind is distinct from old.generation_kind
       or new.reviewed_by is distinct from old.reviewed_by
       or new.version_number is distinct from old.version_number then
      raise exception 'APPROVED_WIKI_VERSION_IS_IMMUTABLE: create a new version instead of editing %', old.id
        using errcode = 'check_violation';
    end if;
    -- An approved version may only move forward to SUPERSEDED; it can never be reopened, because a
    -- historical answer may already cite it.
    if new.review_status not in ('APPROVED','SUPERSEDED') then
      raise exception 'APPROVED_WIKI_VERSION_CANNOT_BE_REOPENED: % -> %', old.review_status, new.review_status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_knowledge_wiki_versions_immutable on public.knowledge_wiki_versions;
create trigger trg_knowledge_wiki_versions_immutable
  before update on public.knowledge_wiki_versions
  for each row execute function public.enforce_wiki_version_immutability();

create or replace function public.prevent_cited_wiki_version_delete()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.ai_message_sources s where s.wiki_version_id = old.id) then
    raise exception 'WIKI_VERSION_CITED_BY_HISTORY: supersede it instead of deleting %', old.id
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_knowledge_wiki_versions_no_delete_cited on public.knowledge_wiki_versions;
create trigger trg_knowledge_wiki_versions_no_delete_cited
  before delete on public.knowledge_wiki_versions
  for each row execute function public.prevent_cited_wiki_version_delete();

-- Approved evidence is frozen the same way: its text and position are what a citation quoted.
create or replace function public.enforce_evidence_immutability()
returns trigger language plpgsql as $$
begin
  if old.review_status = 'APPROVED'
     and (new.content is distinct from old.content
          or new.content_hash is distinct from old.content_hash
          or new.locator is distinct from old.locator
          or new.document_version_id is distinct from old.document_version_id
          or new.evidence_kind is distinct from old.evidence_kind) then
    raise exception 'APPROVED_EVIDENCE_IS_IMMUTABLE: reject it and select a new excerpt instead of editing %', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_document_chunks_immutable on public.document_chunks;
create trigger trg_document_chunks_immutable
  before update on public.document_chunks
  for each row execute function public.enforce_evidence_immutability();

-- Ingestion events are an audit trail; audit trails are append-only.
create or replace function public.prevent_ingestion_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'INGESTION_EVENTS_ARE_APPEND_ONLY' using errcode = 'check_violation';
end $$;

drop trigger if exists trg_ingestion_events_append_only on public.ingestion_events;
create trigger trg_ingestion_events_append_only
  before update or delete on public.ingestion_events
  for each row execute function public.prevent_ingestion_event_mutation();

-- updated_at triggers, matching the convention used by every other table here.
do $$ declare r record; begin
  for r in select unnest(array['knowledge_wikis','knowledge_wiki_versions','ingestion_jobs']) as t loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', r.t, r.t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', r.t, r.t);
  end loop;
end $$;

-- =====================================================================================
-- 9. Authorization helper — one derived source of truth, never a second access model
-- =====================================================================================
-- Knowledge management rights are DERIVED from the owning document. The helper takes a document id,
-- never an organization id, so a caller cannot nominate the scope it wants checked -- which is
-- precisely how the legacy process-document escalated across organizations (audit §3.2).
create or replace function public.can_manage_document_knowledge(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and public.can_manage_document(d.owner_organization_id)
  );
$$;

revoke all on function public.can_manage_document_knowledge(uuid) from public, anon;
grant execute on function public.can_manage_document_knowledge(uuid) to authenticated;

comment on function public.can_manage_document_knowledge(uuid) is
  'Derives Phase 5 curation rights from the owning document via the accepted can_manage_document(). '
  'Takes a document id, never an organization id: callers cannot choose their own scope.';

-- =====================================================================================
-- 10. RLS — fail closed, anchored to can_access_document()
-- =====================================================================================
do $$ declare r record; begin
  for r in select unnest(array['document_versions','document_sources','knowledge_wikis',
                               'knowledge_wiki_versions','knowledge_embeddings',
                               'ingestion_jobs','ingestion_events','ai_usage_quota']) as t loop
    execute format('alter table public.%I enable row level security', r.t);
  end loop;
end $$;

-- --- Canonical versions/sources -------------------------------------------------------
-- End users see versions of documents they may read; curators see everything they own, including
-- drafts, because reviewing requires seeing the not-yet-published.
drop policy if exists "readers read accessible document versions" on public.document_versions;
create policy "readers read accessible document versions" on public.document_versions
  for select using (
    public.can_access_document(document_id) or public.can_manage_document_knowledge(document_id)
  );

drop policy if exists "readers read accessible document sources" on public.document_sources;
create policy "readers read accessible document sources" on public.document_sources
  for select using (exists (
    select 1 from public.document_versions v
    where v.id = document_version_id
      and (public.can_access_document(v.document_id) or public.can_manage_document_knowledge(v.document_id))
  ));

-- --- Wiki ------------------------------------------------------------------------------
-- An end user may only see a wiki that is actually published; anything else is work in progress and
-- must not look authoritative.
drop policy if exists "readers read published wikis" on public.knowledge_wikis;
create policy "readers read published wikis" on public.knowledge_wikis
  for select using (
    (public.can_access_document(document_id)
      and status = 'PUBLISHED'
      and current_published_version_id is not null)
    or public.can_manage_document_knowledge(document_id)
  );

drop policy if exists "readers read approved wiki versions" on public.knowledge_wiki_versions;
create policy "readers read approved wiki versions" on public.knowledge_wiki_versions
  for select using (exists (
    select 1 from public.knowledge_wikis w
    where w.id = wiki_id
      and (
        (public.can_access_document(w.document_id)
          and w.status = 'PUBLISHED'
          and knowledge_wiki_versions.review_status = 'APPROVED'
          and knowledge_wiki_versions.published_at is not null)
        or public.can_manage_document_knowledge(w.document_id)
      )
  ));

-- --- Evidence --------------------------------------------------------------------------
-- Replaces the Phase 1 admin-only read policy with the same visibility ladder the documents
-- themselves use, plus the APPROVED gate that docs/brain/03-decisions.md [2026-07-30] required.
drop policy if exists "content admins read chunks" on public.document_chunks;
drop policy if exists "content admins manage chunks" on public.document_chunks;

drop policy if exists "readers read approved evidence" on public.document_chunks;
create policy "readers read approved evidence" on public.document_chunks
  for select using (
    (public.can_access_document(document_id) and review_status = 'APPROVED')
    or public.can_manage_document_knowledge(document_id)
  );

drop policy if exists "curators manage evidence" on public.document_chunks;
create policy "curators manage evidence" on public.document_chunks
  for all using (public.can_manage_document_knowledge(document_id))
  with check (public.can_manage_document_knowledge(document_id));

-- --- Embeddings ------------------------------------------------------------------------
-- No policy at all, by design. RLS is on and nothing is permitted, so even a mis-granted SELECT
-- cannot read vectors. Retrieval will run through a SECURITY DEFINER function in P5-05 that
-- resolves permission before ranking; direct client access is never part of that path.
comment on table public.knowledge_embeddings is
  'Secondary index over published knowledge. RLS is enabled with NO permissive policy: reachable '
  'only by service_role and by the future SECURITY DEFINER retrieval function. Direct client '
  'access is denied by construction, not by filtering after the fact.';

-- --- Ingestion -------------------------------------------------------------------------
drop policy if exists "curators read ingestion jobs" on public.ingestion_jobs;
create policy "curators read ingestion jobs" on public.ingestion_jobs
  for select using (public.can_manage_document_knowledge(document_id));

drop policy if exists "curators read ingestion events" on public.ingestion_events;
create policy "curators read ingestion events" on public.ingestion_events
  for select using (exists (
    select 1 from public.ingestion_jobs j
    where j.id = job_id and public.can_manage_document_knowledge(j.document_id)
  ));

-- --- Quota -----------------------------------------------------------------------------
drop policy if exists "users read own ai quota" on public.ai_usage_quota;
create policy "users read own ai quota" on public.ai_usage_quota
  for select using (user_id = auth.uid() and public.is_active_user());

-- =====================================================================================
-- 11. Grants — least privilege
-- =====================================================================================
-- WHY these are explicit revokes rather than "RLS will catch it": a broad grant plus a policy is
-- one edit away from exposure, and it also misrepresents intent to the next reader. P4-01 set the
-- precedent by revoking write grants on documents once an RPC replaced them; Phase 5 tables have no
-- client write path at all, so they get none.

-- New tables: deny everything to end users first, then grant back only reads that RLS gates.
revoke all on table public.document_versions, public.document_sources,
                   public.knowledge_wikis, public.knowledge_wiki_versions,
                   public.knowledge_embeddings, public.ingestion_jobs,
                   public.ingestion_events, public.ai_usage_quota
  from public, anon, authenticated;

-- SELECT only. Writes arrive through trusted RPCs in P5-02/P5-04, never from a browser.
grant select on table public.document_versions      to authenticated;
grant select on table public.document_sources       to authenticated;
grant select on table public.knowledge_wikis        to authenticated;
grant select on table public.knowledge_wiki_versions to authenticated;
grant select on table public.ingestion_jobs         to authenticated;
grant select on table public.ingestion_events       to authenticated;
grant select on table public.ai_usage_quota         to authenticated;

-- knowledge_embeddings: deliberately NO grant to anon/authenticated. Trusted retrieval only.

grant all on table public.document_versions, public.document_sources,
                  public.knowledge_wikis, public.knowledge_wiki_versions,
                  public.knowledge_embeddings, public.ingestion_jobs,
                  public.ingestion_events, public.ai_usage_quota
  to service_role;

-- Legacy over-grants confirmed by the P5-00 audit: these four tables were created in
-- 202607300001 with INSERT/UPDATE/DELETE for `authenticated` and have been held back by RLS alone
-- ever since. Evidence and citations are server-authored records; a client that can write them can
-- fabricate what an official document says, or forge an assistant answer.
revoke insert, update, delete on table public.document_chunks    from authenticated;
revoke insert, update, delete on table public.ai_messages        from authenticated;
revoke insert, update, delete on table public.ai_message_sources from authenticated;

-- ai_conversations and ai_feedback keep their client write grants on purpose: those rows are the
-- user's own (renaming or deleting one's own conversation, rating an answer), and their existing
-- `user_id = auth.uid()` policies already scope them correctly. Removing them would break genuine
-- user-owned actions with nothing to replace them -- the same reasoning P4-02 recorded for
-- document_relations.

-- =====================================================================================
-- 12. Indexes — only ones with a named query behind them
-- =====================================================================================
create index if not exists idx_document_versions_document      on public.document_versions (document_id, version_number desc);
create index if not exists idx_document_versions_hash          on public.document_versions (content_hash);
create index if not exists idx_document_sources_version        on public.document_sources (document_version_id);
create index if not exists idx_document_sources_url            on public.document_sources (official_url) where official_url is not null;

create index if not exists idx_knowledge_wikis_document_status on public.knowledge_wikis (document_id, status);
create index if not exists idx_knowledge_wiki_versions_wiki    on public.knowledge_wiki_versions (wiki_id, version_number desc);
create index if not exists idx_knowledge_wiki_versions_review  on public.knowledge_wiki_versions (review_status) where review_status = 'PENDING_REVIEW';
create index if not exists idx_knowledge_wiki_versions_source  on public.knowledge_wiki_versions (document_version_id);

create index if not exists idx_document_chunks_version         on public.document_chunks (document_version_id);
create index if not exists idx_document_chunks_wiki_version    on public.document_chunks (wiki_version_id) where wiki_version_id is not null;
create index if not exists idx_document_chunks_approved        on public.document_chunks (document_id) where review_status = 'APPROVED';

-- Supports "narrow by permission, then rank" -- the ordering the security model requires.
create index if not exists idx_knowledge_embeddings_scope      on public.knowledge_embeddings (document_id, embedding_model) where is_active;
create index if not exists idx_knowledge_embeddings_target     on public.knowledge_embeddings (target_kind, wiki_version_id, evidence_id);
-- No vector index yet: P5-00 PART M requires choosing ivfflat/HNSW from measured cardinality, and
-- an index tuned for the wrong scale silently degrades recall.

create index if not exists idx_ingestion_jobs_claimable        on public.ingestion_jobs (status, scheduled_at) where status = 'PENDING';
create index if not exists idx_ingestion_jobs_document         on public.ingestion_jobs (document_id, job_kind);
create index if not exists idx_ingestion_events_job            on public.ingestion_events (job_id, created_at desc);

create index if not exists idx_ai_message_sources_message      on public.ai_message_sources (message_id, rank);
create index if not exists idx_ai_message_sources_wiki_version on public.ai_message_sources (wiki_version_id) where wiki_version_id is not null;
