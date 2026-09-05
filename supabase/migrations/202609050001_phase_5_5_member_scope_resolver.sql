-- P5.5-02: server-side helper for the resolve-member-scope Edge Function.
-- Translates a user_roles.scope_organization_id into the list of organizations.code values in that
-- scope (the org itself plus every recursive descendant), reusing the same recursive-tree traversal
-- already proven by is_organization_in_scope() (202607300003_fix_phase_1_security.sql) instead of
-- writing a second one. See docs/phase-5-5/00-member-management-architecture.md muc 6/13.
create or replace function public.member_scope_org_codes(scope_org_id uuid)
returns setof text
language sql stable security definer set search_path = public
as $$
  with recursive org_tree as (
    select id from public.organizations where id = scope_org_id
    union
    select o.id from public.organizations o
    join org_tree ot on o.parent_id = ot.id
  )
  select o.code from public.organizations o join org_tree ot on o.id = ot.id;
$$;

-- Only the Member Scope resolver (via the service-role adminClient) ever calls this — a browser
-- session must never be able to enumerate an arbitrary organization's descendant codes directly.
revoke all on function public.member_scope_org_codes(uuid) from public;
grant execute on function public.member_scope_org_codes(uuid) to service_role;
