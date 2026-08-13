-- P3-04 acceptance: trusted report notification hooks enqueue server-resolved email events.
begin;

select no_plan();

create or replace function p304_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function p304_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select p304_reset_auth();

select has_function('public', 'enqueue_report_email_from_notification', ARRAY[]::text[], 'P3-04 notification email trigger function exists');
select has_column('public', 'email_queue', 'recipient_user_id', 'queue keeps server-resolved recipient identity');
select function_privs_are(
  'public', 'enqueue_report_email_for_user_event',
  ARRAY['text', 'uuid', 'text', 'uuid', 'text', 'jsonb', 'timestamp with time zone', 'integer'],
  'authenticated', ARRAY[]::text[],
  'authenticated cannot enqueue report email events directly'
);

create temp table p304_campaign(id uuid not null);
grant all on table p304_campaign to authenticated;
select p304_set_auth('11112222-3333-4444-5555-666677778888'::uuid);
insert into p304_campaign
select id
from public.create_report_campaign(
  'P3-04 event campaign', 'Event hook fixture', 'Ban Thanh niên',
  now(), now() + interval '7 days', null, false, true, array['pdf'], 20, 1, '{}'::jsonb, 'INTERNAL_YOUTH'
);
select lives_ok(
  $$ select public.publish_report_campaign((select id from p304_campaign), array['22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'authorized publish succeeds and remains the business transaction boundary'
);
select p304_reset_auth();
select is(
  (select count(*)::integer from public.email_queue where template_code = 'REPORT_CAMPAIGN_PUBLISHED' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid),
  1,
  'campaign publish enqueues one event for the server-resolved officer'
);
select is(
  (select recipient_email from public.email_queue where template_code = 'REPORT_CAMPAIGN_PUBLISHED' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid order by created_at desc limit 1),
  'officera@test.local',
  'campaign email recipient email comes from auth.users'
);
select ok(
  (select payload ? 'action_path' and (payload->>'action_path') like '/cong-viec/bao-cao/%' from public.email_queue where template_code = 'REPORT_CAMPAIGN_PUBLISHED' and recipient_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid order by created_at desc limit 1),
  'campaign email has an internal assignment action path'
);

create temp table p304_assignment as
select id from public.report_assignments where campaign_id = (select id from p304_campaign) limit 1;
insert into public.report_submissions(id, assignment_id, version_number, submitted_by, summary, review_note, submitted_at, created_at)
values
  ('30400000-0000-4000-8000-000000000001', (select id from p304_assignment), 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'v1', null, now() - interval '2 hours', now() - interval '2 hours'),
  ('30400000-0000-4000-8000-000000000002', (select id from p304_assignment), 2, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'v2', '<script>alert(1)</script>', now() - interval '1 hour', now() - interval '1 hour');

insert into public.notifications(user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'REPORT_SUBMITTED', 'submitted', null, '/cong-viec/bao-cao/' || (select id from p304_assignment), 'report_assignment', (select id from p304_assignment), 'P304-SUBMITTED-V1'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'REPORT_RESUBMITTED', 'resubmitted', null, '/cong-viec/bao-cao/' || (select id from p304_assignment), 'report_assignment', (select id from p304_assignment), 'P304-RESUBMITTED-V2'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'REPORT_NEEDS_SUPPLEMENT', 'needs supplement', null, '/cong-viec/bao-cao/' || (select id from p304_assignment), 'report_assignment', (select id from p304_assignment), 'P304-SUPPLEMENT-V2'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'REPORT_ACCEPTED', 'accepted', null, '/cong-viec/bao-cao/' || (select id from p304_assignment), 'report_assignment', (select id from p304_assignment), 'P304-ACCEPTED-V2');

select is((select count(*)::integer from public.email_queue where idempotency_key like 'REPORT_SUBMITTED:%'), 1, 'submit v1 creates one email event');
select is((select count(*)::integer from public.email_queue where idempotency_key like 'REPORT_RESUBMITTED:%'), 1, 'resubmit v2 creates a distinct email event');
select is((select count(*)::integer from public.email_queue where idempotency_key like 'REPORT_NEEDS_SUPPLEMENT:%'), 1, 'needs supplement creates one email event');
select is((select count(*)::integer from public.email_queue where idempotency_key like 'REPORT_ACCEPTED:%'), 1, 'accepted creates one email event');
select is((select recipient_user_id from public.email_queue where idempotency_key like 'REPORT_ACCEPTED:%' limit 1), 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'review email recipient is the trusted latest submitter');
select is((select payload->>'version' from public.email_queue where idempotency_key like 'REPORT_RESUBMITTED:%' limit 1), '2', 'resubmit payload carries the latest server version');
select is((select payload->>'review_reason' from public.email_queue where idempotency_key like 'REPORT_NEEDS_SUPPLEMENT:%' limit 1), '<script>alert(1)</script>', 'review reason is bounded at enqueue and escaped later by renderer');

create temp table p304_retry as
select * from public.enqueue_email_for_user_event(
  'REPORT_ACCEPTED', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'report_assignment', (select id from p304_assignment), md5('P304-ACCEPTED-V2'), '{}'::jsonb, now(), 5
);
select is((select created from p304_retry), false, 'retrying the same logical event is idempotent');
select is((select count(*)::integer from public.email_queue where idempotency_key = (select idempotency_key from p304_retry)), 1, 'retry does not create a duplicate queue row');

select p304_set_auth('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select throws_ok(
  $$ insert into public.notifications(user_id, type, title, source_entity_type, source_entity_id, event_key)
     values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'REPORT_ACCEPTED', 'spoof', 'report_assignment', gen_random_uuid(), 'P304-SPOOF') $$,
  'permission denied for table notifications',
  'ordinary client cannot forge a report email event or recipient'
);
select p304_reset_auth();

select throws_ok(
  $$ select * from public.enqueue_email_for_user_event(
    'REPORT_ACCEPTED', '99999999-9999-9999-9999-999999999999'::uuid,
    'report_assignment', (select id from p304_assignment), 'suspended', '{}'::jsonb, now(), 5
  ) $$,
  'RECIPIENT_NOT_FOUND',
  'suspended recipient is rejected by the server resolver'
);

select p304_reset_auth();
select * from finish();
rollback;
