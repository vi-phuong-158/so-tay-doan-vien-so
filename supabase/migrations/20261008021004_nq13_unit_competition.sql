begin;

create table public.nq_competition_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique check (length(name) between 3 and 180),
  short_name text not null,
  unit_type text not null check (unit_type in ('xa','phuong')),
  display_order integer not null,
  eligible_members integer check (eligible_members >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nq_competition_units enable row level security;
revoke all on public.nq_competition_units from public, anon, authenticated;
grant select on public.nq_competition_units to anon, authenticated;
create policy nq_units_read on public.nq_competition_units for select to anon, authenticated
  using (active or (select public.has_role_in_scope('YOUTH_ADMIN',null)));

create table quiz_private.nq_competition_config (
  id boolean primary key default true check (id),
  completion_weight numeric not null default 0.50 check (completion_weight between 0 and 1),
  average_score_weight numeric not null default 0.30 check (average_score_weight between 0 and 1),
  pass_rate_weight numeric not null default 0.20 check (pass_rate_weight between 0 and 1),
  public_missing_units boolean not null default false,
  check (completion_weight + average_score_weight + pass_rate_weight = 1)
);
alter table quiz_private.nq_competition_config enable row level security;
revoke all on quiz_private.nq_competition_config from public, anon, authenticated;
insert into quiz_private.nq_competition_config(id) values (true);

alter table public.nq_attempt_participants
  add column unit_id uuid references public.nq_competition_units(id) on delete restrict,
  add column unit_name_snapshot text,
  add column authenticated_user_id uuid,
  add column is_competition_test boolean not null default false,
  add column normalized_full_name text generated always as
    (lower(btrim(regexp_replace(normalize(full_name,NFC),'[[:space:]]+',' ','g')))) stored;
-- Do not guess a unit mapping for historical organization text.
create index nq_participant_unit_identity_idx on public.nq_attempt_participants
  (unit_id,authenticated_user_id,normalized_full_name) where unit_id is not null;
create index nq_submitted_attempt_idx on public.quiz_attempts(quiz_id,submitted_at,id)
  include (score,passed) where submitted_at is not null;

-- Keep the legacy RPC for old clients; it never creates a competition mapping.
-- This UUID-based contract is the only registration path used by the new UI.
create function public.nq_save_unit_participant(p_attempt_id uuid,p_full_name text,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.quiz_attempts%rowtype;
  u public.nq_competition_units%rowtype;
  v_name text := btrim(normalize(coalesce(p_full_name,''),NFC));
  v_user uuid;
begin
  if auth.uid() is null or (not public.is_active_user() and not public.is_nq_300_guest()) then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;
  if length(btrim(regexp_replace(v_name,'[[:space:]]+',' ','g'))) not between 2 and 120 then
    raise exception 'INVALID_PARTICIPANT_INFO';
  end if;
  select * into a from public.quiz_attempts where id=p_attempt_id for update;
  if a.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.user_id <> auth.uid() or not exists (
    select 1 from public.quizzes where id=a.quiz_id and bank_code='NQ_300'
  ) then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;
  if a.submitted_at is not null then raise exception 'ATTEMPT_ALREADY_SUBMITTED'; end if;
  select * into u from public.nq_competition_units where id=p_unit_id and active for share;
  if u.id is null then raise exception 'INVALID_COMPETITION_UNIT'; end if;
  select id into v_user from auth.users where id=auth.uid() and not coalesce(is_anonymous,false);
  insert into public.nq_attempt_participants(attempt_id,full_name,organization_name,unit_id,
    unit_name_snapshot,authenticated_user_id,confirmed_at)
    values(a.id,v_name,u.name,u.id,u.name,v_user,clock_timestamp())
  on conflict(attempt_id) do update set full_name=excluded.full_name,
    organization_name=excluded.organization_name,unit_id=excluded.unit_id,
    unit_name_snapshot=excluded.unit_name_snapshot,authenticated_user_id=excluded.authenticated_user_id,
    confirmed_at=excluded.confirmed_at;
  return jsonb_build_object('full_name',v_name,'organization_name',u.name,
    'unit_id',u.id,'unit_name_snapshot',u.name);
end $$;
revoke all on function public.nq_save_unit_participant(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.nq_save_unit_participant(uuid,text,uuid) to authenticated;

-- Prevent a legacy edit from leaving a stale competition mapping attached to another name/unit.
create function quiz_private.nq_preserve_unit_mapping() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.unit_id is not null and new.organization_name is distinct from new.unit_name_snapshot then
    new.unit_id := null;
    new.unit_name_snapshot := null;
    new.authenticated_user_id := null;
  end if;
  return new;
end $$;
revoke all on function quiz_private.nq_preserve_unit_mapping() from public,anon,authenticated;
create trigger nq_preserve_unit_mapping before update on public.nq_attempt_participants
  for each row execute function quiz_private.nq_preserve_unit_mapping();

create view quiz_private.nq_competition_attempts with (security_invoker=true) as
select p.unit_id,
  case when p.authenticated_user_id is not null then 'user:'||p.authenticated_user_id::text
    else 'guest:'||p.normalized_full_name end as identity_key,
  p.full_name,a.id as attempt_id,a.score,a.submitted_at,
  c.id is not null as has_certificate
from public.nq_attempt_participants p
join public.quiz_attempts a on a.id=p.attempt_id
join public.quizzes q on q.id=a.quiz_id and q.bank_code='NQ_300'
join quiz_private.attempt_snapshots s on s.attempt_id=a.id and s.status in ('SUBMITTED','EXPIRED')
left join public.nq_certificates c on c.attempt_id=a.id and c.status='VALID'
where p.unit_id is not null and not p.is_competition_test
  and a.submitted_at is not null and a.score between 0 and 100;

create view quiz_private.nq_competition_people with (security_invoker=true) as
select unit_id,identity_key,max(score) as best_score,count(*) as attempts,
  count(*) filter(where has_certificate) as certificate_count,max(submitted_at) as latest_activity_at
from quiz_private.nq_competition_attempts group by unit_id,identity_key;

create view quiz_private.nq_unit_competition_stats with (security_invoker=true) as
with totals as (
  select u.id,u.code as unit_code,u.name as unit_name,u.unit_type,u.active,u.eligible_members,
    count(p.identity_key) as participants,coalesce(sum(p.attempts),0)::bigint as attempts,
    avg(p.best_score) as average_best_score,count(*) filter(where p.best_score>=80) as pass_count,
    coalesce(sum(p.certificate_count),0)::bigint as certificate_count,max(p.best_score) as highest_score,
    max(p.latest_activity_at) as latest_activity_at
  from public.nq_competition_units u left join quiz_private.nq_competition_people p on p.unit_id=u.id
  group by u.id
), rates as (
  select *,participants::numeric/nullif(eligible_members,0)*100 as completion_rate,
    pass_count::numeric/nullif(participants,0)*100 as pass_rate,
    case when coalesce(eligible_members,0)=0 then 'INCOMPLETE_ROSTER'
      when participants>eligible_members then 'ROSTER_EXCEEDED' else 'READY' end as ranking_status
  from totals
), scores as (
  select r.*,case when ranking_status='READY' then
    completion_rate*c.completion_weight + coalesce(average_best_score,0)*c.average_score_weight
      + coalesce(pass_rate,0)*c.pass_rate_weight else null end as competition_score
  from rates r cross join quiz_private.nq_competition_config c
), ranked as (
  select id,row_number() over(order by competition_score desc,completion_rate desc,
    average_best_score desc nulls last,pass_rate desc nulls last,unit_name collate "C",unit_code) as rank
  from scores where ranking_status='READY' and active
)
select scores.*,ranked.rank from scores left join ranked using(id);
revoke all on quiz_private.nq_competition_attempts,quiz_private.nq_competition_people,
  quiz_private.nq_unit_competition_stats from public,anon,authenticated;

-- Deliberate aggregate-only definer boundary. No private rows/identifiers leave this RPC.
create function public.nq_competition_dashboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  with stats as materialized (select * from quiz_private.nq_unit_competition_stats)
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'unit_count',(select count(*) from stats where active),
      'participating_units',(select count(*) from stats where active and participants>0),
      'missing_units',(select count(*) from stats where active and participants=0),
      'participants',(select coalesce(sum(participants),0) from stats),
      'attempts',(select coalesce(sum(attempts),0) from stats),
      'pass_count',(select coalesce(sum(pass_count),0) from stats),
      'pass_rate',(select sum(pass_count)::numeric/nullif(sum(participants),0)*100 from stats),
      'average_best_score',(select sum(average_best_score*participants)/nullif(sum(participants),0) from stats),
      'certificate_count',(select coalesce(sum(certificate_count),0) from stats)),
    'units',(select coalesce(jsonb_agg(to_jsonb(s)-'id' order by rank nulls last,unit_name collate "C"),'[]'::jsonb) from stats s),
    'config',(select to_jsonb(c)-'id' from quiz_private.nq_competition_config c)
  );
$$;
revoke all on function public.nq_competition_dashboard() from public,anon,authenticated;
grant execute on function public.nq_competition_dashboard() to anon,authenticated;

create function public.nq_update_eligible_members(p_unit_code text,p_eligible_members integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role_in_scope('YOUTH_ADMIN',null) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_eligible_members < 0 then raise exception 'INVALID_ROSTER'; end if;
  update public.nq_competition_units set eligible_members=p_eligible_members,updated_at=clock_timestamp()
    where code=p_unit_code;
  if not found then raise exception 'INVALID_COMPETITION_UNIT'; end if;
end $$;
revoke all on function public.nq_update_eligible_members(text,integer) from public,anon,authenticated;
grant execute on function public.nq_update_eligible_members(text,integer) to authenticated;

create function public.nq_admin_unit_participants(p_unit_code text,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_role_in_scope('YOUTH_ADMIN',null) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  select jsonb_build_object(
    'historical_unmapped',(select count(*) from public.nq_attempt_participants p
      join public.quiz_attempts a on a.id=p.attempt_id join public.quizzes q on q.id=a.quiz_id
      where q.bank_code='NQ_300' and p.unit_id is null),
    'total',(select count(*) from quiz_private.nq_competition_people p
      join public.nq_competition_units u on u.id=p.unit_id where u.code=p_unit_code),
    'participants',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select (select a.full_name from quiz_private.nq_competition_attempts a
        where a.unit_id=p.unit_id and a.identity_key=p.identity_key
        order by a.submitted_at desc,a.attempt_id limit 1) as full_name,
        p.attempts,p.best_score,p.certificate_count,p.latest_activity_at
      from quiz_private.nq_competition_people p join public.nq_competition_units u on u.id=p.unit_id
      where u.code=p_unit_code order by p.best_score desc,p.identity_key limit 50 offset p_offset
    ) r)) into result;
  return result;
end $$;
revoke all on function public.nq_admin_unit_participants(text,integer) from public,anon,authenticated;
grant execute on function public.nq_admin_unit_participants(text,integer) to authenticated;

-- Frozen, audited catalogue seed is appended below, within this transaction.

-- Source: https://xaydungchinhsach.chinhphu.vn/sap-xep-dvhc-danh-sach-148-xa-phuong-cua-tinh-phu-tho-119250623074347981.htm
-- Verified 2026-10-08: 133 xa + 15 phuong. Internal codes are frozen.
insert into public.nq_competition_units(id,code,name,short_name,unit_type,display_order) values
('57d0e3f3-f5df-5188-9706-150961c804b7','PT-NQ-001','Xã Hy Cương','Hy Cương','xa',1),
('15b48b38-f81a-572b-b28d-0595b087eb22','PT-NQ-002','Xã Lâm Thao','Lâm Thao','xa',2),
('de6f2885-ad65-5f5a-b695-4755a2ab7474','PT-NQ-003','Xã Xuân Lũng','Xuân Lũng','xa',3),
('e56ffb08-38db-51e5-8671-aea93d58a33a','PT-NQ-004','Xã Phùng Nguyên','Phùng Nguyên','xa',4),
('9e4fea8d-f302-5acd-b094-aad9a64e6160','PT-NQ-005','Xã Bản Nguyên','Bản Nguyên','xa',5),
('3b713565-1154-51ca-b236-0851a83ba203','PT-NQ-006','Xã Phù Ninh','Phù Ninh','xa',6),
('9dc0c568-2e9c-523e-8b51-3b6a00bab296','PT-NQ-007','Xã Dân Chủ','Dân Chủ','xa',7),
('4c7a591d-7493-52e9-8916-5d6a67f75122','PT-NQ-008','Xã Phú Mỹ','Phú Mỹ','xa',8),
('509c293f-508b-56e9-bb3f-971b3e17fac5','PT-NQ-009','Xã Trạm Thản','Trạm Thản','xa',9),
('886ae7c6-8327-51b9-b648-375b9b2e588b','PT-NQ-010','Xã Bình Phú','Bình Phú','xa',10),
('ae1d50de-3735-5299-9e8f-63acb0f8c540','PT-NQ-011','Xã Thanh Ba','Thanh Ba','xa',11),
('3e547770-e4a4-54ab-ba4c-a32aaa165863','PT-NQ-012','Xã Quảng Yên','Quảng Yên','xa',12),
('b20add54-b0b5-5295-8f6c-2fb125b16eef','PT-NQ-013','Xã Hoàng Cương','Hoàng Cương','xa',13),
('a1d58c01-744c-592f-b895-d2cc483ac595','PT-NQ-014','Xã Đông Thành','Đông Thành','xa',14),
('dc8f52e6-f790-5910-adef-5e943e03f566','PT-NQ-015','Xã Chí Tiên','Chí Tiên','xa',15),
('808519c5-1a6d-50d6-b55e-dc74085485eb','PT-NQ-016','Xã Liên Minh','Liên Minh','xa',16),
('ef196319-0d3f-5151-b896-127594f20e70','PT-NQ-017','Xã Đoan Hùng','Đoan Hùng','xa',17),
('e4e2b357-8b1d-552b-9056-78b9bed4bd1a','PT-NQ-018','Xã Tây Cốc','Tây Cốc','xa',18),
('14fd6f13-0335-5d9a-9e86-8df221dfde56','PT-NQ-019','Xã Chân Mộng','Chân Mộng','xa',19),
('471fdee4-ac6a-58f0-8120-1cc40d71a290','PT-NQ-020','Xã Chí Đám','Chí Đám','xa',20),
('15b553fc-4e5a-5e6c-bccc-a9986c8f97bc','PT-NQ-021','Xã Bằng Luân','Bằng Luân','xa',21),
('e957ddfc-867e-5317-bf33-98ae3216fae4','PT-NQ-022','Xã Hạ Hòa','Hạ Hòa','xa',22),
('77598b40-fa11-5119-ba1a-8c994d67199f','PT-NQ-023','Xã Đan Thượng','Đan Thượng','xa',23),
('e8d5ac88-ab4a-54f7-bc83-1296f639f751','PT-NQ-024','Xã Yên Kỳ','Yên Kỳ','xa',24),
('560ff555-5fb8-59a4-8a95-dbd6b989f56a','PT-NQ-025','Xã Vĩnh Chân','Vĩnh Chân','xa',25),
('a21dc8a4-4f55-5ab2-88bc-71167b0f2ccf','PT-NQ-026','Xã Văn Lang','Văn Lang','xa',26),
('caf2e87e-c63b-5d73-ad46-75cdeb582cbe','PT-NQ-027','Xã Hiền Lương','Hiền Lương','xa',27),
('5ed925b9-c1db-537d-a044-67fbfcb11fd8','PT-NQ-028','Xã Cẩm Khê','Cẩm Khê','xa',28),
('5fec5eb1-45c2-5245-8026-970163beb8e0','PT-NQ-029','Xã Phú Khê','Phú Khê','xa',29),
('ef35161b-f123-505e-9e8d-24fd1d1d4b75','PT-NQ-030','Xã Hùng Việt','Hùng Việt','xa',30),
('1b68550a-c93a-5348-82f8-19614e3045a4','PT-NQ-031','Xã Đồng Lương','Đồng Lương','xa',31),
('a267ab03-73ec-5980-9456-8e129bd6cc57','PT-NQ-032','Xã Tiên Lương','Tiên Lương','xa',32),
('4c7a7dcc-b5e6-50ba-89f6-1d19d54b3572','PT-NQ-033','Xã Vân Bán','Vân Bán','xa',33),
('15ccf664-bf55-5496-9e05-157b6d9912ea','PT-NQ-034','Xã Tam Nông','Tam Nông','xa',34),
('c15bfa6f-5a65-5452-b3c9-febbea1a2642','PT-NQ-035','Xã Thọ Văn','Thọ Văn','xa',35),
('667c073a-1927-5eaf-b222-a2480a3cde89','PT-NQ-036','Xã Vạn Xuân','Vạn Xuân','xa',36),
('c2148360-09da-5da7-b8f9-0c353fe110ee','PT-NQ-037','Xã Hiền Quan','Hiền Quan','xa',37),
('4855dbb6-ec4e-585c-8fa5-04008bcffb33','PT-NQ-038','Xã Thanh Thủy','Thanh Thủy','xa',38),
('711d5c41-cb10-553a-aab4-58ac61d98d23','PT-NQ-039','Xã Đào Xá','Đào Xá','xa',39),
('178bae91-4774-5d34-97bf-acedd6771783','PT-NQ-040','Xã Tu Vũ','Tu Vũ','xa',40),
('0757bf49-118c-56e3-8b4c-f7d24bff4c36','PT-NQ-041','Xã Thanh Sơn','Thanh Sơn','xa',41),
('8f0d3cb7-d259-5f4e-a789-386d500215c5','PT-NQ-042','Xã Võ Miếu','Võ Miếu','xa',42),
('e246c9e9-3cb1-553c-b802-f4dfdceb0f03','PT-NQ-043','Xã Văn Miếu','Văn Miếu','xa',43),
('6bf4ad32-846e-5f68-b248-a70582358a41','PT-NQ-044','Xã Cự Đồng','Cự Đồng','xa',44),
('6c4738a8-cb8b-5596-9ade-70f76703f01d','PT-NQ-045','Xã Hương Cần','Hương Cần','xa',45),
('3ad726b5-a32f-5d3d-9378-a3b8d981ac49','PT-NQ-046','Xã Yên Sơn','Yên Sơn','xa',46),
('f6676686-eb78-5e55-9cce-7c4126bc5f4f','PT-NQ-047','Xã Khả Cửu','Khả Cửu','xa',47),
('7f842db7-f4c9-5329-9e9e-e4d7fa5bbc36','PT-NQ-048','Xã Tân Sơn','Tân Sơn','xa',48),
('048275af-5bf1-5be8-8991-ba615272e5f0','PT-NQ-049','Xã Minh Đài','Minh Đài','xa',49),
('7a6f2c7a-fec5-5021-b548-b99928b66e01','PT-NQ-050','Xã Lai Đồng','Lai Đồng','xa',50),
('b1740186-b3cb-55fc-ac70-491bbd08fef7','PT-NQ-051','Xã Xuân Đài','Xuân Đài','xa',51),
('2e4e1a5f-50f9-50eb-b71f-aac507bfb68e','PT-NQ-052','Xã Long Cốc','Long Cốc','xa',52),
('751576f8-4e04-5202-b39d-54e59124d388','PT-NQ-053','Xã Yên Lập','Yên Lập','xa',53),
('7af2ca79-7d88-5750-b652-2de26b9a2f57','PT-NQ-054','Xã Thượng Long','Thượng Long','xa',54),
('536a1b89-cf83-545c-8b6c-0cfa7bb1d8de','PT-NQ-055','Xã Sơn Lương','Sơn Lương','xa',55),
('e2f3f279-8280-53ae-b1b4-2c0fedf680f2','PT-NQ-056','Xã Xuân Viên','Xuân Viên','xa',56),
('e4e25478-1435-5166-9df0-af85d2b68f84','PT-NQ-057','Xã Minh Hòa','Minh Hòa','xa',57),
('006d95a8-7569-5acf-b81d-7ac0d84b432e','PT-NQ-058','Xã Tam Sơn','Tam Sơn','xa',58),
('e72b30b5-8eaf-5ae1-83cb-c0dbe4542051','PT-NQ-059','Xã Sông Lô','Sông Lô','xa',59),
('12721ce8-7505-54b9-8650-7a44e9ce18d5','PT-NQ-060','Xã Hải Lựu','Hải Lựu','xa',60),
('f973a982-2ec7-57f6-9060-7034022f0ea8','PT-NQ-061','Xã Yên Lãng','Yên Lãng','xa',61),
('f5a170df-b5f1-5cb4-a50d-2bb64a7064dc','PT-NQ-062','Xã Lập Thạch','Lập Thạch','xa',62),
('ce54e5b4-62be-5f54-a506-8f513ec85f7b','PT-NQ-063','Xã Tiên Lữ','Tiên Lữ','xa',63),
('42b9c1b6-a8eb-596e-8d90-ca843508cbeb','PT-NQ-064','Xã Thái Hòa','Thái Hòa','xa',64),
('2d949fb8-8b3a-50b5-b6b6-e7138116957e','PT-NQ-065','Xã Liên Hòa','Liên Hòa','xa',65),
('a2bdb1c2-c48b-59fa-ac06-390713714cf9','PT-NQ-066','Xã Hợp Lý','Hợp Lý','xa',66),
('6856e864-7c86-5ba9-9365-444c2b9e2a96','PT-NQ-067','Xã Sơn Đông','Sơn Đông','xa',67),
('f03fea24-7006-595a-b13d-3c60d7b3b1c7','PT-NQ-068','Xã Tam Đảo','Tam Đảo','xa',68),
('ed6a5d9a-fe7e-54cc-b6d1-b9d2d85e4b43','PT-NQ-069','Xã Đại Đình','Đại Đình','xa',69),
('c90e6db0-e7a5-51f8-b5b9-805df0fe9fe3','PT-NQ-070','Xã Đạo Trù','Đạo Trù','xa',70),
('0307b6ef-d2a0-5a36-8cf5-0e5fb28a6622','PT-NQ-071','Xã Tam Dương','Tam Dương','xa',71),
('66d60e86-fa18-579a-b323-63b1b392969d','PT-NQ-072','Xã Hội Thịnh','Hội Thịnh','xa',72),
('37743444-636a-5fe5-a3c0-00b6c6e99373','PT-NQ-073','Xã Hoàng An','Hoàng An','xa',73),
('642665ab-6dfc-59a4-ad7a-6d6934a819c1','PT-NQ-074','Xã Tam Dương Bắc','Tam Dương Bắc','xa',74),
('5990c30d-861d-56da-ae0a-03d3b566e766','PT-NQ-075','Xã Vĩnh Tường','Vĩnh Tường','xa',75),
('6eaaeae8-8744-5853-8cd1-351d8362bfb8','PT-NQ-076','Xã Thổ Tang','Thổ Tang','xa',76),
('8c9eebd4-f96d-5e24-8eed-9a83be844066','PT-NQ-077','Xã Vĩnh Hưng','Vĩnh Hưng','xa',77),
('58f29f09-05f8-5f64-91cf-0e34af9dc198','PT-NQ-078','Xã Vĩnh An','Vĩnh An','xa',78),
('5be87a78-7ab0-5875-9bd5-73b460d20692','PT-NQ-079','Xã Vĩnh Phú','Vĩnh Phú','xa',79),
('5c9346d1-49fa-52b7-b73d-3a3417d7b5d1','PT-NQ-080','Xã Vĩnh Thành','Vĩnh Thành','xa',80),
('63b8f91d-2dd8-5133-88a8-7644bde6c3b1','PT-NQ-081','Xã Yên Lạc','Yên Lạc','xa',81),
('1b92a235-4ce9-53c2-bfec-232043d853c2','PT-NQ-082','Xã Tề Lỗ','Tề Lỗ','xa',82),
('ffcbbc17-1087-548b-8ac8-b937152836b8','PT-NQ-083','Xã Liên Châu','Liên Châu','xa',83),
('5257f1dd-5114-5dfa-a993-ba22abd35c19','PT-NQ-084','Xã Tam Hồng','Tam Hồng','xa',84),
('fbd79e15-4f81-5158-96cc-a23acb692fab','PT-NQ-085','Xã Nguyệt Đức','Nguyệt Đức','xa',85),
('a24aa7db-e747-544f-b62d-57b4bf02f319','PT-NQ-086','Xã Bình Nguyên','Bình Nguyên','xa',86),
('7714c58b-c424-5826-849c-b3dce1cd86d7','PT-NQ-087','Xã Xuân Lãng','Xuân Lãng','xa',87),
('c4a7614e-758e-51fe-bcad-266ea3d76aa3','PT-NQ-088','Xã Bình Xuyên','Bình Xuyên','xa',88),
('0ac70db4-ffdb-5769-8336-6f97cf18a02b','PT-NQ-089','Xã Bình Tuyền','Bình Tuyền','xa',89),
('716da7f9-6ed6-5e97-9f85-3d5a2902d8d1','PT-NQ-090','Xã Thịnh Minh','Thịnh Minh','xa',90),
('58b53139-10f1-5052-b751-4cc7edea1385','PT-NQ-091','Xã Cao Phong','Cao Phong','xa',91),
('366cbb79-f39d-5575-949a-e25d1a981ab0','PT-NQ-092','Xã Mường Thàng','Mường Thàng','xa',92),
('2a027bbb-0b2e-5f4f-95f9-4489cb7b2a79','PT-NQ-093','Xã Thung Nai','Thung Nai','xa',93),
('ae12b4e8-b236-5eee-9f40-2fc0688fe0f9','PT-NQ-094','Xã Đà Bắc','Đà Bắc','xa',94),
('d65446f9-38ac-59db-83b9-af5c2f78e323','PT-NQ-095','Xã Cao Sơn','Cao Sơn','xa',95),
('11a66424-3bea-5aed-9b3f-38d0d878ed69','PT-NQ-096','Xã Đức Nhàn','Đức Nhàn','xa',96),
('4819e030-621c-5f6e-afab-07a739310478','PT-NQ-097','Xã Quy Đức','Quy Đức','xa',97),
('e1536e9f-aaec-59bf-9355-97531ce81c18','PT-NQ-098','Xã Tân Pheo','Tân Pheo','xa',98),
('34a915b8-4c87-54d4-8e88-7d9911886e89','PT-NQ-099','Xã Tiền Phong','Tiền Phong','xa',99),
('8cc89b85-6e22-5392-948f-a7db1efaa754','PT-NQ-100','Xã Kim Bôi','Kim Bôi','xa',100),
('6a87f421-c4e7-5026-86a5-f1e93775232e','PT-NQ-101','Xã Mường Động','Mường Động','xa',101),
('f3fa35d1-eda6-5838-9110-24b61bd3909d','PT-NQ-102','Xã Dũng Tiến','Dũng Tiến','xa',102),
('d86514d8-2e19-54f0-ad93-05526cbfcc3c','PT-NQ-103','Xã Hợp Kim','Hợp Kim','xa',103),
('81c0be45-88fa-5b46-9cd9-3c894d1700b7','PT-NQ-104','Xã Nật Sơn','Nật Sơn','xa',104),
('842e773a-2bee-54da-abc9-85a5879772dc','PT-NQ-105','Xã Lạc Sơn','Lạc Sơn','xa',105),
('eafa282c-9db9-5810-9d25-a675eb36cc37','PT-NQ-106','Xã Mường Vang','Mường Vang','xa',106),
('4141185b-94cc-56e9-96ad-947631934969','PT-NQ-107','Xã Đại Đồng','Đại Đồng','xa',107),
('e0822675-2b91-5f82-b989-d1c1ce35dc74','PT-NQ-108','Xã Ngọc Sơn','Ngọc Sơn','xa',108),
('4feae47c-8078-59b7-ade4-ce9bbf3df4c5','PT-NQ-109','Xã Nhân Nghĩa','Nhân Nghĩa','xa',109),
('45844221-215b-5f54-b229-4191cfd6aeda','PT-NQ-110','Xã Quyết Thắng','Quyết Thắng','xa',110),
('df1987cc-f848-5ff4-9813-3a14ecd20121','PT-NQ-111','Xã Thượng Cốc','Thượng Cốc','xa',111),
('42ea151b-6bc8-5dd8-bc0b-6809b720686b','PT-NQ-112','Xã Yên Phú','Yên Phú','xa',112),
('0336d680-5ad9-53d6-95d0-4f02de2b54ee','PT-NQ-113','Xã Lạc Thủy','Lạc Thủy','xa',113),
('cb7cd4d0-bc73-5d35-b2db-58c778b00399','PT-NQ-114','Xã An Bình','An Bình','xa',114),
('84de46ef-be48-5d49-af6e-0dc48cd1faf7','PT-NQ-115','Xã An Nghĩa','An Nghĩa','xa',115),
('2d2dae1b-bc41-5f31-b268-1e0916393eb3','PT-NQ-116','Xã Lương Sơn','Lương Sơn','xa',116),
('e24d6bb7-1126-5d44-8387-9fb77fdabbc9','PT-NQ-117','Xã Cao Dương','Cao Dương','xa',117),
('1c0ddbb2-6287-5766-96e9-0e138e9dc7cc','PT-NQ-118','Xã Liên Sơn','Liên Sơn','xa',118),
('82711d2e-5f6c-5391-80fb-1e921b6e5e19','PT-NQ-119','Xã Mai Châu','Mai Châu','xa',119),
('0309b2aa-b78e-5f5f-a904-00bac97c7cd7','PT-NQ-120','Xã Bao La','Bao La','xa',120),
('51944683-152c-51b5-b791-579553bbdd63','PT-NQ-121','Xã Mai Hạ','Mai Hạ','xa',121),
('278850ee-2f87-5ea0-9b24-754584f3c5e7','PT-NQ-122','Xã Pà Cò','Pà Cò','xa',122),
('fc6c7a8c-bc7a-5f4f-a5e8-595d03561f6e','PT-NQ-123','Xã Tân Mai','Tân Mai','xa',123),
('8dd6218a-2964-5fb6-b872-3ad0e503c538','PT-NQ-124','Xã Tân Lạc','Tân Lạc','xa',124),
('463548b9-d220-58c0-a221-d2eebf0c9e94','PT-NQ-125','Xã Mường Bi','Mường Bi','xa',125),
('7223ee2f-5f8a-5eba-80fd-f12becd754fb','PT-NQ-126','Xã Mường Hoa','Mường Hoa','xa',126),
('361265ad-9f30-5836-91ff-7c20aa763b46','PT-NQ-127','Xã Toàn Thắng','Toàn Thắng','xa',127),
('deeac5eb-66e6-56d7-ab1e-c42afe7ff354','PT-NQ-128','Xã Vân Sơn','Vân Sơn','xa',128),
('eebf9f6d-ad55-50b8-8694-e208b2cce03c','PT-NQ-129','Xã Yên Thủy','Yên Thủy','xa',129),
('a6e33625-478b-5f1d-b2c8-97101d99743a','PT-NQ-130','Xã Lạc Lương','Lạc Lương','xa',130),
('48060bf3-4ba4-53e8-80aa-26930eadca0b','PT-NQ-131','Xã Yên Trị','Yên Trị','xa',131),
('543cd416-f00f-53f3-a078-c54f08f95205','PT-NQ-132','Phường Việt Trì','Việt Trì','phuong',132),
('02c8c2c6-5689-585e-b929-afa0fb8652f8','PT-NQ-133','Phường Nông Trang','Nông Trang','phuong',133),
('9d43b685-104d-57d8-9d20-fc7b174e6ae6','PT-NQ-134','Phường Thanh Miếu','Thanh Miếu','phuong',134),
('3f217f41-e8c6-5bce-922a-bb9622d04e74','PT-NQ-135','Phường Vân Phú','Vân Phú','phuong',135),
('ef822739-cdb3-542a-b853-ce33c15b6548','PT-NQ-136','Phường Phú Thọ','Phú Thọ','phuong',136),
('366939d1-a67b-5b29-881d-d21066415363','PT-NQ-137','Phường Phong Châu','Phong Châu','phuong',137),
('93e38542-5888-5db7-a39c-9410d329194d','PT-NQ-138','Phường Âu Cơ','Âu Cơ','phuong',138),
('7d83a863-7e8d-51fc-9af6-b75568bd90d6','PT-NQ-139','Phường Vĩnh Phúc','Vĩnh Phúc','phuong',139),
('ec349a74-bac4-5cbb-bcaf-bf9ceb36806d','PT-NQ-140','Phường Vĩnh Yên','Vĩnh Yên','phuong',140),
('f9dbced8-cdca-5503-92d1-fb577fe9e06d','PT-NQ-141','Phường Phúc Yên','Phúc Yên','phuong',141),
('9e722731-2603-563a-ba2a-d1fa4ac43469','PT-NQ-142','Phường Xuân Hòa','Xuân Hòa','phuong',142),
('fdff410d-1cab-5469-8fc6-6638b8ad20de','PT-NQ-143','Phường Hòa Bình','Hòa Bình','phuong',143),
('d2e55300-5363-5136-a81f-314c4a270a4f','PT-NQ-144','Phường Kỳ Sơn','Kỳ Sơn','phuong',144),
('4242f4f2-05e7-5605-a6c4-a169c2572ef7','PT-NQ-145','Phường Tân Hòa','Tân Hòa','phuong',145),
('b996dab5-f2d3-5eec-b727-4ec991a785f8','PT-NQ-146','Phường Thống Nhất','Thống Nhất','phuong',146),
('03102d86-3096-50ca-b5a2-6372b98cbbf3','PT-NQ-147','Xã Thu Cúc','Thu Cúc','xa',147),
('e0e7a4da-5fda-54fa-81da-d7d2bf17529b','PT-NQ-148','Xã Trung Sơn','Trung Sơn','xa',148)
on conflict (code) do nothing;
do $$ begin if (select count(*) from public.nq_competition_units where active) <> 148 then raise exception 'NQ_UNIT_COUNT_EXPECTED_148'; end if; end $$;

commit;
