-- Phase 3 / P3-05: deterministic report reminder selection and logical events.
-- This migration prepares a trusted scan primitive only. It does not schedule the scan,
-- persist OVERDUE transitions, or call an email provider.

create table if not exists public.report_reminder_events (
  id uuid primary key default gen_random_uuid(),
  logical_key text not null unique,
  assignment_id uuid not null references public.report_assignments(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_type text not null check (reminder_type in (
    'REPORT_DUE_SOON', 'REPORT_OVERDUE', 'REPORT_SUPPLEMENT_REMINDER'
  )),
  policy_offset integer,
  as_of timestamptz not null,
  notification_id uuid references public.notifications(id) on delete set null,
  email_queue_id uuid references public.email_queue(id) on delete set null,
  email_enqueue_status text not null default 'PENDING' check (email_enqueue_status in (
    'PENDING', 'CREATED', 'SKIPPED'
  )),
  email_error_code text,
  scan_count integer not null default 1 check (scan_count > 0),
  last_scan_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((reminder_type = 'REPORT_DUE_SOON' and policy_offset between 1 and 365)
    or (reminder_type <> 'REPORT_DUE_SOON' and policy_offset is null))
);

create index if not exists idx_report_reminder_events_assignment
  on public.report_reminder_events(assignment_id, created_at desc);
create index if not exists idx_report_reminder_events_recipient
  on public.report_reminder_events(recipient_user_id, created_at desc);

alter table public.report_reminder_events enable row level security;
revoke all on table public.report_reminder_events from public, anon, authenticated;
grant all on table public.report_reminder_events to service_role;

drop trigger if exists trg_report_reminder_events_updated_at on public.report_reminder_events;
create trigger trg_report_reminder_events_updated_at
before update on public.report_reminder_events
for each row execute function public.set_updated_at();

create or replace function public.report_reminder_policy_due_offsets(p_policy jsonb)
returns table(policy_offset integer)
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_offset integer;
  v_seen integer[] := array[]::integer[];
begin
  if p_policy is null
    or jsonb_typeof(p_policy) <> 'object'
    or jsonb_typeof(p_policy -> 'due_soon_days') <> 'array' then
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_policy -> 'due_soon_days') loop
    v_offset := null;
    begin
      if jsonb_typeof(v_item) = 'number' then
        v_offset := (v_item #>> '{}')::integer;
      elsif jsonb_typeof(v_item) = 'string'
        and (v_item #>> '{}') ~ '^[1-9][0-9]{0,2}$' then
        v_offset := (v_item #>> '{}')::integer;
      end if;
    exception when others then
      v_offset := null;
    end;

    if v_offset between 1 and 365 and not v_offset = any(v_seen) then
      v_seen := array_append(v_seen, v_offset);
      policy_offset := v_offset;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.report_reminder_policy_enabled(
  p_policy jsonb,
  p_key text
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_policy is null
    or jsonb_typeof(p_policy) <> 'object'
    or jsonb_typeof(p_policy -> p_key) <> 'boolean' then
    return false;
  end if;
  return (p_policy ->> p_key) = 'true';
end;
$$;

-- Reminder email is a secondary side effect of the mandatory notification. P3-04 keeps its
-- original event trigger; this separate trigger only handles the three P3-05 templates.
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

drop trigger if exists trg_enqueue_report_reminder_email_from_notification on public.notifications;
create trigger trg_enqueue_report_reminder_email_from_notification
after insert on public.notifications
for each row execute function public.enqueue_report_reminder_email_from_notification();

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
    v_policy_key := 'NEEDS_SUPPLEMENT';
  end if;

  v_key := format('REPORT_REMINDER:%s:%s:%s:%s',
    p_assignment_id, p_recipient_user_id, p_reminder_type, v_policy_key);

  insert into public.report_reminder_events(
    logical_key, assignment_id, recipient_user_id, reminder_type, policy_offset,
    as_of, last_scan_as_of
  ) values (
    v_key, p_assignment_id, p_recipient_user_id, p_reminder_type, p_policy_offset,
    p_as_of, p_as_of
  ) on conflict (logical_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id, notification_id into v_event_id, v_notification_id
    from public.report_reminder_events
    where logical_key = v_key;
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
  ) on conflict (event_key) do nothing
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
    from public.notifications
    where event_key = v_key;
    update public.report_reminder_events
    set notification_id = v_notification_id,
        scan_count = scan_count + 1,
        last_scan_as_of = p_as_of
    where id = v_event_id;
  end if;

  return query select v_event_id, true, v_key, v_notification_id;
end;
$$;

create or replace function public.scan_report_reminders(p_as_of timestamptz default now())
returns table(
  scan_as_of timestamptz,
  scanned_assignments integer,
  candidate_events integer,
  created_events integer,
  existing_events integer,
  skipped_events integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_assignment record;
  v_recipient record;
  v_offset record;
  v_result record;
  v_due_at timestamptz;
  v_type text;
  v_policy_offset integer;
  v_had_recipient boolean;
  v_logical_key text;
  v_policy_key text;
begin
  if p_as_of is null then raise exception 'AS_OF_REQUIRED'; end if;

  scan_as_of := p_as_of;
  scanned_assignments := 0;
  candidate_events := 0;
  created_events := 0;
  existing_events := 0;
  skipped_events := 0;

  for v_assignment in
    select a.id, a.campaign_id, a.organization_id, a.status, a.due_at_override,
      c.due_at as campaign_due_at, c.reminder_policy, c.open_at, c.close_at
    from public.report_assignments a
    join public.report_campaigns c on c.id = a.campaign_id
    where c.status = 'PUBLISHED'
      and c.open_at <= p_as_of
      and (c.close_at is null or c.close_at > p_as_of)
      and (
        (
          a.status in ('PENDING', 'OVERDUE')
          and coalesce(a.due_at_override, c.due_at) <= p_as_of
          and public.report_reminder_policy_enabled(c.reminder_policy, 'overdue')
        )
        or (
          a.status = 'PENDING'
          and coalesce(a.due_at_override, c.due_at) > p_as_of
          and exists (
            select 1 from public.report_reminder_policy_due_offsets(c.reminder_policy) p
            where p_as_of >= coalesce(a.due_at_override, c.due_at) - (p.policy_offset * interval '1 day')
          )
        )
        or (
          a.status = 'NEEDS_SUPPLEMENT'
          and public.report_reminder_policy_enabled(c.reminder_policy, 'needs_supplement')
        )
      )
    for update of a skip locked
  loop
    scanned_assignments := scanned_assignments + 1;
    v_due_at := coalesce(v_assignment.due_at_override, v_assignment.campaign_due_at);

    if v_assignment.status = 'PENDING' and v_due_at > p_as_of then
      for v_offset in
        select p.policy_offset
        from public.report_reminder_policy_due_offsets(v_assignment.reminder_policy) p
        where p_as_of >= v_due_at - (p.policy_offset * interval '1 day')
      loop
        v_type := 'REPORT_DUE_SOON';
        v_policy_offset := v_offset.policy_offset;
        v_had_recipient := false;
        for v_recipient in
          select distinct p.id
          from public.profiles p
          join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
          join auth.users u on u.id = p.id
          where p.organization_id = v_assignment.organization_id
            and p.account_status = 'ACTIVE'
            and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id)
        loop
          v_had_recipient := true;
          candidate_events := candidate_events + 1;
          select * into v_result from public.create_report_reminder_event(
            v_assignment.id, v_recipient.id, v_type, v_policy_offset, p_as_of
          );
          if v_result.created then created_events := created_events + 1;
          elsif v_result.reminder_event_id is not null then existing_events := existing_events + 1;
          else skipped_events := skipped_events + 1;
          end if;
        end loop;
        if not v_had_recipient then
          v_policy_key := format('T-%s', v_policy_offset);
          v_logical_key := format('REPORT_REMINDER:%s:NO_RECIPIENT:%s:%s', v_assignment.id, v_type, v_policy_key);
          insert into public.audit_logs(action, entity_type, entity_id, organization_id, after_data)
          values (
            'REPORT_REMINDER_SKIPPED', 'report_assignment', v_assignment.id, v_assignment.organization_id,
            jsonb_build_object('as_of', p_as_of, 'reminder_type', v_type, 'policy_offset', v_policy_offset,
              'logical_key', v_logical_key, 'reason_code', 'NO_ACTIVE_BRANCH_OFFICER')
          );
          skipped_events := skipped_events + 1;
        end if;
      end loop;
    end if;

    if v_assignment.status in ('PENDING', 'OVERDUE') and v_due_at <= p_as_of
      and public.report_reminder_policy_enabled(v_assignment.reminder_policy, 'overdue') then
      v_type := 'REPORT_OVERDUE';
      v_policy_offset := null;
      v_had_recipient := false;
      for v_recipient in
        select distinct p.id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
        join auth.users u on u.id = p.id
        where p.organization_id = v_assignment.organization_id
          and p.account_status = 'ACTIVE'
          and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id)
      loop
        v_had_recipient := true;
        candidate_events := candidate_events + 1;
        select * into v_result from public.create_report_reminder_event(
          v_assignment.id, v_recipient.id, v_type, null, p_as_of
        );
        if v_result.created then created_events := created_events + 1;
        elsif v_result.reminder_event_id is not null then existing_events := existing_events + 1;
        else skipped_events := skipped_events + 1;
        end if;
      end loop;
      if not v_had_recipient then
        v_logical_key := format('REPORT_REMINDER:%s:NO_RECIPIENT:%s:OVERDUE', v_assignment.id, v_type);
        insert into public.audit_logs(action, entity_type, entity_id, organization_id, after_data)
        values (
          'REPORT_REMINDER_SKIPPED', 'report_assignment', v_assignment.id, v_assignment.organization_id,
          jsonb_build_object('as_of', p_as_of, 'reminder_type', v_type, 'logical_key', v_logical_key,
            'reason_code', 'NO_ACTIVE_BRANCH_OFFICER')
        );
        skipped_events := skipped_events + 1;
      end if;
    end if;

    if v_assignment.status = 'NEEDS_SUPPLEMENT'
      and public.report_reminder_policy_enabled(v_assignment.reminder_policy, 'needs_supplement') then
      v_type := 'REPORT_SUPPLEMENT_REMINDER';
      v_policy_offset := null;
      v_had_recipient := false;
      for v_recipient in
        select distinct p.id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
        join auth.users u on u.id = p.id
        where p.organization_id = v_assignment.organization_id
          and p.account_status = 'ACTIVE'
          and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id)
      loop
        v_had_recipient := true;
        candidate_events := candidate_events + 1;
        select * into v_result from public.create_report_reminder_event(
          v_assignment.id, v_recipient.id, v_type, null, p_as_of
        );
        if v_result.created then created_events := created_events + 1;
        elsif v_result.reminder_event_id is not null then existing_events := existing_events + 1;
        else skipped_events := skipped_events + 1;
        end if;
      end loop;
      if not v_had_recipient then
        v_logical_key := format('REPORT_REMINDER:%s:NO_RECIPIENT:%s:NEEDS_SUPPLEMENT', v_assignment.id, v_type);
        insert into public.audit_logs(action, entity_type, entity_id, organization_id, after_data)
        values (
          'REPORT_REMINDER_SKIPPED', 'report_assignment', v_assignment.id, v_assignment.organization_id,
          jsonb_build_object('as_of', p_as_of, 'reminder_type', v_type, 'logical_key', v_logical_key,
            'reason_code', 'NO_ACTIVE_BRANCH_OFFICER')
        );
        skipped_events := skipped_events + 1;
      end if;
    end if;
  end loop;

  return next;
end;
$$;

revoke all on function public.report_reminder_policy_due_offsets(jsonb) from public, anon, authenticated;
revoke all on function public.report_reminder_policy_enabled(jsonb, text) from public, anon, authenticated;
revoke all on function public.create_report_reminder_event(uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.scan_report_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.scan_report_reminders(timestamptz) to service_role;
