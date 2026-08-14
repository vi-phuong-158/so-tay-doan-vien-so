-- P3-06 acceptance: persisted OVERDUE transition, history/audit, idempotency, concurrency-safety
-- reasoning, trusted pg_cron schedule, and reminder-cron regression (P3-05/P3-R1 untouched).
begin;

select no_plan();

create or replace function p306_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function p306_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select p306_reset_auth();

-- =====================================================================================
-- Function surface and security boundary
-- =====================================================================================
select has_function('public', 'mark_overdue_assignments', ARRAY['timestamp with time zone'], 'P3-06 mark_overdue_assignments(p_as_of) exists');
select function_privs_are(
  'public', 'mark_overdue_assignments', ARRAY['timestamp with time zone'],
  'authenticated', ARRAY[]::text[], 'authenticated users cannot invoke mark_overdue_assignments'
);
select function_privs_are(
  'public', 'mark_overdue_assignments', ARRAY['timestamp with time zone'],
  'anon', ARRAY[]::text[], 'anonymous callers cannot invoke mark_overdue_assignments'
);
select function_privs_are(
  'public', 'mark_overdue_assignments', ARRAY['timestamp with time zone'],
  'service_role', ARRAY['EXECUTE'], 'service_role (trusted worker/scheduler) can invoke mark_overdue_assignments'
);

-- =====================================================================================
-- Trusted schedule: pg_cron jobs installed by the migration, correct UTC-converted times,
-- no HTTP/provider call in either job body.
-- =====================================================================================
select is(
  (select schedule from cron.job where jobname = 'report_mark_overdue_daily'),
  '5 17 * * *',
  '00:05 Asia/Ho_Chi_Minh converts to 17:05 UTC (no DST) for the overdue sweep job'
);
select is(
  (select active from cron.job where jobname = 'report_mark_overdue_daily'),
  true,
  'overdue sweep cron job is active'
);
select is(
  (select schedule from cron.job where jobname = 'report_reminder_scan_daily'),
  '0 0 * * *',
  '07:00 Asia/Ho_Chi_Minh converts to 00:00 UTC (no DST) for the reminder scan job'
);
select is(
  (select active from cron.job where jobname = 'report_reminder_scan_daily'),
  true,
  'reminder scan cron job is active'
);
select ok(
  (select command from cron.job where jobname = 'report_mark_overdue_daily') !~* 'http|net\.|provider',
  'overdue cron job body calls the DB function directly, never an HTTP/provider path'
);
select ok(
  (select command from cron.job where jobname = 'report_reminder_scan_daily') !~* 'http|net\.|provider',
  'reminder cron job body calls the DB function directly, never an HTTP/provider path'
);

