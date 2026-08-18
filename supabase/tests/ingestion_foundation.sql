-- Phase 5 / P5-02 acceptance: provider-neutral locators, trigger queueing, leases and RLS.
begin;
select no_plan();

create or replace function set_ingestion_test_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function reset_ingestion_test_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_ingestion_test_auth();

-- CĐA fixture and CĐB fixture prove both trigger behavior and provider metadata does not bypass RLS.
insert into public.documents (
  id, title, document_number, status, visibility_level, owner_organization_id, created_by, source_class
) values
  ('d1000001-0000-0000-0000-000000000001', 'P5-02 source A', 'P5-02-A', 'PUBLISHED', 'INTERNAL_YOUTH',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_B_INTERNAL'),
  ('d1000002-0000-0000-0000-000000000002', 'P5-02 source B', 'P5-02-B', 'PUBLISHED', 'RESTRICTED',
   '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CLASS_B_INTERNAL')
on conflict (id) do nothing;

insert into public.document_versions (id, document_id, version_number, content_hash, is_current, created_by) values
  ('d2000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000001', 1, 'p5-02-hash-a', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('d2000002-0000-0000-0000-000000000002', 'd1000002-0000-0000-0000-000000000002', 1, 'p5-02-hash-b', true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

update public.documents set current_version_id = 'd2000001-0000-0000-0000-000000000001' where id = 'd1000001-0000-0000-0000-000000000001';
update public.documents set current_version_id = 'd2000002-0000-0000-0000-000000000002' where id = 'd1000002-0000-0000-0000-000000000002';

insert into public.document_sources (
  id, document_version_id, source_kind, file_provider, external_file_id, external_parent_id, provider_metadata
) values
  ('d3000001-0000-0000-0000-000000000001', 'd2000001-0000-0000-0000-000000000001', 'STORAGE_FILE',
   'GOOGLE_DRIVE', 'opaque-drive-file-a', 'opaque-parent-a', '{"mime_type":"application/pdf"}'::jsonb),
  ('d3000002-0000-0000-0000-000000000002', 'd2000002-0000-0000-0000-000000000002', 'STORAGE_FILE',
   'GOOGLE_DRIVE', 'opaque-drive-file-b', 'opaque-parent-b', '{"mime_type":"application/pdf"}'::jsonb)
on conflict (id) do nothing;

-- Provider-neutral shape and P4 storage compatibility.
select has_column('public', 'document_sources', 'file_provider', 'source locators declare a provider without assuming Drive');
select has_column('public', 'document_sources', 'external_file_id', 'external file id is stored as an opaque locator');
select has_column('public', 'document_sources', 'provider_metadata', 'provider metadata has a bounded non-secret home');
select is((select file_provider from public.document_sources where id = 'd3000001-0000-0000-0000-000000000001'), 'GOOGLE_DRIVE',
  'Google Drive is one provider value, not a schema branch');
select throws_ok(
  $$ insert into public.document_sources (document_version_id, source_kind, file_provider, external_file_id, provider_metadata)
     values ('d2000001-0000-0000-0000-000000000001', 'STORAGE_FILE', 'GOOGLE_DRIVE', 'opaque-other', '{"refresh_token":"forbidden"}'::jsonb) $$,
  '23514', null, 'provider metadata rejects OAuth credentials');
select throws_ok(
  $$ insert into public.document_sources (document_version_id, source_kind, file_provider, external_file_id)
     values ('d2000001-0000-0000-0000-000000000001', 'STORAGE_FILE', 'SUPABASE_STORAGE', 'not-a-storage-path') $$,
  '23514', null, 'Supabase Storage keeps the accepted storage_path contract');

-- Trigger queueing is atomic with source registration; retrying the logical queue operation does not duplicate it.
select is((select count(*)::integer from public.ingestion_jobs where document_source_id = 'd3000001-0000-0000-0000-000000000001'), 1,
  'canonical source registration creates exactly one ingestion job');
select is((select public.queue_ingestion_for_source('d3000001-0000-0000-0000-000000000001')), (select id from public.ingestion_jobs where document_source_id = 'd3000001-0000-0000-0000-000000000001'),
  'replaying the logical source queue operation returns its original job');
select is((select count(*)::integer from public.ingestion_jobs where document_source_id = 'd3000001-0000-0000-0000-000000000001'), 1,
  'replayed trigger logic cannot create a duplicate job');
select is((select ingestion_status from public.documents where id = 'd1000001-0000-0000-0000-000000000001'), 'QUEUED',
  'queueing advances only the ingestion state axis');
select is((select status from public.documents where id = 'd1000001-0000-0000-0000-000000000001'), 'PUBLISHED',
  'queueing never changes the accepted publication state');

-- Isolate explicit lifecycle fixtures below from the two automatic trigger jobs above.
update public.ingestion_jobs set status = 'CANCELLED'
where document_source_id in ('d3000001-0000-0000-0000-000000000001', 'd3000002-0000-0000-0000-000000000002');

-- Claim is atomic; a live lease blocks a second worker and an expired lease is reclaimed with a new attempt.
insert into public.ingestion_jobs (id, job_kind, document_id, document_version_id, status, idempotency_key, max_attempts, next_attempt_at)
values ('d8000001-0000-0000-0000-000000000001', 'EXTRACT', 'd1000001-0000-0000-0000-000000000001',
        'd2000001-0000-0000-0000-000000000001', 'PENDING', 'P5-02-LEASE-ONE', 3, now() - interval '1 minute');
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-a', 1, 300) where id = 'd8000001-0000-0000-0000-000000000001'), 1,
  'one worker claims a pending job');
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-b', 50, 300) where id = 'd8000001-0000-0000-0000-000000000001'), 0,
  'a second worker cannot claim an active lease');
select is((select attempt_count from public.ingestion_jobs where id = 'd8000001-0000-0000-0000-000000000001'), 1,
  'first claim increments attempt_count exactly once');
update public.ingestion_jobs set lease_expires_at = now() - interval '1 second' where id = 'd8000001-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-b', 50, 300) where id = 'd8000001-0000-0000-0000-000000000001'), 1,
  'an expired worker lease is reclaimed');
