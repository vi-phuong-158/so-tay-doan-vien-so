-- P3-05 acceptance: policy-driven reminders, server recipients and logical exactly-once effects.
begin;

select no_plan();

create or replace function p305_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function p305_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select p305_reset_auth();

select has_table('public', 'report_reminder_events', 'P3-05 logical reminder event table exists');
select has_column('public', 'report_reminder_events', 'logical_key', 'logical reminder key is persisted');
select has_column('public', 'report_reminder_events', 'email_queue_id', 'reminder event relates to email queue');
select has_function('public', 'scan_report_reminders', ARRAY['timestamp with time zone'], 'trusted reminder scan exists');
select function_privs_are(
  'public', 'scan_report_reminders', ARRAY['timestamp with time zone'],
  'authenticated', ARRAY[]::text[], 'authenticated users cannot invoke reminder scan'
);
select function_privs_are(
  'public', 'scan_report_reminders', ARRAY['timestamp with time zone'],
  'anon', ARRAY[]::text[], 'anonymous callers cannot invoke reminder scan'
);
select function_privs_are(
  'public', 'create_report_reminder_event', ARRAY['uuid', 'uuid', 'text', 'integer', 'timestamp with time zone'],
  'authenticated', ARRAY[]::text[], 'authenticated users cannot choose reminder recipients'
);

-- Fixed UTC reference time keeps all due/milestone assertions deterministic.
insert into public.report_campaigns(
  id, title, issuer, open_at, due_at, status, reminder_policy
) values
  (
    '30500000-0000-4000-8000-000000000001', 'P3-05 due override', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-30 00:00:00+00', 'PUBLISHED',
    '{"due_soon_days":[7,3,1],"overdue":true,"needs_supplement":true}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000002', 'P3-05 overdue', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-10 00:00:00+00', 'PUBLISHED',
    '{"due_soon_days":[3],"overdue":true}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000003', 'P3-05 no policy', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-18 00:00:00+00', 'PUBLISHED', '{}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000004', 'P3-05 draft', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-10 00:00:00+00', 'DRAFT',
    '{"overdue":true}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000005', 'P3-05 malformed policy', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-18 00:00:00+00', 'PUBLISHED',
    '{"due_soon_days":["bad",0,999],"overdue":"true"}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000006', 'P3-05 supplement', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-30 00:00:00+00', 'PUBLISHED',
    '{"needs_supplement":true}'::jsonb
  ),
  (
    '30500000-0000-4000-8000-000000000007', 'P3-05 invalid email', 'Ban Thanh niên',
    '2026-08-01 00:00:00+00', '2026-08-10 00:00:00+00', 'DRAFT',
    '{"overdue":true}'::jsonb
  );

