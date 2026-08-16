-- Phase 4 / P4-01: documents foundation.
--
-- The documents model is NOT greenfield. 202607300001_initial_schema.sql already created
-- public.documents (with the full spec field set and the 7-value status CHECK),
-- public.document_relations and public.document_chunks; 202607300003_fix_phase_1_security.sql
-- already added documents.owner_organization_id, the fail-closed can_access_document(uuid) helper,
-- the admin-manage policies, the private `documents-private` bucket and its Storage read policy.
--
-- This migration therefore does NOT recreate that model. It closes the specific gaps found by the
-- P4-00 baseline audit (docs/phase-4/00-baseline-documents-plan.md) and adds the server-validated
-- admin write path. It is forward-only and non-destructive: no table is dropped, no column is
-- removed, no historical row is edited.
--
-- Out of scope by design: document_chunks / embeddings / match_document_chunks (AI-RAG),
-- learning topics, quiz. Those tables are deliberately left untouched so nothing about the future
-- AI pipeline is pre-empted or broken here.

-- =====================================================================================
-- 1. Data-integrity constraints (G2, G6)
-- =====================================================================================
-- documents.status already has the spec CHECK from the initial schema; visibility_level did not.
-- Both constraints are added NOT VALID-free (the tables are empty in a fresh reset, and any
-- pre-existing row already conforms: the column default is 'INTERNAL_YOUTH').
alter table public.documents drop constraint if exists documents_visibility_level_check;
alter table public.documents add constraint documents_visibility_level_check
  check (visibility_level in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED'));

alter table public.document_relations drop constraint if exists document_relations_type_check;
alter table public.document_relations add constraint document_relations_type_check
  check (relation_type in ('AMENDS', 'REPLACES', 'GUIDES', 'RELATED'));

-- A document must not relate to itself: the pair is the PK, so a self-row would render as a
-- "related document" pointing at the page you are already on.
alter table public.document_relations drop constraint if exists document_relations_no_self_check;
alter table public.document_relations add constraint document_relations_no_self_check
  check (source_document_id <> target_document_id);

-- =====================================================================================
-- 2. document_relations RLS (G1) -- table had RLS enabled but ZERO policies, i.e. deny-all
-- =====================================================================================
-- Without this, the document detail view cannot read relations for anyone, admins included.
-- A relation is readable only when BOTH endpoints are readable by the caller: revealing that
-- document X "replaces" some other document is itself a disclosure about that other document.
drop policy if exists "active users read accessible document relations" on public.document_relations;
create policy "active users read accessible document relations" on public.document_relations
for select using (
  public.can_access_document(source_document_id)
  and public.can_access_document(target_document_id)
);

-- Scoped content admins manage relations for documents they own. can_access_document() is
-- publish-gated, so admins additionally need this policy to curate relations pre-publication.
drop policy if exists "content admins manage document relations" on public.document_relations;
create policy "content admins manage document relations" on public.document_relations
for all using (
  exists (
    select 1 from public.documents d
    where d.id = source_document_id
      and (public.has_role_in_scope('YOUTH_ADMIN', d.owner_organization_id) or public.has_role('SYSTEM_ADMIN'))
  )
) with check (
  exists (
    select 1 from public.documents d
    where d.id = source_document_id
      and (public.has_role_in_scope('YOUTH_ADMIN', d.owner_organization_id) or public.has_role('SYSTEM_ADMIN'))
  )
);

-- =====================================================================================
-- 3. Close direct table write grants (G3, G4)
-- =====================================================================================
-- RLS already blocks an end user's INSERT/UPDATE/DELETE here (the only write policy requires
-- YOUTH_ADMIN-in-scope or SYSTEM_ADMIN), so this is defense-in-depth rather than an open hole.
-- It follows the precedent set by P2-06, which closed the equivalent direct-write surface on the
-- report submission path: the trusted write path is an RPC that validates the transition
-- server-side, not a table grant plus a policy.
revoke insert, update, delete on table public.documents from authenticated;
revoke insert, update, delete on table public.document_relations from authenticated;
revoke insert, update, delete on table public.document_chunks from authenticated;

-- SELECT stays: RLS (can_access_document / admin policies) is the enforcement layer for reads.
grant select on table public.documents to authenticated;
grant select on table public.document_relations to authenticated;

-- =====================================================================================
-- 4. Storage read policy hardening (G5)
-- =====================================================================================
-- The existing policy derives the document id from the first path segment and defers to
-- can_access_document -- correct in shape, but it casts with a raw `::uuid`, which RAISES
-- `invalid input syntax for type uuid` for any object whose first segment is not a UUID rather
-- than simply denying. Phase 2 introduced public.uuid_or_null(text) for exactly this situation
-- (see can_read_report_template in 202608090006); this aligns documents with that precedent so a
-- malformed or traversal-shaped path fails CLOSED and silently, with no error surface.
drop policy if exists "Users can read chunks they have access to" on storage.objects;
drop policy if exists "active users read accessible document files" on storage.objects;
create policy "active users read accessible document files" on storage.objects
for select using (
  bucket_id = 'documents-private'
  and public.is_active_user()
  and public.uuid_or_null((string_to_array(name, '/'))[1]) is not null
  and public.can_access_document(public.uuid_or_null((string_to_array(name, '/'))[1]))
);

