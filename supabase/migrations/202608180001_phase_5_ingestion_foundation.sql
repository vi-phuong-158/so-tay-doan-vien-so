-- Phase 5 / P5-02: provider-neutral canonical source locators and ingestion job lifecycle.
--
-- This migration deliberately extends the accepted P5-01 foundation instead of rewriting it.
-- `storage_path` remains the P4-compatible Supabase Storage locator; new provider fields make
-- Phase 5 source ingestion portable without making Google Drive an authorization authority.

-- =====================================================================================
-- 1. Provider-neutral source locator (no credentials; legacy storage_path remains valid)
-- =====================================================================================
alter table public.document_sources
  add column if not exists file_provider text,
  add column if not exists external_file_id text,
  add column if not exists external_parent_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

-- Existing accepted P5-01 STORAGE_FILE rows are Supabase Storage. This only describes their
-- already-established location; it does not move any P4 document object or alter its path policy.
update public.document_sources
set file_provider = 'SUPABASE_STORAGE'
where source_kind = 'STORAGE_FILE'
  and storage_path is not null
  and file_provider is null;

alter table public.document_sources
  drop constraint if exists document_sources_file_provider_check,
  drop constraint if exists document_sources_provider_metadata_check,
  drop constraint if exists document_sources_provider_credentials_check;

alter table public.document_sources
  add constraint document_sources_file_provider_check
    check (file_provider is null or file_provider in ('SUPABASE_STORAGE', 'GOOGLE_DRIVE', 'OTHER')),
  add constraint document_sources_provider_metadata_check
    check (jsonb_typeof(provider_metadata) = 'object' and pg_column_size(provider_metadata) <= 8192),
  add constraint document_sources_provider_credentials_check
    check (not (provider_metadata ?| array[
      'access_token', 'refresh_token', 'client_secret', 'authorization', 'password', 'api_key'
    ]));

-- P5-01 used anonymous inline CHECKs for these locators. Replace only the STORAGE_FILE rule with
-- its forward-compatible equivalent; OFFICIAL_URL and URL_SNAPSHOT rules stay unchanged.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.document_sources'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%source_kind <> ''STORAGE_FILE''%'
  loop
    execute format('alter table public.document_sources drop constraint %I', v_constraint);
  end loop;
end;
$$;

alter table public.document_sources
  add constraint document_sources_storage_locator_check
    check (
      source_kind <> 'STORAGE_FILE'
      or (
        (coalesce(file_provider, 'SUPABASE_STORAGE') = 'SUPABASE_STORAGE' and storage_path is not null and external_file_id is null)
        or (file_provider in ('GOOGLE_DRIVE', 'OTHER') and external_file_id is not null and storage_path is null)
      )
    ),
  add constraint document_sources_external_locator_check
    check (
      (file_provider is null or file_provider = 'SUPABASE_STORAGE' or external_file_id is not null)
      and (external_file_id is null or (length(btrim(external_file_id)) between 1 and 512))
      and (external_parent_id is null or (length(btrim(external_parent_id)) between 1 and 512))
    );

comment on column public.document_sources.storage_path is
  'Legacy P4/P5-01 Supabase Storage locator. Preserved unchanged; Phase 5 provider-neutral sources use file_provider + external_file_id.';
comment on column public.document_sources.external_file_id is
  'Opaque provider file identifier. It is never a frontend URL and must be resolved only by a trusted backend StorageProvider.';
comment on column public.document_sources.provider_metadata is
  'Bounded non-secret provider metadata only. OAuth tokens, client secrets, URLs granting public access, and credentials are forbidden.';

-- =====================================================================================
-- 2. Queue state, atomic source registration trigger, and trusted lifecycle RPCs
-- =====================================================================================
alter table public.ingestion_jobs
  add column if not exists document_source_id uuid references public.document_sources(id) on delete cascade,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists worker_id text,
  add column if not exists last_error_at timestamptz;

update public.ingestion_jobs
set next_attempt_at = coalesce(next_attempt_at, scheduled_at, created_at, now())
where next_attempt_at is null;

alter table public.ingestion_jobs
  alter column next_attempt_at set default now();

alter table public.ingestion_jobs
  drop constraint if exists ingestion_jobs_status_check,
  drop constraint if exists ingestion_jobs_attempt_count_check,
  drop constraint if exists ingestion_jobs_claim_shape_check;

