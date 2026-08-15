-- P3-08 acceptance: email worker scheduler installed, idempotent, secret-free, and does not
-- disturb the P3-06 overdue/reminder cron jobs or the P3-R1 delivery-mode safety gate.
begin;

select no_plan();

-- =====================================================================================
-- pg_net installed (required bridge from pg_cron to the process-email-queue Edge Function).
-- =====================================================================================
select ok(
  exists(select 1 from pg_extension where extname = 'pg_net'),
  'pg_net extension is installed for cron-to-Edge-Function invocation'
);

-- =====================================================================================
-- Exactly one official worker job, correct name, cadence and active state.
-- =====================================================================================
select is(
  (select count(*)::integer from cron.job where jobname = 'email_queue_worker'),
  1,
  'exactly one email_queue_worker cron job is registered'
);
select is(
  (select schedule from cron.job where jobname = 'email_queue_worker'),
  '*/10 * * * *',
  'email_queue_worker runs every 10 minutes'
);
select is(
  (select active from cron.job where jobname = 'email_queue_worker'),
  true,
  'email_queue_worker cron job is active'
);

-- =====================================================================================
-- Job body reaches the real Edge Function over HTTP via net.http_post, authenticated with the
-- same x-cron-secret header process-email-queue/index.ts already checks -- not a second worker,
-- not a direct provider call, and not a bypass of the Edge Function.
-- =====================================================================================
select ok(
  (select command from cron.job where jobname = 'email_queue_worker') ~* 'net\.http_post',
  'email_queue_worker invokes the Edge Function via pg_net, not an in-database provider call'
);
select ok(
  (select command from cron.job where jobname = 'email_queue_worker') ~* 'x-cron-secret',
  'email_queue_worker authenticates with the existing x-cron-secret header contract'
);
select ok(
  (select command from cron.job where jobname = 'email_queue_worker') ~* 'vault\.decrypted_secrets',
  'email_queue_worker sources its URL and secret from Vault at execution time, not literals'
);

-- =====================================================================================
-- No secret literal in the job body: no CRON_SECRET/service-role/provider-key-shaped string,
-- and no hardcoded https:// endpoint (which would mean an operator-provisioned value leaked
-- into a migration rather than being read from Vault).
-- =====================================================================================
select ok(
  (select command from cron.job where jobname = 'email_queue_worker') !~ 'https://[a-z0-9.-]+\.supabase\.co',
  'email_queue_worker job body contains no hardcoded project URL literal'
);
select ok(
  (select command from cron.job where jobname = 'email_queue_worker') !~* 'bearer |service_role|re_[a-z0-9_-]{10}',
  'email_queue_worker job body contains no bearer token, service-role or provider-key-shaped literal'
);

-- =====================================================================================
-- Idempotent registration: re-running the exact unschedule-then-schedule pattern the migration
-- uses (simulating a second `supabase db reset` / forward re-deploy / rehearsal repeat) must not
-- create a duplicate job or change the logical job identity beyond its cron.job id.
-- =====================================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email_queue_worker') then
    perform cron.unschedule('email_queue_worker');
  end if;
end;
$$;

select cron.schedule(
  'email_queue_worker',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_worker_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select is(
  (select count(*)::integer from cron.job where jobname = 'email_queue_worker'),
  1,
  'reapplying the idempotent schedule pattern still leaves exactly one email_queue_worker job'
);
select is(
  (select active from cron.job where jobname = 'email_queue_worker'),
  true,
  'reapplied email_queue_worker job is still active'
);

-- =====================================================================================
-- P3-06 non-regression: the two existing daily jobs are untouched by this migration.
-- =====================================================================================
select is(
  (select count(*)::integer from cron.job where jobname = 'report_mark_overdue_daily'),
  1,
  'report_mark_overdue_daily is still registered exactly once'
);
select is(
  (select schedule from cron.job where jobname = 'report_mark_overdue_daily'),
  '5 17 * * *',
  'report_mark_overdue_daily schedule is unchanged by P3-08'
);
select is(
  (select active from cron.job where jobname = 'report_mark_overdue_daily'),
  true,
  'report_mark_overdue_daily is still active'
);
select is(
  (select count(*)::integer from cron.job where jobname = 'report_reminder_scan_daily'),
  1,
  'report_reminder_scan_daily is still registered exactly once'
);
select is(
  (select schedule from cron.job where jobname = 'report_reminder_scan_daily'),
  '0 0 * * *',
  'report_reminder_scan_daily schedule is unchanged by P3-08'
);
select is(
  (select active from cron.job where jobname = 'report_reminder_scan_daily'),
  true,
  'report_reminder_scan_daily is still active'
);
select ok(
  (select command from cron.job where jobname = 'report_mark_overdue_daily') !~* 'http|net\.|provider',
  'report_mark_overdue_daily still calls the DB function directly, never HTTP -- P3-08 did not rewire it'
);
select ok(
  (select command from cron.job where jobname = 'report_reminder_scan_daily') !~* 'http|net\.|provider',
  'report_reminder_scan_daily still calls the DB function directly, never HTTP -- P3-08 did not rewire it'
);

-- =====================================================================================
-- P3-R1 non-regression: the EMAIL_DELIVERY_MODE fail-closed contract lives in the Edge Function,
-- not the database, so it cannot be asserted from SQL. Assert instead that this migration did not
-- touch claim_email_queue/mark_email_sent/mark_email_retry (still the exact P3-02 signatures the
-- worker relies on) or add any new privileged grant on email_queue/email_logs to anon/authenticated.
-- =====================================================================================
select has_function('public', 'claim_email_queue', ARRAY['text', 'integer', 'integer'], 'claim_email_queue signature is unchanged by P3-08');
select has_function('public', 'mark_email_sent', ARRAY['uuid', 'uuid', 'text', 'text'], 'mark_email_sent signature is unchanged by P3-08');
select has_function('public', 'mark_email_retry', ARRAY['uuid', 'uuid', 'text', 'text', 'boolean'], 'mark_email_retry signature is unchanged by P3-08');
select function_privs_are(
  'public', 'claim_email_queue', ARRAY['text', 'integer', 'integer'],
  'authenticated', ARRAY[]::text[], 'authenticated still cannot claim the email queue after P3-08'
);
select function_privs_are(
  'public', 'claim_email_queue', ARRAY['text', 'integer', 'integer'],
  'anon', ARRAY[]::text[], 'anon still cannot claim the email queue after P3-08'
);
select table_privs_are(
  'public', 'email_queue', 'anon', ARRAY[]::text[], 'anon still has zero privileges on email_queue after P3-08'
);
select table_privs_are(
  'public', 'email_queue', 'authenticated', ARRAY[]::text[], 'authenticated still has zero privileges on email_queue after P3-08'
);

select * from finish();
rollback;
