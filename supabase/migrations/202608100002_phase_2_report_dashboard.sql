-- Phase 2 · P2-13 — scoped, read-only report dashboard aggregation.
-- Effective overdue is calculated with the database clock only; this migration never mutates
-- assignments and therefore does not replace the Phase 3 overdue reconciliation job.

create or replace function public.assert_report_dashboard_scope(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_report_campaign_admin();

  if not exists (select 1 from public.report_campaigns c where c.id = p_campaign_id) then
    raise exception 'REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if not public.can_manage_report_campaign(p_campaign_id)
    and not exists (
      select 1
      from public.report_assignments a
      where a.campaign_id = p_campaign_id
        and (public.has_role('SYSTEM_ADMIN') or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id))
    ) then
    raise exception 'REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN';
  end if;
end;
$$;

create or replace function public.get_report_dashboard(p_campaign_id uuid)
returns table(
  campaign_id uuid, title text, status text, open_at timestamptz, due_at timestamptz, close_at timestamptz,
  total_assignments integer, pending_count integer, submitted_count integer, needs_supplement_count integer,
  resubmitted_count integer, accepted_count integer, overdue_count integer, late_submitted_count integer,
  exempted_count integer, closed_count integer, completed_count integer, completion_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_report_dashboard_scope(p_campaign_id);

  return query
  with scoped_assignments as (
    select a.id, a.status as stored_status, coalesce(a.due_at_override, c.due_at) as effective_due_at,
      latest.is_late,
      case
        when a.status = 'PENDING' and c.status = 'PUBLISHED' and now() > coalesce(a.due_at_override, c.due_at) then 'OVERDUE'
        else a.status
      end as dashboard_status
    from public.report_campaigns c
    left join public.report_assignments a on a.campaign_id = c.id
    left join lateral (
      select s.is_late
      from public.report_submissions s
      where s.assignment_id = a.id
      order by s.version_number desc
      limit 1
    ) latest on true
    where c.id = p_campaign_id
      and a.id is not null
      and (public.has_role('SYSTEM_ADMIN') or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id))
  ), counts as (
    select count(*)::integer as total_assignments,
      count(*) filter (where dashboard_status = 'PENDING')::integer as pending_count,
      count(*) filter (where dashboard_status = 'SUBMITTED')::integer as submitted_count,
      count(*) filter (where dashboard_status = 'NEEDS_SUPPLEMENT')::integer as needs_supplement_count,
      count(*) filter (where dashboard_status = 'RESUBMITTED')::integer as resubmitted_count,
      count(*) filter (where dashboard_status = 'ACCEPTED')::integer as accepted_count,
      count(*) filter (where dashboard_status = 'OVERDUE')::integer as overdue_count,
      count(*) filter (where coalesce(is_late, false))::integer as late_submitted_count,
      count(*) filter (where dashboard_status = 'EXEMPTED')::integer as exempted_count,
      count(*) filter (where dashboard_status = 'CLOSED')::integer as closed_count
    from scoped_assignments
  )
  select c.id, c.title, c.status, c.open_at, c.due_at, c.close_at,
    counts.total_assignments, counts.pending_count, counts.submitted_count, counts.needs_supplement_count,
    counts.resubmitted_count, counts.accepted_count, counts.overdue_count, counts.late_submitted_count,
    counts.exempted_count, counts.closed_count,
    (counts.accepted_count + counts.exempted_count)::integer,
    case when counts.total_assignments = 0 then 0::numeric
      else round(((counts.accepted_count + counts.exempted_count)::numeric * 100) / counts.total_assignments, 2)
    end
  from public.report_campaigns c cross join counts
  where c.id = p_campaign_id;
end;
$$;

create or replace function public.get_report_dashboard_assignments(
  p_campaign_id uuid,
  p_status text default null,
  p_search text default null
) returns table(
  assignment_id uuid, organization_id uuid, organization_code text, organization_name text,
  status text, effective_due_at timestamptz, latest_version integer, latest_submitted_at timestamptz,
  is_late boolean, review_status text, review_note text, accepted_at timestamptz, exempt_reason text,
  attention_rank integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_report_dashboard_scope(p_campaign_id);
  if v_status is not null and v_status not in ('PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'COMPLETED', 'OVERDUE', 'LATE_SUBMITTED', 'EXEMPTED') then
    raise exception 'INVALID_DASHBOARD_FILTER';
  end if;
  if v_search is not null and length(v_search) > 100 then raise exception 'INVALID_DASHBOARD_FILTER'; end if;

  return query
  with scoped_rows as (
    select a.id as assignment_id, o.id as organization_id, o.code as organization_code, o.name as organization_name,
      case
        when a.status = 'PENDING' and c.status = 'PUBLISHED' and now() > coalesce(a.due_at_override, c.due_at) then 'OVERDUE'
        else a.status
      end as dashboard_status,
      coalesce(a.due_at_override, c.due_at) as effective_due_at,
      latest.version_number as latest_version, latest.submitted_at as latest_submitted_at,
      coalesce(latest.is_late, false) as is_late, latest.review_status, latest.review_note,
      a.accepted_at, a.exempt_reason
    from public.report_campaigns c
    join public.report_assignments a on a.campaign_id = c.id
    join public.organizations o on o.id = a.organization_id
    left join lateral (
      select s.version_number, s.submitted_at, s.is_late, s.review_status, s.review_note
      from public.report_submissions s
      where s.assignment_id = a.id
      order by s.version_number desc
      limit 1
    ) latest on true
    where c.id = p_campaign_id
      and (public.has_role('SYSTEM_ADMIN') or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id))
  )
  select r.assignment_id, r.organization_id, r.organization_code, r.organization_name, r.dashboard_status,
    r.effective_due_at, r.latest_version, r.latest_submitted_at, r.is_late, r.review_status, r.review_note,
    r.accepted_at, r.exempt_reason,
    case r.dashboard_status
      when 'OVERDUE' then 1 when 'NEEDS_SUPPLEMENT' then 2 when 'SUBMITTED' then 3
      when 'LATE_SUBMITTED' then 3 when 'PENDING' then 4 when 'RESUBMITTED' then 5
      when 'ACCEPTED' then 6 when 'EXEMPTED' then 7 else 8
    end
  from scoped_rows r
  where (v_status is null
      or (v_status = 'COMPLETED' and r.dashboard_status in ('ACCEPTED', 'EXEMPTED'))
      or (v_status = 'LATE_SUBMITTED' and r.is_late)
      or (v_status not in ('COMPLETED', 'LATE_SUBMITTED') and r.dashboard_status = v_status))
    and (v_search is null or r.organization_name ilike '%' || v_search || '%' or coalesce(r.organization_code, '') ilike '%' || v_search || '%')
  order by
    case r.dashboard_status
      when 'OVERDUE' then 1 when 'NEEDS_SUPPLEMENT' then 2 when 'SUBMITTED' then 3
      when 'LATE_SUBMITTED' then 3 when 'PENDING' then 4 when 'RESUBMITTED' then 5
      when 'ACCEPTED' then 6 when 'EXEMPTED' then 7 else 8
    end,
    r.effective_due_at nulls last, r.organization_name, r.assignment_id;
end;
$$;

revoke all on function public.get_report_dashboard(uuid) from public, anon;
grant execute on function public.get_report_dashboard(uuid) to authenticated;
revoke all on function public.get_report_dashboard_assignments(uuid, text, text) from public, anon;
grant execute on function public.get_report_dashboard_assignments(uuid, text, text) to authenticated;
revoke all on function public.assert_report_dashboard_scope(uuid) from public, anon, authenticated;
