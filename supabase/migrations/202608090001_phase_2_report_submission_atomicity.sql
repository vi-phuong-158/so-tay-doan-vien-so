-- Phase 2 · P2-02 — Report submission atomicity & RPC hardening (forward-only)
-- Source of truth: docs/phase-2/01-report-state-machine.md (decisions D1–D5 authoritative).
--
-- Goals:
--   S1/C3  Close the direct-INSERT bypass on report_submissions; submissions may ONLY be
--          created through the controlled SECURITY DEFINER RPC create_report_submission().
--   C1/D4  is_late (a submission column) is the source of truth for lateness. A resubmission
--          after a NEEDS_SUPPLEMENT request keeps the workflow label RESUBMITTED and is NOT
--          overwritten to LATE_SUBMITTED.
--   D5     close_at is a hard stop: past close_at no submission is accepted regardless of
--          allow_late_submission.
--   D1/D2/D3 ACCEPTED / EXEMPTED / CLOSED assignment states are terminal for submission.
--
-- This migration does NOT touch Storage policies (P2-03), submit-report (P2-04) or
-- review-report (P2-05). It is safe to run forward from the current baseline and does not
-- delete data or historical enum/check values.

-- =====================================================================================
-- 1. Remove the direct-insert path (S1 / C3)
-- =====================================================================================
-- The RLS INSERT policy allowed a BRANCH_OFFICER to INSERT a submission straight through
-- PostgREST, bypassing atomic version allocation and all lifecycle/time checks.
drop policy if exists "branch officers insert own submissions" on public.report_submissions;

-- Remove table-level write privileges from end-user roles. The RPC runs as its owner
-- (SECURITY DEFINER) and does not rely on these grants; the submit-report Edge Function
-- writes files via service_role. SELECT is kept so organizations can still read their own
-- submissions per the existing "organization reads own submissions" policy.
revoke insert, update on table public.report_submissions from authenticated;

-- Defense-in-depth immutability (RPT-V03/V04): finalized submission files and status history
-- are written only by trusted backend paths (service_role / SECURITY DEFINER RPC), never
-- directly by end-user roles. These grants were already dead (no permissive RLS policy for
-- write), so revoking them is a no-op functionally and hardens intent.
revoke insert, update, delete on table public.report_submission_files from authenticated;
revoke insert on table public.report_status_history from authenticated;

-- =====================================================================================
-- 2. Hardened create_report_submission RPC (single source of truth for submissions)
-- =====================================================================================
-- Same signature as the baseline (202607300002) so callers/grants stay compatible.
create or replace function public.create_report_submission(
  p_assignment_id uuid,
  p_summary text default null,
  p_submit_note text default null
) returns table(submission_id uuid, version_number integer, resulting_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_effective_due timestamptz;
  v_is_late boolean;
  v_version integer;
  v_status text;
begin
  -- 1. Authentication
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  -- 2. Account must be ACTIVE (fail-closed for SUSPENDED/ARCHIVED/INVITED)
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  -- 3. Only BRANCH_OFFICER may submit reports
  if not public.has_role('BRANCH_OFFICER') then raise exception 'REPORT_ROLE_DENIED'; end if;
  v_org := public.current_org_id();

  -- 4. Load assignment and LOCK the row. The FOR UPDATE lock serializes concurrent
  --    submissions for the same assignment so version allocation is atomic (RPT-V06).
  select * into v_assignment from public.report_assignments where id = p_assignment_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  -- 5. Organization isolation (RPT-A01): the officer's org must own the assignment
  if v_assignment.organization_id is distinct from v_org then raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;

  -- 6. Terminal assignment states are closed to new submissions (D1/D2/D3)
  if v_assignment.status = 'ACCEPTED' then raise exception 'REPORT_ALREADY_ACCEPTED'; end if;
  if v_assignment.status = 'EXEMPTED' then raise exception 'REPORT_EXEMPTED'; end if;
  if v_assignment.status = 'CLOSED'   then raise exception 'REPORT_CLOSED'; end if;

  -- 7. Campaign lifecycle: only PUBLISHED accepts submissions
  select * into v_campaign from public.report_campaigns where id = v_assignment.campaign_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if v_campaign.status = 'DRAFT' then raise exception 'REPORT_NOT_OPEN'; end if;
  if v_campaign.status in ('CLOSED','ARCHIVED') then raise exception 'REPORT_CLOSED'; end if;

  -- 8. Server-side time rules (database now(), never a browser clock)
  v_effective_due := coalesce(v_assignment.due_at_override, v_campaign.due_at);

  -- 8a. Before open
  if now() < v_campaign.open_at then raise exception 'REPORT_NOT_OPEN'; end if;

  -- 8b. Hard close (D5): close_at is absolute, independent of allow_late_submission
  if v_campaign.close_at is not null and now() > v_campaign.close_at then raise exception 'REPORT_CLOSED'; end if;

  -- 8c. Late window
  v_is_late := now() > v_effective_due;
  if v_is_late and not v_campaign.allow_late_submission then raise exception 'LATE_SUBMISSION_NOT_ALLOWED'; end if;

  -- 9. Atomic version allocation under the row lock taken in step 4
  select coalesce(max(s.version_number), 0) + 1 into v_version
  from public.report_submissions s where s.assignment_id = p_assignment_id;

  -- 10. Resubmission policy. A NEEDS_SUPPLEMENT request always permits a resubmit even when
  --     allow_resubmission = false (admin-requested); voluntary resubmits require the flag.
  if v_version > 1 and not (v_campaign.allow_resubmission or v_assignment.status = 'NEEDS_SUPPLEMENT') then
    raise exception 'RESUBMISSION_NOT_ALLOWED';
  end if;

  -- 11. Resulting assignment workflow label. is_late is captured on the submission itself, so a
  --     resubmission is never demoted to LATE_SUBMITTED (C1 fix). Only the FIRST submission may
  --     become LATE_SUBMITTED (initial late from PENDING/OVERDUE).
  v_status := case
                when v_version = 1 then (case when v_is_late then 'LATE_SUBMITTED' else 'SUBMITTED' end)
                else 'RESUBMITTED'
              end;

  -- 12. Create the immutable submission version
  insert into public.report_submissions(assignment_id, version_number, submitted_by, summary, submit_note, is_late)
  values (p_assignment_id, v_version, v_uid, nullif(trim(p_summary), ''), nullif(trim(p_submit_note), ''), v_is_late)
  returning id into submission_id;

  -- 13. Advance the assignment, append history and audit in the same transaction (RPT-AU01)
  update public.report_assignments set status = v_status, updated_at = now() where id = p_assignment_id;

  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  values (p_assignment_id, v_assignment.status, v_status, v_uid, 'Nộp báo cáo phiên bản ' || v_version);

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (v_uid, 'REPORT_SUBMITTED', 'report_submission', submission_id, v_assignment.organization_id,
          jsonb_build_object('version', v_version, 'status', v_status, 'is_late', v_is_late));

  version_number := v_version;
  resulting_status := v_status;
  return next;
end $$;

-- Least-privilege execute grants: SECURITY DEFINER function self-checks the caller.
revoke all on function public.create_report_submission(uuid, text, text) from public, anon;
grant execute on function public.create_report_submission(uuid, text, text) to authenticated;
