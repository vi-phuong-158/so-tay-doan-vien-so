-- Phase 3 / P3-08: email worker scheduling.
--
-- Installs one pg_cron job, `email_queue_worker`, that invokes the existing process-email-queue
-- Edge Function on a fixed cadence. This is scheduling infrastructure only: it does not touch
-- process-email-queue's code, the email_queue state machine, the provider adapter, or the
-- EMAIL_DELIVERY_MODE safety gate added in P3-R1 (202608140001). No worker/queue/provider logic
-- is duplicated or reimplemented here -- pg_cron only triggers the same trusted HTTP path an
-- operator would call by hand.
--
-- Why HTTP here and not an in-database function call like P3-06's two jobs
-- (202608140002_phase_3_cron_overdue_automation.sql): mark_overdue_assignments() and
-- scan_report_reminders() are pure SQL RPCs with no external side effect, so pg_cron can call
-- them directly. process-email-queue is different -- it is the only component that holds the
-- provider secret (EMAIL_PROVIDER_API_KEY) and makes the outbound Resend call, and P3-R1's
-- EMAIL_DELIVERY_MODE gate is enforced inside that Edge Function, evaluated before any provider
-- secret is even read. Reimplementing queue-claim + provider-call + delivery-mode-gate as a second,
-- database-side worker (per the task's "do not build a second worker" constraint) would duplicate
-- and risk diverging from that safety gate. So this job reaches the *existing* Edge Function over
-- HTTP, authenticated the same way an operator already can: the `x-cron-secret` header that
-- process-email-queue/index.ts checks with hasTrustedWorkerSecret() against its CRON_SECRET env
-- var (unchanged, added in P3-03). pg_cron cannot call an Edge Function directly, so the
-- Supabase-documented bridge is pg_net's net.http_post from a scheduled job body.
--
-- Secret handling (hard requirement, see CLAUDE.md and this task's brief): this migration
-- contains ZERO secret literals -- no CRON_SECRET, no service-role key, no project URL/API key.
-- The job body reads both the target URL and the shared secret from Supabase Vault
-- (vault.decrypted_secrets) by name, at execution time, exactly as Supabase's own
-- "Scheduling Edge Functions" documentation recommends for authenticating a cron-invoked function:
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/process-email-queue',
--     'email_queue_worker_url');
--   select vault.create_secret('<same value as the process-email-queue CRON_SECRET secret>',
--     'email_queue_worker_cron_secret');
--
-- Those two vault.create_secret calls are an operational step run once per environment directly
-- against that environment's database (e.g. via the SQL editor or `supabase db execute` against a
-- live project) -- never committed to this repo, never logged, never placed in a migration or
-- doc. Until both vault secrets exist, the scheduled job's net.http_post call resolves a NULL url
-- and the request fails harmlessly (net.http_post is async/fire-and-forget, so a bad call here
-- cannot fail the migration, `supabase db reset`, or any test run); it just means no worker
-- invocation happens until an operator provisions the two secrets. Supabase Vault
-- (vault.decrypted_secrets) is available by default on every Supabase project (cloud and local
-- `supabase start`), so no extension needs to be created for it here.
create extension if not exists pg_net with schema extensions;

-- Idempotent registration, same pattern as P3-06: unschedule any existing job with this name
-- first, so this migration is safe on `supabase db reset`, forward re-deploy, or a repeated
-- rehearsal apply. After this migration, count(jobname = 'email_queue_worker') = 1, always.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email_queue_worker') then
    perform cron.unschedule('email_queue_worker');
  end if;
end;
$$;

-- Every 10 minutes: simplest cadence with no technical reason to go faster. The worker's own
-- batch size (EMAIL_WORKER_BATCH_SIZE, default 20, hard-capped at 50 by both
-- getWorkerConfig()/process-email-queue/contract.ts and claim_email_queue()'s own
-- least(...,50)) already bounds how much provider traffic one invocation can generate, and the
-- retry backoff schedule (60s/300s/900s/3600s, supabase/migrations/202608110002) tops out well
-- inside a 10-minute window, so a RETRY row is reliably picked up by the next tick without needing
-- a faster schedule. `timeout_milliseconds` is set generously above pg_net's 2000ms default
-- because a full batch of sequential provider calls (worker.ts processes claimed rows one at a
-- time) can legitimately take tens of seconds; net.http_post is still fire-and-forget from
-- pg_cron's perspective, so a slow batch cannot block the scheduler or overlap-lock the next tick.
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
