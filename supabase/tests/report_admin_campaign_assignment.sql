-- Phase 2 · P2-12 acceptance — scoped draft/publish workflow and private templates.
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

insert into public.organizations(id, code, name, organization_type, is_active)
values ('77777777-7777-4777-8777-777777777777', 'P2I', 'Đơn vị ngừng hoạt động P2-12', 'YOUTH_BRANCH', false)
on conflict (id) do update set is_active = false;

create temp table p2_campaigns(name text primary key, id uuid not null);
grant all on table p2_campaigns to authenticated;
grant select on table p2_campaigns to anon;

-- Youth Admin A is scoped only to CĐA. It can create a draft and publish to CĐA.
select set_auth_user('11112222-3333-4444-5555-666677778888');
insert into p2_campaigns(name, id)
select 'happy', id
from public.create_report_campaign(
  'P2-12 happy', 'Kiểm tra luồng phát hành', 'Ban Thanh niên', now(), now() + interval '7 days', null,
  false, true, array['pdf', 'docx'], 20, 3, '{}'::jsonb, 'INTERNAL_YOUTH'
);
select lives_ok(
  $$ select public.publish_report_campaign((select id from p2_campaigns where name='happy'), array['22222222-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'P1 scoped youth admin publishes a draft to a selected in-scope organization');
select reset_auth();
select results_eq(
  $$ select status from public.report_campaigns where id=(select id from p2_campaigns where name='happy') $$,
  array['PUBLISHED'::text], 'P1 publish changes campaign status only after assignment creation');
select results_eq(
  $$ select count(*)::integer from public.report_assignments where campaign_id=(select id from p2_campaigns where name='happy') $$,
  array[1], 'P8 duplicate organization IDs create one assignment');
select results_eq(
  $$ select count(*)::integer from public.report_status_history where assignment_id=(select id from public.report_assignments where campaign_id=(select id from p2_campaigns where name='happy')) and from_status is null and to_status='PENDING' $$,
  array[1], 'P1 assignment creation records initial PENDING status history');
select results_eq(
  $$ select actor_user_id from public.audit_logs where entity_id=(select id from p2_campaigns where name='happy') and action='REPORT_CAMPAIGN_PUBLISHED' $$,
  array['11112222-3333-4444-5555-666677778888'::uuid], 'P12 audit actor is resolved from auth.uid');

-- A repeated publish is a no-op with the original count, rather than a duplicate assignment.
select set_auth_user('11112222-3333-4444-5555-666677778888');
select lives_ok(
  $$ select public.publish_report_campaign((select id from p2_campaigns where name='happy'), array['22222222-2222-2222-2222-222222222222'::uuid]) $$,
  'P9 repeated publish request is idempotent');
select reset_auth();
select results_eq(
  $$ select count(*)::integer from public.report_assignments where campaign_id=(select id from p2_campaigns where name='happy') $$,
  array[1], 'P9 repeat publish does not create duplicate assignments');

-- The unique database constraint remains the final line of defense.
select throws_ok(
  $$ insert into public.report_assignments(campaign_id, organization_id) values ((select id from p2_campaigns where name='happy'), '22222222-2222-2222-2222-222222222222') $$,
  'duplicate key value violates unique constraint', 'P10 campaign and organization pair remains structurally unique');

-- Scope and active-organization validation happens before any status mutation.
select set_auth_user('11112222-3333-4444-5555-666677778888');
insert into p2_campaigns(name, id)
select 'scope', id from public.create_report_campaign('P2-12 scope', null, null, now(), now()+interval '7 days', null, false, true, array['pdf'], 20, 1, '{}'::jsonb, 'INTERNAL_YOUTH');
select throws_ok(
  $$ select public.publish_report_campaign((select id from p2_campaigns where name='scope'), array['33333333-3333-3333-3333-333333333333'::uuid]) $$,
  'ASSIGNMENT_SCOPE_DENIED', 'P6 admin scoped to CĐA cannot assign CĐB');
select throws_ok(
  $$ select public.publish_report_campaign((select id from p2_campaigns where name='scope'), array['22222222-2222-2222-2222-222222222222'::uuid, '77777777-7777-4777-8777-777777777777'::uuid]) $$,
  'ORGANIZATION_INACTIVE', 'P7 inactive organization cannot be assigned');
select reset_auth();
select results_eq(
  $$ select c.status || '|' || count(a.id)::text from public.report_campaigns c left join public.report_assignments a on a.campaign_id=c.id where c.id=(select id from p2_campaigns where name='scope') group by c.status $$,
  array['DRAFT|0'::text], 'P11 failed publish is atomic: draft remains and no partial assignment exists');

-- Non-admin, suspended and anonymous callers all fail closed.
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok(
  $$ select public.create_report_campaign('member', null, null, now(), now()+interval '1 day', null, false, true, array['pdf'], 20, 1, '{}'::jsonb, 'INTERNAL_YOUTH') $$,
  'REPORT_CAMPAIGN_SCOPE_DENIED', 'P4 MEMBER cannot create a campaign');
select set_auth_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
select throws_ok(
  $$ select public.create_report_campaign('officer', null, null, now(), now()+interval '1 day', null, false, true, array['pdf'], 20, 1, '{}'::jsonb, 'INTERNAL_YOUTH') $$,
  'REPORT_CAMPAIGN_SCOPE_DENIED', 'P5 BRANCH_OFFICER cannot create a campaign');
select set_auth_user('99999999-9999-9999-9999-999999999999');
select throws_ok($$ select public.get_assignable_report_organizations() $$, 'ACCOUNT_NOT_ACTIVE', 'P3 suspended user cannot load assignable organizations');
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$ select public.publish_report_campaign((select id from p2_campaigns where name='scope'), array['22222222-2222-2222-2222-222222222222'::uuid]) $$, 'permission denied for function publish_report_campaign', 'P2 anonymous caller cannot execute publish RPC');

-- Direct PostgREST-style writes cannot bypass draft state, assignment scope or metadata checks.
select set_auth_user('11112222-3333-4444-5555-666677778888');
select throws_ok(
  $$ insert into public.report_assignments(campaign_id, organization_id) values ((select id from p2_campaigns where name='scope'), '22222222-2222-2222-2222-222222222222') $$,
  'permission denied for table report_assignments', 'P13 direct assignment INSERT is denied');
select throws_ok(
  $$ insert into public.report_campaign_templates(campaign_id, storage_path, file_name, size_bytes) values ((select id from p2_campaigns where name='scope'), 'x', 'x.pdf', 1) $$,
  'permission denied for table report_campaign_templates', 'P13 direct template metadata INSERT is denied');

-- The controlled template registration binds path, campaign draft state, scope and actor audit.
select lives_ok(
  $$ select public.register_report_campaign_template((select id from p2_campaigns where name='scope'), (select id::text from p2_campaigns where name='scope') || '/12345678-1234-4123-8123-123456789abc-mau.pdf', 'mau.pdf', 'application/pdf', 100) $$,
  'P1 scoped admin attaches template metadata through controlled RPC');
select reset_auth();
select results_eq(
  $$ select count(*)::integer from public.report_campaign_templates where campaign_id=(select id from p2_campaigns where name='scope') $$,
  array[1], 'P1 template metadata is attached to the draft campaign');

select function_privs_are('public', 'publish_report_campaign', array['uuid','uuid[]'], 'authenticated', array['EXECUTE'], 'authenticated may execute controlled publish RPC');
select function_privs_are('public', 'publish_report_campaign', array['uuid','uuid[]'], 'anon', array[]::text[], 'anon has no publish RPC privilege');

select * from finish();
rollback;
