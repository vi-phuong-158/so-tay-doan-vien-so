-- Phase 4 / P4-02: documents admin workflow — Storage write authorization + orphan cleanup.
--
-- P4-01 (202608160001) established the read side: documents RLS, the fail-closed
-- `can_access_document()` gate, the admin write RPCs, and a `documents-private` SELECT policy that
-- re-derives the document id from the object path via `uuid_or_null` and re-checks access.
--
-- What was still missing: `documents-private` had NO INSERT/UPDATE/DELETE policy at all, so nobody
-- could upload a source file from an authenticated session — `attach_document_source_file` could
-- only ever record a path that some out-of-band process had put there. This migration opens
-- exactly the minimum write surface needed by the admin UI, using the same shape P2-03 established
-- for the report buckets (202608090002_phase_2_report_storage_authorization.sql).
--
-- Out of scope, unchanged: document_chunks, embeddings, AI/RAG, learning, quiz.

-- =====================================================================================
-- 1. documents-private INSERT — only a document's own administrator, only under its prefix
-- =====================================================================================
-- Path contract (fixed by P4-01's attach RPC and its SELECT policy):
--     documents-private/{document_id}/source/{uuid}-{safe_filename}
-- The first segment must resolve to a real document the caller may administer. `uuid_or_null`
-- keeps a malformed/traversal-shaped first segment from raising — it yields NULL, the
-- `can_manage_document` lookup finds nothing, and the policy denies. Knowing a path is never
-- sufficient, and an admin of organization A cannot plant an object under a document owned by
-- organization B, because authority is re-derived from the document row, not from the request.
drop policy if exists "document admins upload source files" on storage.objects;
create policy "document admins upload source files" on storage.objects for insert with check (
  bucket_id = 'documents-private'
  and public.is_active_user()
  and (string_to_array(name, '/'))[2] = 'source'
  and exists (
    select 1 from public.documents d
    where d.id = public.uuid_or_null((string_to_array(name, '/'))[1])
      and public.can_manage_document(d.owner_organization_id)
  )
);

-- =====================================================================================
-- 2. documents-private DELETE — compensation only; the live attached file is protected
-- =====================================================================================
-- Deliberately NO UPDATE policy: like the report buckets, an object is never overwritten in
-- place. Every upload lands on a fresh `{uuid}-{name}` path, so a replacement never destroys the
-- previous file, and a half-finished replacement can never corrupt a good one.
--
-- DELETE exists for exactly one reason: compensation. If the object upload succeeds but the
-- subsequent `attach_document_source_file` RPC fails, the object would otherwise be orphaned in
-- the bucket forever. The admin service deletes that staged object on the failure path.
--
-- The `d.storage_path is distinct from o.name` guard makes the currently-attached file
-- undeletable through this policy — so a cleanup bug, a stale UI, or a mistaken retry can never
-- remove the live source file of a published document. Detaching a live file is therefore a
-- deliberate two-step action (attach a replacement first, then clean up the old path), never a
-- single accidental delete.
drop policy if exists "document admins clean up unattached source files" on storage.objects;
create policy "document admins clean up unattached source files" on storage.objects for delete using (
  bucket_id = 'documents-private'
  and public.is_active_user()
  and exists (
    select 1 from public.documents d
    where d.id = public.uuid_or_null((string_to_array(name, '/'))[1])
      and public.can_manage_document(d.owner_organization_id)
      and d.storage_path is distinct from storage.objects.name
  )
);

-- =====================================================================================
-- 3. Admin read of unpublished source files
-- =====================================================================================
-- P4-01's SELECT policy defers to `can_access_document()`, which requires status = 'PUBLISHED'.
-- That is correct for end users, but it means an administrator cannot preview the file they just
-- attached to a DRAFT — the exact review step that should happen *before* publishing. This adds a
-- second, narrow SELECT policy for administrators of that specific document. Policies are OR-ed,
-- so the P4-01 end-user policy is unchanged and no end user gains anything here.
drop policy if exists "document admins read managed source files" on storage.objects;
create policy "document admins read managed source files" on storage.objects for select using (
  bucket_id = 'documents-private'
  and public.is_active_user()
  and exists (
    select 1 from public.documents d
    where d.id = public.uuid_or_null((string_to_array(name, '/'))[1])
      and public.can_manage_document(d.owner_organization_id)
  )
);

-- =====================================================================================
-- 4. Admin list read model
-- =====================================================================================
-- The admin list must show DRAFT/PENDING_REVIEW/WITHDRAWN documents, which `can_access_document`
-- (publish-gated) hides. P4-01's "content admins manage documents" policy already grants scoped
-- admins SELECT on those rows, so no new table policy is needed — but the admin list also needs a
-- total count and stable ordering over a filtered set, and that benefits from an index covering
-- the admin's own organization scope.
create index if not exists idx_documents_admin_list
  on public.documents (owner_organization_id, status, issued_date desc, id desc);

-- =====================================================================================
-- 5. detach_document_source_file — the only way to clear a live storage_path
-- =====================================================================================
-- Needed so an administrator can retire a source file deliberately. Splitting this out (rather
-- than letting the DELETE policy touch the attached object) keeps the invariant in section 2
-- intact: the database row is updated first, which is what makes the object deletable afterwards.
-- Order matters — clearing the pointer before removing bytes means a crash in between leaves an
-- orphaned object (harmless, cleanable) rather than a document pointing at a missing file.
create or replace function public.detach_document_source_file(p_document_id uuid)
returns text
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
  if v_doc.storage_path is null then
    raise exception 'DOCUMENT_HAS_NO_SOURCE';
  end if;
  -- A published document must not silently lose the file people are being pointed at.
  if v_doc.status = 'PUBLISHED' then
    raise exception 'INVALID_DOCUMENT_TRANSITION';
  end if;

  update public.documents
  set storage_path = null, updated_by = auth.uid(), updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'DOCUMENT_SOURCE_DETACHED', 'document', p_document_id, v_doc.owner_organization_id,
    jsonb_build_object('storage_path', v_doc.storage_path),
    jsonb_build_object('storage_path', null));

  -- Returned so the caller can delete exactly the object it just detached. This is a storage
  -- path, never a signed URL or token — nothing secret is returned or logged.
  return v_doc.storage_path;
