-- Phase 2 · P2-03 acceptance — report storage authorization & organization isolation.
-- Verifies storage.objects RLS for report-submissions-private / report-templates-private and
-- the table RLS for report_campaign_templates / report_status_history. begin/rollback.
-- Fixtures use seed orgs: CĐA = 2222..., CĐB = 3333..., Ban TN (parent) = 1111...
--   Officer A = cccccccc... (BRANCH_OFFICER, org CĐA)
--   Officer B = dddddddd... (BRANCH_OFFICER, org CĐB)
--   Youth Admin = bbbbbbbb... (YOUTH_ADMIN, scope Ban TN = parent of CĐA)
--   Suspended = 99999999... (SUSPENDED, org CĐA)

begin;

select no_plan();

create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_auth();

-- Campaigns: CS1 assigned to CĐA; CS2 assigned to CĐA only (used for the template negative test).
insert into public.report_campaigns (id, title, issuer, open_at, due_at, status) values
  ('7d000001-0000-0000-0000-000000000001','STO1','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED'),
  ('7d000002-0000-0000-0000-000000000002','STO2','T', now()-interval '1 day', now()+interval '1 day', 'PUBLISHED')
on conflict (id) do nothing;

insert into public.report_assignments (id, campaign_id, organization_id, status) values
  ('7e000001-0000-0000-0000-000000000001','7d000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','SUBMITTED'), -- ASG_A (CS1)
  ('7e000002-0000-0000-0000-000000000002','7d000002-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','PENDING')    -- ASG_A2 (CS2)
on conflict (id) do nothing;

-- A status-history row for ASG_A (readable by CĐA + scoped admins only).
insert into public.report_status_history (assignment_id, from_status, to_status, changed_by) values
  ('7e000001-0000-0000-0000-000000000001','PENDING','SUBMITTED','cccccccc-cccc-cccc-cccc-cccccccccccc')
on conflict do nothing;

-- A template metadata row for CS2.
insert into public.report_campaign_templates (campaign_id, storage_path, file_name) values
  ('7d000002-0000-0000-0000-000000000002','7d000002-0000-0000-0000-000000000002/tpl-uuid-mau.docx','Mau bao cao.docx')
on conflict do nothing;

-- Storage objects. Submission paths carry the org uuid at segment [2].
insert into storage.objects (bucket_id, name, owner) values
  ('report-submissions-private','7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v1/own-uuid.pdf','cccccccc-cccc-cccc-cccc-cccccccccccc'),   -- OWN (Org A)
  ('report-submissions-private','7d000001-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/7e0000ff-0000-0000-0000-0000000000ff/v1/other-uuid.pdf','dddddddd-dddd-dddd-dddd-dddddddddddd'), -- OTHER (Org B)
  ('report-templates-private','7d000002-0000-0000-0000-000000000002/tpl-uuid-mau.docx','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')                                                                             -- TEMPLATE (CS2)
on conflict do nothing;

-- =====================================================================================
-- SUBMISSION STORAGE ISOLATION (mandated negatives)
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
-- Org A -> file A = PASS
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v1/own-uuid.pdf' $$,
  ARRAY[1], 'Org A can read its own submission object');
-- Org A -> file B = DENY
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000001-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/7e0000ff-0000-0000-0000-0000000000ff/v1/other-uuid.pdf' $$,
  ARRAY[0], 'Org A cannot read Org B submission object (isolation)');

-- Anon -> file A = DENY
select set_config('role','anon',true);
select set_config('request.jwt.claims','{}',true);
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v1/own-uuid.pdf' $$,
  ARRAY[0], 'Anon cannot read submission object');

-- Suspended user -> file A = DENY (fail-closed)
select set_auth_user('99999999-9999-9999-9999-999999999999');
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v1/own-uuid.pdf' $$,
  ARRAY[0], 'Suspended user cannot read submission object');

-- Scoped YOUTH_ADMIN (parent org) can read descendant org submission (recursive scope)
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v1/own-uuid.pdf' $$,
  ARRAY[1], 'Youth Admin (parent scope) can read descendant org submission object');

-- =====================================================================================
-- SUBMISSION UPLOAD PATH VALIDATION (insert with-check)
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
-- Officer A can upload into a path under their own org
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('report-submissions-private','7d000001-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222/7e000001-0000-0000-0000-000000000001/v2/new-uuid.pdf') $$,
  'Officer A can upload into its own organization path');
-- Officer A cannot upload into another org's path (cross-org planting blocked)
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('report-submissions-private','7d000001-0000-0000-0000-000000000001/33333333-3333-3333-3333-333333333333/7e0000ff-0000-0000-0000-0000000000ff/v2/evil.pdf') $$,
  'new row violates row-level security policy for table "objects"',
  'Officer A cannot upload into another organization path');

-- =====================================================================================
-- TEMPLATE STORAGE ACCESS
-- =====================================================================================
-- Officer A is assigned to CS2 -> can read its template object
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000002-0000-0000-0000-000000000002/tpl-uuid-mau.docx' $$,
  ARRAY[1], 'Assigned org can read campaign template object');
-- Officer B is NOT assigned to CS2 -> cannot read the template object
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
select results_eq(
  $$ select count(*)::integer from storage.objects where name = '7d000002-0000-0000-0000-000000000002/tpl-uuid-mau.docx' $$,
  ARRAY[0], 'Unassigned org cannot read campaign template object');

-- =====================================================================================
-- TEMPLATE METADATA TABLE RLS (G3)
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select results_eq(
  $$ select count(*)::integer from public.report_campaign_templates where campaign_id = '7d000002-0000-0000-0000-000000000002' $$,
  ARRAY[1], 'Assigned org can read campaign template metadata');
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
select results_eq(
  $$ select count(*)::integer from public.report_campaign_templates where campaign_id = '7d000002-0000-0000-0000-000000000002' $$,
  ARRAY[0], 'Unassigned org cannot read campaign template metadata');

-- =====================================================================================
-- STATUS HISTORY TABLE RLS (G14)
-- =====================================================================================
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id = '7e000001-0000-0000-0000-000000000001' $$,
  ARRAY[1], 'Owning org can read its assignment status history');
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id = '7e000001-0000-0000-0000-000000000001' $$,
  ARRAY[0], 'Other org cannot read the assignment status history');

select * from finish();
rollback;
