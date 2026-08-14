-- P3-02 acceptance: trusted enqueue, lifecycle ownership, recovery and least privilege.
begin;

select no_plan();

create or replace function p302_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function p302_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select p302_reset_auth();

select has_table('public', 'email_queue', 'P3-02 email queue exists');
select has_table('public', 'email_logs', 'P3-02 email logs exists');
select has_column('public', 'email_queue', 'claim_token', 'queue claim token exists');
select has_column('public', 'email_queue', 'lease_expires_at', 'queue lease exists');
select has_column('public', 'email_queue', 'next_attempt_at', 'queue retry schedule exists');
select has_column('public', 'email_logs', 'attempt_number', 'attempt evidence exists');

select table_privs_are(
  'public', 'email_queue', 'anon', ARRAY[]::text[],
  'anon cannot access email queue directly'
);
select table_privs_are(
  'public', 'email_queue', 'authenticated', ARRAY[]::text[],
  'authenticated cannot access email queue directly'
);
select table_privs_are(
  'public', 'email_logs', 'authenticated', ARRAY[]::text[],
  'authenticated cannot access email logs directly'
);
select function_privs_are(
  'public', 'enqueue_email_for_user_event',
  ARRAY['text', 'uuid', 'text', 'uuid', 'text', 'jsonb', 'timestamp with time zone', 'integer'],
  'service_role', ARRAY['EXECUTE'],
  'service_role can enqueue through trusted RPC'
);
select function_privs_are(
  'public', 'enqueue_email_for_user_event',
  ARRAY['text', 'uuid', 'text', 'uuid', 'text', 'jsonb', 'timestamp with time zone', 'integer'],
  'authenticated', ARRAY[]::text[],
  'authenticated cannot enqueue through trusted RPC'
);
select function_privs_are(
  'public', 'claim_email_queue', ARRAY['text', 'integer', 'integer'],
  'authenticated', ARRAY[]::text[],
  'authenticated cannot claim queue work'
);

create temp table p302_first as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture',
  '30200000-0000-4000-8000-000000000001'::uuid,
  'v1',
  jsonb_build_object('title', 'Queue fixture', 'entity_id', '30200000-0000-4000-8000-000000000001'),
  now(),
  5
);
select is((select created from p302_first), true, 'trusted enqueue creates one row');
select is((select recipient_email from public.email_queue where id = (select queue_id from p302_first)), 'officera@test.local', 'recipient is resolved on the server');
select is((select attempt_count from public.email_queue where id = (select queue_id from p302_first)), 0, 'new queue starts with zero attempts');

create temp table p302_duplicate as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture',
  '30200000-0000-4000-8000-000000000001'::uuid,
  'v1',
  jsonb_build_object('title', 'Should not overwrite'),
  now(),
  5
);
select is((select created from p302_duplicate), false, 'duplicate enqueue is idempotent');
select is(
  (select count(*)::integer from public.email_queue where idempotency_key = (select idempotency_key from p302_first)),
  1,
  'concurrent-safe idempotency key has one logical row'
);
select throws_ok(
  $$ select * from public.enqueue_email_for_user_event(
    'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'p302_fixture', '30200000-0000-4000-8000-000000000002'::uuid, 'v1',
    jsonb_build_object('html', '<p>unsafe</p>'), now(), 5
  ) $$,
  'INVALID_EMAIL_PAYLOAD',
  'trusted enqueue rejects arbitrary HTML payload'
);

