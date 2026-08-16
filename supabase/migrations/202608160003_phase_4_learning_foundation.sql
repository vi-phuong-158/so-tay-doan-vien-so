-- Phase 4 / P4-03: learning topics & resources foundation.
--
-- Like Documents, this model is NOT greenfield: 202607300001_initial_schema.sql already creates
-- learning_topics (title, description, objectives, status DRAFT/PUBLISHED/CLOSED/ARCHIVED, open_at,
-- close_at, visibility_level, created_by, timestamps) and learning_resources (topic_id,
-- resource_type, title, content, storage_path, external_url, sort_order), and 202607300002 already
-- creates the private `learning-resources-private` bucket.
--
-- What it does NOT have is a safe access model. The shipped read policies are:
--
--   create policy "active users read published topics" on public.learning_topics
--     for select using (public.is_active_user() and status='PUBLISHED');
--
-- That policy never looks at `visibility_level`, so a PUBLISHED topic marked ORGANIZATION_ONLY or
-- RESTRICTED is readable by ANY active user. The resource policy has the same shape and the same
-- flaw. `learning_topics` also has no organization column at all, so ORGANIZATION_ONLY could not be
-- enforced even if the policy tried. This is the same gap 202607300003_fix_phase_1_security.sql
-- closed for documents, and this migration closes it for learning the same way.
--
-- Out of scope, untouched: quizzes, quiz_questions, quiz_options, quiz_attempts, quiz_answers,
-- document_chunks, embeddings, AI/RAG.

-- =====================================================================================
-- 1. Organization scoping (the column ORGANIZATION_ONLY needs to mean anything)
-- =====================================================================================
alter table public.learning_topics
  add column if not exists owner_organization_id uuid references public.organizations(id);

-- Keep any pre-existing row consistent by inferring the owner from its creator, exactly as
-- 202607300003 did for documents. Rows with no creator stay NULL and are treated as
-- unscoped/admin-only by the access helper below.
update public.learning_topics t
set owner_organization_id = (select organization_id from public.profiles p where p.id = t.created_by)
where t.owner_organization_id is null;

alter table public.learning_topics
  add column if not exists updated_by uuid references public.profiles(id);

-- learning_resources shipped without timestamps; add them so ordering/auditing has something real.
alter table public.learning_resources
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.profiles(id);

