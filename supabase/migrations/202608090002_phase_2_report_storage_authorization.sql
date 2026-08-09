-- Phase 2 · P2-03 — Report storage authorization & organization isolation (forward-only)
-- Source of truth: docs/phase-2/01-report-state-machine.md §8 (storage invariants RPT-F01..F07)
-- and §9 (database access invariants). Remediates audit findings S5, G2, G3, G14.
--
-- Path conventions (spec §9.2); organization isolation is enforced from the path:
--   report-submissions-private/{campaign_id}/{organization_id}/{assignment_id}/v{n}/{uuid}-{safe}
--       -> organization_id is path segment [2]
--   report-templates-private/{campaign_id}/{uuid}-{safe}
--       -> campaign_id is path segment [1]
--
-- storage.objects has RLS enabled by default in Supabase; with no policy the report buckets
-- were fully closed (fail-closed but blocking the intended flows). These policies open the
-- minimum required access with organization isolation. No UPDATE/DELETE policy is granted to
-- end-user roles, so finalized objects cannot be overwritten (RPT-F05). service_role bypasses
-- RLS and remains the trusted path for Edge Functions (submit-report, download-report-bundle).
--
-- This migration does NOT modify submit-report (P2-04) or review-report (P2-05).

-- =====================================================================================
-- 0. Safe path-segment -> uuid helper
-- =====================================================================================
-- A storage object name is untrusted text. Casting an arbitrary path segment directly with
-- ::uuid raises on malformed input, and PostgreSQL does not guarantee that a `bucket_id = '...'`
-- guard is evaluated before the cast. This helper returns NULL instead of raising so policies
-- stay robust regardless of planner ordering or objects living in other buckets.
create or replace function public.uuid_or_null(p_text text) returns uuid
language plpgsql immutable strict
set search_path = public
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end $$;
revoke all on function public.uuid_or_null(text) from public;
grant execute on function public.uuid_or_null(text) to anon, authenticated;

-- =====================================================================================
-- 1. report-submissions-private — organization-isolated private report files
-- =====================================================================================
-- Read: a user may read an object only when the org segment ([2]) is their own organization,
-- or they are a YOUTH_ADMIN whose scope covers that organization, or a SYSTEM_ADMIN.
-- Knowing a path is never sufficient (RPT-F02/F03): the org segment must authorize the caller.
drop policy if exists "read own org submission files" on storage.objects;
create policy "read own org submission files" on storage.objects for select using (
  bucket_id = 'report-submissions-private'
  and public.is_active_user()
  and (
    public.uuid_or_null((string_to_array(name, '/'))[2]) = public.current_org_id()
    or public.has_role_in_scope('YOUTH_ADMIN', public.uuid_or_null((string_to_array(name, '/'))[2]))
    or public.has_role('SYSTEM_ADMIN')
  )
);

-- Upload: only an active BRANCH_OFFICER may upload, and only into a path whose org segment is
-- their own organization. This validates the upload path and blocks cross-organization planting
-- and path traversal (RPT-F03). No overwrite path is granted (no UPDATE policy) -> RPT-F05.
drop policy if exists "branch officers upload own org submissions" on storage.objects;
create policy "branch officers upload own org submissions" on storage.objects for insert with check (
  bucket_id = 'report-submissions-private'
  and public.is_active_user()
  and public.has_role('BRANCH_OFFICER')
  and public.uuid_or_null((string_to_array(name, '/'))[2]) = public.current_org_id()
);

-- =====================================================================================
-- 2. report-templates-private — blank forms distributed to assigned units
-- =====================================================================================
-- Read: units assigned to the campaign (path segment [1]) may read the template; content
-- admins may read any template. Templates are low-sensitivity blank forms.
drop policy if exists "assigned orgs read report templates" on storage.objects;
create policy "assigned orgs read report templates" on storage.objects for select using (
  bucket_id = 'report-templates-private'
  and public.is_active_user()
  and (
    exists (
      select 1 from public.report_assignments a
      where a.campaign_id = public.uuid_or_null((string_to_array(name, '/'))[1])
        and a.organization_id = public.current_org_id()
    )
    or public.has_role('YOUTH_ADMIN')
    or public.has_role('SYSTEM_ADMIN')
  )
);

-- Manage: content admins upload/replace/remove template files.
drop policy if exists "admins manage report templates" on storage.objects;
create policy "admins manage report templates" on storage.objects for all
using (
  bucket_id = 'report-templates-private'
  and (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN'))
)
with check (
  bucket_id = 'report-templates-private'
  and (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN'))
);

-- =====================================================================================
-- 3. Table RLS for template + status-history metadata (G3, G14)
-- =====================================================================================
-- report_campaign_templates: assigned units read their campaign's template metadata; content
-- admins read and manage. RLS was enabled with no policy (fully closed), blocking downloads.
drop policy if exists "read campaign templates" on public.report_campaign_templates;
create policy "read campaign templates" on public.report_campaign_templates for select using (
  public.is_active_user()
  and (
    exists (
      select 1 from public.report_assignments a
      where a.campaign_id = report_campaign_templates.campaign_id
        and a.organization_id = public.current_org_id()
    )
    or public.has_role('YOUTH_ADMIN')
    or public.has_role('SYSTEM_ADMIN')
  )
);

drop policy if exists "admins manage campaign templates" on public.report_campaign_templates;
create policy "admins manage campaign templates" on public.report_campaign_templates for all
using (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN'))
with check (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN'));

-- report_status_history: the owning organization and scoped admins read the transition timeline.
-- Writes stay closed to end users (only the RPC/Edge Function writes history) per P2-02.
drop policy if exists "read status history in scope" on public.report_status_history;
create policy "read status history in scope" on public.report_status_history for select using (
  exists (
    select 1 from public.report_assignments a
    where a.id = report_status_history.assignment_id
      and (
        a.organization_id = public.current_org_id()
        or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id)
        or public.has_role('SYSTEM_ADMIN')
      )
  )
);