create temp table p302_future as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture', '30200000-0000-4000-8000-000000000003'::uuid, 'v1',
  '{}'::jsonb, now() + interval '1 hour', 5
);
create temp table p302_claim_a as
select * from public.claim_email_queue('worker-a', 10, 300);
select is((select count(*)::integer from p302_claim_a), 1, 'eligible queue row is claimed');
select is((select status from p302_claim_a limit 1), 'PROCESSING', 'claim changes status to processing');
select is((select attempt_count from p302_claim_a limit 1), 1, 'claim increments attempt count');
select ok((select claim_token is not null and worker_id = 'worker-a' and lease_expires_at > clock_timestamp() from p302_claim_a limit 1), 'claim records token, worker and lease');
select is((select count(*)::integer from public.claim_email_queue('worker-b', 10, 300)), 0, 'second worker cannot claim owned row');
select is((select count(*)::integer from public.email_queue where id = (select queue_id from p302_future) and status = 'PENDING'), 1, 'future scheduled row remains pending');
select is(public.mark_email_sent((select id from p302_claim_a limit 1), null), false, 'missing claim token is denied');

select is(
  public.mark_email_sent(
    (select id from p302_claim_a limit 1),
    (select claim_token from p302_claim_a limit 1),
    'P3_FAKE',
    'placeholder-message-id'
  ),
  true,
  'current owner can complete successfully'
);
select is((select status from public.email_queue where id = (select id from p302_claim_a limit 1)), 'SENT', 'success is terminal');
select is((select count(*)::integer from public.claim_email_queue('worker-c', 10, 300)), 0, 'SENT row is not claimable');
select is(public.mark_email_retry((select id from p302_claim_a limit 1), (select claim_token from p302_claim_a limit 1)), false, 'SENT row cannot be retried by old owner');
select is((select count(*)::integer from public.email_logs where queue_id = (select id from p302_claim_a limit 1) and status = 'SENT'), 1, 'success writes one bounded attempt log');

create temp table p302_retry_seed as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture', '30200000-0000-4000-8000-000000000004'::uuid, 'v1', '{}'::jsonb, now(), 5
);
create temp table p302_retry_claim as
select * from public.claim_email_queue('retry-worker', 10, 300);
select is(
  public.mark_email_retry(
    (select id from p302_retry_claim limit 1),
    (select claim_token from p302_retry_claim limit 1),
    'TEMP_PROVIDER_FAILURE',
    'temporary provider response',
    true
  ),
  true,
  'current owner can move work to retry'
);
select is((select status from public.email_queue where id = (select id from p302_retry_claim limit 1)), 'RETRY', 'retry state is explicit');
select ok((select next_attempt_at > clock_timestamp() from public.email_queue where id = (select id from p302_retry_claim limit 1)), 'retry uses a future server-calculated next attempt');
select ok((select length(last_error) <= 500 and last_error_code = 'TEMP_PROVIDER_FAILURE' from public.email_queue where id = (select id from p302_retry_claim limit 1)), 'retry error is bounded');
select is((select count(*)::integer from public.email_logs where queue_id = (select id from p302_retry_claim limit 1) and status = 'RETRY'), 1, 'retry writes attempt evidence');

create temp table p302_max_seed as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture', '30200000-0000-4000-8000-000000000005'::uuid, 'v1', '{}'::jsonb, now(), 2
);
create temp table p302_max_claim_1 as
select * from public.claim_email_queue('max-worker-1', 10, 300);
select is(public.mark_email_retry((select id from p302_max_claim_1 limit 1), (select claim_token from p302_max_claim_1 limit 1), 'TEMP', 'first failure', true), true, 'first max-attempt retry is accepted');
update public.email_queue set next_attempt_at = now() - interval '1 second' where id = (select id from p302_max_claim_1 limit 1);
create temp table p302_max_claim_2 as
select * from public.claim_email_queue('max-worker-2', 10, 300);
select is((select attempt_count from p302_max_claim_2 limit 1), 2, 'second claim reaches max attempt count');
select is(public.mark_email_retry((select id from p302_max_claim_2 limit 1), (select claim_token from p302_max_claim_2 limit 1), 'PERMANENT', 'permanent failure', true), true, 'max attempt retry call is accepted and terminal');
select is((select status from public.email_queue where id = (select id from p302_max_claim_2 limit 1)), 'FAILED', 'max attempts become FAILED');
select is((select count(*)::integer from public.claim_email_queue('max-worker-3', 10, 300)), 0, 'FAILED is terminal');
select is(public.mark_email_sent((select id from p302_max_claim_2 limit 1), (select claim_token from p302_max_claim_2 limit 1)), false, 'FAILED cannot be completed by old owner');

