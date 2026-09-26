-- The rehearsal project has explicit default EXECUTE grants for anon and
-- authenticated. Revoke those direct grants as well as PUBLIC: revoking only
-- PUBLIC does not remove a role-specific grant on a SECURITY DEFINER function.
revoke all on function public.member_scope_org_codes(uuid) from public, anon, authenticated;
grant execute on function public.member_scope_org_codes(uuid) to service_role;
