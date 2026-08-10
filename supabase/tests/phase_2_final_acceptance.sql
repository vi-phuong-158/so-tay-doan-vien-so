-- P2-15 — integrated Phase 2 vertical slice.
-- One transaction proves the real controlled RPC chain from campaign draft through accepted v2,
-- immutable history and the dashboard/export read models. Edge-specific ZIP/XLSX serialization is
-- covered by Deno tests; this suite proves the database scope contract those functions consume.
begin;
select no_plan();

create or replace function p15_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function p15_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

create temp table p15_ids(campaign_id uuid, assignment_id uuid);
grant all on p15_ids to authenticated;

-- Admin creates a draft, attaches private template metadata, then publishes one assignment.
select p15_set_auth('11112222-3333-4444-5555-666677778888');
insert into p15_ids(campaign_id)
select id from public.create_report_campaign(
  'P2-15 vertical slice', 'Technical acceptance', 'Ban Thanh niên',
  now() - interval '1 hour', now() + interval '7 days', null,
  false, true, array['pdf'], 20, 2, '{}'::jsonb, 'INTERNAL_YOUTH'
);
select p15_reset_auth();
insert into storage.objects(bucket_id, name, owner, metadata)
select 'report-templates-private', campaign_id::text || '/12345678-1234-4123-8123-123456789abc-template.pdf',
  '11112222-3333-4444-5555-666677778888', '{"size":100,"mimetype":"application/pdf"}'::jsonb
from p15_ids;
select p15_set_auth('11112222-3333-4444-5555-666677778888');
select lives_ok(
  $$ select public.register_report_campaign_template(
    (select campaign_id from p15_ids),
    (select campaign_id::text || '/12345678-1234-4123-8123-123456789abc-template.pdf' from p15_ids),
    'template.pdf', 'application/pdf', 100) $$,
  'V1 scoped admin registers private campaign template');
select lives_ok(
  $$ select public.publish_report_campaign((select campaign_id from p15_ids), array['22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'V2 scoped admin atomically publishes campaign and assignment');
select p15_reset_auth();
update p15_ids set assignment_id = (
  select id from public.report_assignments where campaign_id = p15_ids.campaign_id
);

-- Officer submits immutable v1 from a Storage object already finalized by the trusted Edge path.
insert into storage.objects(bucket_id, name, owner, metadata)
select 'report-submissions-private',
  campaign_id::text || '/22222222-2222-2222-2222-222222222222/' || assignment_id::text || '/v1/report-v1.pdf',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"size":101,"mimetype":"application/pdf"}'::jsonb
from p15_ids;
select p15_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');
select lives_ok(
  $$ select public.create_report_submission_with_files(
    (select assignment_id from p15_ids), 'version one', null,
    jsonb_build_array(jsonb_build_object(
      'storage_path', (select campaign_id::text || '/22222222-2222-2222-2222-222222222222/' || assignment_id::text || '/v1/report-v1.pdf' from p15_ids),
      'original_name', 'report-v1.pdf', 'safe_name', 'report-v1.pdf',
      'mime_type', 'application/pdf', 'size_bytes', 101
    )), 1) $$,
  'V3 branch officer submits version 1');

-- Admin requests a supplement; officer creates v2; admin accepts the latest version.
select p15_set_auth('11112222-3333-4444-5555-666677778888');
select lives_ok(
  $$ select public.review_report_assignment((select assignment_id from p15_ids), 'NEEDS_SUPPLEMENT', 'Bổ sung phụ lục') $$,
  'V4 admin requests supplement with reason');
select p15_reset_auth();
insert into storage.objects(bucket_id, name, owner, metadata)
select 'report-submissions-private',
  campaign_id::text || '/22222222-2222-2222-2222-222222222222/' || assignment_id::text || '/v2/report-v2.pdf',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"size":202,"mimetype":"application/pdf"}'::jsonb
from p15_ids;
select p15_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');
select lives_ok(
  $$ select public.create_report_submission_with_files(
    (select assignment_id from p15_ids), 'version two', 'Đã bổ sung',
    jsonb_build_array(jsonb_build_object(
      'storage_path', (select campaign_id::text || '/22222222-2222-2222-2222-222222222222/' || assignment_id::text || '/v2/report-v2.pdf' from p15_ids),
      'original_name', 'report-v2.pdf', 'safe_name', 'report-v2.pdf',
      'mime_type', 'application/pdf', 'size_bytes', 202
    )), 2) $$,
  'V5 officer resubmits immutable version 2');
select p15_set_auth('11112222-3333-4444-5555-666677778888');
select lives_ok(
  $$ select public.review_report_assignment((select assignment_id from p15_ids), 'ACCEPTED', null) $$,
  'V6 admin accepts latest submission');

select results_eq(
  $$ select status || '|' || (accepted_at is not null)::text from public.report_assignments where id=(select assignment_id from p15_ids) $$,
  array['ACCEPTED|true'::text], 'V7 final assignment state is ACCEPTED with server timestamp');
select results_eq(
  $$ select array_agg(version_number order by version_number) from public.report_submissions where assignment_id=(select assignment_id from p15_ids) $$,
  $$ values (array[1,2]::integer[]) $$, 'V8 immutable submission history retains v1 and v2');
select results_eq(
  $$ select array_agg(review_status order by version_number) from public.report_submissions where assignment_id=(select assignment_id from p15_ids) $$,
  $$ values (array['NEEDS_SUPPLEMENT','ACCEPTED']::text[]) $$, 'V9 reviews remain attached to their respective versions');
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id=(select assignment_id from p15_ids) $$,
  array[5], 'V10 publish, submit, supplement, resubmit and accept transitions are auditable');
select results_eq(
  $$ select total_assignments::text || '|' || accepted_count::text || '|' || completed_count::text || '|' || completion_rate::text from public.get_report_dashboard((select campaign_id from p15_ids)) $$,
  array['1|1|1|100.00'::text], 'V11 dashboard aggregate reflects accepted latest state');
select results_eq(
  $$ select status || '|' || latest_version::text || '|' || review_status from public.get_report_dashboard_assignments((select campaign_id from p15_ids), 'COMPLETED', null) $$,
  array['ACCEPTED|2|ACCEPTED'::text], 'V12 export/bundle scope source selects accepted latest v2');
select results_eq(
  $$ select count(*)::integer from public.report_submission_files f join public.report_submissions s on s.id=f.submission_id where s.assignment_id=(select assignment_id from p15_ids) $$,
  array[2], 'V13 both versioned file records remain immutable and addressable');

select * from finish();
rollback;