-- =====================================================================================
-- Fixtures. Fixed literal timestamps keep every assertion deterministic (no wall-clock race).
-- =====================================================================================
insert into public.report_campaigns(id, title, issuer, open_at, due_at, status, reminder_policy) values
  ('06c00000-0000-4000-8000-00000000000a', 'P3-06 base (past due)', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-03-10 00:00:00+00', 'PUBLISHED', '{"overdue":true}'::jsonb),
  ('06c00000-0000-4000-8000-00000000000b', 'P3-06 future due', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-06-01 00:00:00+00', 'PUBLISHED', '{}'::jsonb),
  ('06c00000-0000-4000-8000-00000000000c', 'P3-06 boundary', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-03-15 00:00:00+00', 'PUBLISHED', '{}'::jsonb),
  ('06c00000-0000-4000-8000-00000000000d', 'P3-06 override future wins', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-03-10 00:00:00+00', 'PUBLISHED', '{}'::jsonb),
  ('06c00000-0000-4000-8000-00000000000e', 'P3-06 override past wins', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-06-01 00:00:00+00', 'PUBLISHED', '{}'::jsonb),
  ('06c00000-0000-4000-8000-00000000000f', 'P3-06 draft not published', 'Ban Thanh niên',
    '2027-01-01 00:00:00+00', '2027-03-10 00:00:00+00', 'DRAFT', '{}'::jsonb);

insert into public.report_assignments(id, campaign_id, organization_id, status, due_at_override) values
  -- A: basic overdue candidate
  ('06a00000-0000-4000-8000-000000000001', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  -- J: second org, same campaign, also overdue-eligible
  ('06a00000-0000-4000-8000-000000000002', '06c00000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'PENDING', null),
  -- B: not yet due
  ('06a00000-0000-4000-8000-000000000003', '06c00000-0000-4000-8000-00000000000b', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  -- C: boundary (due_at == as_of tested separately below)
  ('06a00000-0000-4000-8000-000000000004', '06c00000-0000-4000-8000-00000000000c', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  -- D: campaign due already past, but per-assignment override is still in the future
  ('06a00000-0000-4000-8000-000000000005', '06c00000-0000-4000-8000-00000000000d', '22222222-2222-2222-2222-222222222222', 'PENDING', '2027-04-01 00:00:00+00'),
  -- E: campaign due still in the future, but per-assignment override has already passed
  ('06a00000-0000-4000-8000-000000000006', '06c00000-0000-4000-8000-00000000000e', '22222222-2222-2222-2222-222222222222', 'PENDING', '2027-03-10 00:00:00+00'),
  -- Terminal / non-eligible statuses on the same past-due campaign: must never transition
  ('06a00000-0000-4000-8000-000000000007', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'SUBMITTED', null),
  ('06a00000-0000-4000-8000-000000000008', '06c00000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'ACCEPTED', null),
  ('06a00000-0000-4000-8000-000000000009', '06c00000-0000-4000-8000-00000000000a', '44444444-4444-4444-4444-444444444444', 'EXEMPTED', null),
  ('06a0000a-0000-4000-8000-00000000000a', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'CLOSED', null),
  ('06a0000b-0000-4000-8000-00000000000b', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'NEEDS_SUPPLEMENT', null),
  ('06a0000c-0000-4000-8000-00000000000c', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'RESUBMITTED', null),
  ('06a0000d-0000-4000-8000-00000000000d', '06c00000-0000-4000-8000-00000000000a', '22222222-2222-2222-2222-222222222222', 'LATE_SUBMITTED', null),
  -- F: DRAFT campaign, past due, PENDING: must stay untouched (campaign never PUBLISHED)
  ('06a0000e-0000-4000-8000-00000000000e', '06c00000-0000-4000-8000-00000000000f', '22222222-2222-2222-2222-222222222222', 'PENDING', null);

-- =====================================================================================
-- A/D/E/F/G/H/J -- one batch sweep at a fixed as_of covers the exclusion matrix in one call.
-- =====================================================================================
select is(
  public.mark_overdue_assignments('2027-03-11 00:00:00+00'),
  3,
  'sweep transitions exactly the 3 eligible PENDING+PUBLISHED+past-due assignments (basic, second org, override-past-wins)'
);

select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000001'),
  'OVERDUE', 'A: basic PENDING past due becomes OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000002'),
  'OVERDUE', 'J: second organization on the same campaign also becomes OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000003'),
  'PENDING', 'B: not-yet-due assignment stays PENDING'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000005'),
  'PENDING', 'D: due_at_override in the future wins over an already-past campaign due_at'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000006'),
  'OVERDUE', 'E: due_at_override in the past wins over an still-future campaign due_at'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000007'),
  'SUBMITTED', 'SUBMITTED assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000008'),
  'ACCEPTED', 'ACCEPTED (terminal) assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000009'),
  'EXEMPTED', 'EXEMPTED (terminal) assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a0000a-0000-4000-8000-00000000000a'),
  'CLOSED', 'CLOSED (terminal) assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a0000b-0000-4000-8000-00000000000b'),
  'NEEDS_SUPPLEMENT', 'NEEDS_SUPPLEMENT assignment past due is never marked OVERDUE (its own reminder cycle owns this state)'
);
select is(
  (select status from public.report_assignments where id = '06a0000c-0000-4000-8000-00000000000c'),
  'RESUBMITTED', 'RESUBMITTED (awaiting review) assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a0000d-0000-4000-8000-00000000000d'),
  'LATE_SUBMITTED', 'LATE_SUBMITTED (awaiting review) assignment past due is never marked OVERDUE'
);
select is(
  (select status from public.report_assignments where id = '06a0000e-0000-4000-8000-00000000000e'),
  'PENDING', 'PENDING assignment under a DRAFT (unpublished) campaign is never marked OVERDUE'
);

-- History/audit: exactly one row per actually-transitioned assignment, system actor (null), and
-- no history/audit noise for the untouched assignments above.
select is(
  (select count(*)::integer from public.report_status_history
   where assignment_id = '06a00000-0000-4000-8000-000000000001' and from_status = 'PENDING' and to_status = 'OVERDUE'),
  1, 'exactly one PENDING->OVERDUE history row for the transitioned assignment'
);
select is(
  (select changed_by from public.report_status_history
   where assignment_id = '06a00000-0000-4000-8000-000000000001' and to_status = 'OVERDUE'),
  null, 'overdue history row uses a null (system) actor, never a fabricated user'
);
select is(
  (select count(*)::integer from public.audit_logs
   where entity_type = 'report_assignment' and entity_id = '06a00000-0000-4000-8000-000000000001' and action = 'REPORT_MARKED_OVERDUE'),
  1, 'exactly one REPORT_MARKED_OVERDUE audit row for the transitioned assignment'
);
select is(
  (select actor_user_id from public.audit_logs
   where entity_id = '06a00000-0000-4000-8000-000000000001' and action = 'REPORT_MARKED_OVERDUE'),
  null, 'overdue audit row uses a null (system) actor, never a fabricated user'
);
select is(
  (select count(*)::integer from public.report_status_history where assignment_id = '06a0000b-0000-4000-8000-00000000000b'),
  0, 'NEEDS_SUPPLEMENT assignment gets no history row from the overdue sweep'
);

-- =====================================================================================
-- I / O -- idempotent retry: repeating the exact same sweep does not re-transition or duplicate
-- history/audit. This also stands in for the concurrency guarantee documented in the migration:
-- two overlapping cron ticks each run this same UPDATE ... WHERE status='PENDING' statement, and
-- Postgres re-checks that predicate against the just-committed row before applying a second
-- transition, so only the first writer ever matches a given row.
-- =====================================================================================
select is(
  public.mark_overdue_assignments('2027-03-11 00:00:00+00'),
  0, 'retrying the same sweep at the same as_of transitions zero additional rows'
);
select is(
  public.mark_overdue_assignments('2027-03-12 00:00:00+00'),
  0, 'retrying later against already-OVERDUE rows is still a no-op (no re-transition out of OVERDUE)'
);
select is(
  (select count(*)::integer from public.report_status_history
   where assignment_id = '06a00000-0000-4000-8000-000000000001' and to_status = 'OVERDUE'),
  1, 'repeat sweeps never duplicate the OVERDUE history row'
);
select is(
  (select count(*)::integer from public.audit_logs
   where entity_id = '06a00000-0000-4000-8000-000000000001' and action = 'REPORT_MARKED_OVERDUE'),
  1, 'repeat sweeps never duplicate the OVERDUE audit row'
);

-- =====================================================================================
-- C -- exact boundary semantics: due_at == as_of is NOT yet overdue (strict ">" matches
-- create_report_submission's is_late boundary); due_at < as_of by any margin is overdue.
-- =====================================================================================
select is(
  public.mark_overdue_assignments('2027-03-15 00:00:00+00'),
  0, 'due_at == as_of transitions nothing (boundary is exclusive)'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000004'),
  'PENDING', 'boundary assignment stays PENDING exactly at due_at'
);
select is(
  public.mark_overdue_assignments('2027-03-15 00:00:00.000001+00'),
  1, 'due_at < as_of by one microsecond is enough to become overdue'
);
select is(
  (select status from public.report_assignments where id = '06a00000-0000-4000-8000-000000000004'),
  'OVERDUE', 'boundary assignment becomes OVERDUE just past due_at'
);

-- Default parameter still works for the pre-existing zero-argument call shape (used by the cron job).
select is(
  public.mark_overdue_assignments(),
  0, 'zero-argument call (default p_as_of = now()) still works and finds nothing left to transition among these fixtures'
);

-- =====================================================================================
-- Reminder-cron regression: P3-05 scan + P3-R1 supplement milestone/versioning/email-safety
-- must be untouched by P3-06. Reuses the org/user fixtures from seed.sql (Officer A =
-- cccccccc..., org CDA = 22222222...).
-- =====================================================================================
select p306_reset_auth();

-- K: the newly-OVERDUE assignment from the sweep above is immediately reminder-eligible, and a
-- repeated scan at the same as_of does not duplicate the OVERDUE reminder.
select * from public.scan_report_reminders('2027-03-11 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
   where assignment_id = '06a00000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_OVERDUE'),
  1, 'K: cron-marked OVERDUE assignment produces exactly one overdue reminder event'
);
select * from public.scan_report_reminders('2027-03-11 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
   where assignment_id = '06a00000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_OVERDUE'),
  1, 'K: rescanning the same cycle does not duplicate the overdue reminder event'
);

-- L: NEEDS_SUPPLEMENT reminder milestones stay keyed by submission version across a resubmit
-- cycle; direct-insert submission fixtures mirror report_reminder_engine.sql's approach.
update public.report_campaigns set reminder_policy = '{"needs_supplement":true}'::jsonb
where id = '06c00000-0000-4000-8000-00000000000a';
insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, submitted_at, created_at)
values ('06a0000b-0000-4000-8000-000000000901', '06a0000b-0000-4000-8000-00000000000b', 1,
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'P3-06 supplement v1', '2027-03-11 00:00:00+00', '2027-03-11 00:00:00+00');
select * from public.scan_report_reminders('2027-03-11 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
   where assignment_id = '06a0000b-0000-4000-8000-00000000000b' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  1, 'L: v1 supplement reminder created'
);
insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, submitted_at, created_at)
values ('06a0000b-0000-4000-8000-000000000902', '06a0000b-0000-4000-8000-00000000000b', 2,
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'P3-06 supplement v2', '2027-03-12 00:00:00+00', '2027-03-12 00:00:00+00');
select * from public.scan_report_reminders('2027-03-12 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events
   where assignment_id = '06a0000b-0000-4000-8000-00000000000b' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  2, 'L: resubmission opens a new v2 supplement reminder milestone, v1 milestone untouched'
);
select is(
  (select count(*)::integer from public.report_reminder_events
   where assignment_id = '06a0000b-0000-4000-8000-00000000000b' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'
     and logical_key like '%NEEDS_SUPPLEMENT:v2'),
  1, 'L: the new milestone is keyed by the latest (v2) submission version, matching P3-R1'
);

