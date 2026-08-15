-- Phase 3 / P3-06: cron & overdue automation.
--
-- Two forward-only pieces:
--   1. Harden mark_overdue_assignments(): the PENDING -> OVERDUE transition already existed
--      (202607300002) but wrote no report_status_history / audit_logs row and had no scheduler.
--      This replaces it with the same eligibility rule (unchanged business behaviour) plus a
--      deterministic p_as_of parameter (default now(), so every existing zero-arg call site keeps
--      working) and atomic history/audit writes for every row it actually transitions.
--   2. Install a trusted pg_cron schedule for the two daily jobs the product spec defines
--      (docs/01-product-spec.md §12.1): overdue sweep at 00:05 and reminder scan at 07:00,
--      Asia/Ho_Chi_Minh time. Vietnam (ICT, UTC+7) has no DST, so the UTC-equivalent cron times
--      below are fixed year-round and documented inline. Both jobs call the trusted SECURITY
--      DEFINER RPCs directly, in-database -- no HTTP call, no email provider call, no CRON_SECRET
--      or service-role key in this migration. This keeps the existing send-reminder Edge Function
--      (CRON_SECRET-gated) untouched as a manual/external-trigger fallback; it is not required for
--      the schedule installed here.
--
-- Does NOT touch scan_report_reminders(), the email queue worker, EMAIL_DELIVERY_MODE, or any
-- P3-R1 remediation. Does NOT schedule process-email-queue -- automating live email dispatch is a
-- separate, larger operational decision left to a later phase (see docs/phase-3/06-cron-overdue-automation.md).

-- =====================================================================================
-- 1. mark_overdue_assignments(p_as_of) -- persisted transition with history/audit
-- =====================================================================================
-- Same signature style as scan_report_reminders(p_as_of timestamptz default now()). The old
-- zero-argument overload is dropped first so there is exactly one implementation reachable by a
-- bare mark_overdue_assignments() call -- no ambiguous overload, no orphaned legacy function.
drop function if exists public.mark_overdue_assignments();

create or replace function public.mark_overdue_assignments(p_as_of timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_history_count integer;
  v_audit_count integer;
begin
  if p_as_of is null then raise exception 'AS_OF_REQUIRED'; end if;

  -- Single atomic statement: lock + transition eligible rows, then fan out history/audit from the
  -- exact same row set. Eligibility is unchanged from the original implementation and matches the
  -- state machine's only SYS transition (docs/phase-2/01-report-state-machine.md row "PENDING ->
  -- OVERDUE"): campaign PUBLISHED, assignment still PENDING (every other status -- SUBMITTED,
  -- NEEDS_SUPPLEMENT, RESUBMITTED, ACCEPTED, OVERDUE, LATE_SUBMITTED, CLOSED, EXEMPTED -- is left
  -- untouched), and the effective due date (due_at_override if set, else campaign.due_at) strictly
  -- before p_as_of. The strict ">" matches create_report_submission's is_late boundary, so
  -- due_at == p_as_of is NOT yet overdue. A plain UPDATE ... WHERE is concurrency-safe under
  -- Postgres' default READ COMMITTED semantics: a second concurrent call re-checks status='PENDING'
  -- against the just-committed row and matches zero rows, so retries/overlapping cron ticks can
  -- never double-transition or double-write history.
  with newly_overdue as (
    update public.report_assignments a
    set status = 'OVERDUE', updated_at = now()
    from public.report_campaigns c
    where c.id = a.campaign_id
      and c.status = 'PUBLISHED'
      and a.status = 'PENDING'
      and p_as_of > coalesce(a.due_at_override, c.due_at)
    returning a.id, a.organization_id
  ),
  history_ins as (
    insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
    select id, 'PENDING', 'OVERDUE', null, 'Tự động chuyển quá hạn (cron mark_overdue_assignments)'
    from newly_overdue
    returning 1
  ),
  audit_ins as (
    insert into public.audit_logs(action, entity_type, entity_id, organization_id, before_data, after_data)
    select 'REPORT_MARKED_OVERDUE', 'report_assignment', id, organization_id,
      jsonb_build_object('status', 'PENDING'),
      jsonb_build_object('status', 'OVERDUE', 'source', 'cron', 'as_of', p_as_of)
    from newly_overdue
    returning 1
  )
  select
    (select count(*) from newly_overdue),
    (select count(*) from history_ins),
    (select count(*) from audit_ins)
  into v_count, v_history_count, v_audit_count;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.mark_overdue_assignments(timestamptz) from public, anon, authenticated;
grant execute on function public.mark_overdue_assignments(timestamptz) to service_role, postgres;

-- =====================================================================================
-- 2. Trusted schedule -- pg_cron, in-database, no secrets
-- =====================================================================================
-- 00:05 Asia/Ho_Chi_Minh (UTC+7, no DST) == 17:05 UTC the previous calendar day.
-- 07:00 Asia/Ho_Chi_Minh (UTC+7, no DST) == 00:00 UTC the same calendar day.
create extension if not exists pg_cron;

-- Idempotent registration: unschedule any existing job with the same stable name before
-- rescheduling, so this migration can be applied to a fresh database (supabase db reset) or
-- re-applied without erroring on "job name already used" or creating duplicate jobs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'report_mark_overdue_daily') then
    perform cron.unschedule('report_mark_overdue_daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'report_reminder_scan_daily') then
    perform cron.unschedule('report_reminder_scan_daily');
  end if;
end;
$$;

-- 00:05 ICT daily: sweep PENDING assignments past their effective due date into OVERDUE.
select cron.schedule(
  'report_mark_overdue_daily',
  '5 17 * * *',
  $$ select public.mark_overdue_assignments(); $$
);

-- 07:00 ICT daily: scan for due-soon/overdue/supplement reminders. This only creates
-- notifications and enqueues PENDING email_queue rows (public.scan_report_reminders never calls
-- an email provider); the separate email worker (process-email-queue) still gates every send
-- behind EMAIL_DELIVERY_MODE and is not scheduled by this migration.
select cron.schedule(
  'report_reminder_scan_daily',
  '0 0 * * *',
  $$ select public.scan_report_reminders(); $$
);
