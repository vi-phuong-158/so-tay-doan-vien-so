-- An anonymous Supabase Auth session uses the `authenticated` database role and receives an
-- INVITED profile for the public NQ_300 quiz. Public documents must remain readable in that
-- session just as they are to the `anon` role. Keep unpublished and non-public documents behind
-- the existing active-user and organization/role checks.
create or replace function public.can_access_document(doc_id uuid) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  doc record;
  user_org uuid;
begin
  select * into doc from public.documents where id = doc_id;
  if not found or doc.status != 'PUBLISHED' then return false; end if;

  -- Public content is public regardless of whether the caller has an active application profile.
  -- This mirrors the dedicated anon SELECT policy for authenticated anonymous quiz guests.
  if doc.visibility_level = 'PUBLIC' then return true; end if;

  if not public.is_active_user() then return false; end if;

  if doc.visibility_level = 'INTERNAL_YOUTH' then return true; end if;

  if doc.visibility_level = 'ORGANIZATION_ONLY' then
    user_org := public.current_org_id();
    if doc.owner_organization_id = user_org then return true; end if;
    if public.has_role_in_scope('YOUTH_ADMIN', doc.owner_organization_id) then return true; end if;
  end if;

  if doc.visibility_level = 'RESTRICTED' then
    -- There are no per-document targets yet, so only scoped admins can access restricted rows.
    if public.has_role_in_scope('YOUTH_ADMIN', doc.owner_organization_id) then return true; end if;
  end if;

  return false;
end;
$$;
