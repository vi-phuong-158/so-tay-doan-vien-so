-- Phase 5 / P5-R0: provider-neutral ingestion queue foundation.
-- No extraction, AI generation, embedding generation or retrieval is performed here.

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null check (job_kind in (
    'SOURCE_READY', 'SNAPSHOT_REFRESH', 'ARTICLE_DRAFT', 'EVIDENCE_REVIEW', 'EMBEDDING_REFRESH'
  )),
  document_id uuid not null references public.documents(id),
  document_version_id uuid references public.document_versions(id),
  source_id uuid references public.document_sources(id),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
  scheduled_at timestamptz not null default now(),
  next_attempt_at timestamptz default now(),
  worker_id text,
  claim_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  last_error text,
  last_error_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_id is not null or document_version_id is not null)
);

create table if not exists public.ingestion_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ingestion_jobs(id),
  event_type text not null check (event_type in (
    'QUEUED', 'CLAIMED', 'STALE_RECLAIMED', 'SUCCEEDED', 'RETRY', 'FAILED', 'CANCELLED'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ingestion_jobs is
  'Backend-only P5 queue. Claim ownership is a lease and idempotency_key prevents duplicate work.';
comment on table public.ingestion_events is
  'Append-only operational events. Never store document text, tokens or credentials here.';

create index if not exists idx_ingestion_jobs_claimable_p5
  on public.ingestion_jobs (status, next_attempt_at, scheduled_at, created_at)
  where status in ('PENDING', 'RETRY');
create index if not exists idx_ingestion_jobs_stale_p5
  on public.ingestion_jobs (lease_expires_at)
  where status = 'PROCESSING';
create index if not exists idx_ingestion_jobs_source_p5
  on public.ingestion_jobs (source_id, job_kind);
create index if not exists idx_ingestion_events_job_p5
  on public.ingestion_events (job_id, created_at desc);

create or replace function public.enforce_ingestion_job_provenance()
returns trigger
language plpgsql
as $$
declare
  v_document_id uuid;
  v_version_id uuid;
begin
  if new.source_id is not null then
    select v.document_id, v.id into v_document_id, v_version_id
      from public.document_sources s
      join public.document_versions v on v.id = s.document_version_id
     where s.id = new.source_id;
    if v_document_id is null or new.document_id <> v_document_id
       or (new.document_version_id is not null and new.document_version_id <> v_version_id) then
      raise exception 'INGESTION_JOB_PROVENANCE_MISMATCH' using errcode = 'check_violation';
    end if;
    new.document_version_id := coalesce(new.document_version_id, v_version_id);
  elsif new.document_version_id is not null then
    select document_id into v_document_id from public.document_versions where id = new.document_version_id;
    if v_document_id is null or new.document_id <> v_document_id then
      raise exception 'INGESTION_JOB_PROVENANCE_MISMATCH' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ingestion_jobs_provenance on public.ingestion_jobs;
create trigger trg_ingestion_jobs_provenance
before insert or update on public.ingestion_jobs
for each row execute function public.enforce_ingestion_job_provenance();

create or replace function public.ingestion_event_detail_is_safe(p_detail jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_detail, '{}'::jsonb)) = 'object'
    and length(coalesce(p_detail, '{}'::jsonb)::text) <= 4000
    and not (coalesce(p_detail, '{}'::jsonb) ?| array['content', 'document_text', 'bytes', 'access_token', 'refresh_token', 'client_secret']);
$$;

create or replace function public.queue_ingestion_for_source(p_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_sources%rowtype;
  v_version public.document_versions%rowtype;
  v_job_id uuid;
  v_key text;
begin
  select * into v_source from public.document_sources where id = p_source_id;
  if not found then return null; end if;
  select * into v_version from public.document_versions where id = v_source.document_version_id;
  if not found then raise exception 'DOCUMENT_VERSION_NOT_FOUND'; end if;

  v_key := format('source:%s:version:%s:SOURCE_READY', v_source.id, v_version.id);
  insert into public.ingestion_jobs (
    job_kind, document_id, document_version_id, source_id, idempotency_key
  ) values (
    'SOURCE_READY', v_version.document_id, v_version.id, v_source.id, v_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id from public.ingestion_jobs where idempotency_key = v_key;
  else
    insert into public.ingestion_events (job_id, event_type, detail)
    values (v_job_id, 'QUEUED', jsonb_build_object('job_kind', 'SOURCE_READY'));
  end if;
  return v_job_id;
end;
$$;

create or replace function public.enqueue_ingestion_for_document(p_document_id uuid)
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
     where v.document_id = p_document_id
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
     and (old.status is distinct from new.status
       or old.current_version_id is distinct from new.current_version_id) then
    perform public.enqueue_ingestion_for_document(new.id);
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

  with reclaimed as (
    update public.ingestion_jobs j
       set status = case when j.attempt_count >= j.max_attempts then 'FAILED' else 'RETRY' end,
           worker_id = null, claim_token = null, claimed_at = null, lease_expires_at = null,
           completed_at = case when j.attempt_count >= j.max_attempts then v_now else null end,
           next_attempt_at = case when j.attempt_count >= j.max_attempts
             then null else v_now + make_interval(secs => case
               when j.attempt_count <= 1 then 60
               when j.attempt_count = 2 then 120
               when j.attempt_count = 3 then 240
               else 3600 end) end,
           error_code = case when j.attempt_count >= j.max_attempts then 'MAX_ATTEMPTS_EXCEEDED' else 'LEASE_EXPIRED' end,
           last_error = 'Processing lease expired', last_error_at = v_now, updated_at = v_now
     where j.status = 'PROCESSING' and j.lease_expires_at <= v_now
     returning j.id, j.attempt_count, j.status
  )
  insert into public.ingestion_events (job_id, event_type, detail)
  select id, 'STALE_RECLAIMED', jsonb_build_object('attempt', attempt_count, 'status', status)
    from reclaimed;

  return query
  with candidates as (
    select j.id
      from public.ingestion_jobs j
     where j.status in ('PENDING', 'RETRY')
       and j.scheduled_at <= v_now
       and j.next_attempt_at <= v_now
     order by j.next_attempt_at, j.scheduled_at, j.created_at, j.id
     for update skip locked
     limit v_batch
  ), claimed as (
    update public.ingestion_jobs j
       set status = 'PROCESSING', attempt_count = j.attempt_count + 1,
           claim_token = gen_random_uuid(), worker_id = p_worker_id,
           claimed_at = v_now, started_at = v_now,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds), updated_at = v_now
      from candidates c
     where j.id = c.id
     returning j.*
  ), logged as (
    insert into public.ingestion_events (job_id, event_type, detail)
    select id, 'CLAIMED', jsonb_build_object('attempt', attempt_count, 'worker_id', p_worker_id)
      from claimed
    returning job_id
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
  v_attempt integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_job_id is null or p_claim_token is null or not public.ingestion_event_detail_is_safe(p_result) then
    raise exception 'INVALID_INGESTION_COMPLETION';
  end if;
  update public.ingestion_jobs
     set status = 'SUCCEEDED', worker_id = null, claim_token = null,
         claimed_at = null, lease_expires_at = null, completed_at = v_now,
         next_attempt_at = null, result = p_result, updated_at = v_now
   where id = p_job_id and status = 'PROCESSING' and claim_token = p_claim_token
     and lease_expires_at > v_now
  returning attempt_count into v_attempt;
  if not found then return false; end if;
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
  v_attempt integer;
  v_max_attempts integer;
  v_status text;
  v_next_attempt timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_job_id is null or p_claim_token is null
     or p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
     or p_error_message is null or length(p_error_message) > 500 then
    raise exception 'INVALID_INGESTION_FAILURE';
  end if;
  select attempt_count, max_attempts into v_attempt, v_max_attempts
    from public.ingestion_jobs
   where id = p_job_id and status = 'PROCESSING'
     and claim_token = p_claim_token and lease_expires_at > v_now
   for update;
  if not found then return false; end if;

  if coalesce(p_retryable, true) and v_attempt < v_max_attempts then
    v_status := 'RETRY';
    v_next_attempt := v_now + make_interval(secs => case
      when v_attempt <= 1 then 60
      when v_attempt = 2 then 120
      when v_attempt = 3 then 240
      else 3600 end);
  else
    v_status := 'FAILED';
    v_next_attempt := null;
  end if;
  update public.ingestion_jobs
     set status = v_status, worker_id = null, claim_token = null,
         claimed_at = null, lease_expires_at = null,
         completed_at = case when v_status = 'FAILED' then v_now else null end,
         next_attempt_at = v_next_attempt, error_code = p_error_code,
         last_error = left(p_error_message, 500), last_error_at = v_now, updated_at = v_now
   where id = p_job_id;
  insert into public.ingestion_events (job_id, event_type, detail)
  values (p_job_id, v_status, jsonb_build_object('attempt', v_attempt, 'error_code', p_error_code));
  return true;
end;
$$;

create or replace function public.prevent_ingestion_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'INGESTION_EVENTS_APPEND_ONLY' using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_ingestion_events_append_only on public.ingestion_events;
create trigger trg_ingestion_events_append_only
before update or delete on public.ingestion_events
for each row execute function public.prevent_ingestion_event_mutation();

alter table public.ingestion_jobs enable row level security;
alter table public.ingestion_events enable row level security;
revoke all on table public.ingestion_jobs, public.ingestion_events from public, anon, authenticated;

revoke all on function public.ingestion_event_detail_is_safe(jsonb) from public, anon, authenticated;
revoke all on function public.queue_ingestion_for_source(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_ingestion_for_document(uuid) from public, anon, authenticated;
revoke all on function public.claim_ingestion_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_ingestion_job(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_ingestion_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_ingestion_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_ingestion_job(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_ingestion_job(uuid, uuid, text, text, boolean) to service_role;