insert into public.report_assignments(id, campaign_id, organization_id, status, due_at_override)
values
  ('30510000-0000-4000-8000-000000000001', '30500000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'PENDING', '2026-08-18 00:00:00+00'),
  ('30510000-0000-4000-8000-000000000002', '30500000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  ('30510000-0000-4000-8000-000000000003', '30500000-0000-4000-8000-000000000003', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  ('30510000-0000-4000-8000-000000000004', '30500000-0000-4000-8000-000000000004', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  ('30510000-0000-4000-8000-000000000005', '30500000-0000-4000-8000-000000000005', '22222222-2222-2222-2222-222222222222', 'PENDING', null),
  ('30510000-0000-4000-8000-000000000006', '30500000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'ACCEPTED', null),
  ('30510000-0000-4000-8000-000000000007', '30500000-0000-4000-8000-000000000001', '44444444-4444-4444-4444-444444444444', 'EXEMPTED', null),
  ('30510000-0000-4000-8000-000000000008', '30500000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'CLOSED', null),
  ('30510000-0000-4000-8000-000000000009', '30500000-0000-4000-8000-000000000006', '22222222-2222-2222-2222-222222222222', 'NEEDS_SUPPLEMENT', null),
  ('30510000-0000-4000-8000-000000000010', '30500000-0000-4000-8000-000000000007', '22222222-2222-2222-2222-222222222222', 'PENDING', null);

select results_eq(
  $$ select policy_offset from public.report_reminder_policy_due_offsets('{"due_soon_days":[7,"3",3,"bad",0,366]}'::jsonb) order by policy_offset $$,
  $$ values (3), (7) $$,
  'malformed and unsupported due-soon policy values are ignored fail-safe'
);
select ok(
  public.report_reminder_policy_enabled('{"overdue":true}'::jsonb, 'overdue')
  and not public.report_reminder_policy_enabled('{"overdue":"true"}'::jsonb, 'overdue'),
  'policy flags require boolean JSON values'
);

select * from public.scan_report_reminders('2026-08-11 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_DUE_SOON' and policy_offset = 7),
  1,
  'T-7 creates one due-soon milestone'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000001' and policy_offset = 3),
  0,
  'T-3 is not created before its policy window'
);

select * from public.scan_report_reminders('2026-08-15 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_DUE_SOON' and policy_offset = 3),
  1,
  'due_at_override wins campaign due_at for T-3 eligibility'
);
select is(
  (select payload->>'due_at' from public.email_queue where source_entity_id = '30510000-0000-4000-8000-000000000001' and template_code = 'REPORT_DUE_SOON' limit 1),
  '18/08/2026 00:00',
  'email payload uses the effective override due date'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_DUE_SOON'),
  2,
  'T-7 and T-3 are distinct logical milestones'
);

select * from public.scan_report_reminders('2026-08-15 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000001' and reminder_type = 'REPORT_DUE_SOON'),
  2,
  'repeating the same scan does not duplicate due-soon events'
);
select is(
  (select count(*)::integer from public.notifications where type = 'REPORT_DUE_SOON' and source_entity_id = '30510000-0000-4000-8000-000000000001'),
  2,
  'repeating the same scan does not duplicate notifications'
);
select is(
  (select count(*)::integer from public.email_queue where template_code = 'REPORT_DUE_SOON' and source_entity_id = '30510000-0000-4000-8000-000000000001'),
  2,
  'repeating the same scan does not duplicate email queue rows'
);

select * from public.scan_report_reminders('2026-08-15 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000002' and reminder_type = 'REPORT_OVERDUE'),
  1,
  'past due PENDING assignment creates an OVERDUE reminder'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000009' and reminder_type = 'REPORT_SUPPLEMENT_REMINDER'),
  1,
  'NEEDS_SUPPLEMENT creates its own reminder type'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id in (
    '30510000-0000-4000-8000-000000000003', '30510000-0000-4000-8000-000000000004', '30510000-0000-4000-8000-000000000005'
  )),
  0,
  'no policy, draft campaign and malformed policy create no reminders'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id in (
    '30510000-0000-4000-8000-000000000006', '30510000-0000-4000-8000-000000000007', '30510000-0000-4000-8000-000000000008'
  )),
  0,
  'ACCEPTED, EXEMPTED and CLOSED assignments never receive reminders'
);

select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000002' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  'recipient is resolved to the active branch officer in the assignment organization'
);
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000006' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0,
  'cross-organization officer is not used for another assignment'
);
select is(
  (select action_url from public.notifications where type = 'REPORT_OVERDUE' and source_entity_id = '30510000-0000-4000-8000-000000000002' limit 1),
  '/cong-viec/bao-cao/30510000-0000-4000-8000-000000000002',
  'reminder action URL is the trusted assignment route'
);

-- Add the suspended profile to the role set temporarily; the server-side profile status filter must exclude it.
insert into public.user_roles(user_id, role_code, scope_organization_id)
values ('99999999-9999-9999-9999-999999999999', 'BRANCH_OFFICER', '22222222-2222-2222-2222-222222222222');
update public.report_assignments set status = 'OVERDUE' where id = '30510000-0000-4000-8000-000000000002';
select * from public.scan_report_reminders('2026-08-16 00:00:00+00');
select is(
  (select count(*)::integer from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000002' and recipient_user_id = '99999999-9999-9999-9999-999999999999'),
  0,
  'suspended profile is excluded from recipient fan-out'
);

-- Invalid email remains an in-app reminder but fails the secondary queue path with bounded evidence.
update auth.users set email = 'invalid-email' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
update public.report_campaigns set status = 'PUBLISHED' where id = '30500000-0000-4000-8000-000000000007';
select * from public.scan_report_reminders('2026-08-17 00:00:00+00');
select is(
  (select email_enqueue_status from public.report_reminder_events where assignment_id = '30510000-0000-4000-8000-000000000010' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and reminder_type = 'REPORT_OVERDUE'),
  'SKIPPED',
  'invalid email is recorded as a skipped secondary email'
);
select is(
  (select count(*)::integer from public.email_queue where source_entity_id = '30510000-0000-4000-8000-000000000010' and template_code = 'REPORT_OVERDUE'),
  0,
  'invalid email does not create an email queue row'
);

select p305_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok(
  $$ select * from public.scan_report_reminders('2026-08-18 00:00:00+00') $$,
  'permission denied for function scan_report_reminders',
  'authenticated client cannot invoke reminder scan'
);
select p305_reset_auth();

select * from finish();
rollback;