select is((select attempt_count from public.ingestion_jobs where id = 'd8000001-0000-0000-0000-000000000001'), 2,
  'reclaim increments attempt_count exactly once more');
select is((select public.complete_ingestion_job('d8000001-0000-0000-0000-000000000001', claim_token, '{"handler":"NO_OP"}'::jsonb)
           from public.ingestion_jobs where id = 'd8000001-0000-0000-0000-000000000001'), true,
  'matching live claim token completes a job');
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-c', 50, 300) where id = 'd8000001-0000-0000-0000-000000000001'), 0,
  'completed jobs cannot be claimed again');

-- Retry has bounded backoff and exhausted jobs become terminal failures when reclaim runs.
insert into public.ingestion_jobs (id, job_kind, document_id, status, idempotency_key, max_attempts, next_attempt_at)
values ('d8000002-0000-0000-0000-000000000002', 'EXTRACT', 'd1000001-0000-0000-0000-000000000001', 'PENDING', 'P5-02-RETRY', 2, now() - interval '1 minute');
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-retry', 50, 300) where id = 'd8000002-0000-0000-0000-000000000002'), 1,
  'retry fixture is claimed');
select is((select public.fail_ingestion_job('d8000002-0000-0000-0000-000000000002', claim_token, 'FIXTURE_ERROR', 'fixture failure', true)
           from public.ingestion_jobs where id = 'd8000002-0000-0000-0000-000000000002'), true,
  'retryable failure is accepted only from its live lease owner');
select is((select status from public.ingestion_jobs where id = 'd8000002-0000-0000-0000-000000000002'), 'RETRY',
  'retryable failure enters RETRY rather than losing the job');
update public.ingestion_jobs set next_attempt_at = now() - interval '1 second' where id = 'd8000002-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-retry-2', 50, 300) where id = 'd8000002-0000-0000-0000-000000000002'), 1,
  'retry is eligible after its scheduled backoff');
update public.ingestion_jobs set lease_expires_at = now() - interval '1 second' where id = 'd8000002-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-terminal', 50, 300) where id = 'd8000002-0000-0000-0000-000000000002'), 0,
  'max-attempt lease is not reclaimed for processing');
select is((select status from public.ingestion_jobs where id = 'd8000002-0000-0000-0000-000000000002'), 'FAILED',
  'max_attempts produces a terminal FAILED state');

insert into public.ingestion_jobs (id, job_kind, document_id, status, idempotency_key, next_attempt_at)
values ('d8000003-0000-0000-0000-000000000003', 'EXTRACT', 'd1000001-0000-0000-0000-000000000001', 'CANCELLED', 'P5-02-CANCELLED', now() - interval '1 minute');
select is((select count(*)::integer from public.claim_ingestion_jobs('worker-cancelled', 50, 300) where id = 'd8000003-0000-0000-0000-000000000003'), 0,
  'cancelled jobs cannot be claimed');

-- Operational evidence is append-only and never permits document content.
select throws_ok(
  $$ update public.ingestion_events set event_type = 'TAMPERED' where job_id = 'd8000001-0000-0000-0000-000000000001' $$,
  '23514', null, 'ingestion events are append-only');
select throws_ok(
  $$ insert into public.ingestion_events (job_id, event_type, detail)
     values ('d8000001-0000-0000-0000-000000000001', 'TAMPER', '{"content":"never log source text"}'::jsonb) $$,
  '23514', null, 'ingestion event detail rejects document content');

-- Browser roles remain read-only and document-scoped even when the source has a Drive provider id.
select reset_ingestion_test_auth();
select set_ingestion_test_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'); -- MEMBER, CĐA
select throws_ok(
  $$ insert into public.ingestion_jobs (job_kind, document_id, idempotency_key) values
     ('EXTRACT', 'd1000001-0000-0000-0000-000000000001', 'MEMBER-FORGE') $$,
  '42501', null, 'authenticated users cannot insert ingestion jobs');
select throws_ok(
  $$ update public.ingestion_jobs set status = 'SUCCEEDED' where id = 'd8000001-0000-0000-0000-000000000001' $$,
  '42501', null, 'authenticated users cannot update ingestion jobs');
select is((select count(*)::integer from public.document_sources where id = 'd3000001-0000-0000-0000-000000000001'), 1,
  'accessible provider metadata stays behind the document access gate');
select is((select count(*)::integer from public.document_sources where id = 'd3000002-0000-0000-0000-000000000002'), 0,
  'a Drive provider id does not bypass can_access_document for another organization');

select reset_ingestion_test_auth();
select set_ingestion_test_user('11112222-3333-4444-5555-666677778888'); -- Youth Admin A, CĐA only
select is((select count(*)::integer from public.ingestion_jobs where document_id = 'd1000002-0000-0000-0000-000000000002'), 0,
  'CĐA curator cannot read CĐB ingestion jobs');

select reset_ingestion_test_auth();
select set_ingestion_test_user('99999999-9999-9999-9999-999999999999');
select is((select count(*)::integer from public.ingestion_jobs), 0, 'suspended user fails closed for ingestion jobs');

select reset_ingestion_test_auth();
select * from finish();
rollback;