-- M: cron never bypasses the email delivery safety gate -- every row the reminder scan enqueues
-- stays PENDING in the database layer; only the separately-gated worker (EMAIL_DELIVERY_MODE)
-- may ever move it to SENT, and it is not invoked by any function under test here.
select is(
  (select count(*)::integer from public.email_queue
   where source_entity_id in ('06a00000-0000-4000-8000-000000000001', '06a0000b-0000-4000-8000-00000000000b')
     and status <> 'PENDING'),
  0, 'M: cron-enqueued reminder emails are never anything other than PENDING -- no send bypass'
);

-- N: source entity identity persists on the enqueued row (P3-R1 fix), unaffected by P3-06.
select is(
  (select source_entity_type from public.email_queue where source_entity_id = '06a00000-0000-4000-8000-000000000001' and template_code = 'REPORT_OVERDUE' limit 1),
  'report_assignment', 'N: source_entity_type is persisted on the reminder email row'
);
select is(
  (select source_entity_id from public.email_queue where source_entity_id = '06a00000-0000-4000-8000-000000000001' and template_code = 'REPORT_OVERDUE' limit 1),
  '06a00000-0000-4000-8000-000000000001'::uuid, 'N: source_entity_id points back to the correct assignment'
);

-- Cross-check the authenticated/anon security boundary is unchanged for the reminder scan too.
select p306_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok(
  $$ select public.mark_overdue_assignments('2027-03-11 00:00:00+00') $$,
  'permission denied for function mark_overdue_assignments',
  'authenticated client cannot invoke mark_overdue_assignments'
);
select p306_reset_auth();

select * from finish();
rollback;
