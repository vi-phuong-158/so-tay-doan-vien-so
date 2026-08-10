-- Phase 2 · P2-14 acceptance — export/bundle reuse the dashboard scope contract.
begin;
select no_plan();

create or replace function p14_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function p14_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select p14_reset_auth();

select has_table('public', 'audit_logs', 'E1 audit destination exists for download actions');
select has_column('public', 'report_submission_files', 'storage_path', 'E2 bundle source retains private storage metadata only');
select function_privs_are('public', 'get_report_dashboard_assignments', array['uuid', 'text', 'text'], 'authenticated', array['EXECUTE'], 'E3 export callers can only reuse authenticated dashboard RPC');
select function_privs_are('public', 'get_report_dashboard_assignments', array['uuid', 'text', 'text'], 'anon', array[]::text[], 'E4 anonymous caller cannot use dashboard scope for export');

select p14_set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq(
  $$ select count(*)::integer from public.get_report_dashboard_assignments('55555555-5555-5555-5555-555555555555', null, null) $$,
  array[2], 'E5 SYSTEM_ADMIN sees only the seeded campaign assignments through the scoped RPC');
select throws_ok(
  $$ select * from public.get_report_dashboard_assignments('55555555-5555-5555-5555-555555555555', 'NOT_A_STATUS', null) $$,
  'INVALID_DASHBOARD_FILTER', 'E6 invalid export filter fails in the database before any file read');
select p14_reset_auth();
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select * from public.get_report_dashboard_assignments('55555555-5555-5555-5555-555555555555', null, null) $$,
  'permission denied for function get_report_dashboard_assignments', 'E7 anonymous cannot reach the export scope RPC');
select * from finish();
rollback;
