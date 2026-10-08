begin;

alter table quiz_private.nq_competition_config add column public_min_participants integer not null default 3
  check (public_min_participants >= 3);

-- RLS controls rows; column privileges also keep internal roster out of direct REST reads.
revoke select on public.nq_competition_units from anon, authenticated;
grant select(id,code,name,short_name,unit_type,display_order,active)
  on public.nq_competition_units to anon, authenticated;

create or replace function public.nq_competition_dashboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  with stats as materialized (select * from quiz_private.nq_unit_competition_stats where active),
  config as (select public_min_participants,public_missing_units from quiz_private.nq_competition_config),
  safe as (select coalesce(sum(participants),0) >= (select public_min_participants from config)
    and not coalesce(bool_or(participants > 0 and participants < (select public_min_participants from config)),false) as publish
    from stats)
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'unit_count',count(*),'participating_units',count(*) filter(where participants>0),
      'missing_units',count(*) filter(where participants=0),'participants',coalesce(sum(participants),0),
      'attempts',coalesce(sum(attempts),0),
      'pass_count',case when (select publish from safe) then coalesce(sum(pass_count),0) end,
      'pass_rate',case when (select publish from safe) then sum(pass_count)::numeric/nullif(sum(participants),0)*100 end,
      'average_best_score',case when (select publish from safe) then sum(average_best_score*participants)/nullif(sum(participants),0) end,
      'certificate_count',case when (select publish from safe) then coalesce(sum(certificate_count),0) end,
      'statistics_suppressed',not (select publish from safe)) from stats),
    'units',(select coalesce(jsonb_agg(jsonb_build_object(
      'unit_code',unit_code,'unit_name',unit_name,'unit_type',unit_type,'active',active,
      'participants',participants,'attempts',attempts,'eligible_members',null,'completion_rate',null,
      'ranking_status','PILOT','competition_score',null,'rank',null,
      'statistics_suppressed',participants<c.public_min_participants,
      'average_best_score',case when participants>=c.public_min_participants then average_best_score end,
      'pass_count',case when participants>=c.public_min_participants then pass_count end,
      'pass_rate',case when participants>=c.public_min_participants then pass_rate end,
      'highest_score',case when participants>=c.public_min_participants then highest_score end,
      'certificate_count',case when participants>=c.public_min_participants then certificate_count end,
      'latest_activity_at',case when participants>=c.public_min_participants then latest_activity_at end
    ) order by unit_name collate "C",unit_code),'[]'::jsonb) from stats cross join config c),
    'config',(select to_jsonb(c)||jsonb_build_object('purpose','PILOT_LEARNING') from config c));
$$;
revoke all on function public.nq_competition_dashboard() from public,anon,authenticated;
grant execute on function public.nq_competition_dashboard() to anon,authenticated;

-- The public endpoint stays suppressed even for an administrator. A separate role-checked RPC
-- exposes the unchanged private calculation, internal roster and historical inactive units.
create function public.nq_admin_competition_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_role_in_scope('YOUTH_ADMIN',null) then raise exception 'ADMIN_REQUIRED'; end if;
  with stats as materialized (select * from quiz_private.nq_unit_competition_stats)
  select jsonb_build_object(
    'summary',(select jsonb_build_object(
      'unit_count',count(*),'participating_units',count(*) filter(where participants>0),
      'missing_units',count(*) filter(where participants=0),'participants',coalesce(sum(participants),0),
      'attempts',coalesce(sum(attempts),0),'pass_count',coalesce(sum(pass_count),0),
      'pass_rate',sum(pass_count)::numeric/nullif(sum(participants),0)*100,
      'average_best_score',sum(average_best_score*participants)/nullif(sum(participants),0),
      'certificate_count',coalesce(sum(certificate_count),0)) from stats where active),
    'units',(select coalesce(jsonb_agg(to_jsonb(s)-'id' order by rank nulls last,unit_name collate "C",unit_code),'[]'::jsonb) from stats s),
    'config',(select to_jsonb(c)-'id'||jsonb_build_object('purpose','PILOT_LEARNING') from quiz_private.nq_competition_config c)
  ) into result;
  return result;
end $$;
revoke all on function public.nq_admin_competition_dashboard() from public,anon,authenticated;
grant execute on function public.nq_admin_competition_dashboard() to authenticated;

commit;
