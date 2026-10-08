-- Synthetic fixtures, including metadata changes, always roll back. No real names are read.
begin;
set local search_path = public, extensions, pg_temp;
select no_plan();
create temp table nq_tap(output text);
grant insert on nq_tap to anon,authenticated;
create function pg_temp.tap(output text) returns text language plpgsql as $$
begin
  if output like 'not ok%' then raise exception '%',output; end if;
  insert into nq_tap values(output);
  return output;
end $$;

select pg_temp.tap(is((select count(*)::integer from public.nq_competition_units where active),148,'148 active units'));
select pg_temp.tap(is((select count(*)::integer from public.nq_competition_units where unit_type='xa' and active),133,'133 communes'));
select pg_temp.tap(is((select count(*)::integer from public.nq_competition_units where unit_type='phuong' and active),15,'15 wards'));
select pg_temp.tap(is((select count(distinct code)::integer from public.nq_competition_units),148,'no duplicate codes'));
select pg_temp.tap(is((select count(distinct name)::integer from public.nq_competition_units),148,'no duplicate exact names'));
select pg_temp.tap(ok(not exists(select 1 from public.nq_competition_units where code is null or unit_type not in ('xa','phuong') or name<>normalize(name,NFC)),'codes, types and Unicode valid'));
select pg_temp.tap(ok((select relrowsecurity from pg_class where oid='public.nq_competition_units'::regclass),'unit RLS enabled'));
select pg_temp.tap(ok(not has_table_privilege('anon','public.nq_competition_units','INSERT,UPDATE,DELETE'),'anon cannot modify units'));
select pg_temp.tap(ok(not has_table_privilege('authenticated','public.nq_competition_units','INSERT,UPDATE,DELETE'),'authenticated cannot directly modify units'));
select pg_temp.tap(ok(not has_table_privilege('anon','public.nq_attempt_participants','SELECT'),'anon cannot enumerate participant names'));
select pg_temp.tap(ok(not has_schema_privilege('authenticated','quiz_private','USAGE'),'private stats/identity/config inaccessible'));
select pg_temp.tap(ok(not has_function_privilege('anon','public.nq_update_eligible_members(text,integer)','EXECUTE'),'anon cannot update roster RPC'));
select pg_temp.tap(ok(not has_function_privilege('anon','public.nq_admin_unit_participants(text,integer)','EXECUTE'),'anon cannot call participant RPC'));
select pg_temp.tap(ok(not has_function_privilege('anon','public.nq_save_unit_participant(uuid,text,uuid)','EXECUTE'),'registration requires an owned Auth session'));