end;
$$;

revoke all on function public.detach_document_source_file(uuid) from public, anon, authenticated;
grant execute on function public.detach_document_source_file(uuid) to authenticated;

-- =====================================================================================
-- 6. get_admin_documents — scoped admin read model with a total count
-- =====================================================================================
-- PostgREST can return an exact count, but the admin list also needs to be certain it only ever
-- sees documents inside the caller's administrative scope. Doing that here, once, is safer than
-- relying on the client to send the right organization filter every time.
create or replace function public.get_admin_documents(
  p_search text default null,
  p_status text default null,
  p_document_type text default null,
  p_issuing_authority text default null,
  p_visibility_level text default null,
  p_year integer default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  document_number text,
  title text,
  document_type text,
  issuing_authority text,
  issued_date date,
  effective_date date,
  expiry_date date,
  effect_status text,
  scope text,
  summary text,
  keywords text[],
  storage_path text,
  source_url text,
  status text,
  visibility_level text,
  owner_organization_id uuid,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_status is not null and p_status not in
    ('DRAFT','PROCESSING','PENDING_REVIEW','PUBLISHED','REPLACED','EXPIRED','WITHDRAWN') then
    raise exception 'INVALID_DOCUMENT_STATUS';
  end if;
  if p_visibility_level is not null and p_visibility_level not in
    ('PUBLIC','INTERNAL_YOUTH','ORGANIZATION_ONLY','RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;
  if p_year is not null and (p_year < 1900 or p_year > 2200) then
    raise exception 'INVALID_DOCUMENT_YEAR';
  end if;

  return query
  with scoped as (
    select d.* from public.documents d
    where public.can_manage_document(d.owner_organization_id)
      and (p_status is null or d.status = p_status)
      and (p_document_type is null or d.document_type = p_document_type)
      and (p_issuing_authority is null or d.issuing_authority = p_issuing_authority)
      and (p_visibility_level is null or d.visibility_level = p_visibility_level)
      and (p_year is null or extract(year from d.issued_date) = p_year)
      and (
        v_search is null
        or d.title ilike '%' || v_search || '%'
        or coalesce(d.document_number, '') ilike '%' || v_search || '%'
      )
  ), counted as (
    select count(*) as n from scoped
  )
  select s.id, s.document_number, s.title, s.document_type, s.issuing_authority,
    s.issued_date, s.effective_date, s.expiry_date, s.effect_status, s.scope, s.summary,
    s.keywords, s.storage_path, s.source_url, s.status, s.visibility_level,
    s.owner_organization_id, s.updated_at, c.n
  from scoped s cross join counted c
  order by s.issued_date desc nulls last, s.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.get_admin_documents(text, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.get_admin_documents(text, text, text, text, text, integer, integer, integer) to authenticated;
