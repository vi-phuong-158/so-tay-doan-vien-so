-- Independent of bank seed: exercise legacy ownership policies with real RLS.
begin;
select plan(12);

insert into auth.users(id, aud, role, is_anonymous)
values ('6f937301-3b91-4c21-bde5-804359704001', 'authenticated', 'authenticated', true),
       ('6f937301-3b91-4c21-bde5-804359704002', 'authenticated', 'authenticated', false);
insert into public.profiles(id, full_name, account_status)
values ('6f937301-3b91-4c21-bde5-804359704001', 'NQ RLS guest', 'INVITED'),
       ('6f937301-3b91-4c21-bde5-804359704002', 'NQ RLS member', 'ACTIVE');
insert into public.organizations(id, code, name)
values ('6f937301-3b91-4c21-bde5-804359704004', 'NQ_RLS_FIXTURE', 'NQ RLS fixture organization');
update public.profiles set organization_id='6f937301-3b91-4c21-bde5-804359704004'
where id='6f937301-3b91-4c21-bde5-804359704002';
insert into quiz_private.nq_guest_accounts(user_id)
values ('6f937301-3b91-4c21-bde5-804359704001');
insert into public.ai_conversations(id, user_id, title)
values ('6f937301-3b91-4c21-bde5-804359704003', '6f937301-3b91-4c21-bde5-804359704001', 'Synthetic owned data');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6f937301-3b91-4c21-bde5-804359704001","role":"authenticated","is_anonymous":true}', true);
select ok(public.is_nq_300_guest(), 'guest recognition uses signed anonymous claim and private registry');
select ok(not public.is_active_user() and not public.has_role('MEMBER'), 'guest receives no active account or member privileges');
select is((select count(*)::integer from public.ai_conversations where id='6f937301-3b91-4c21-bde5-804359704003'), 0,
  'guest cannot read even own non-quiz conversation');
select throws_ok($$insert into public.ai_conversations(user_id,title) values(auth.uid(),'NQ guest denied')$$,
  '42501', null, 'guest cannot create own AI conversation');
select results_eq($$update public.profiles set full_name='Guest edit denied' where id=auth.uid() returning id$$,
  array[]::uuid[], 'guest cannot edit account profile');
select throws_ok($$select * from quiz_private.attempt_snapshots$$, '42501', 'permission denied for schema quiz_private',
  'guest cannot read private grading snapshots');
select throws_ok($$select * from public.quiz_options$$, '42501', 'permission denied for table quiz_options',
  'guest cannot read answer keys directly');
select is((select count(*)::integer from public.profiles where id='6f937301-3b91-4c21-bde5-804359704002'), 0,
  'guest cannot read another profile');

select set_config('request.jwt.claims', '{"sub":"6f937301-3b91-4c21-bde5-804359704002","role":"authenticated","is_anonymous":false}', true);
select lives_ok($$insert into public.ai_conversations(user_id,title) values(auth.uid(),'Permanent member preserved')$$,
  'permanent member retains own AI conversation writes');
select results_eq($$update public.profiles set full_name='Member edit allowed' where id=auth.uid() returning id$$,
  array['6f937301-3b91-4c21-bde5-804359704002'::uuid], 'permanent member retains own profile editing');
reset role;
select is((select count(*)::integer from pg_policies where schemaname='public' and policyname='NQ guests cannot use non-quiz personal data'
  and permissive='RESTRICTIVE' and cmd='ALL' and qual='(NOT is_nq_300_guest())' and with_check='(NOT is_nq_300_guest())'), 5,
  'all five legacy personal data surfaces have restrictive read/write guards');
select is((select count(*)::integer from public.user_roles where user_id='6f937301-3b91-4c21-bde5-804359704001'), 0,
  'guest provisioning does not create an application role');
select * from finish();
rollback;