alter table public.ingestion_jobs
  add constraint ingestion_jobs_status_check
    check (status in ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  add constraint ingestion_jobs_attempt_count_check
    check (attempt_count between 0 and max_attempts),
  add constraint ingestion_jobs_claim_shape_check
    check (
      (status = 'PROCESSING' and claim_token is not null and worker_id is not null and lease_expires_at is not null)
      or (status <> 'PROCESSING' and claim_token is null and worker_id is null and lease_expires_at is null)
    );

create index if not exists idx_ingestion_jobs_claimable_p5_02
  on public.ingestion_jobs (next_attempt_at, scheduled_at, created_at, id)
  where status in ('PENDING', 'RETRY');
create index if not exists idx_ingestion_jobs_stale_p5_02
  on public.ingestion_jobs (lease_expires_at, created_at, id)
  where status = 'PROCESSING';
create index if not exists idx_ingestion_jobs_source_p5_02
  on public.ingestion_jobs (document_source_id) where document_source_id is not null;

create or replace function public.ingestion_event_detail_is_safe(p_detail jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_detail) = 'object'
    and pg_column_size(p_detail) <= 8192
    and not (p_detail ?| array['content', 'content_text', 'document_content', 'raw_text', 'payload']);
$$;

alter table public.ingestion_events
  drop constraint if exists ingestion_events_detail_safe_check;
alter table public.ingestion_events
  add constraint ingestion_events_detail_safe_check
  check (public.ingestion_event_detail_is_safe(detail));

create or replace function public.queue_ingestion_for_source(p_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_sources%rowtype;
  v_document public.documents%rowtype;
  v_job_id uuid;
  v_key text;
begin
  select s.* into v_source
  from public.document_sources s
  where s.id = p_source_id;

  if not found then
    return null;
  end if;

  select d.* into v_document
  from public.documents d
  join public.document_versions v on v.id = v_source.document_version_id
  where d.id = v.document_id
    and v.is_current
    and d.current_version_id = v.id
    and d.status = 'PUBLISHED';

  if not found then
    return null;
  end if;

  v_key := format('EXTRACT:SOURCE:%s', v_source.id);
  insert into public.ingestion_jobs (
    job_kind, document_id, document_version_id, document_source_id, status,
    idempotency_key, scheduled_at, next_attempt_at, payload, requested_by
  ) values (
    'EXTRACT', v_document.id, v_source.document_version_id, v_source.id, 'PENDING',
    v_key, clock_timestamp(), clock_timestamp(),
    jsonb_strip_nulls(jsonb_build_object('source_id', v_source.id, 'file_provider', v_source.file_provider)),
    auth.uid()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    insert into public.ingestion_events (job_id, event_type, detail)
    values (v_job_id, 'QUEUED', jsonb_strip_nulls(jsonb_build_object(
      'source_id', v_source.id, 'document_version_id', v_source.document_version_id,
      'file_provider', v_source.file_provider
    )));

    update public.documents
    set ingestion_status = 'QUEUED'
    where id = v_document.id
      and ingestion_status in ('NOT_STARTED', 'NEEDS_REPROCESS', 'FAILED');
  else
    select id into v_job_id from public.ingestion_jobs where idempotency_key = v_key;
  end if;

  return v_job_id;
end;
$$;

create or replace function public.enqueue_ingestion_for_document_sources(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_count integer := 0;
begin
  for v_source_id in
    select s.id
    from public.document_sources s
    join public.document_versions v on v.id = s.document_version_id
    join public.documents d on d.id = v.document_id
    where d.id = p_document_id
      and d.status = 'PUBLISHED'
      and d.current_version_id = v.id
      and v.is_current
  loop
    if public.queue_ingestion_for_source(v_source_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.trg_queue_ingestion_for_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_ingestion_for_source(new.id);
  return new;
end;
$$;

drop trigger if exists trg_document_sources_queue_ingestion on public.document_sources;
create trigger trg_document_sources_queue_ingestion
  after insert on public.document_sources
  for each row execute function public.trg_queue_ingestion_for_source();

create or replace function public.trg_queue_ingestion_when_document_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'PUBLISHED'
     and (old.status is distinct from new.status or old.current_version_id is distinct from new.current_version_id) then
    perform public.enqueue_ingestion_for_document_sources(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_queue_ingestion_when_published on public.documents;
create trigger trg_documents_queue_ingestion_when_published
  after update of status, current_version_id on public.documents
  for each row execute function public.trg_queue_ingestion_when_document_published();

create or replace function public.claim_ingestion_jobs(
  p_worker_id text,
  p_batch_size integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.ingestion_jobs
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
    update public.ingestion_jobs j
    set status = 'FAILED', claim_token = null, worker_id = null, claimed_at = null,
        lease_expires_at = null, completed_at = v_now, error_code = 'MAX_ATTEMPTS_EXCEEDED',
        last_error = 'Processing lease expired after max attempts', last_error_at = v_now,
        updated_at = v_now
    where j.status = 'PROCESSING'
      and j.lease_expires_at <= v_now
      and j.attempt_count >= j.max_attempts
    returning j.id, j.attempt_count
  )
  insert into public.ingestion_events (job_id, event_type, detail)
  select id, 'FAILED', jsonb_build_object('attempt', attempt_count, 'error_code', 'MAX_ATTEMPTS_EXCEEDED')
  from exhausted;

  return query
  with candidates as (
    select j.id
    from public.ingestion_jobs j
    where (
      (j.status in ('PENDING', 'RETRY') and j.scheduled_at <= v_now and j.next_attempt_at <= v_now)
      or (j.status = 'PROCESSING' and j.lease_expires_at <= v_now and j.attempt_count < j.max_attempts)
    )
    order by j.next_attempt_at, j.scheduled_at, j.created_at, j.id
    for update skip locked
    limit v_batch
  ), claimed as (
    update public.ingestion_jobs j
    set status = 'PROCESSING', attempt_count = j.attempt_count + 1, claim_token = gen_random_uuid(),
        worker_id = p_worker_id, claimed_at = v_now, started_at = v_now,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds), updated_at = v_now
    from candidates c
    where j.id = c.id
    returning j.*
  ), logged as (
    insert into public.ingestion_events (job_id, event_type, detail)
    select id, 'CLAIMED', jsonb_build_object('attempt', attempt_count, 'worker_id', p_worker_id)
    from claimed
  )
  select c.* from claimed c;
end;
$$;

create or replace function public.complete_ingestion_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
begin
  if p_job_id is null or p_claim_token is null or not public.ingestion_event_detail_is_safe(p_result) then
    raise exception 'INVALID_INGESTION_COMPLETION';
  end if;

  update public.ingestion_jobs j
  set status = 'SUCCEEDED', claim_token = null, worker_id = null, claimed_at = null,
      lease_expires_at = null, completed_at = v_now, next_attempt_at = null,
      error_code = null, last_error = null, last_error_at = null, result = p_result, updated_at = v_now
  where j.id = p_job_id
    and j.status = 'PROCESSING'
    and j.claim_token = p_claim_token
    and j.lease_expires_at > v_now
  returning j.attempt_count into v_attempt;

  if not found then
    return false;
  end if;

  insert into public.ingestion_events (job_id, event_type, detail)
  values (p_job_id, 'SUCCEEDED', jsonb_build_object('attempt', v_attempt));
  return true;
end;
$$;

create or replace function public.fail_ingestion_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
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
  v_next_attempt_at timestamptz;
begin
  if p_job_id is null or p_claim_token is null
     or p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
     or p_error_message is null or length(p_error_message) > 500 then
    raise exception 'INVALID_INGESTION_FAILURE';
  end if;

  select attempt_count, max_attempts into v_attempt, v_max_attempts
  from public.ingestion_jobs
  where id = p_job_id and status = 'PROCESSING' and claim_token = p_claim_token and lease_expires_at > v_now
  for update;
  if not found then
    return false;
  end if;

  if coalesce(p_retryable, true) and v_attempt < v_max_attempts then
    v_status := 'RETRY';
    v_next_attempt_at := v_now + make_interval(secs => case least(v_attempt, 4)
      when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end);
  else
    v_status := 'FAILED';
    v_next_attempt_at := null;
  end if;

  update public.ingestion_jobs
  set status = v_status, claim_token = null, worker_id = null, claimed_at = null,
      lease_expires_at = null, next_attempt_at = v_next_attempt_at, completed_at = case when v_status = 'FAILED' then v_now else null end,
      error_code = p_error_code, last_error = p_error_message, last_error_at = v_now, updated_at = v_now
  where id = p_job_id;

  insert into public.ingestion_events (job_id, event_type, detail)
  values (p_job_id, v_status, jsonb_build_object('attempt', v_attempt, 'error_code', p_error_code));
  return true;
end;
$$;

-- =====================================================================================
-- 3. RLS and grants: jobs remain backend-only for mutation
-- =====================================================================================
revoke all on function public.ingestion_event_detail_is_safe(jsonb) from public, anon, authenticated;
revoke all on function public.queue_ingestion_for_source(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_ingestion_for_document_sources(uuid) from public, anon, authenticated;
revoke all on function public.claim_ingestion_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_ingestion_job(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_ingestion_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_ingestion_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_ingestion_job(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_ingestion_job(uuid, uuid, text, text, boolean) to service_role;

-- =====================================================================================
-- 4. pg_cron -> pg_net -> Edge Function (Vault names only; no secret value in this repo)
-- =====================================================================================
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingestion_jobs_worker') then
    perform cron.unschedule('ingestion_jobs_worker');
  end if;
end;
$$;

select cron.schedule(
  'ingestion_jobs_worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ingestion_jobs_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ingestion_jobs_worker_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

comment on table public.ingestion_jobs is
  'P5-02 bounded, provider-neutral ingestion queue. Claim/complete/fail are service_role-only; a lease prevents double-processing.';
