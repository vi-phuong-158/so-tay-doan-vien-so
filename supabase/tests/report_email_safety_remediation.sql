-- P3-R1 acceptance: email delivery safety gate remediation.
-- Covers: source entity persisted directly at enqueue (P2-01), REPORT_SUPPLEMENT_REMINDER
-- keyed per review cycle instead of once per assignment forever (P1-02), and proof that a
-- failed secondary email enqueue never rolls back the report business transaction (P2-04).
-- Delivery-mode (OFF/ALLOWLIST/LIVE) coverage lives in the Deno unit tests for
-- process-email-queue/contract.ts and worker.ts; it has no database surface.
begin;

select no_plan();

create or replace function pr1_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pr1_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select pr1_reset_auth();

-- === P2-01: source entity is stored directly by enqueue_email_for_user_event ===

create temp table pr1_source_test as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'pr1_fixture', 'a0530000-0000-4000-8000-000000000001'::uuid, 'pr1-source-v1',
  '{}'::jsonb, now(), 5
);
select is(
  (select source_entity_type from public.email_queue where id = (select queue_id from pr1_source_test)),
  'pr1_fixture',
  'enqueue_email_for_user_event persists source_entity_type on insert, not via a later UPDATE'
);
select is(
  (select source_entity_id from public.email_queue where id = (select queue_id from pr1_source_test)),
  'a0530000-0000-4000-8000-000000000001'::uuid,
  'enqueue_email_for_user_event persists source_entity_id on insert, not via a later UPDATE'
);

-- === P1-02: REPORT_SUPPLEMENT_REMINDER milestone is keyed by review cycle (submission version) ===

insert into public.report_campaigns(
  id, title, issuer, open_at, due_at, status, reminder_policy
) values (
  'a0500000-0000-4000-8000-000000000001', 'P3-R1 supplement cycle', 'Ban Thanh niên',
  '2026-08-01 00:00:00+00', '2026-08-30 00:00:00+00', 'PUBLISHED',
  '{"needs_supplement": true}'::jsonb
);

insert into public.report_assignments(id, campaign_id, organization_id, status)
values (
  'a0510000-0000-4000-8000-000000000001', 'a0500000-0000-4000-8000-000000000001',
  '22222222-2222-2222-2222-222222222222', 'NEEDS_SUPPLEMENT'
);

insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, submitted_at, created_at)
values (
  'a0520000-0000-4000-8000-000000000001', 'a0510000-0000-4000-8000-000000000001', 1,
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'v1 needs supplement', now() - interval '2 hours', now() - interval '2 hours'
);

select * from public.scan_report_reminders('2026-08-15 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  1,
  'first NEEDS_SUPPLEMENT cycle (v1) creates exactly one reminder'
);
select is(
  (select logical_key from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER' limit 1),
  'REPORT_REMINDER:a0510000-0000-4000-8000-000000000001:cccccccc-cccc-cccc-cccc-cccccccccccc:REPORT_SUPPLEMENT_REMINDER:NEEDS_SUPPLEMENT:v1',
  'v1 milestone key is scoped to submission version 1'
);
select is(
  (select count(*)::integer from public.email_queue
    where template_code = 'REPORT_SUPPLEMENT_REMINDER' and source_entity_type = 'report_assignment'
      and source_entity_id = 'a0510000-0000-4000-8000-000000000001'),
  1,
  'reminder email queue row carries the assignment as its source entity (P2-01 fix applies to P3-05 events too)'
);

select * from public.scan_report_reminders('2026-08-16 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  1,
  'rescanning the same v1 cycle does not duplicate the reminder'
);
select is(
  (select count(*)::integer from public.notifications
    where type = 'REPORT_SUPPLEMENT_REMINDER' and source_entity_id = 'a0510000-0000-4000-8000-000000000001'),
  1,
  'rescanning the same v1 cycle does not duplicate the notification'
);
select is(
  (select count(*)::integer from public.email_queue
    where template_code = 'REPORT_SUPPLEMENT_REMINDER' and source_entity_id = 'a0510000-0000-4000-8000-000000000001'),
  1,
  'rescanning the same v1 cycle does not duplicate the email queue row'
);

-- Snapshot the fully-settled v1 cycle (after its own rescan) before the v2 cycle begins, so the
-- "untouched by v2" assertions below compare against the right baseline. All rows in this test
-- share one transaction-frozen now(), so identify v1 by its own primary key, never by created_at
-- ordering.
create temp table pr1_v1_event_before as
select id, scan_count, notification_id, email_queue_id
from public.report_reminder_events
where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER';

-- Resubmission: a new version is reviewed and needs supplement again. The assignment stays
-- NEEDS_SUPPLEMENT (as review_report_assignment leaves it), but a new submission version exists.
insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, submitted_at, created_at)
values (
  'a0520000-0000-4000-8000-000000000002', 'a0510000-0000-4000-8000-000000000001', 2,
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'v2 needs supplement again', now() - interval '1 hour', now() - interval '1 hour'
);

