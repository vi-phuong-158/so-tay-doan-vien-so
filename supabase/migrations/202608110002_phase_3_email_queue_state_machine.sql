-- Phase 3 / P3-02: email queue state machine and concurrency-safe worker boundary.
-- This migration deliberately does not configure or call an email provider.

alter table public.email_queue
  add column if not exists recipient_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id uuid,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists worker_id text,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz;

update public.email_queue
set next_attempt_at = coalesce(next_attempt_at, scheduled_at, now())
where next_attempt_at is null;

alter table public.email_queue
  alter column next_attempt_at set default now();

alter table public.email_queue drop constraint if exists email_queue_status_check;
alter table public.email_queue add constraint email_queue_status_check
  check (status in ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED', 'CANCELLED'));

alter table public.email_queue drop constraint if exists email_queue_payload_check;
alter table public.email_queue add constraint email_queue_payload_check
  check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 16384
    and not (payload ?| array['html', 'html_content', 'raw_html'])
  );

alter table public.email_queue drop constraint if exists email_queue_template_code_check;
alter table public.email_queue add constraint email_queue_template_code_check
  check (template_code ~ '^[A-Z][A-Z0-9_]{1,63}$');

alter table public.email_queue drop constraint if exists email_queue_recipient_email_check;
alter table public.email_queue add constraint email_queue_recipient_email_check
  check (
    length(btrim(recipient_email)) between 3 and 320
    and recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

alter table public.email_queue drop constraint if exists email_queue_max_attempts_check;
alter table public.email_queue add constraint email_queue_max_attempts_check
  check (max_attempts between 1 and 10);

alter table public.email_queue drop constraint if exists email_queue_attempt_count_check;
alter table public.email_queue add constraint email_queue_attempt_count_check
  check (attempt_count between 0 and max_attempts);

alter table public.email_queue drop constraint if exists email_queue_source_identity_check;
alter table public.email_queue add constraint email_queue_source_identity_check
  check ((source_entity_type is null and source_entity_id is null)
    or (source_entity_type is not null and source_entity_id is not null));

alter table public.email_queue
  add column if not exists updated_at timestamptz not null default now();

alter table public.email_logs
  add column if not exists attempt_number integer,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists provider_code text;

alter table public.email_logs alter column status set default 'PROCESSING';
alter table public.email_logs drop constraint if exists email_logs_status_check;
alter table public.email_logs add constraint email_logs_status_check
  check (status is null or status in ('PROCESSING', 'SENT', 'RETRY', 'FAILED'));

create index if not exists idx_email_queue_eligible
  on public.email_queue (scheduled_at, next_attempt_at, created_at, id)
  where status in ('PENDING', 'RETRY');

create index if not exists idx_email_queue_stale_processing
  on public.email_queue (lease_expires_at, created_at, id)
  where status = 'PROCESSING';

create index if not exists idx_email_logs_queue_attempt
  on public.email_logs (queue_id, attempt_number, status);

create or replace function public.enqueue_email_for_user_event(
  p_template_code text,
  p_recipient_user_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_event_revision text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now(),
  p_max_attempts integer default 5
)
returns table(queue_id uuid, created boolean, idempotency_key text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
  v_key text;
  v_queue_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_template_code is null or p_template_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception 'INVALID_TEMPLATE_CODE';
  end if;
  if p_recipient_user_id is null then
    raise exception 'RECIPIENT_REQUIRED';
  end if;
  if p_source_entity_type is null or p_source_entity_type !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_source_entity_id is null then
    raise exception 'SOURCE_IDENTITY_REQUIRED';
  end if;
  if p_event_revision is null or btrim(p_event_revision) = '' or length(p_event_revision) > 64 then
    raise exception 'EVENT_REVISION_REQUIRED';
  end if;
  if p_max_attempts is null or p_max_attempts not between 1 and 10 then
    raise exception 'INVALID_MAX_ATTEMPTS';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384
    or p_payload ?| array['html', 'html_content', 'raw_html'] then
    raise exception 'INVALID_EMAIL_PAYLOAD';
  end if;

  select lower(btrim(u.email)), left(p.full_name, 200)
    into v_email, v_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_recipient_user_id
    and p.account_status = 'ACTIVE';

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  v_key := format('%s:%s:%s:%s:%s', p_template_code, p_source_entity_type,
    p_source_entity_id, p_recipient_user_id, p_event_revision);

  insert into public.email_queue(
    template_code, recipient_user_id, recipient_email, recipient_name,
    payload, scheduled_at, next_attempt_at, status, max_attempts, idempotency_key,
    created_at, updated_at
  ) values (
    p_template_code, p_recipient_user_id, v_email, v_name,
    p_payload, coalesce(p_scheduled_at, v_now), coalesce(p_scheduled_at, v_now),
    'PENDING', p_max_attempts, v_key, v_now, v_now
  )
  on conflict on constraint email_queue_idempotency_key_key do nothing
  returning id into v_queue_id;

  if v_queue_id is not null then
    return query select v_queue_id, true, v_key;
    return;
  end if;

  return query
  select q.id, false, q.idempotency_key
  from public.email_queue q
  where q.idempotency_key = v_key;
end;
$$;

create or replace function public.claim_email_queue(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.email_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_batch integer := least(greatest(coalesce(p_batch_size, 10), 1), 50);
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or length(p_worker_id) > 100 then
    raise exception 'INVALID_WORKER_ID';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'INVALID_LEASE_SECONDS';
  end if;

  with exhausted as (
    update public.email_queue q
    set status = 'FAILED',
        claim_token = null,
        worker_id = null,
        claimed_at = null,
        lease_expires_at = null,
        last_error_code = 'MAX_ATTEMPTS_EXCEEDED',
        last_error = 'Processing lease expired after max attempts',
        last_error_at = v_now,
        updated_at = v_now
    where q.status = 'PROCESSING'
      and q.lease_expires_at is not null
      and q.lease_expires_at <= v_now
      and q.attempt_count >= q.max_attempts
    returning q.id, q.attempt_count
  )
  insert into public.email_logs(queue_id, attempt_number, status, error_code, error_message, started_at, completed_at)
  select id, attempt_count, 'FAILED', 'MAX_ATTEMPTS_EXCEEDED',
    'Processing lease expired after max attempts', v_now, v_now
  from exhausted;

  return query
  with candidates as (
    select q.id
    from public.email_queue q
    where (
      (
        q.status in ('PENDING', 'RETRY')
        and q.scheduled_at <= v_now
        and coalesce(q.next_attempt_at, q.scheduled_at) <= v_now
      )
      or (
        q.status = 'PROCESSING'
        and q.lease_expires_at is not null
        and q.lease_expires_at <= v_now
        and q.attempt_count < q.max_attempts
      )
    )
    order by greatest(q.scheduled_at, coalesce(q.next_attempt_at, q.scheduled_at)), q.created_at, q.id
    for update skip locked
    limit v_batch
  ), claimed as (
    update public.email_queue q
    set status = 'PROCESSING',
        attempt_count = q.attempt_count + 1,
        claim_token = gen_random_uuid(),
        worker_id = p_worker_id,
        claimed_at = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        updated_at = v_now
    from candidates c
    where q.id = c.id
    returning q.*
  ), logged as (
    insert into public.email_logs(queue_id, attempt_number, status, started_at)
    select c.id, c.attempt_count, 'PROCESSING', c.claimed_at
    from claimed c
    returning queue_id
  )
  select c.* from claimed c;
end;
$$;

create or replace function public.mark_email_sent(
  p_queue_id uuid,
  p_claim_token uuid,
  p_provider text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
  v_updated integer;
begin
  update public.email_queue q
  set status = 'SENT',
      claim_token = null,
      worker_id = null,
      claimed_at = null,
      lease_expires_at = null,
      next_attempt_at = null,
      last_error = null,
      last_error_code = null,
      last_error_at = null,
      updated_at = v_now
  where q.id = p_queue_id
    and q.status = 'PROCESSING'
    and q.claim_token = p_claim_token
  returning q.attempt_count into v_attempt;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.email_logs l
  set status = 'SENT',
      provider = left(p_provider, 64),
      provider_message_id = left(p_provider_message_id, 255),
      completed_at = v_now,
      sent_at = v_now,
      error_code = null,
      error_message = null
  where l.queue_id = p_queue_id
    and l.attempt_number = v_attempt
    and l.status = 'PROCESSING';

  if not found then
    insert into public.email_logs(
      queue_id, attempt_number, status, provider, provider_message_id,
      started_at, completed_at, sent_at
    ) values (
      p_queue_id, v_attempt, 'SENT', left(p_provider, 64), left(p_provider_message_id, 255),
      v_now, v_now, v_now
    );
  end if;
  return true;
end;
$$;

create or replace function public.mark_email_retry(
  p_queue_id uuid,
  p_claim_token uuid,
  p_error_code text default 'EMAIL_PROVIDER_ERROR',
  p_error_message text default null,
  p_retryable boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
  v_max_attempts integer;
  v_status text;
  v_error_code text;
  v_error_message text;
  v_delay_seconds integer;
  v_next_attempt_at timestamptz;
begin
  select q.attempt_count, q.max_attempts
    into v_attempt, v_max_attempts
  from public.email_queue q
  where q.id = p_queue_id
    and q.status = 'PROCESSING'
    and q.claim_token = p_claim_token
  for update;

  if not found then
    return false;
  end if;

  v_error_code := left(upper(regexp_replace(coalesce(nullif(btrim(p_error_code), ''), 'EMAIL_PROVIDER_ERROR'), '[^A-Z0-9_.-]', '_', 'g')), 64);
  if lower(coalesce(p_error_message, '')) ~ '(authorization|api[ _-]?key|bearer|secret|token)' then
    v_error_message := 'REDACTED_ERROR';
  else
    v_error_message := left(regexp_replace(coalesce(p_error_message, 'EMAIL_PROVIDER_ERROR'), '[[:cntrl:]]+', ' ', 'g'), 500);
  end if;

  if coalesce(p_retryable, true) and v_attempt < v_max_attempts then
    v_status := 'RETRY';
    v_delay_seconds := case least(greatest(v_attempt, 1), 4)
      when 1 then 60
      when 2 then 300
      when 3 then 900
      else 3600
    end;
    v_next_attempt_at := v_now + make_interval(secs => v_delay_seconds);
  else
    v_status := 'FAILED';
    v_next_attempt_at := null;
  end if;

  update public.email_queue q
  set status = v_status,
      claim_token = null,
      worker_id = null,
      claimed_at = null,
      lease_expires_at = null,
      next_attempt_at = v_next_attempt_at,
      last_error_code = v_error_code,
      last_error = v_error_message,
      last_error_at = v_now,
      updated_at = v_now
  where q.id = p_queue_id;

  update public.email_logs l
  set status = v_status,
      completed_at = v_now,
      error_code = v_error_code,
      error_message = v_error_message
  where l.queue_id = p_queue_id
    and l.attempt_number = v_attempt
    and l.status = 'PROCESSING';

  if not found then
    insert into public.email_logs(
      queue_id, attempt_number, status, error_code, error_message, started_at, completed_at
    ) values (
      p_queue_id, v_attempt, v_status, v_error_code, v_error_message, v_now, v_now
    );
  end if;
  return true;
end;
$$;

create or replace function public.get_email_queue_stats()
returns table(
  pending_count bigint,
  processing_count bigint,
  retry_count bigint,
  sent_count bigint,
  failed_count bigint,
  stale_processing_count bigint,
  oldest_pending_at timestamptz,
  last_failure_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where status = 'PENDING'),
    count(*) filter (where status = 'PROCESSING'),
    count(*) filter (where status = 'RETRY'),
    count(*) filter (where status = 'SENT'),
    count(*) filter (where status = 'FAILED'),
    count(*) filter (where status = 'PROCESSING' and lease_expires_at <= clock_timestamp()),
    min(scheduled_at) filter (where status in ('PENDING', 'RETRY')),
    max(last_error_at) filter (where status = 'FAILED')
  from public.email_queue;
$$;

revoke all on table public.email_queue, public.email_logs from public, anon, authenticated;
grant all privileges on table public.email_queue, public.email_logs to service_role;

revoke all on function public.enqueue_email_for_user_event(text, uuid, text, uuid, text, jsonb, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_email_queue(text, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_email_sent(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_email_retry(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_email_queue_stats() from public, anon, authenticated;

grant execute on function public.enqueue_email_for_user_event(text, uuid, text, uuid, text, jsonb, timestamptz, integer) to service_role;
grant execute on function public.claim_email_queue(text, integer, integer) to service_role;
grant execute on function public.mark_email_sent(uuid, uuid, text, text) to service_role;
grant execute on function public.mark_email_retry(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.get_email_queue_stats() to service_role;
