-- Phase 3 · P3-01 acceptance — notification ownership, trusted writes and read state.
begin;

select no_plan();

create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_auth();

select has_table('public', 'notifications', 'P3-01 notification table exists');
select has_column('public', 'notifications', 'source_entity_type', 'notification source type exists');
select has_column('public', 'notifications', 'source_entity_id', 'notification source id exists');
select has_column('public', 'notifications', 'event_key', 'notification event key exists');
select function_privs_are(
  'public', 'mark_notification_read', array['uuid'], 'authenticated', array['EXECUTE'],
  'authenticated can mark one own notification read through RPC'
);
select function_privs_are(
  'public', 'mark_notification_read', array['uuid'], 'anon', array[]::text[],
  'anon cannot mark notifications read'
);
select function_privs_are(
  'public', 'mark_all_notifications_read', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated can mark all own notifications read through RPC'
);

insert into public.notifications(
  id, user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
) values
  ('a3010000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'REPORT_SUBMITTED', 'A notification', 'Body A', '/cong-viec/bao-cao/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'report_assignment', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'P3-FIXTURE-A'),
  ('a3010000-0000-4000-8000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'REPORT_SUBMITTED', 'B notification', 'Body B', '/cong-viec/bao-cao/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'report_assignment', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'P3-FIXTURE-B'),
  ('a3010000-0000-4000-8000-000000000003', '99999999-9999-9999-9999-999999999999',
   'REPORT_SUBMITTED', 'Suspended notification', 'Body S', null,
   null, null, 'P3-FIXTURE-S');

select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select results_eq(
  'select count(*)::integer from public.notifications',
  array[1],
  'P3-A user sees only own notification'
);
select results_eq(
  $$ select count(*)::integer from public.notifications where id='a3010000-0000-4000-8000-000000000002'::uuid $$,
  array[0],
  'P3-A cannot read user B notification by guessed UUID'
);
select is(
  public.mark_notification_read('a3010000-0000-4000-8000-000000000002'::uuid),
  false,
  'P3-A cannot mark user B notification read'
);
select is(
  public.mark_notification_read('a3010000-0000-4000-8000-000000000001'::uuid),
  true,
  'P3-A can mark own notification read'
);
select is(
  public.mark_notification_read('a3010000-0000-4000-8000-000000000001'::uuid),
  true,
  'P3-A mark-read is idempotent'
);
select results_eq(
  $$ select count(*)::integer from public.notifications where id='a3010000-0000-4000-8000-000000000001'::uuid and read_at is not null $$,
  array[1],
  'P3-A mark-read only changes read_at'
);
select throws_ok(
  $$ update public.notifications set title='tampered' where id='a3010000-0000-4000-8000-000000000001'::uuid $$,
  'permission denied for table notifications',
  'authenticated cannot update notification title directly'
);
select throws_ok(
  $$ insert into public.notifications(user_id, type, title) values (auth.uid(), 'SPOOFED', 'Spoofed') $$,
  'permission denied for table notifications',
  'authenticated cannot insert arbitrary notification directly'
);
select throws_ok(
  $$ delete from public.notifications where id='a3010000-0000-4000-8000-000000000001'::uuid $$,
  'permission denied for table notifications',
  'authenticated cannot delete notification directly'
);

select reset_auth();
insert into public.notifications(
  user_id, type, title, action_url, event_key
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'P3_UNREAD', 'Unread', null, 'P3-FIXTURE-A-UNREAD'
);
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select is(
  public.mark_all_notifications_read(),
  1,
  'P3-A mark-all returns number of unread rows changed'
);
select results_eq(
  'select count(*)::integer from public.notifications where user_id=auth.uid() and read_at is null',
  array[0],
  'P3-A has no unread rows after mark-all'
);

select set_auth_user('99999999-9999-9999-9999-999999999999'::uuid);
select results_eq(
  'select count(*)::integer from public.notifications',
  array[0],
  'suspended user cannot read notifications'
);
select is(
  public.mark_notification_read('a3010000-0000-4000-8000-000000000003'::uuid),
  false,
  'suspended user cannot mark notification read'
);

select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select count(*) from public.notifications $$,
  'permission denied for table notifications',
  'anon cannot read notifications'
);
select throws_ok(
  $$ select public.mark_notification_read('a3010000-0000-4000-8000-000000000001'::uuid) $$,
  'permission denied for function mark_notification_read',
  'anon cannot call mark-read RPC'
);

select reset_auth();
select throws_ok(
  $$ insert into public.notifications(user_id, type, title, action_url) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'UNSAFE', 'Unsafe', 'https://evil.example') $$,
  'new row for relation "notifications" violates check constraint "notifications_action_url_check"',
  'unsafe external action URL is rejected by database constraint'
);
select throws_ok(
  $$ insert into public.notifications(user_id, type, title, source_entity_type) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'INVALID', 'Invalid', 'report_assignment') $$,
  'new row for relation "notifications" violates check constraint "notifications_source_entity_pair_check"',
  'partial notification source identity is rejected'
);
select throws_ok(
  $$ insert into public.notifications(user_id, type, title, event_key) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'DUPLICATE', 'Duplicate', 'P3-FIXTURE-A') $$,
  'duplicate key value violates unique constraint "notifications_event_key_unique"',
  'notification event key is unique when present'
);

create temp table p3_campaign(id uuid not null);
grant all on table p3_campaign to authenticated;
select set_auth_user('11112222-3333-4444-5555-666677778888'::uuid);
insert into p3_campaign
select id
from public.create_report_campaign(
  'P3 notification campaign', 'Publish recipient test', 'Ban Thanh niên',
  now(), now() + interval '7 days', null, false, true, array['pdf'], 20, 1, '{}'::jsonb, 'INTERNAL_YOUTH'
);
select lives_ok(
  $$ select public.publish_report_campaign((select id from p3_campaign), array['22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'trusted publish creates assignment and notification atomically'
);
select reset_auth();
select results_eq(
  $$ select count(*)::integer
     from public.notifications n
     join public.report_assignments a on a.id=n.source_entity_id
     where a.campaign_id=(select id from p3_campaign)
       and n.type='REPORT_CAMPAIGN_PUBLISHED'
       and n.user_id='cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid $$,
  array[1],
  'published campaign notifies active branch officer in assigned organization'
);
select results_eq(
  $$ select count(*)::integer
     from public.notifications n
     join public.report_assignments a on a.id=n.source_entity_id
     where a.campaign_id=(select id from p3_campaign)
       and n.user_id in ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid) $$,
  array[0],
  'published campaign does not notify users outside recipient role/scope'
);
select results_eq(
  $$ select count(*)::integer
     from public.notifications n
     join public.report_assignments a on a.id=n.source_entity_id
     where a.campaign_id=(select id from p3_campaign)
       and n.event_key like 'REPORT_CAMPAIGN_PUBLISHED:%' $$,
  array[1],
  'published campaign event has one deterministic identity'
);

select set_auth_user('11112222-3333-4444-5555-666677778888'::uuid);
select lives_ok(
  $$ select public.publish_report_campaign((select id from p3_campaign), array['22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'repeated publish is a no-op'
);
select reset_auth();
select results_eq(
  $$ select count(*)::integer from public.notifications where event_key like 'REPORT_CAMPAIGN_PUBLISHED:%' $$,
  array[1],
  'repeated publish does not duplicate notification'
);

select * from finish();
rollback;
