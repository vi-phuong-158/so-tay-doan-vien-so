-- Phase 2 · P2-06 — Keep the template Storage policy safe for anon evaluation.
--
-- PostgreSQL may evaluate an OR branch of a storage.objects policy before its bucket guard.
-- The old branch read report_assignments as the caller, so an anon lookup of a submission
-- object could raise a table-permission error instead of being denied by RLS.

create or replace function public.can_read_report_template(p_campaign_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and (
      exists (
        select 1
        from public.report_assignments a
        where a.campaign_id = p_campaign_id
          and a.organization_id = public.current_org_id()
      )
      or public.has_role('YOUTH_ADMIN')
      or public.has_role('SYSTEM_ADMIN')
    );
$$;

revoke all on function public.can_read_report_template(uuid) from public;
grant execute on function public.can_read_report_template(uuid) to anon, authenticated;

drop policy if exists "assigned orgs read report templates" on storage.objects;
create policy "assigned orgs read report templates" on storage.objects for select using (
  bucket_id = 'report-templates-private'
  and public.can_read_report_template(public.uuid_or_null((string_to_array(name, '/'))[1]))
);