select * from public.scan_report_reminders('2026-08-17 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  2,
  'a second NEEDS_SUPPLEMENT cycle (v2) creates a second, distinct reminder'
);
select is(
  (select logical_key from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'
      and id <> (select id from pr1_v1_event_before)),
  'REPORT_REMINDER:a0510000-0000-4000-8000-000000000001:cccccccc-cccc-cccc-cccc-cccccccccccc:REPORT_SUPPLEMENT_REMINDER:NEEDS_SUPPLEMENT:v2',
  'v2 milestone key is scoped to submission version 2, distinct from v1'
);
select is(
  (select scan_count from public.report_reminder_events where id = (select id from pr1_v1_event_before)),
  (select scan_count from pr1_v1_event_before),
  'the historical v1 reminder event scan_count is untouched by the v2 cycle'
);
select is(
  (select notification_id from public.report_reminder_events where id = (select id from pr1_v1_event_before)),
  (select notification_id from pr1_v1_event_before),
  'the historical v1 reminder event notification_id is untouched by the v2 cycle'
);
select is(
  (select email_queue_id from public.report_reminder_events where id = (select id from pr1_v1_event_before)),
  (select email_queue_id from pr1_v1_event_before),
  'the historical v1 reminder event email_queue_id is untouched by the v2 cycle'
);

select * from public.scan_report_reminders('2026-08-18 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
    where assignment_id = 'a0510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  2,
  'rescanning after the v2 cycle does not duplicate either reminder'
);
select is(
  (select count(*)::integer from public.notifications
    where type = 'REPORT_SUPPLEMENT_REMINDER' and source_entity_id = 'a0510000-0000-4000-8000-000000000001'),
  2,
  'exactly two supplement notifications exist across both cycles, never more'
);

-- === P2-04: a failed secondary email enqueue must not roll back the report business transaction ===
-- Exercised through the real review_report_assignment RPC (not a direct notifications insert):
-- the recipient is a suspended profile, so the trusted email resolver inside the P3-04 trigger
-- raises RECIPIENT_NOT_FOUND. That exception must stay contained inside the trigger's own
-- exception block and never propagate out of review_report_assignment's transaction.

insert into public.report_campaigns(id, title, issuer, open_at, due_at, status)
values (
  'a0500000-0000-4000-8000-000000000002', 'P3-R1 email failure isolation', 'Ban Thanh niên',
  '2026-08-01 00:00:00+00', '2026-08-30 00:00:00+00', 'PUBLISHED'
);
insert into public.report_assignments(id, campaign_id, organization_id, status)
values (
  'a0510000-0000-4000-8000-000000000002', 'a0500000-0000-4000-8000-000000000002',
  '22222222-2222-2222-2222-222222222222', 'SUBMITTED'
);
insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, submitted_at, created_at)
values (
  'a0520000-0000-4000-8000-000000000003', 'a0510000-0000-4000-8000-000000000002', 1,
  '99999999-9999-9999-9999-999999999999', 'submitted by a since-suspended member', now() - interval '3 hours', now() - interval '3 hours'
);

select pr1_set_auth('11112222-3333-4444-5555-666677778888'::uuid);
select lives_ok(
  $$ select * from public.review_report_assignment('a0510000-0000-4000-8000-000000000002'::uuid, 'ACCEPTED', null) $$,
  'reviewing a report whose submitter has an unresolvable recipient still commits successfully'
);
select pr1_reset_auth();

select is(
  (select status from public.report_assignments where id = 'a0510000-0000-4000-8000-000000000002'),
  'ACCEPTED',
  'the assignment status transition committed despite the downstream email failure'
);
select is(
  (select review_status from public.report_submissions where id = 'a0520000-0000-4000-8000-000000000003'),
  'ACCEPTED',
  'the submission review transition committed despite the downstream email failure'
);
select is(
  (select count(*)::integer from public.report_status_history
    where assignment_id = 'a0510000-0000-4000-8000-000000000002' and to_status = 'ACCEPTED'),
  1,
  'the status history row committed despite the downstream email failure'
);
select is(
  (select count(*)::integer from public.notifications
    where type = 'REPORT_ACCEPTED' and source_entity_id = 'a0510000-0000-4000-8000-000000000002'
      and user_id = '99999999-9999-9999-9999-999999999999'),
  1,
  'the mandatory in-app notification still committed even though its email could not be resolved'
);
select is(
  (select count(*)::integer from public.email_queue
    where template_code = 'REPORT_ACCEPTED' and source_entity_id = 'a0510000-0000-4000-8000-000000000002'),
  0,
  'no email queue row was created for the unresolvable recipient'
);
select is(
  (select after_data->>'reason_code' from public.audit_logs
    where action = 'REPORT_EMAIL_ENQUEUE_SKIPPED' and entity_id = 'a0510000-0000-4000-8000-000000000002'
    order by created_at desc limit 1),
  'P0001',
  'the enqueue failure is captured as bounded, observable audit evidence'
);

select * from finish();
rollback;
