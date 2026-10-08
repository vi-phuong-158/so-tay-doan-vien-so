-- Rehearsal/local only. 3,000 attempts across the real 148-unit catalogue; complete rollback.
begin;
set local plpgsql.check_asserts=on;
create temp table nq_perf_actor(id uuid default gen_random_uuid());
insert into nq_perf_actor default values;
insert into auth.users(id,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data)
  select id,'authenticated','authenticated',true,'{"provider":"anonymous","providers":["anonymous"]}','{}' from nq_perf_actor;
insert into public.profiles(id,full_name,account_status) select id,'NQTEST PERF','INVITED' from nq_perf_actor;
create temp table nq_perf_rows as
select n,gen_random_uuid() as id,units.ids[((n-1)/2)%148+1] as unit_id,((n-1)/2)::text as person
from generate_series(1,3000) n cross join (
  select array_agg(id order by display_order) ids from public.nq_competition_units where active
) units;
insert into public.quiz_attempts(id,quiz_id,user_id,attempt_number,started_at,submitted_at,score,passed)
select r.id,q.id,u.id,r.n,now()-interval '5 minutes',now(),case when r.n%2=0 then 90 else 70 end,r.n%2=0
from nq_perf_rows r cross join nq_perf_actor u cross join public.quizzes q where q.bank_code='NQ_300';
insert into quiz_private.attempt_snapshots(attempt_id,expires_at,status,questions)
select id,now()+interval '15 minutes','SUBMITTED',(select jsonb_agg('{}'::jsonb) from generate_series(1,30)) from nq_perf_rows;
insert into public.nq_attempt_participants(attempt_id,full_name,organization_name,unit_id,unit_name_snapshot)
select r.id,'NQTEST PERF '||r.person,u.name,u.id,u.name from nq_perf_rows r join public.nq_competition_units u on u.id=r.unit_id;
analyze public.quiz_attempts;
analyze public.nq_attempt_participants;
analyze quiz_private.attempt_snapshots;
do $$ begin
  assert (select count(*) from quiz_private.nq_competition_attempts where full_name like 'NQTEST PERF %')=3000;
  assert (select count(*) from quiz_private.nq_competition_people where identity_key like 'guest:nqtest perf %')=1500;
  assert (select count(distinct unit_id) from quiz_private.nq_competition_attempts where full_name like 'NQTEST PERF %')=148;
end $$;
explain (analyze,buffers,format json) select public.nq_competition_dashboard();
rollback;
