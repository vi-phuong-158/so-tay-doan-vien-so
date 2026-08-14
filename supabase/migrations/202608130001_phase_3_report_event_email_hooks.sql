-- Phase 3 / P3-04: turn trusted report notifications into secondary email queue events.
-- The notification insert remains the business event boundary. This trigger never trusts
-- frontend input and absorbs queue failures so report mutations keep their Phase 2 contract.

create or replace function public.enqueue_report_email_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_organization public.organizations%rowtype;
  v_submission public.report_submissions%rowtype;
  v_template text;
  v_payload jsonb;
  v_enqueue_created boolean;
  v_error_code text;
begin
  if new.source_entity_type <> 'report_assignment'
    or new.source_entity_id is null
    or new.type not in (
      'REPORT_CAMPAIGN_PUBLISHED', 'REPORT_SUBMITTED', 'REPORT_RESUBMITTED',
      'REPORT_NEEDS_SUPPLEMENT', 'REPORT_ACCEPTED'
    ) then
    return new;
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = new.source_entity_id;
  if not found then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
    values (
      auth.uid(), 'REPORT_EMAIL_ENQUEUE_SKIPPED', 'report_assignment', new.source_entity_id,
      jsonb_build_object('event_key', new.event_key, 'reason_code', 'SOURCE_NOT_FOUND')
    );
    return new;
  end if;

  select * into v_campaign from public.report_campaigns where id = v_assignment.campaign_id;
  select * into v_organization from public.organizations where id = v_assignment.organization_id;
  if not found then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
    values (
      auth.uid(), 'REPORT_EMAIL_ENQUEUE_SKIPPED', 'report_assignment', v_assignment.id,
      v_assignment.organization_id,
      jsonb_build_object('event_key', new.event_key, 'reason_code', 'CAMPAIGN_OR_ORG_NOT_FOUND')
    );
    return new;
  end if;

  v_template := new.type;
  v_payload := jsonb_build_object(
    'campaign_title', left(v_campaign.title, 300),
    'unit_name', left(coalesce(v_organization.name, v_organization.code), 200),
    'action_path', format('/cong-viec/bao-cao/%s', v_assignment.id)
  );

  if new.type = 'REPORT_CAMPAIGN_PUBLISHED' then
    v_payload := v_payload || jsonb_build_object(
      'due_at', to_char(v_campaign.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
    );
  else
    select * into v_submission
    from public.report_submissions
    where assignment_id = v_assignment.id
      and (new.type in ('REPORT_SUBMITTED', 'REPORT_RESUBMITTED') and submitted_by = new.user_id
        or new.type in ('REPORT_NEEDS_SUPPLEMENT', 'REPORT_ACCEPTED'))
    order by version_number desc
    limit 1;

    if not found then
      insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
      values (
        auth.uid(), 'REPORT_EMAIL_ENQUEUE_SKIPPED', 'report_assignment', v_assignment.id,
        v_assignment.organization_id,
        jsonb_build_object('event_key', new.event_key, 'reason_code', 'SUBMISSION_NOT_FOUND')
      );
      return new;
    end if;

    v_payload := v_payload || jsonb_build_object(
      'version', v_submission.version_number,
      'submitted_at', to_char(v_submission.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
    );

    if new.type = 'REPORT_NEEDS_SUPPLEMENT' then
      v_payload := v_payload || jsonb_build_object(
        'review_reason', left(coalesce(v_submission.review_note, ''), 1000)
      );
    end if;
  end if;

  begin
    select created into v_enqueue_created
    from public.enqueue_email_for_user_event(
      v_template,
      new.user_id,
      'report_assignment',
      v_assignment.id,
      md5(coalesce(new.event_key, new.id::text)),
      v_payload,
      now(),
      5
    );
  exception when others then
    get stacked diagnostics v_error_code = returned_sqlstate;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
    values (
      auth.uid(), 'REPORT_EMAIL_ENQUEUE_SKIPPED', 'report_assignment', v_assignment.id,
      v_assignment.organization_id,
      jsonb_build_object(
        'event_key', new.event_key,
        'template_code', v_template,
        'reason_code', left(v_error_code, 5)
      )
    );
  end;

  return new;
end;
$$;

revoke all on function public.enqueue_report_email_from_notification() from public, anon, authenticated;
grant execute on function public.enqueue_report_email_from_notification() to service_role;

drop trigger if exists trg_enqueue_report_email_from_notification on public.notifications;
create trigger trg_enqueue_report_email_from_notification
after insert on public.notifications
for each row execute function public.enqueue_report_email_from_notification();

-- A publish with no active, in-scope user with a valid email still succeeds, but leaves
-- explicit audit evidence instead of pretending that an email was queued.
create or replace function public.record_report_email_recipient_gaps()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if old.status <> 'PUBLISHED' and new.status = 'PUBLISHED' then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
    select new.updated_by, 'REPORT_EMAIL_RECIPIENT_MISSING', 'report_assignment', a.id,
      a.organization_id,
      jsonb_build_object('event_type', 'REPORT_CAMPAIGN_PUBLISHED', 'reason_code', 'NO_VALID_RECIPIENT')
    from public.report_assignments a
    where a.campaign_id = new.id
      and not exists (
        select 1
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
        join auth.users u on u.id = p.id
        where p.organization_id = a.organization_id
          and p.account_status = 'ACTIVE'
          and (ur.scope_organization_id is null or ur.scope_organization_id = a.organization_id)
          and lower(btrim(u.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  end if;
  return new;
end;
$$;

revoke all on function public.record_report_email_recipient_gaps() from public, anon, authenticated;
grant execute on function public.record_report_email_recipient_gaps() to service_role;

drop trigger if exists trg_record_report_email_recipient_gaps on public.report_campaigns;
create trigger trg_record_report_email_recipient_gaps
after update of status on public.report_campaigns
for each row execute function public.record_report_email_recipient_gaps();
