-- Phase 2 · P2-10 — make review notifications part of the atomic transition.
--
-- The P2-05 RPC already owns authorization, transition guards, history and audit. This
-- forward-only replacement keeps those invariants and moves notification creation into the
-- same transaction so a notification failure cannot leave a partially reviewed assignment.

create or replace function public.review_report_assignment(
  p_assignment_id uuid,
  p_action text,
  p_reason text default null
) returns table(resulting_status text, notified_user_id uuid, campaign_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_latest public.report_submissions%rowtype;
  v_notification_title text;
  v_notification_body text;
  v_notification_type text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_action not in ('ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = p_assignment_id
  for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  if not (
    public.has_role_in_scope('YOUTH_ADMIN', v_assignment.organization_id)
    or public.has_role('SYSTEM_ADMIN')
  ) then
    raise exception 'ASSIGNMENT_SCOPE_DENIED';
  end if;

  if v_assignment.status = 'ACCEPTED' then raise exception 'REPORT_ALREADY_ACCEPTED'; end if;
  if v_assignment.status = 'EXEMPTED' then raise exception 'REPORT_EXEMPTED'; end if;
  if v_assignment.status = 'CLOSED' then raise exception 'REPORT_CLOSED'; end if;

  select * into v_campaign
  from public.report_campaigns
  where id = v_assignment.campaign_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  if p_action = 'EXEMPTED' then
    if v_assignment.status not in ('PENDING', 'OVERDUE') then
      raise exception 'INVALID_REPORT_TRANSITION';
    end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;

    update public.report_assignments
    set status = 'EXEMPTED',
        exempted_at = now(),
        exempt_reason = v_reason,
        updated_at = now()
    where id = p_assignment_id;

    v_notification_type := 'REPORT_EXEMPTED';
    v_notification_title := 'Báo cáo được miễn nộp';
    v_notification_body := format('%s: %s', v_campaign.title, v_reason);
  else
    if v_assignment.status not in ('SUBMITTED', 'RESUBMITTED', 'LATE_SUBMITTED') then
      raise exception 'INVALID_REPORT_TRANSITION';
    end if;
    if p_action = 'NEEDS_SUPPLEMENT' and v_reason is null then
      raise exception 'REASON_REQUIRED';
    end if;

    select * into v_latest
    from public.report_submissions
    where assignment_id = p_assignment_id
    order by version_number desc
    limit 1;
    if not found then raise exception 'INVALID_REPORT_TRANSITION'; end if;

    update public.report_submissions
    set review_status = case when p_action = 'ACCEPTED' then 'ACCEPTED' else 'NEEDS_SUPPLEMENT' end,
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_note = v_reason
    where id = v_latest.id;

    update public.report_assignments
    set status = p_action,
        accepted_at = case when p_action = 'ACCEPTED' then now() else accepted_at end,
        updated_at = now()
    where id = p_assignment_id;

    notified_user_id := v_latest.submitted_by;
    v_notification_type := format('REPORT_%s', p_action);
    v_notification_title := case
      when p_action = 'ACCEPTED' then 'Báo cáo đã được xác nhận hoàn thành'
      else 'Báo cáo cần bổ sung'
    end;
    v_notification_body := case
      when p_action = 'ACCEPTED' then v_campaign.title
      else format('%s: %s', v_campaign.title, v_reason)
    end;
  end if;

  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  values (p_assignment_id, v_assignment.status, p_action, v_uid, v_reason);

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (
    v_uid,
    'REPORT_REVIEWED',
    'report_assignment',
    p_assignment_id,
    v_assignment.organization_id,
    jsonb_build_object('status', v_assignment.status),
    jsonb_build_object('status', p_action, 'reason', v_reason)
  );

  -- Keep notification creation inside this SECURITY DEFINER transaction. The submitter gets
  -- one notification for a reviewed submission; exemption informs active officers in scope.
  if p_action = 'EXEMPTED' then
    insert into public.notifications(user_id, type, title, body, action_url)
    select distinct
      p.id,
      v_notification_type,
      v_notification_title,
      v_notification_body,
      format('/cong-viec/bao-cao/%s', p_assignment_id)
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.organization_id = v_assignment.organization_id
      and p.account_status = 'ACTIVE'
      and ur.role_code = 'BRANCH_OFFICER'
      and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id);
  else
    insert into public.notifications(user_id, type, title, body, action_url)
    values (
      v_latest.submitted_by,
      v_notification_type,
      v_notification_title,
      v_notification_body,
      format('/cong-viec/bao-cao/%s', p_assignment_id)
    );
  end if;

  resulting_status := p_action;
  campaign_id := v_assignment.campaign_id;
  return next;
end;
$$;

revoke all on function public.review_report_assignment(uuid, text, text) from public, anon;
grant execute on function public.review_report_assignment(uuid, text, text) to authenticated;