-- =====================================================================================
-- 2. Data-integrity constraints
-- =====================================================================================
alter table public.learning_topics drop constraint if exists learning_topics_visibility_level_check;
alter table public.learning_topics add constraint learning_topics_visibility_level_check
  check (visibility_level in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED'));

alter table public.learning_topics drop constraint if exists learning_topics_window_check;
alter table public.learning_topics add constraint learning_topics_window_check
  check (open_at is null or close_at is null or close_at > open_at);

alter table public.learning_resources drop constraint if exists learning_resources_type_check;
alter table public.learning_resources add constraint learning_resources_type_check
  check (resource_type in ('TEXT', 'DOCUMENT', 'VIDEO', 'IMAGE', 'LINK'));

-- External URLs are constrained at the database, not in the browser: a hostile value cannot even
-- be stored. https only -- `javascript:`, `data:`, `file:`, and protocol-relative `//host` forms
-- are all rejected. This is the durable control; the frontend's own check is only a convenience.
alter table public.learning_resources drop constraint if exists learning_resources_external_url_check;
alter table public.learning_resources add constraint learning_resources_external_url_check
  check (
    external_url is null
    or (external_url ~ '^https://[^\s/?#]+[^\s]*$' and length(external_url) <= 2000)
  );

-- A resource file must live under its own topic's prefix. Anchoring the path to topic_id in the
-- row itself is what makes the Storage policy's first-segment check meaningful, and it stops a
-- resource of topic A from pointing at an object belonging to topic B.
alter table public.learning_resources drop constraint if exists learning_resources_storage_path_check;
alter table public.learning_resources add constraint learning_resources_storage_path_check
  check (
    storage_path is null
    or (
      storage_path ~ ('^' || topic_id::text || '/resources/[^/\\]+$')
      and storage_path !~ '\.\.'
      and length(storage_path) <= 1024
    )
  );

-- A resource has to actually carry something.
alter table public.learning_resources drop constraint if exists learning_resources_payload_check;
alter table public.learning_resources add constraint learning_resources_payload_check
  check (num_nonnulls(content, storage_path, external_url) >= 1);

alter table public.learning_resources drop constraint if exists learning_resources_sort_order_check;
alter table public.learning_resources add constraint learning_resources_sort_order_check
  check (sort_order between 0 and 10000);

-- =====================================================================================
-- 3. Access helpers (fail-closed, mirroring can_access_document)
-- =====================================================================================
-- Deliberately a separate function from can_manage_document rather than reusing it: the predicate
-- happens to be identical today, but documents and learning are different content domains and may
-- diverge (e.g. a dedicated learning-manager role) -- keeping them separate costs two lines and
-- avoids a future change to one silently altering the other.
create or replace function public.can_manage_learning_topic(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('SYSTEM_ADMIN')
    or (p_org is not null and public.has_role_in_scope('YOUTH_ADMIN', p_org));
$$;

revoke all on function public.can_manage_learning_topic(uuid) from public, anon, authenticated;
-- anon needs EXECUTE, not because anonymous callers may manage anything (the function always
-- returns false for them -- has_role/has_role_in_scope both require is_active_user()), but because
-- this function is referenced from a storage.objects policy. PostgreSQL evaluates every policy on
-- a table for whichever role is current, so without EXECUTE an anonymous read of ANY object in ANY
-- bucket would raise `permission denied for function` instead of returning zero rows -- a hard
-- error where a silent deny is required. This is the exact failure P4-02 hit with
-- can_manage_document and 202608090006 hit before that with can_read_report_template.
grant execute on function public.can_manage_learning_topic(uuid) to anon, authenticated;

create or replace function public.can_access_learning_topic(p_topic_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  topic record;
  user_org uuid;
begin
  if not public.is_active_user() then return false; end if;

  select * into topic from public.learning_topics where id = p_topic_id;
  if not found then return false; end if;

  -- Administrators of the owning organization see their own content in any state, so they can
  -- review a DRAFT before publishing it.
  if public.can_manage_learning_topic(topic.owner_organization_id) then return true; end if;

  -- Everyone else: published only. DRAFT / CLOSED / ARCHIVED are invisible by construction.
  if topic.status <> 'PUBLISHED' then return false; end if;

  if topic.visibility_level = 'PUBLIC' then return true; end if;
  if topic.visibility_level = 'INTERNAL_YOUTH' then return true; end if;

  if topic.visibility_level = 'ORGANIZATION_ONLY' then
    user_org := public.current_org_id();
    if topic.owner_organization_id is not null and topic.owner_organization_id = user_org then
      return true;
    end if;
    return false;
  end if;

  -- RESTRICTED: scoped admins only (handled above). No per-user grant table exists, matching the
  -- documents posture; anything else falls through to the default deny.
  return false;
end $$;

revoke all on function public.can_access_learning_topic(uuid) from public, anon, authenticated;
grant execute on function public.can_access_learning_topic(uuid) to anon, authenticated;

-- =====================================================================================
-- 4. Replace the visibility-blind read policies
-- =====================================================================================
drop policy if exists "active users read published topics" on public.learning_topics;
drop policy if exists "active users read accessible topics" on public.learning_topics;
create policy "active users read accessible topics" on public.learning_topics
for select using (public.can_access_learning_topic(id));

drop policy if exists "content admins manage learning topics" on public.learning_topics;
create policy "content admins manage learning topics" on public.learning_topics
for all
using (public.can_manage_learning_topic(owner_organization_id))
with check (public.can_manage_learning_topic(owner_organization_id));

-- Resources are gated entirely by their parent topic, so fetching a resource directly by id
-- cannot bypass the topic's visibility.
drop policy if exists "active users read resources" on public.learning_resources;
drop policy if exists "active users read accessible learning resources" on public.learning_resources;
create policy "active users read accessible learning resources" on public.learning_resources
for select using (public.can_access_learning_topic(topic_id));

drop policy if exists "content admins manage learning resources" on public.learning_resources;
create policy "content admins manage learning resources" on public.learning_resources
for all
using (
  exists (
    select 1 from public.learning_topics t
    where t.id = topic_id and public.can_manage_learning_topic(t.owner_organization_id)
  )
)
with check (
  exists (
    select 1 from public.learning_topics t
    where t.id = topic_id and public.can_manage_learning_topic(t.owner_organization_id)
  )
);

-- =====================================================================================
-- 5. Grants -- reads stay open to RLS, writes stay closed and go through RPCs
-- =====================================================================================
-- The initial schema granted SELECT only and no write privileges, which is already the posture we
-- want; this restates it explicitly so a later grant cannot drift unnoticed.
revoke insert, update, delete on table public.learning_topics from anon, authenticated;
revoke insert, update, delete on table public.learning_resources from anon, authenticated;
grant select on table public.learning_topics to anon, authenticated;
grant select on table public.learning_resources to anon, authenticated;

-- =====================================================================================
-- 6. Storage policies for learning-resources-private (bucket had none -> deny-all)
-- =====================================================================================
-- Path contract, mirroring documents so there is one convention:
--     learning-resources-private/{topic_id}/resources/{uuid}-{safe_filename}
drop policy if exists "active users read accessible learning files" on storage.objects;
create policy "active users read accessible learning files" on storage.objects
for select using (
  bucket_id = 'learning-resources-private'
  and public.is_active_user()
  and public.uuid_or_null((string_to_array(name, '/'))[1]) is not null
  and public.can_access_learning_topic(public.uuid_or_null((string_to_array(name, '/'))[1]))
);

drop policy if exists "learning admins upload resource files" on storage.objects;
create policy "learning admins upload resource files" on storage.objects for insert with check (
  bucket_id = 'learning-resources-private'
  and public.is_active_user()
  and (string_to_array(name, '/'))[2] = 'resources'
  and exists (
    select 1 from public.learning_topics t
    where t.id = public.uuid_or_null((string_to_array(name, '/'))[1])
      and public.can_manage_learning_topic(t.owner_organization_id)
  )
);

-- No UPDATE policy: objects are never overwritten in place (same invariant as the report and
-- document buckets). DELETE is compensation only and refuses to remove an object that a resource
-- row still points at, so a cleanup bug cannot destroy live learning material.
drop policy if exists "learning admins clean up unattached resource files" on storage.objects;
create policy "learning admins clean up unattached resource files" on storage.objects for delete using (
  bucket_id = 'learning-resources-private'
  and public.is_active_user()
  and exists (
    select 1 from public.learning_topics t
    where t.id = public.uuid_or_null((string_to_array(name, '/'))[1])
      and public.can_manage_learning_topic(t.owner_organization_id)
  )
  and not exists (
    select 1 from public.learning_resources r
    where r.storage_path = storage.objects.name
  )
);

-- =====================================================================================
-- 7. Indexes
-- =====================================================================================
create index if not exists idx_learning_topics_list
  on public.learning_topics (status, open_at desc nulls last, id desc);
create index if not exists idx_learning_topics_owner_org
  on public.learning_topics (owner_organization_id)
  where owner_organization_id is not null;
create index if not exists idx_learning_resources_topic_order
  on public.learning_resources (topic_id, sort_order, id);

-- =====================================================================================
-- 8. Trusted mutations
-- =====================================================================================
create or replace function public.create_learning_topic_draft(
  p_title text,
  p_description text default null,
  p_objectives text default null,
  p_open_at timestamptz default null,
  p_close_at timestamptz default null,
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

  v_org := coalesce(p_owner_organization_id, public.current_org_id());
  if v_org is null then raise exception 'ORGANIZATION_REQUIRED'; end if;
  if not public.can_manage_learning_topic(v_org) then raise exception 'LEARNING_SCOPE_DENIED'; end if;

  if p_title is null or btrim(p_title) = '' or length(p_title) > 300 then
    raise exception 'INVALID_TOPIC_TITLE';
  end if;
  if p_visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception 'INVALID_TOPIC_WINDOW';
  end if;

  insert into public.learning_topics (
    title, description, objectives, status, open_at, close_at,
    visibility_level, owner_organization_id, created_by, updated_by
  ) values (
    btrim(p_title), p_description, p_objectives, 'DRAFT', p_open_at, p_close_at,
    p_visibility_level, v_org, auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'LEARNING_TOPIC_CREATED', 'learning_topic', v_id, v_org,
    jsonb_build_object('title', btrim(p_title), 'status', 'DRAFT', 'visibility_level', p_visibility_level));

  return v_id;
end;
$$;

revoke all on function public.create_learning_topic_draft(text, text, text, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.create_learning_topic_draft(text, text, text, timestamptz, timestamptz, text, uuid) to authenticated;

create or replace function public.update_learning_topic(
  p_topic_id uuid,
  p_title text default null,
  p_description text default null,
  p_objectives text default null,
  p_open_at timestamptz default null,
  p_close_at timestamptz default null,
  p_visibility_level text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic public.learning_topics%rowtype;
  v_open timestamptz;
  v_close timestamptz;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_topic from public.learning_topics where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_learning_topic(v_topic.owner_organization_id) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;
  if v_topic.status = 'ARCHIVED' then raise exception 'TOPIC_NOT_EDITABLE'; end if;
  if p_visibility_level is not null
    and p_visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;
  if p_title is not null and (btrim(p_title) = '' or length(p_title) > 300) then
    raise exception 'INVALID_TOPIC_TITLE';
  end if;

  v_open := coalesce(p_open_at, v_topic.open_at);
  v_close := coalesce(p_close_at, v_topic.close_at);
  if v_open is not null and v_close is not null and v_close <= v_open then
    raise exception 'INVALID_TOPIC_WINDOW';
  end if;

  update public.learning_topics set
    title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    description = coalesce(p_description, description),
    objectives = coalesce(p_objectives, objectives),
    open_at = v_open,
    close_at = v_close,
    visibility_level = coalesce(p_visibility_level, visibility_level),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_topic_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'LEARNING_TOPIC_UPDATED', 'learning_topic', p_topic_id, v_topic.owner_organization_id,
    jsonb_build_object('title', v_topic.title, 'visibility_level', v_topic.visibility_level),
    jsonb_build_object('title', coalesce(nullif(btrim(coalesce(p_title, '')), ''), v_topic.title),
      'visibility_level', coalesce(p_visibility_level, v_topic.visibility_level)));

  return true;
end;
$$;

revoke all on function public.update_learning_topic(uuid, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.update_learning_topic(uuid, text, text, text, timestamptz, timestamptz, text) to authenticated;

create or replace function public.set_learning_topic_status(p_topic_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic public.learning_topics%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_status not in ('PUBLISHED', 'CLOSED', 'ARCHIVED') then
    raise exception 'INVALID_TOPIC_TRANSITION';
  end if;

  select * into v_topic from public.learning_topics where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_learning_topic(v_topic.owner_organization_id) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;

  -- Explicit transition table. Anything not listed is rejected rather than silently accepted.
  if not (
    (p_status = 'PUBLISHED' and v_topic.status in ('DRAFT', 'CLOSED'))
    or (p_status = 'CLOSED' and v_topic.status = 'PUBLISHED')
    or (p_status = 'ARCHIVED' and v_topic.status in ('DRAFT', 'PUBLISHED', 'CLOSED'))
  ) then
    raise exception 'INVALID_TOPIC_TRANSITION';
  end if;

  if p_status = 'PUBLISHED' and (v_topic.title is null or btrim(v_topic.title) = '') then
    raise exception 'INVALID_TOPIC_TITLE';
  end if;

  update public.learning_topics
  set status = p_status, updated_by = auth.uid(), updated_at = now()
  where id = p_topic_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(),
    case p_status when 'PUBLISHED' then 'LEARNING_TOPIC_PUBLISHED'
                  when 'CLOSED' then 'LEARNING_TOPIC_CLOSED'
                  else 'LEARNING_TOPIC_ARCHIVED' end,
    'learning_topic', p_topic_id, v_topic.owner_organization_id,
    jsonb_build_object('status', v_topic.status), jsonb_build_object('status', p_status));

  return true;
end;
$$;

revoke all on function public.set_learning_topic_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_learning_topic_status(uuid, text) to authenticated;

create or replace function public.upsert_learning_resource(
  p_topic_id uuid,
  p_resource_type text,
  p_title text,
  p_content text default null,
  p_storage_path text default null,
  p_external_url text default null,
  p_sort_order integer default 0,
  p_resource_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic public.learning_topics%rowtype;
  v_id uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_topic from public.learning_topics where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_learning_topic(v_topic.owner_organization_id) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;

  if p_resource_type not in ('TEXT', 'DOCUMENT', 'VIDEO', 'IMAGE', 'LINK') then
    raise exception 'INVALID_RESOURCE_TYPE';
  end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 300 then
    raise exception 'INVALID_RESOURCE_TITLE';
  end if;
  if num_nonnulls(p_content, p_storage_path, p_external_url) < 1 then
    raise exception 'RESOURCE_PAYLOAD_REQUIRED';
  end if;
  -- https only; anything else never reaches the table.
  if p_external_url is not null
    and (p_external_url !~ '^https://[^\s/?#]+[^\s]*$' or length(p_external_url) > 2000) then
    raise exception 'INVALID_EXTERNAL_URL';
  end if;
  if p_storage_path is not null
    and (p_storage_path !~ ('^' || p_topic_id::text || '/resources/[^/\\]+$')
         or p_storage_path ~ '\.\.') then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  if p_sort_order is null or p_sort_order not between 0 and 10000 then
    raise exception 'INVALID_SORT_ORDER';
  end if;

  if p_resource_id is null then
    insert into public.learning_resources (
      topic_id, resource_type, title, content, storage_path, external_url, sort_order, created_by
    ) values (
      p_topic_id, p_resource_type, btrim(p_title), p_content, p_storage_path, p_external_url,
      p_sort_order, auth.uid()
    )
    returning id into v_id;
  else
    update public.learning_resources set
      resource_type = p_resource_type,
      title = btrim(p_title),
      content = p_content,
      storage_path = p_storage_path,
      external_url = p_external_url,
      sort_order = p_sort_order,
      updated_at = now()
    where id = p_resource_id and topic_id = p_topic_id
    returning id into v_id;

    if v_id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(),
    case when p_resource_id is null then 'LEARNING_RESOURCE_CREATED' else 'LEARNING_RESOURCE_UPDATED' end,
    'learning_resource', v_id, v_topic.owner_organization_id,
    jsonb_build_object('topic_id', p_topic_id, 'resource_type', p_resource_type, 'sort_order', p_sort_order));

  return v_id;
end;
$$;

revoke all on function public.upsert_learning_resource(uuid, text, text, text, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.upsert_learning_resource(uuid, text, text, text, text, text, integer, uuid) to authenticated;

create or replace function public.delete_learning_resource(p_resource_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource public.learning_resources%rowtype;
  v_topic public.learning_topics%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into v_resource from public.learning_resources where id = p_resource_id;
  if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;

  select * into v_topic from public.learning_topics where id = v_resource.topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_learning_topic(v_topic.owner_organization_id) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;

  delete from public.learning_resources where id = p_resource_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data)
  values (auth.uid(), 'LEARNING_RESOURCE_DELETED', 'learning_resource', p_resource_id,
    v_topic.owner_organization_id,
    jsonb_build_object('topic_id', v_resource.topic_id, 'resource_type', v_resource.resource_type));

  -- Returned so the caller can remove the now-unreferenced object. The row is deleted first, which
  -- is exactly what makes the object deletable under the cleanup policy above.
  return v_resource.storage_path;
end;
$$;

revoke all on function public.delete_learning_resource(uuid) from public, anon, authenticated;
grant execute on function public.delete_learning_resource(uuid) to authenticated;
