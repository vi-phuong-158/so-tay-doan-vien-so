begin;

select plan(8);

create or replace function p5_5_set_auth_user(p_uid uuid) returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function p5_5_reset_auth() returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

-- Synthetic-only fixture in Org B. The assigned innovation member is allowed;
-- another innovation member and an out-of-scope youth admin are not.
select p5_5_reset_auth();
insert into public.user_roles (user_id, role_code, scope_organization_id)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'INNOVATION_MEMBER', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.innovation_problems (
  id, title, submitted_by, organization_id, pain_point, status
)
values (
  '51555555-5555-4555-8555-555555555555', 'P5.5 synthetic problem',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '33333333-3333-3333-3333-333333333333', 'Synthetic acceptance fixture', 'NEW'
);

insert into public.innovation_problem_assignments (
  problem_id, assigned_user_id, assigned_by
)
values (
  '51555555-5555-4555-8555-555555555555',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '11112222-3333-4444-5555-666677778888'
);

select p5_5_set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
select results_eq(
  $$ select (public.transition_problem_status(
    '51555555-5555-4555-8555-555555555555', 'SCREENING', 'assigned update', null
  )).status $$,
  array['SCREENING'::text],
  'Assigned innovation member may transition the problem'
);

select p5_5_set_auth_user('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
select throws_ok(
  $$ select public.transition_problem_status(
    '51555555-5555-4555-8555-555555555555', 'ACCEPTED', null, null
  ) $$,
  'FORBIDDEN',
  'Unassigned innovation member cannot transition the problem'
);

select p5_5_set_auth_user('11112222-3333-4444-5555-666677778888'::uuid);
select throws_ok(
  $$ select public.transition_problem_status(
    '51555555-5555-4555-8555-555555555555', 'ACCEPTED', null, null
  ) $$,
  'FORBIDDEN',
  'Out-of-scope youth admin cannot transition the problem'
);

select p5_5_set_auth_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
select results_eq(
  $$ select (public.transition_problem_status(
    '51555555-5555-4555-8555-555555555555', 'ACCEPTED', null, null
  )).status $$,
  array['ACCEPTED'::text],
  'System admin may transition the problem'
);

select p5_5_reset_auth();
select function_privs_are(
  'public', 'transition_problem_status', array['uuid', 'text', 'text', 'text'],
  'anon', array[]::text[],
  'Anonymous callers cannot execute the status-transition RPC'
);
select function_privs_are(
  'public', 'transition_problem_status', array['uuid', 'text', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'Authenticated callers retain the status-transition RPC contract'
);
select results_eq(
  $$ select count(*)::integer
     from public.innovation_problem_updates
    where problem_id = '51555555-5555-4555-8555-555555555555' $$,
  array[2],
  'Only the two authorized transitions created update events'
);
select results_eq(
  $$ select status from public.innovation_problems
    where id = '51555555-5555-4555-8555-555555555555' $$,
  array['ACCEPTED'::text],
  'Denied transitions did not mutate problem status'
);

select p5_5_reset_auth();
select * from finish();
rollback;