create temp table nq_fixture_ids(key text primary key,id uuid not null default gen_random_uuid());
insert into nq_fixture_ids(key) values('guest'),('member'),('admin'),('org'),('A'),('B'),('C'),('inactive');
grant select on nq_fixture_ids to anon,authenticated;
insert into auth.users(id,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',key='guest',case when key='guest' then '{"provider":"anonymous","providers":["anonymous"]}'::jsonb else '{}' end,'{}'
from nq_fixture_ids where key in ('guest','member','admin');
insert into public.profiles(id,full_name,account_status) select id,'NQTEST '||key,'ACTIVE' from nq_fixture_ids where key in ('guest','member','admin') on conflict(id) do update set account_status='ACTIVE';
insert into public.organizations(id,code,name) select id,'NQTEST-'||id::text,'NQTEST organization' from nq_fixture_ids where key='org';
insert into public.user_roles(user_id,role_code) select id,'YOUTH_ADMIN' from nq_fixture_ids where key='admin';

-- pgTAP runs before the NQ bank seed in CI. A minimal temporary bank is enough for aggregation.
do $$ declare topic uuid; begin
  if not exists(select 1 from public.quizzes where bank_code='NQ_300') then
    insert into public.learning_topics(title,status,visibility_level,owner_organization_id,created_by)
      values('NQTEST topic','PUBLISHED','PUBLIC',(select id from nq_fixture_ids where key='org'),(select id from nq_fixture_ids where key='admin')) returning id into topic;
    insert into public.quizzes(topic_id,title,status,pass_score,bank_code)
      values(topic,'NQTEST bank','PUBLISHED',80,'NQ_300');
  end if;
end $$;
insert into public.nq_competition_units(id,code,name,short_name,unit_type,display_order,eligible_members,active)
select id,'NQTEST-'||key,'NQTEST Unit '||key,key,'xa',999,case key when 'A' then 10 when 'B' then 20 when 'C' then 10 else null end,key<>'inactive'
from nq_fixture_ids where key in ('A','B','C','inactive');

create function pg_temp.nq_fixture(unit_key text,person text,points numeric,permanent boolean default false)
returns uuid language plpgsql as $$
declare aid uuid := gen_random_uuid(); uid uuid; unit public.nq_competition_units%rowtype; bank uuid; seq integer;
begin
  select id into uid from nq_fixture_ids where key=case when permanent then 'member' else 'guest' end;
  select * into unit from public.nq_competition_units where code='NQTEST-'||unit_key;
  select id into bank from public.quizzes where bank_code='NQ_300';
  select coalesce(max(attempt_number),0)+1 into seq from public.quiz_attempts where user_id=uid and quiz_id=bank;
  insert into public.quiz_attempts(id,quiz_id,user_id,attempt_number,started_at,submitted_at,score,passed)
    values(aid,bank,uid,seq,now()-interval '5 minutes',now(),points,points>=80);
  insert into quiz_private.attempt_snapshots(attempt_id,expires_at,status,questions)
    values(aid,now()+interval '15 minutes','SUBMITTED',(select jsonb_agg('{}'::jsonb) from generate_series(1,30)));
  insert into public.nq_attempt_participants(attempt_id,full_name,organization_name,unit_id,unit_name_snapshot,authenticated_user_id)
    values(aid,person,unit.name,unit.id,unit.name,case when permanent then uid else null end);
  return aid;
end $$;

select pg_temp.nq_fixture('A','Nguyễn Văn A',70);
select pg_temp.nq_fixture('A','nguyễn văn a',83.33);
select pg_temp.nq_fixture('A',' Nguyễn   Văn   A ',93.33);
select pg_temp.nq_fixture('A','Nguyễn Văn Hai',60);
select pg_temp.nq_fixture('A','NGUYỄN VĂN HAI',80);
select pg_temp.nq_fixture('A',normalize('Nguyễn Văn Hai',NFD),90);
select pg_temp.nq_fixture('A','NQTEST Ba',50);
select pg_temp.nq_fixture('A','NQTEST Bốn',76.67);
select pg_temp.nq_fixture('A','NQTEST Năm',80);
select pg_temp.nq_fixture('A','NQTEST Sáu',83.33);
select pg_temp.nq_fixture('A','NQTEST Bảy',96.67);
select pg_temp.nq_fixture('A','NQTEST Tám',100);
select pg_temp.nq_fixture('B','NQTEST B '||n,90) from generate_series(1,20) n;
select pg_temp.nq_fixture('C','NQTEST Một',100);

select pg_temp.tap(is((select attempts from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),12::bigint,'A has 12 attempts'));
select pg_temp.tap(is((select participants from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),8::bigint,'A has eight people; retakes and NFC variants deduplicated'));
select pg_temp.tap(is((select best_score from quiz_private.nq_competition_people where unit_id=(select id from nq_fixture_ids where key='A') and identity_key='guest:nguyễn văn a'),93.33::numeric,'70/83.33/93.33 contributes only 93.33'));
select pg_temp.tap(is((select average_best_score from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),83.75::numeric,'average of eight best scores, not twelve attempts'));
select pg_temp.tap(is((select pass_count from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),6::bigint,'six best results pass'));
select pg_temp.tap(is((select pass_rate from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),75::numeric,'pass rate 6/8'));
select pg_temp.tap(is((select completion_rate from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),80::numeric,'completion 8/10'));
select pg_temp.tap(is((select competition_score from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),80.125::numeric,'weighted score retains precision'));
select pg_temp.tap(is((select competition_score from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-B'),97::numeric,'B score reflects 20/20 participation'));
select pg_temp.tap(is((select rank from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-B'),1::bigint,'B outranks a one-person 100 score'));
select pg_temp.tap(is((select rank from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-C'),3::bigint,'C is third despite highest individual score'));
select pg_temp.tap(ok((select competition_score is null and rank is null and completion_rate is null from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-inactive'),'unknown denominator is not fabricated'));

-- Auth identity wins over entered names. Same name in two units remains two unit participants.
select pg_temp.nq_fixture('C','NQTEST Member One',60,true);
select pg_temp.nq_fixture('C','NQTEST Changed Name',90,true);
select pg_temp.nq_fixture('B','Nguyễn Văn A',90);
select pg_temp.tap(is((select count(*) from quiz_private.nq_competition_people where unit_id=(select id from nq_fixture_ids where key='C') and identity_key like 'user:%'),1::bigint,'permanent Auth ID groups changed names'));
select pg_temp.tap(is((select count(*) from quiz_private.nq_competition_people where identity_key='guest:nguyễn văn a'),2::bigint,'same guest name in different units counts separately'));
select pg_temp.tap(is((select full_name from public.nq_attempt_participants p join public.quiz_attempts a on a.id=p.attempt_id where p.unit_id=(select id from nq_fixture_ids where key='A') and a.score=93.33),' Nguyễn   Văn   A ','display snapshot is not overwritten by grouping normalization'));

update public.nq_competition_units set eligible_members=0 where code='NQTEST-C';
select pg_temp.tap(ok((select completion_rate is null and competition_score is null from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-C'),'zero denominator cannot divide by zero'));
update public.nq_competition_units set eligible_members=1 where code='NQTEST-C';
select pg_temp.tap(is((select ranking_status from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-C'),'ROSTER_EXCEEDED','underreported denominator cannot earn official rank'));
update public.nq_competition_units set eligible_members=10 where code='NQTEST-C';
update quiz_private.nq_competition_config set completion_weight=0.6,average_score_weight=0.2,pass_rate_weight=0.2;
select pg_temp.tap(is((select competition_score from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-A'),79.75::numeric,'weights can change server-side'));
select pg_temp.tap(throws_ok($$update quiz_private.nq_competition_config set completion_weight=0.7$$,'23514',null,'weights must sum to one'));
update quiz_private.nq_competition_config set completion_weight=0.5,average_score_weight=0.3,pass_rate_weight=0.2;

-- Tied metrics resolve deterministically by unit name (C collation) and code.
update public.nq_competition_units set eligible_members=1 where code='NQTEST-C';
delete from public.quiz_attempts where id in (select attempt_id from public.nq_attempt_participants where unit_id=(select id from nq_fixture_ids where key='C'));
select pg_temp.nq_fixture('C','NQTEST Tie',90);
update public.nq_competition_units set eligible_members=21 where code='NQTEST-B';
select pg_temp.tap(ok((select rank from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-B') < (select rank from quiz_private.nq_unit_competition_stats where unit_code='NQTEST-C'),'tie resolves by name'));

-- Registration: owner session, active unit validation, immutable submitted snapshot.
insert into nq_fixture_ids(key,id) select 'pending',pg_temp.nq_fixture('A','NQTEST Pending',80);
update public.quiz_attempts set submitted_at=null,score=null,passed=null where id=(select id from nq_fixture_ids where key='pending');
update quiz_private.attempt_snapshots set status='IN_PROGRESS' where attempt_id=(select id from nq_fixture_ids where key='pending');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from nq_fixture_ids where key='member'),'role','authenticated')::text,true);
update public.quiz_attempts set user_id=(select id from nq_fixture_ids where key='member'),attempt_number=100000 where id=(select id from nq_fixture_ids where key='pending');
set local role authenticated;
select pg_temp.tap(lives_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Registered',(select id from nq_fixture_ids where key='A'))$$,'valid owned unit registration'));
select pg_temp.tap(throws_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Registered',(select id from nq_fixture_ids where key='inactive'))$$,'P0001','INVALID_COMPETITION_UNIT','inactive unit rejected'));
select pg_temp.tap(throws_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Registered',gen_random_uuid())$$,'P0001','INVALID_COMPETITION_UNIT','random nonexistent unit rejected'));
select pg_temp.tap(throws_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Registered',null)$$,'P0001','INVALID_COMPETITION_UNIT','null unit rejected'));
select pg_temp.tap(throws_ok($$select public.nq_update_eligible_members('NQTEST-A',50)$$,'P0001','ADMIN_REQUIRED','ordinary member cannot update roster'));
select pg_temp.tap(throws_ok($$select public.nq_admin_unit_participants('NQTEST-A',0)$$,'P0001','ADMIN_REQUIRED','ordinary member cannot list people'));
reset role;
select pg_temp.tap(is((select unit_name_snapshot from public.nq_attempt_participants where attempt_id=(select id from nq_fixture_ids where key='pending')),'NQTEST Unit A','snapshot sourced from database'));
update public.nq_competition_units set name='NQTEST Unit A Renamed' where code='NQTEST-A';
select pg_temp.tap(is((select organization_name from public.nq_attempt_participants where attempt_id=(select id from nq_fixture_ids where key='pending')),'NQTEST Unit A','rename leaves certificate organization snapshot intact'));
select pg_temp.tap(ok((select authenticated_user_id=(select id from nq_fixture_ids where key='member') from public.nq_attempt_participants where attempt_id=(select id from nq_fixture_ids where key='pending')),'authenticated identity captured by server'));
update public.quiz_attempts set submitted_at=now(),score=80,passed=true where id=(select id from nq_fixture_ids where key='pending');
set local role authenticated;
select pg_temp.tap(throws_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Changed',(select id from nq_fixture_ids where key='B'))$$,'P0001','ATTEMPT_ALREADY_SUBMITTED','submitted registration immutable'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from nq_fixture_ids where key='guest'),'role','authenticated','is_anonymous',true)::text,true);
select pg_temp.tap(throws_ok($$select public.nq_save_unit_participant((select id from nq_fixture_ids where key='pending'),'NQTEST Changed',(select id from nq_fixture_ids where key='B'))$$,'P0001','ATTEMPT_SCOPE_DENIED','cross-user registration rejected'));
select pg_temp.tap(throws_ok($$select public.nq_admin_unit_participants('NQTEST-A',0)$$,'P0001','ADMIN_REQUIRED','anonymous Auth identity cannot enumerate people'));
reset role;
select pg_temp.tap(is((select count(*) from quiz_private.nq_competition_attempts where attempt_id=(select id from nq_fixture_ids where key='pending')),0::bigint,'submitted timestamp alone does not include in-progress snapshot'));

-- Test markers and unmapped history cannot affect the leaderboard.
insert into nq_fixture_ids(key,id) select 'excluded',pg_temp.nq_fixture('A','NQTEST Excluded',100);
update public.nq_attempt_participants set is_competition_test=true where attempt_id=(select id from nq_fixture_ids where key='excluded');
select pg_temp.tap(is((select count(*) from quiz_private.nq_competition_attempts where attempt_id=(select id from nq_fixture_ids where key='excluded')),0::bigint,'explicit test rows excluded'));
update public.nq_attempt_participants set is_competition_test=false,unit_id=null where attempt_id=(select id from nq_fixture_ids where key='excluded');
select pg_temp.tap(is((select count(*) from quiz_private.nq_competition_attempts where attempt_id=(select id from nq_fixture_ids where key='excluded')),0::bigint,'unmapped historical rows excluded'));

-- Guest REST/read boundary returns only aggregates; the complete JSON contract is tested.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.tap(is((select count(*) from public.nq_competition_units where active),151::bigint,'anon reads active catalogue including three temporary fixtures'));
select pg_temp.tap(throws_ok($$insert into public.nq_competition_units(code,name,short_name,unit_type,display_order) values('BAD','BAD','BAD','xa',1)$$,'42501',null,'anon insert denied'));
select pg_temp.tap(throws_ok($$update public.nq_competition_units set eligible_members=999 where code='NQTEST-A'$$,'42501',null,'anon update denied'));
select pg_temp.tap(throws_ok($$delete from public.nq_competition_units where code='NQTEST-A'$$,'42501',null,'anon delete denied'));
select pg_temp.tap(throws_ok($$select full_name from public.nq_attempt_participants$$,'42501',null,'anon participant query denied'));
select pg_temp.tap(ok(not exists(select 1 from jsonb_array_elements(public.nq_competition_dashboard()->'units') u,jsonb_object_keys(u) k
  where k not in ('unit_code','unit_name','unit_type','active','eligible_members','participants','attempts','average_best_score','pass_count','certificate_count','highest_score','latest_activity_at','completion_rate','pass_rate','ranking_status','competition_score','rank')),'public rows contain only explicit aggregate fields'));
select pg_temp.tap(ok(public.nq_competition_dashboard()::text !~ '(identity_key|full_name|auth_user|authenticated_user_id|attempt_id|certificate_code|email|answers)','complete public response has no individual fields'));
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from nq_fixture_ids where key='admin'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.tap(lives_ok($$select public.nq_update_eligible_members('NQTEST-A',30)$$,'admin roster update accepted'));
select pg_temp.tap(throws_ok($$select public.nq_update_eligible_members('NQTEST-A',-1)$$,'P0001','INVALID_ROSTER','negative roster rejected'));
select pg_temp.tap(ok(jsonb_array_length(public.nq_admin_unit_participants('NQTEST-A',0)->'participants')=8,'authorized admin drill-down returns grouped participants'));
select pg_temp.tap(ok((public.nq_admin_unit_participants('NQTEST-A',0)->>'historical_unmapped')::integer>=1,'historical unmapped count reported only to admin'));
reset role;

select * from finish();
select '# NQ_COMPETITION_DATABASE_ASSERTIONS_PASS assertions='||count(*) from nq_tap;
rollback;
