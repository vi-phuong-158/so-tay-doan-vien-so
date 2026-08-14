-- P3-03 acceptance: provider metadata, ownership preservation and no end-user RPC access.
begin;

select no_plan();

create or replace function p303_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function p303_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select p303_reset_auth();
select has_column('public', 'email_logs', 'provider_code', 'provider result code exists');
select function_privs_are(
  'public', 'mark_email_sent', ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'service_role', ARRAY['EXECUTE'],
  'service role can persist provider result code'
);
select function_privs_are(
  'public', 'mark_email_sent', ARRAY['uuid', 'uuid', 'text', 'text', 'text'],
  'authenticated', ARRAY[]::text[],
  'authenticated cannot complete provider sends'
);

insert into public.email_queue(
  id, template_code, recipient_email, recipient_name, payload, scheduled_at,
  next_attempt_at, status, max_attempts, idempotency_key
) values (
  '30300000-0000-4000-8000-000000000001'::uuid,
  'SYSTEM_EMAIL_TEST', 'officera@test.local', 'Test recipient',
  jsonb_build_object('title', 'P3-03 test', 'message', 'Provider metadata'),
  now(), now(), 'PENDING', 3, 'P303-PROVIDER-001'
);

create temp table p303_claim as
select * from public.claim_email_queue('p303-worker', 1, 300);
select is((select count(*)::integer from p303_claim), 1, 'P3-03 fixture claims through P3-02 primitive');
select is(
  public.mark_email_sent(
    (select id from p303_claim limit 1),
    (select claim_token from p303_claim limit 1),
    'RESEND', 'resend-message-303', 'HTTP_200'
  ),
  true,
  'provider success can complete the current claim'
);
select is((select status from public.email_queue where id = (select id from p303_claim limit 1)), 'SENT', 'provider success remains terminal SENT');
select is((select provider from public.email_logs where queue_id = (select id from p303_claim limit 1) and status = 'SENT'), 'RESEND', 'provider name is persisted');
select is((select provider_message_id from public.email_logs where queue_id = (select id from p303_claim limit 1) and status = 'SENT'), 'resend-message-303', 'provider message ID is persisted');
select is((select provider_code from public.email_logs where queue_id = (select id from p303_claim limit 1) and status = 'SENT'), 'HTTP_200', 'provider status code is persisted');
select is(public.mark_email_sent((select id from p303_claim limit 1), (select claim_token from p303_claim limit 1), 'RESEND', 'old', 'HTTP_200'), false, 'stale completion cannot overwrite SENT');

select throws_ok(
  $$ insert into public.email_logs(queue_id, status, provider_code) values (null, 'SENT', repeat('x', 65)) $$,
  'new row for relation "email_logs" violates check constraint "email_logs_provider_code_check"',
  'provider code is bounded'
);
select throws_ok(
  $$ insert into public.email_logs(queue_id, status, error_message) values (null, 'FAILED', repeat('x', 501)) $$,
  'new row for relation "email_logs" violates check constraint "email_logs_error_message_check"',
  'provider error message is bounded'
);

select p303_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
select throws_ok(
  $$ select public.mark_email_sent(
    '30300000-0000-4000-8000-000000000001'::uuid, gen_random_uuid(), 'RESEND', 'x', 'HTTP_200'
  ) $$,
  'permission denied for function mark_email_sent',
  'authenticated cannot invoke provider completion RPC'
);
select p303_reset_auth();

select * from finish();
rollback;