create temp table p302_stale_seed as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture', '30200000-0000-4000-8000-000000000006'::uuid, 'v1', '{}'::jsonb, now(), 5
);
create temp table p302_stale_claim_a as
select * from public.claim_email_queue('stale-worker-a', 10, 300);
update public.email_queue
set lease_expires_at = now() - interval '1 second'
where id = (select id from p302_stale_claim_a limit 1);
create temp table p302_stale_claim_b as
select * from public.claim_email_queue('stale-worker-b', 10, 300);
select is((select count(*)::integer from p302_stale_claim_b), 1, 'stale processing is recoverable');
select is((select worker_id from p302_stale_claim_b limit 1), 'stale-worker-b', 'reclaim replaces the worker owner');
select is(public.mark_email_sent((select id from p302_stale_claim_a limit 1), (select claim_token from p302_stale_claim_a limit 1)), false, 'old owner cannot complete after reclaim');
select is(public.mark_email_retry((select id from p302_stale_claim_b limit 1), (select claim_token from p302_stale_claim_b limit 1), 'STALE_TEST', 'reclaimed row closed', false), true, 'new owner can close reclaimed row');

insert into public.email_queue(
  template_code, recipient_email, payload, scheduled_at, next_attempt_at,
  status, max_attempts, idempotency_key
)
select 'TEST_EMAIL', 'fixture@test.local', '{}'::jsonb, now(), now(), 'PENDING', 5,
  'P302-BATCH-' || g::text
from generate_series(1, 55) g;
create temp table p302_batch_claim as
select * from public.claim_email_queue('batch-worker', 500, 300);
select cmp_ok((select count(*)::integer from p302_batch_claim), '<=', 50, 'claim batch is bounded to fifty rows');

create temp table p302_secret_seed as
select * from public.enqueue_email_for_user_event(
  'TEST_EMAIL', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'p302_fixture', '30200000-0000-4000-8000-000000000007'::uuid, 'v1', '{}'::jsonb, now(), 5
);
create temp table p302_secret_claim as
select * from public.claim_email_queue('secret-worker', 10, 300);
select is(public.mark_email_retry(
  (select id from p302_secret_claim limit 1),
  (select claim_token from p302_secret_claim limit 1),
  'AUTH_RESPONSE', 'Authorization: Bearer SUPER-SECRET-PLACEHOLDER', true
), true, 'error handling returns to retry');
select is((select last_error from public.email_queue where id = (select id from p302_secret_claim limit 1)), 'REDACTED_ERROR', 'sensitive error text is redacted');
select ok((select length(error_message) <= 500 and error_message = 'REDACTED_ERROR' from public.email_logs where queue_id = (select id from p302_secret_claim limit 1) and status = 'RETRY'), 'redacted log error is bounded');

select results_eq(
  $$ select pending_count > 0 and processing_count >= 0 and failed_count >= 0 from public.get_email_queue_stats() $$,
  $$ values (true) $$,
  'queue stats expose bounded operational counts'
);

select p302_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok($$ select count(*) from public.email_queue $$, 'permission denied for table email_queue', 'authenticated cannot select queue');
select throws_ok($$ insert into public.email_queue(template_code, recipient_email) values ('SPOOFED', 'spoofed@test.local') $$, 'permission denied for table email_queue', 'authenticated cannot insert queue');
select throws_ok($$ update public.email_queue set status = 'SENT' $$, 'permission denied for table email_queue', 'authenticated cannot update queue');
select throws_ok($$ delete from public.email_queue $$, 'permission denied for table email_queue', 'authenticated cannot delete queue');

select p302_reset_auth();
select * from finish();
rollback;
