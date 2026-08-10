-- Phase 2 · P2-13 acceptance — server aggregation and scope are inseparable.
begin;
select no_plan();

create or replace function p13_set_auth(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function p13_reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
select p13_reset_auth();

insert into public.organizations(id, code, name, organization_type, parent_id, is_active) values
('13130000-0000-4000-8000-000000000001', 'P13A', 'Đơn vị P13 chưa nộp', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000002', 'P13B', 'Đơn vị P13 đã nộp', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000003', 'P13C', 'Đơn vị P13 cần bổ sung', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000004', 'P13D', 'Đơn vị P13 nộp lại', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000005', 'P13E', 'Đơn vị P13 hoàn thành', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000006', 'P13F', 'Đơn vị P13 quá hạn', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true),
('13130000-0000-4000-8000-000000000007', 'P13G', 'Đơn vị P13 miễn nộp', 'YOUTH_BRANCH', '11111111-1111-1111-1111-111111111111', true)
on conflict (id) do update set is_active = true;

insert into public.report_campaigns(id, title, open_at, due_at, status, created_by)
values ('13130000-0000-4000-8000-000000000099', 'P2-13 dashboard', now() - interval '2 days', now() + interval '3 days', 'PUBLISHED', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.report_assignments(campaign_id, organization_id, status) values
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000001', 'PENDING'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000002', 'SUBMITTED'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000003', 'NEEDS_SUPPLEMENT'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000004', 'RESUBMITTED'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000005', 'ACCEPTED'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000006', 'OVERDUE'),
('13130000-0000-4000-8000-000000000099', '13130000-0000-4000-8000-000000000007', 'EXEMPTED');
insert into public.report_submissions(assignment_id, version_number, submitted_by, is_late, review_status)
select id, 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false, 'PENDING' from public.report_assignments where campaign_id='13130000-0000-4000-8000-000000000099' and organization_id='13130000-0000-4000-8000-000000000002';
insert into public.report_submissions(assignment_id, version_number, submitted_by, is_late, review_status)
select id, 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false, 'NEEDS_SUPPLEMENT' from public.report_assignments where campaign_id='13130000-0000-4000-8000-000000000099' and organization_id='13130000-0000-4000-8000-000000000003';
insert into public.report_submissions(assignment_id, version_number, submitted_by, is_late, review_status)
select id, 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc', false, 'NEEDS_SUPPLEMENT' from public.report_assignments where campaign_id='13130000-0000-4000-8000-000000000099' and organization_id='13130000-0000-4000-8000-000000000004';
insert into public.report_submissions(assignment_id, version_number, submitted_by, is_late, review_status)
select id, 2, 'cccccccc-cccc-cccc-cccc-cccccccccccc', true, 'PENDING' from public.report_assignments where campaign_id='13130000-0000-4000-8000-000000000099' and organization_id='13130000-0000-4000-8000-000000000004';

select p13_set_auth('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select results_eq(
  $$ select total_assignments::text || '|' || pending_count::text || '|' || submitted_count::text || '|' || needs_supplement_count::text || '|' || resubmitted_count::text || '|' || accepted_count::text || '|' || overdue_count::text || '|' || late_submitted_count::text || '|' || exempted_count::text || '|' || completed_count::text || '|' || completion_rate::text from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$,
  array['7|1|1|1|1|1|1|1|1|2|28.57'::text], 'D1 aggregate counts, accepted/exempt completion and late version semantics are correct');
select results_eq(
  $$ select organization_code from public.get_report_dashboard_assignments('13130000-0000-4000-8000-000000000099', 'LATE_SUBMITTED', null) $$,
  array['P13D'::text], 'D2 late filter reads latest submission is_late without changing RESUBMITTED workflow state');
select results_eq(
  $$ select organization_code from public.get_report_dashboard_assignments('13130000-0000-4000-8000-000000000099', null, 'hoàn thành') $$,
  array['P13E'::text], 'D3 search is server-side and returns organization names only');

-- Narrow YOUTH_ADMIN scope can access its own campaign row only; aggregate is never global then hidden in UI.
select p13_reset_auth();
update public.report_assignments set organization_id='22222222-2222-2222-2222-222222222222' where campaign_id='13130000-0000-4000-8000-000000000099' and organization_id='13130000-0000-4000-8000-000000000001';
select p13_set_auth('11112222-3333-4444-5555-666677778888');
select results_eq($$ select total_assignments from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, array[1], 'D4 narrow scoped admin aggregate excludes all out-of-scope assignments');
select results_eq($$ select count(*)::integer from public.get_report_dashboard_assignments('13130000-0000-4000-8000-000000000099') $$, array[1], 'D5 narrow scoped admin receives no out-of-scope assignment rows');

select p13_set_auth('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq($$ select total_assignments from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, array[7], 'D6 SYSTEM_ADMIN has global dashboard behavior');
select p13_set_auth('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok($$ select * from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, 'REPORT_CAMPAIGN_SCOPE_DENIED', 'D7 MEMBER is denied dashboard access');
select p13_set_auth('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok($$ select * from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, 'REPORT_CAMPAIGN_SCOPE_DENIED', 'D8 BRANCH_OFFICER is denied dashboard access');
select p13_set_auth('99999999-9999-9999-9999-999999999999');
select throws_ok($$ select * from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, 'ACCOUNT_NOT_ACTIVE', 'D9 suspended account is denied dashboard access');
select set_config('role', 'anon', true); select set_config('request.jwt.claims', '{}', true);
select throws_ok($$ select * from public.get_report_dashboard('13130000-0000-4000-8000-000000000099') $$, 'permission denied for function get_report_dashboard', 'D10 anonymous caller cannot execute dashboard RPC');

select p13_reset_auth();
select function_privs_are('public', 'get_report_dashboard', array['uuid'], 'authenticated', array['EXECUTE'], 'D11 authenticated has explicit dashboard execute');
select function_privs_are('public', 'get_report_dashboard', array['uuid'], 'anon', array[]::text[], 'D12 anon has no dashboard execute');
select * from finish();
rollback;
