-- Phase 2 · P2-05 — Report review authorization & state-machine enforcement (forward-only)
-- Source of truth: docs/phase-2/01-report-state-machine.md §4–§5, §7 (RPT-A03), §10.
-- Remediates audit findings S3 (missing org scope), S4 (no transition guard) and C4 (assignment
-- status and report_submissions.review_status diverging).
--
-- Design mirrors P2-02/P2-04: the business rules live in a SECURITY DEFINER RPC; the Edge Function
-- (review-report) is thin orchestration. Direct PostgREST status writes are closed so every review
-- goes through the state machine.
--
-- Does NOT change create_report_submission (P2-02), create_report_submission_with_files (P2-04) or
-- storage policies (P2-03).

-- =====================================================================================
-- 1. Close the direct status-write path on report_assignments (S4)
-- =====================================================================================
-- Admins could previously UPDATE report_assignments.status straight through PostgREST (RLS
-- "admins manage assignments"), bypassing transition guards, review_status sync, history and audit.
-- Revoke UPDATE from end-user roles: every status change now flows through a controlled RPC
-- (create_report_submission, review_report_assignment, mark_overdue_assignments), all SECURITY
-- DEFINER and therefore unaffected by this revoke. SELECT stays for visibility.
revoke update on table public.report_assignments from authenticated;

-- =====================================================================================
-- 2. review_report_assignment — the only sanctioned review transition
-- =====================================================================================
create or replace function public.review_report_assignment(
  p_assignment_id uuid,
  p_action text,
  p_reason text default null
) returns table(resulting_status text, notified_user_id uuid, campaign_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.report_assignments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_latest public.report_submissions%rowtype;
begin
  -- 1. Authentication + active account
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  -- 2. Valid action
  if p_action not in ('ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED') then raise exception 'INVALID_ACTION'; end if;

  -- 3. Lock assignment (serialize concurrent reviews)
  select * into v_assignment from public.report_assignments where id = p_assignment_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  -- 4. Authorization scope (RPT-A03): YOUTH_ADMIN over the assignment's org, or SYSTEM_ADMIN.
  if not (public.has_role_in_scope('YOUTH_ADMIN', v_assignment.organization_id) or public.has_role('SYSTEM_ADMIN')) then
    raise exception 'ASSIGNMENT_SCOPE_DENIED';
  end if;

  -- 5. Terminal states are closed to further review (D1/D2/D3)
  if v_assignment.status = 'ACCEPTED' then raise exception 'REPORT_ALREADY_ACCEPTED'; end if;
  if v_assignment.status = 'EXEMPTED' then raise exception 'REPORT_EXEMPTED'; end if;
  if v_assignment.status = 'CLOSED'   then raise exception 'REPORT_CLOSED'; end if;

  if p_action = 'EXEMPTED' then
    -- Exemption applies to units that have not submitted (per state machine §4).
    if v_assignment.status not in ('PENDING', 'OVERDUE') then raise exception 'INVALID_REPORT_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    update public.report_assignments
      set status = 'EXEMPTED', exempted_at = now(), exempt_reason = v_reason, updated_at = now()
      where id = p_assignment_id;
  else
    -- ACCEPTED / NEEDS_SUPPLEMENT require a reviewable submission state.
    if v_assignment.status not in ('SUBMITTED', 'RESUBMITTED', 'LATE_SUBMITTED') then raise exception 'INVALID_REPORT_TRANSITION'; end if;
    if p_action = 'NEEDS_SUPPLEMENT' and v_reason is null then raise exception 'REASON_REQUIRED'; end if;

    select * into v_latest from public.report_submissions
      where assignment_id = p_assignment_id order by version_number desc limit 1;
    if not found then raise exception 'INVALID_REPORT_TRANSITION'; end if;

    -- C4: keep the reviewed submission's review_status in sync with the review decision.
    update public.report_submissions
      set review_status = (case when p_action = 'ACCEPTED' then 'ACCEPTED' else 'NEEDS_SUPPLEMENT' end),
          reviewed_by = v_uid, reviewed_at = now(), review_note = v_reason
      where id = v_latest.id;

    update public.report_assignments
      set status = p_action,
          accepted_at = (case when p_action = 'ACCEPTED' then now() else accepted_at end),
          updated_at = now()
      where id = p_assignment_id;

    notified_user_id := v_latest.submitted_by;
  end if;

  -- 6. History + audit in the same transaction (RPT-AU01)
  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  values (p_assignment_id, v_assignment.status, p_action, v_uid, v_reason);

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (v_uid, 'REPORT_REVIEWED', 'report_assignment', p_assignment_id, v_assignment.organization_id,
          jsonb_build_object('status', v_assignment.status),
          jsonb_build_object('status', p_action, 'reason', v_reason));

  resulting_status := p_action;
  campaign_id := v_assignment.campaign_id;
  return next;
end $$;

revoke all on function public.review_report_assignment(uuid, text, text) from public, anon;
grant execute on function public.review_report_assignment(uuid, text, text) to authenticated;