-- No INSERT/UPDATE/DELETE policy is created on documents-private for `authenticated`: end users
-- never write document source files, and the admin attach path below records metadata only after
-- the object is verified, so no broad Storage write grant is introduced by this migration.

-- =====================================================================================
-- 5. Indexes for the list read model
-- =====================================================================================
-- The list query filters on status/visibility and sorts by issued_date desc, id desc (a stable,
-- deterministic keyset order -- issued_date alone is not unique).
create index if not exists idx_documents_list
  on public.documents (status, issued_date desc, id desc);
create index if not exists idx_documents_owner_org
  on public.documents (owner_organization_id)
  where owner_organization_id is not null;
create index if not exists idx_documents_type
  on public.documents (document_type)
  where document_type is not null;
create index if not exists idx_document_relations_target
  on public.document_relations (target_document_id);

-- =====================================================================================
-- 6. Admin write path -- server-validated RPCs (G7)
-- =====================================================================================
-- Every RPC below: SECURITY DEFINER + fixed search_path, re-checks the caller's role against the
-- document's owner organization (never trusts a client-supplied role or a hidden UI button),
-- validates the state transition explicitly, and writes an audit_logs row. Signed URLs, file
-- contents, secrets and tokens are never logged.

-- Shared authorization predicate: may the caller administer documents owned by p_org?
create or replace function public.can_manage_document(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('SYSTEM_ADMIN')
    or (p_org is not null and public.has_role_in_scope('YOUTH_ADMIN', p_org));
$$;

revoke all on function public.can_manage_document(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_document_draft
-- ---------------------------------------------------------------------------
create or replace function public.create_document_draft(
  p_title text,
  p_document_type text default null,
  p_document_number text default null,
  p_issuing_authority text default null,
  p_issued_date date default null,
  p_effective_date date default null,
  p_expiry_date date default null,
  p_scope text default null,
  p_summary text default null,
  p_keywords text[] default '{}',
  p_visibility_level text default 'INTERNAL_YOUTH',
  p_owner_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  -- Default the owner org to the caller's own organization; an explicit value is honoured only
  -- if the caller actually has scope over it (checked below), so this cannot be used to plant a
  -- document under an organization the caller does not administer.
  v_org := coalesce(p_owner_organization_id, public.current_org_id());
  if v_org is null then raise exception 'ORGANIZATION_REQUIRED'; end if;
  if not public.can_manage_document(v_org) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;

  if p_title is null or btrim(p_title) = '' or length(p_title) > 500 then
    raise exception 'INVALID_DOCUMENT_TITLE';
  end if;
  if p_visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;
  if p_expiry_date is not null and p_effective_date is not null and p_expiry_date < p_effective_date then
    raise exception 'INVALID_DOCUMENT_DATES';
  end if;

  insert into public.documents (
    title, document_type, document_number, issuing_authority,
    issued_date, effective_date, expiry_date, scope, summary, keywords,
    visibility_level, owner_organization_id, status, created_by, updated_by
  ) values (
    btrim(p_title), p_document_type, p_document_number, p_issuing_authority,
    p_issued_date, p_effective_date, p_expiry_date, p_scope, p_summary, coalesce(p_keywords, '{}'),
    p_visibility_level, v_org, 'DRAFT', auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'DOCUMENT_CREATED', 'document', v_id, v_org,
    jsonb_build_object('title', btrim(p_title), 'status', 'DRAFT', 'visibility_level', p_visibility_level));

  return v_id;
end;
$$;

revoke all on function public.create_document_draft(text, text, text, text, date, date, date, text, text, text[], text, uuid) from public, anon, authenticated;
grant execute on function public.create_document_draft(text, text, text, text, date, date, date, text, text, text[], text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- update_document_metadata -- editable only while not in a terminal/published state
-- ---------------------------------------------------------------------------
create or replace function public.update_document_metadata(
  p_document_id uuid,
  p_title text default null,
  p_document_type text default null,
  p_document_number text default null,
  p_issuing_authority text default null,
  p_issued_date date default null,
  p_effective_date date default null,
  p_expiry_date date default null,
  p_scope text default null,
  p_summary text default null,
  p_keywords text[] default null,
  p_visibility_level text default null,
  p_effect_status text default null
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

  select * into v_doc from public.documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_doc.owner_organization_id) then
    raise exception 'DOCUMENT_SCOPE_DENIED';
  end if;
  if v_doc.status in ('REPLACED', 'EXPIRED') then
    raise exception 'DOCUMENT_NOT_EDITABLE';
  end if;
  if p_visibility_level is not null
    and p_visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;
  if p_title is not null and (btrim(p_title) = '' or length(p_title) > 500) then
    raise exception 'INVALID_DOCUMENT_TITLE';
  end if;

  update public.documents set
    title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    document_type = coalesce(p_document_type, document_type),
    document_number = coalesce(p_document_number, document_number),
    issuing_authority = coalesce(p_issuing_authority, issuing_authority),
    issued_date = coalesce(p_issued_date, issued_date),
    effective_date = coalesce(p_effective_date, effective_date),
    expiry_date = coalesce(p_expiry_date, expiry_date),
    scope = coalesce(p_scope, scope),
    summary = coalesce(p_summary, summary),
    keywords = coalesce(p_keywords, keywords),
    visibility_level = coalesce(p_visibility_level, visibility_level),
    effect_status = coalesce(p_effect_status, effect_status),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'DOCUMENT_METADATA_UPDATED', 'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('title', v_doc.title, 'visibility_level', v_doc.visibility_level),
    jsonb_build_object('title', coalesce(nullif(btrim(coalesce(p_title, '')), ''), v_doc.title),
      'visibility_level', coalesce(p_visibility_level, v_doc.visibility_level)));

  return true;
end;
$$;

revoke all on function public.update_document_metadata(uuid, text, text, text, text, date, date, date, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.update_document_metadata(uuid, text, text, text, text, date, date, date, text, text, text[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_document -- explicit, validated transition; this is the privilege boundary
-- ---------------------------------------------------------------------------
create or replace function public.publish_document(p_document_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_doc.owner_organization_id) then
    raise exception 'DOCUMENT_SCOPE_DENIED';
  end if;
  -- Only these states may become PUBLISHED. Re-publishing an already-PUBLISHED document, or
  -- resurrecting a REPLACED/EXPIRED one, is rejected rather than silently accepted.
  if v_doc.status not in ('DRAFT', 'PENDING_REVIEW', 'WITHDRAWN') then
    raise exception 'INVALID_DOCUMENT_TRANSITION';
  end if;
  if v_doc.title is null or btrim(v_doc.title) = '' then
    raise exception 'INVALID_DOCUMENT_TITLE';
  end if;

  update public.documents
  set status = 'PUBLISHED',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'DOCUMENT_PUBLISHED', 'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('status', v_doc.status), jsonb_build_object('status', 'PUBLISHED'));

  return true;
end;
$$;

revoke all on function public.publish_document(uuid) from public, anon, authenticated;
grant execute on function public.publish_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- withdraw_document
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_document(p_document_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_doc.owner_organization_id) then
    raise exception 'DOCUMENT_SCOPE_DENIED';
  end if;
  if v_doc.status not in ('PUBLISHED', 'PENDING_REVIEW') then
    raise exception 'INVALID_DOCUMENT_TRANSITION';
  end if;

  update public.documents
  set status = 'WITHDRAWN', updated_by = auth.uid(), updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'DOCUMENT_WITHDRAWN', 'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('status', v_doc.status),
    jsonb_build_object('status', 'WITHDRAWN', 'reason', left(coalesce(p_reason, ''), 500)));

  return true;
end;
$$;

revoke all on function public.withdraw_document(uuid, text) from public, anon, authenticated;
grant execute on function public.withdraw_document(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- attach_document_source_file -- records the storage path after server-side validation
-- ---------------------------------------------------------------------------
-- The browser-declared MIME type is deliberately NOT a parameter and NOT trusted: the extension
-- allowlist below is derived from the stored path itself. The path must sit under this document's
-- own prefix, which is what makes the Storage read policy's first-path-segment check meaningful.
create or replace function public.attach_document_source_file(
  p_document_id uuid,
  p_storage_path text,
  p_file_size_bytes bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_previous text;
  v_extension text;
  v_max_bytes bigint := 52428800; -- 50 MiB
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_doc.owner_organization_id) then
    raise exception 'DOCUMENT_SCOPE_DENIED';
  end if;

  if p_storage_path is null or length(p_storage_path) > 1024 then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  -- Must be exactly `{document_id}/source/{filename}`; no traversal, no backslash, no control
  -- characters, no leading slash, no empty segment. Anchoring on the document's own id prevents
  -- an admin of org A from attaching an object that lives under a document owned by org B.
  if p_storage_path !~ ('^' || p_document_id::text || '/source/[^/\\[:cntrl:]]+$') then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  if p_storage_path ~ '\.\.' then
    raise exception 'INVALID_STORAGE_PATH';
  end if;

  v_extension := lower(substring(p_storage_path from '\.([A-Za-z0-9]+)$'));
  if v_extension is null or v_extension not in ('pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt') then
    raise exception 'FILE_TYPE_NOT_ALLOWED';
  end if;
  if p_file_size_bytes is not null and (p_file_size_bytes <= 0 or p_file_size_bytes > v_max_bytes) then
    raise exception 'FILE_TOO_LARGE';
  end if;

  v_previous := v_doc.storage_path;

  update public.documents
  set storage_path = p_storage_path, updated_by = auth.uid(), updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(),
    case when v_previous is null then 'DOCUMENT_SOURCE_ATTACHED' else 'DOCUMENT_SOURCE_REPLACED' end,
    'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('storage_path', v_previous),
    jsonb_build_object('storage_path', p_storage_path, 'size_bytes', p_file_size_bytes));

  return true;
end;
$$;

revoke all on function public.attach_document_source_file(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.attach_document_source_file(uuid, text, bigint) to authenticated;
