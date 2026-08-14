-- Phase 3 / P3-R1: report event email hook remediation.
-- Two fixes, both forward-only replacements of existing SECURITY DEFINER functions with the
-- same signature and the same grants. No table is dropped, no historical row is edited.

-- Fix 1 (P2-01): enqueue_email_for_user_event already validates and uses
-- p_source_entity_type/p_source_entity_id to build the idempotency key, but never stored them
-- on the row it inserts. Store them directly at the point of insert instead of leaving callers
-- to patch email_queue afterward.
create or replace function public.enqueue_email_for_user_event(
  p_template_code text,
  p_recipient_user_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_event_revision text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now(),
  p_max_attempts integer default 5
)
returns table(queue_id uuid, created boolean, idempotency_key text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_name text;
  v_key text;
  v_queue_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_template_code is null or p_template_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception 'INVALID_TEMPLATE_CODE';
  end if;
  if p_recipient_user_id is null then
    raise exception 'RECIPIENT_REQUIRED';
  end if;
  if p_source_entity_type is null or p_source_entity_type !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_source_entity_id is null then
    raise exception 'SOURCE_IDENTITY_REQUIRED';
  end if;
  if p_event_revision is null or btrim(p_event_revision) = '' or length(p_event_revision) > 64 then
    raise exception 'EVENT_REVISION_REQUIRED';
  end if;
  if p_max_attempts is null or p_max_attempts not between 1 and 10 then
    raise exception 'INVALID_MAX_ATTEMPTS';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384
    or p_payload ?| array['html', 'html_content', 'raw_html'] then
    raise exception 'INVALID_EMAIL_PAYLOAD';
  end if;

  select lower(btrim(u.email)), left(p.full_name, 200)
    into v_email, v_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_recipient_user_id
    and p.account_status = 'ACTIVE';

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  v_key := format('%s:%s:%s:%s:%s', p_template_code, p_source_entity_type,
    p_source_entity_id, p_recipient_user_id, p_event_revision);

  insert into public.email_queue(
    template_code, recipient_user_id, recipient_email, recipient_name,
    source_entity_type, source_entity_id,
    payload, scheduled_at, next_attempt_at, status, max_attempts, idempotency_key,
    created_at, updated_at
  ) values (
    p_template_code, p_recipient_user_id, v_email, v_name,
    p_source_entity_type, p_source_entity_id,
    p_payload, coalesce(p_scheduled_at, v_now), coalesce(p_scheduled_at, v_now),
    'PENDING', p_max_attempts, v_key, v_now, v_now
  )
  on conflict on constraint email_queue_idempotency_key_key do nothing
  returning id into v_queue_id;

  if v_queue_id is not null then
    return query select v_queue_id, true, v_key;
    return;
  end if;

  return query
  select q.id, false, q.idempotency_key
  from public.email_queue q
  where q.idempotency_key = v_key;
end;
$$;

revoke all on function public.enqueue_email_for_user_event(text, uuid, text, uuid, text, jsonb, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.enqueue_email_for_user_event(text, uuid, text, uuid, text, jsonb, timestamptz, integer) to service_role;

-- Fix 2 (P1-02): REPORT_SUPPLEMENT_REMINDER used a fixed 'NEEDS_SUPPLEMENT' milestone, so once
-- one reminder existed for an assignment/recipient pair the unique logical key silently blocked
-- every future review cycle. Key the milestone off the latest submission version instead, so a
-- resubmission that earns a new NEEDS_SUPPLEMENT decision opens a new, distinct milestone while
-- the current cycle still cannot be reminded twice. Earlier report_reminder_events rows are
-- untouched.
create or replace function public.create_report_reminder_event(
  p_assignment_id uuid,
  p_recipient_user_id uuid,
  p_reminder_type text,
  p_policy_offset integer,
  p_as_of timestamptz
)
returns table(reminder_event_id uuid, created boolean, logical_key text, notification_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_event_id uuid;
  v_notification_id uuid;
  v_policy_key text;
  v_key text;
  v_due_at timestamptz;
  v_latest_submission_version integer;
begin
  if p_as_of is null or p_assignment_id is null or p_recipient_user_id is null then
    return;
  end if;
  if p_reminder_type not in ('REPORT_DUE_SOON', 'REPORT_OVERDUE', 'REPORT_SUPPLEMENT_REMINDER') then
    return;
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = p_assignment_id;
  if not found then return; end if;

  select * into v_campaign
  from public.report_campaigns
  where id = v_assignment.campaign_id;
  if not found
    or v_campaign.status <> 'PUBLISHED'
    or v_campaign.open_at > p_as_of
    or (v_campaign.close_at is not null and v_campaign.close_at <= p_as_of) then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
    join auth.users u on u.id = p.id
    where p.id = p_recipient_user_id
      and p.organization_id = v_assignment.organization_id
      and p.account_status = 'ACTIVE'
      and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id)
  ) then
    return;
  end if;

  v_due_at := coalesce(v_assignment.due_at_override, v_campaign.due_at);
  if p_reminder_type = 'REPORT_DUE_SOON' then
    if v_assignment.status <> 'PENDING'
      or p_policy_offset is null
      or not exists (
        select 1 from public.report_reminder_policy_due_offsets(v_campaign.reminder_policy) p
        where p.policy_offset = p_policy_offset
      )
      or v_due_at <= p_as_of
      or p_as_of < v_due_at - (p_policy_offset * interval '1 day') then
      return;
    end if;
    v_policy_key := format('T-%s', p_policy_offset);
  elsif p_reminder_type = 'REPORT_OVERDUE' then
    if v_assignment.status not in ('PENDING', 'OVERDUE')
      or not public.report_reminder_policy_enabled(v_campaign.reminder_policy, 'overdue')
      or v_due_at > p_as_of then
      return;
    end if;
    v_policy_key := 'OVERDUE';
  else
    if v_assignment.status <> 'NEEDS_SUPPLEMENT'
      or not public.report_reminder_policy_enabled(v_campaign.reminder_policy, 'needs_supplement') then
      return;
    end if;

    select s.version_number into v_latest_submission_version
    from public.report_submissions s
    where s.assignment_id = p_assignment_id
    order by s.version_number desc
    limit 1;
    if v_latest_submission_version is null then
      return;
    end if;

    v_policy_key := format('NEEDS_SUPPLEMENT:v%s', v_latest_submission_version);
  end if;

  v_key := format('REPORT_REMINDER:%s:%s:%s:%s',
    p_assignment_id, p_recipient_user_id, p_reminder_type, v_policy_key);

  insert into public.report_reminder_events(
    logical_key, assignment_id, recipient_user_id, reminder_type, policy_offset,
    as_of, last_scan_as_of
  ) values (
    v_key, p_assignment_id, p_recipient_user_id, p_reminder_type, p_policy_offset,
    p_as_of, p_as_of
  ) on conflict on constraint report_reminder_events_logical_key_key do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select e.id, e.notification_id into v_event_id, v_notification_id
    from public.report_reminder_events e
    where e.logical_key = v_key;
    update public.report_reminder_events
    set scan_count = scan_count + 1,
        last_scan_as_of = p_as_of,
        updated_at = now()
    where id = v_event_id;
    return query select v_event_id, false, v_key, v_notification_id;
    return;
  end if;

  insert into public.notifications(
    user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
  ) values (
    p_recipient_user_id,
    p_reminder_type,
    case p_reminder_type
      when 'REPORT_DUE_SOON' then 'Báo cáo sắp đến hạn'
      when 'REPORT_OVERDUE' then 'Báo cáo đã quá hạn'
      else 'Báo cáo cần bổ sung'
    end,
    case p_reminder_type
      when 'REPORT_DUE_SOON' then format('%s: nhiệm vụ sắp đến hạn.', v_campaign.title)
      when 'REPORT_OVERDUE' then format('%s: nhiệm vụ đã quá hạn.', v_campaign.title)
      else format('%s: nhiệm vụ cần bổ sung.', v_campaign.title)
    end,
    format('/cong-viec/bao-cao/%s', p_assignment_id),
    'report_assignment', p_assignment_id, v_key
  ) on conflict (event_key) where event_key is not null do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    update public.report_reminder_events
    set notification_id = v_notification_id
    where id = v_event_id;
    insert into public.audit_logs(action, entity_type, entity_id, organization_id, after_data)
    values (
      'REPORT_REMINDER_CREATED', 'report_assignment', p_assignment_id, v_assignment.organization_id,
      jsonb_build_object(
        'as_of', p_as_of,
        'reminder_type', p_reminder_type,
        'policy_offset', p_policy_offset,
        'logical_key', v_key,
        'recipient_user_id', p_recipient_user_id,
        'notification_id', v_notification_id
      )
    );
  else
    select id into v_notification_id
    from public.notifications n
    where n.event_key = v_key;
    update public.report_reminder_events
    set notification_id = v_notification_id,
        scan_count = scan_count + 1,
        last_scan_as_of = p_as_of
    where id = v_event_id;
  end if;

  return query select v_event_id, true, v_key, v_notification_id;
end;
$$;

revoke all on function public.create_report_reminder_event(uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;

-- The P3-05 reminder email trigger previously patched email_queue.source_entity_type/id after
-- calling enqueue_email_for_user_event because the RPC did not persist them itself. That is now
-- fixed at the RPC (above), so the redundant post-enqueue UPDATE is removed rather than kept as
-- a second, parallel source of truth.
create or replace function public.enqueue_report_reminder_email_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_organization public.organizations%rowtype;
  v_event public.report_reminder_events%rowtype;
  v_queue_id uuid;
  v_enqueue_created boolean;
  v_error_code text;
  v_due_at timestamptz;
  v_days_remaining integer;
  v_payload jsonb;
begin
  if coalesce(new.source_entity_type, '') <> 'report_assignment'
    or new.source_entity_id is null
    or new.type not in ('REPORT_DUE_SOON', 'REPORT_OVERDUE', 'REPORT_SUPPLEMENT_REMINDER') then
    return new;
  end if;

  select * into v_event
  from public.report_reminder_events
  where logical_key = new.event_key;
  if not found then
    insert into public.audit_logs(action, entity_type, entity_id, after_data)
    values (
      'REPORT_REMINDER_EMAIL_SKIPPED', 'report_assignment', new.source_entity_id,
      jsonb_build_object('event_key', new.event_key, 'reason_code', 'REMINDER_EVENT_NOT_FOUND')
    );
    return new;
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = new.source_entity_id;
  if not found then
    update public.report_reminder_events
    set email_enqueue_status = 'SKIPPED', email_error_code = 'ASSIGNMENT_NOT_FOUND'
    where id = v_event.id;
    return new;
  end if;

  select * into v_campaign
  from public.report_campaigns
  where id = v_assignment.campaign_id;
  if not found then
    update public.report_reminder_events
    set email_enqueue_status = 'SKIPPED', email_error_code = 'CAMPAIGN_NOT_FOUND'
    where id = v_event.id;
    return new;
  end if;

  select * into v_organization
  from public.organizations
  where id = v_assignment.organization_id;
  if not found then
    update public.report_reminder_events
    set email_enqueue_status = 'SKIPPED', email_error_code = 'ORGANIZATION_NOT_FOUND'
    where id = v_event.id;
    return new;
  end if;

  v_due_at := coalesce(v_assignment.due_at_override, v_campaign.due_at);
  v_payload := jsonb_build_object(
    'campaign_title', left(v_campaign.title, 300),
    'unit_name', left(coalesce(v_organization.name, v_organization.code), 200),
    'action_path', format('/cong-viec/bao-cao/%s', v_assignment.id)
  );

  if new.type = 'REPORT_DUE_SOON' then
    v_days_remaining := greatest(0, ceil(extract(epoch from (v_due_at - v_event.as_of)) / 86400))::integer;
    v_payload := v_payload || jsonb_build_object(
      'due_at', to_char(v_due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI'),
      'days_remaining', v_days_remaining,
      'policy_offset', v_event.policy_offset
    );
  elsif new.type = 'REPORT_OVERDUE' then
    v_payload := v_payload || jsonb_build_object(
      'due_at', to_char(v_due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
    );
  end if;

  begin
    select queue_id, created into v_queue_id, v_enqueue_created
    from public.enqueue_email_for_user_event(
      new.type,
      new.user_id,
      'report_assignment',
      v_assignment.id,
      md5(coalesce(new.event_key, new.id::text)),
      v_payload,
      now(),
      5
    );

    update public.report_reminder_events
    set notification_id = new.id,
        email_queue_id = v_queue_id,
        email_enqueue_status = 'CREATED',
        email_error_code = null
    where id = v_event.id;
  exception when others then
    get stacked diagnostics v_error_code = returned_sqlstate;
    update public.report_reminder_events
    set notification_id = new.id,
        email_enqueue_status = 'SKIPPED',
        email_error_code = left(v_error_code, 5)
    where id = v_event.id;
    insert into public.audit_logs(action, entity_type, entity_id, organization_id, after_data)
    values (
      'REPORT_REMINDER_EMAIL_SKIPPED', 'report_assignment', v_assignment.id, v_assignment.organization_id,
      jsonb_build_object(
        'event_key', new.event_key,
        'template_code', new.type,
        'reason_code', left(v_error_code, 5),
        'recipient_user_id', new.user_id
      )
    );
  end;

  return new;
end;
$$;

revoke all on function public.enqueue_report_reminder_email_from_notification() from public, anon, authenticated;
grant execute on function public.enqueue_report_reminder_email_from_notification() to service_role;
