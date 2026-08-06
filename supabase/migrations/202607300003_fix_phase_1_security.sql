-- 1. Recursive scope check
create or replace function public.is_organization_in_scope(scope_org_id uuid, target_org_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive org_tree as (
    select id from public.organizations where id = scope_org_id
    union
    select o.id from public.organizations o
    join org_tree ot on o.parent_id = ot.id
  )
  select exists(select 1 from org_tree where id = target_org_id);
$$;

-- 2. Update has_role_in_scope
create or replace function public.has_role_in_scope(required_role text, target_org_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ 
  select public.is_active_user() and exists(
    select 1 from public.user_roles 
    where user_id = auth.uid() 
      and (role_code = 'SYSTEM_ADMIN' or (role_code = required_role and (scope_organization_id is null or public.is_organization_in_scope(scope_organization_id, target_org_id))))
  ) 
$$;

-- 3. Update documents table
alter table public.documents add column if not exists owner_organization_id uuid references public.organizations(id);

-- Update existing documents to infer owner from created_by just to keep data consistent before we apply the new function
update public.documents d set owner_organization_id = (select organization_id from public.profiles where id = d.created_by) where owner_organization_id is null;

-- 4. Rewrite can_access_document
drop policy if exists "active users read published documents" on public.documents;
drop policy if exists "content admins manage documents" on public.documents;
drop policy if exists "content admins read chunks" on public.document_chunks;
drop policy if exists "content admins manage chunks" on public.document_chunks;
drop function if exists public.match_document_chunks(vector, integer);
drop function if exists public.can_access_document(uuid, uuid);

create or replace function public.can_access_document(doc_id uuid) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  doc record;
  user_org uuid;
begin
  if not public.is_active_user() then return false; end if;
  select * into doc from public.documents where id = doc_id;
  if not found or doc.status != 'PUBLISHED' then return false; end if;
  
  if doc.visibility_level = 'PUBLIC' then return true; end if;
  if doc.visibility_level = 'INTERNAL_YOUTH' then return true; end if;
  
  if doc.visibility_level = 'ORGANIZATION_ONLY' then
    user_org := public.current_org_id();
    -- If user is in the same org
    if doc.owner_organization_id = user_org then return true; end if;
    -- If user is an admin that has scope over the document's owner organization
    if public.has_role_in_scope('YOUTH_ADMIN', doc.owner_organization_id) then return true; end if;
  end if;
  
  if doc.visibility_level = 'RESTRICTED' then
    -- Currently no specific document_targets implemented, so only scoped admins can access
    if public.has_role_in_scope('YOUTH_ADMIN', doc.owner_organization_id) then return true; end if;
  end if;
  
  return false;
end $$;
revoke all on function public.can_access_document(uuid) from public;
grant execute on function public.can_access_document(uuid) to authenticated;

-- Update RLS policies that depended on old can_access_document signature
create policy "active users read published documents" on public.documents for select using (public.can_access_document(id));

create policy "content admins manage documents" on public.documents for all using (public.has_role_in_scope('YOUTH_ADMIN', owner_organization_id) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', owner_organization_id) or public.has_role('SYSTEM_ADMIN'));

create policy "content admins read chunks" on public.document_chunks for select using (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', d.owner_organization_id) or public.has_role('SYSTEM_ADMIN'))));

create policy "content admins manage chunks" on public.document_chunks for all using (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', d.owner_organization_id) or public.has_role('SYSTEM_ADMIN')))) with check (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', d.owner_organization_id) or public.has_role('SYSTEM_ADMIN'))));

create or replace function public.match_document_chunks(query_embedding vector(768), match_count integer default 8)
returns table(chunk_id uuid, document_id uuid, content text, section_path text, page_from integer, page_to integer, similarity float)
language sql stable security definer set search_path=public
as $$
  select c.id, c.document_id, c.content, c.section_path, c.page_from, c.page_to, 1-(c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.review_status='APPROVED' and public.can_access_document(c.document_id)
  order by c.embedding <=> query_embedding limit greatest(1,least(match_count,20));
$$;
revoke all on function public.match_document_chunks(vector,integer) from public;
grant execute on function public.match_document_chunks(vector,integer) to authenticated;

-- 5. Storage RLS for documents-private
insert into storage.buckets (id, name, public) values ('documents-private', 'documents-private', false) on conflict do nothing;

create policy "Users can read chunks they have access to" on storage.objects for select using (
  bucket_id = 'documents-private' and
  public.is_active_user() and
  (
    -- Check access using the first part of the path which should be document UUID
    public.can_access_document( (string_to_array(name, '/'))[1]::uuid )
  )
);
