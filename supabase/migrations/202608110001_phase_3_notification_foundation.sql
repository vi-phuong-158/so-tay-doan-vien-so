-- Phase 3 · P3-01 — trusted in-app notification foundation.
--
-- Notification writes stay inside trusted SECURITY DEFINER workflows. End-user clients can
-- read their own active-account rows and mark them read only through narrow RPCs.

alter table public.notifications
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id uuid,
  add column if not exists event_key text;

alter table public.notifications
  drop constraint if exists notifications_source_entity_pair_check,
  drop constraint if exists notifications_action_url_check,
  drop constraint if exists notifications_event_key_check;

alter table public.notifications
  add constraint notifications_source_entity_pair_check
    check (num_nonnulls(source_entity_type, source_entity_id) in (0, 2)),
  add constraint notifications_event_key_check
    check (event_key is null or length(btrim(event_key)) between 1 and 220);

create or replace function public.is_safe_notification_action_url(p_action_url text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_action_url is null
    or p_action_url ~ '^(/$|/(cong-viec|ca-nhan|tri-thuc|doi-moi-sang-tao|admin)(/|\?|$))'
$$;

alter table public.notifications
  add constraint notifications_action_url_check
    check (public.is_safe_notification_action_url(action_url));

create unique index if not exists notifications_event_key_unique
  on public.notifications(event_key)
  where event_key is not null;

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc, id desc);

drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "active users read own notifications" on public.notifications;
create policy "active users read own notifications" on public.notifications
for select using (public.is_active_user() and user_id = auth.uid());

drop policy if exists "users mark own notifications read" on public.notifications;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    return false;
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();

  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_active_user() then
    return 0;
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.is_safe_notification_action_url(text) from public, anon;
grant execute on function public.is_safe_notification_action_url(text) to authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- P2 submit hook: version 1 is a confirmation; later versions are explicit resubmission events.
create or replace function public.create_report_submission_with_files(
  p_assignment_id uuid,
  p_summary text,
  p_submit_note text,
  p_files jsonb,
  p_expected_version integer
) returns table(submission_id uuid, version_number integer, resulting_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created record;
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_prefix text;
  v_version_prefix text;
  v_file jsonb;
  v_path text;
  v_original_name text;
  v_safe_name text;
  v_extension text;
  v_segments text[];
  v_seen_paths text[] := array[]::text[];
  v_object_metadata jsonb;
  v_actual_size bigint;
  v_actual_mime text;
  v_claimed_size bigint;
  v_claimed_mime text;
  v_notification_type text;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then
    raise exception 'FILE_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'INVALID_EXPECTED_VERSION';
  end if;

  select * into v_created
  from public.create_report_submission(p_assignment_id, p_summary, p_submit_note);

  if v_created.version_number <> p_expected_version then
    raise exception 'STALE_SUBMISSION_VERSION';
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = p_assignment_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  select * into v_campaign
  from public.report_campaigns
  where id = v_assignment.campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;

  if jsonb_array_length(p_files) > v_campaign.max_files then
    raise exception 'TOO_MANY_FILES';
  end if;

  v_prefix := v_assignment.campaign_id::text || '/' || v_assignment.organization_id::text || '/' || p_assignment_id::text || '/';
  v_version_prefix := v_prefix || 'v' || v_created.version_number::text || '/';

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path';
    v_original_name := v_file->>'original_name';
    v_safe_name := coalesce(nullif(v_file->>'safe_name', ''), v_original_name);
    if coalesce(v_path, '') = '' or coalesce(v_original_name, '') = '' then
      raise exception 'INVALID_FILE_METADATA';
    end if;

    v_segments := string_to_array(v_path, '/');
    if array_length(v_segments, 1) <> 5
      or left(v_path, length(v_version_prefix)) <> v_version_prefix
      or position('..' in v_path) > 0
      or coalesce(v_segments[5], '') = '' then
      raise exception 'FILE_SCOPE_INVALID';
    end if;
    if v_path = any(v_seen_paths) then raise exception 'DUPLICATE_FILE_PATH'; end if;
    v_seen_paths := array_append(v_seen_paths, v_path);

    v_extension := lower(regexp_replace(v_original_name, '^.*\.', ''));
    if v_extension = lower(v_original_name) or not (v_extension = any(v_campaign.allowed_extensions)) then
      raise exception 'FILE_TYPE_NOT_ALLOWED';
    end if;
    if v_safe_name !~ '^[A-Za-z0-9._-]{1,180}$' then raise exception 'INVALID_SAFE_FILE_NAME'; end if;

    select o.metadata into v_object_metadata
    from storage.objects o
    where o.bucket_id = 'report-submissions-private' and o.name = v_path;
    if not found then raise exception 'STORAGE_OBJECT_NOT_FOUND'; end if;

    begin
      v_actual_size := nullif(v_object_metadata->>'size', '')::bigint;
      v_claimed_size := nullif(v_file->>'size_bytes', '')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_FILE_METADATA';
    end;
    v_actual_mime := nullif(v_object_metadata->>'mimetype', '');
    v_claimed_mime := nullif(v_file->>'mime_type', '');

    if v_actual_size is null or v_actual_size < 1 then raise exception 'STORAGE_OBJECT_NOT_FOUND'; end if;
    if v_actual_size > v_campaign.max_file_size_mb::bigint * 1024 * 1024 then
      raise exception 'FILE_TOO_LARGE';
    end if;
    if v_claimed_size is distinct from v_actual_size
      or v_claimed_mime is distinct from v_actual_mime then
      raise exception 'FILE_METADATA_MISMATCH';
    end if;

    insert into public.report_submission_files(
      submission_id, storage_path, original_name, safe_name, mime_type, size_bytes, checksum, uploaded_by
    ) values (
      v_created.submission_id, v_path, v_original_name, v_safe_name, v_actual_mime, v_actual_size,
      nullif(v_file->>'checksum', ''), auth.uid()
    );
  end loop;

  v_notification_type := case when v_created.version_number = 1 then 'REPORT_SUBMITTED' else 'REPORT_RESUBMITTED' end;
  insert into public.notifications(
    user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
  ) values (
    auth.uid(),
    v_notification_type,
    case when v_created.version_number = 1 then 'Đã nộp báo cáo' else 'Đã nộp lại báo cáo' end,
    format('Phiên bản %s đã được ghi nhận.', v_created.version_number),
    format('/cong-viec/bao-cao/%s', p_assignment_id),
    'report_assignment',
    p_assignment_id,
    format('REPORT_%s:%s:v%s:%s', case when v_created.version_number = 1 then 'SUBMITTED' else 'RESUBMITTED' end, p_assignment_id, v_created.version_number, auth.uid())
  );

  submission_id := v_created.submission_id;
  version_number := v_created.version_number;
  resulting_status := v_created.resulting_status;
  return next;
end;
$$;

create or replace function public.create_report_submission_with_files(
  p_assignment_id uuid,
  p_summary text,
  p_submit_note text,
  p_files jsonb
) returns table(submission_id uuid, version_number integer, resulting_status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'TRUSTED_SUBMIT_PATH_REQUIRED';
end;
$$;

revoke all on function public.create_report_submission_with_files(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_report_submission_with_files(uuid, text, text, jsonb, integer) from public, anon;
grant execute on function public.create_report_submission_with_files(uuid, text, text, jsonb, integer) to authenticated;

-- P2 review hook: preserve recipients and atomicity while attaching event identity.
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
  if p_action not in ('ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED') then raise exception 'INVALID_ACTION'; end if;

  select * into v_assignment from public.report_assignments where id = p_assignment_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if not (public.has_role_in_scope('YOUTH_ADMIN', v_assignment.organization_id) or public.has_role('SYSTEM_ADMIN')) then
    raise exception 'ASSIGNMENT_SCOPE_DENIED';
  end if;
  if v_assignment.status = 'ACCEPTED' then raise exception 'REPORT_ALREADY_ACCEPTED'; end if;
  if v_assignment.status = 'EXEMPTED' then raise exception 'REPORT_EXEMPTED'; end if;
  if v_assignment.status = 'CLOSED' then raise exception 'REPORT_CLOSED'; end if;

  select * into v_campaign from public.report_campaigns where id = v_assignment.campaign_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  if p_action = 'EXEMPTED' then
    if v_assignment.status not in ('PENDING', 'OVERDUE') then raise exception 'INVALID_REPORT_TRANSITION'; end if;
    if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    update public.report_assignments
    set status = 'EXEMPTED', exempted_at = now(), exempt_reason = v_reason, updated_at = now()
    where id = p_assignment_id;
    v_notification_type := 'REPORT_EXEMPTED';
    v_notification_title := 'Báo cáo được miễn nộp';
    v_notification_body := format('%s: %s', v_campaign.title, v_reason);
  else
    if v_assignment.status not in ('SUBMITTED', 'RESUBMITTED', 'LATE_SUBMITTED') then raise exception 'INVALID_REPORT_TRANSITION'; end if;
    if p_action = 'NEEDS_SUPPLEMENT' and v_reason is null then raise exception 'REASON_REQUIRED'; end if;
    select * into v_latest from public.report_submissions where assignment_id = p_assignment_id order by version_number desc limit 1;
    if not found then raise exception 'INVALID_REPORT_TRANSITION'; end if;
    update public.report_submissions
    set review_status = case when p_action = 'ACCEPTED' then 'ACCEPTED' else 'NEEDS_SUPPLEMENT' end,
        reviewed_by = v_uid, reviewed_at = now(), review_note = v_reason
    where id = v_latest.id;
    update public.report_assignments
    set status = p_action, accepted_at = case when p_action = 'ACCEPTED' then now() else accepted_at end, updated_at = now()
    where id = p_assignment_id;
    notified_user_id := v_latest.submitted_by;
    v_notification_type := format('REPORT_%s', p_action);
    v_notification_title := case when p_action = 'ACCEPTED' then 'Báo cáo đã được xác nhận hoàn thành' else 'Báo cáo cần bổ sung' end;
    v_notification_body := case when p_action = 'ACCEPTED' then v_campaign.title else format('%s: %s', v_campaign.title, v_reason) end;
  end if;

  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  values (p_assignment_id, v_assignment.status, p_action, v_uid, v_reason);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (v_uid, 'REPORT_REVIEWED', 'report_assignment', p_assignment_id, v_assignment.organization_id,
    jsonb_build_object('status', v_assignment.status), jsonb_build_object('status', p_action, 'reason', v_reason));

  if p_action = 'EXEMPTED' then
    insert into public.notifications(
      user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
    )
    select distinct p.id, v_notification_type, v_notification_title, v_notification_body,
      format('/cong-viec/bao-cao/%s', p_assignment_id), 'report_assignment', p_assignment_id,
      format('REPORT_EXEMPTED:%s:%s', p_assignment_id, p.id)
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.organization_id = v_assignment.organization_id
      and p.account_status = 'ACTIVE'
      and ur.role_code = 'BRANCH_OFFICER'
      and (ur.scope_organization_id is null or ur.scope_organization_id = v_assignment.organization_id);
  else
    insert into public.notifications(
      user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
    ) values (
      v_latest.submitted_by, v_notification_type, v_notification_title, v_notification_body,
      format('/cong-viec/bao-cao/%s', p_assignment_id), 'report_assignment', p_assignment_id,
      format('REPORT_%s:%s:v%s:%s', p_action, p_assignment_id, v_latest.version_number, v_latest.submitted_by)
    );
  end if;

  resulting_status := p_action;
  campaign_id := v_assignment.campaign_id;
  return next;
end;
$$;

revoke all on function public.review_report_assignment(uuid, text, text) from public, anon;
grant execute on function public.review_report_assignment(uuid, text, text) to authenticated;

-- Campaign publication is the first Phase 3 event whose recipient set is resolved here, not by
-- a client-supplied user_id. One notification is created per assignment/officer pair.
create or replace function public.publish_report_campaign(
  p_campaign_id uuid,
  p_organization_ids uuid[]
) returns table(campaign_id uuid, resulting_status text, assignment_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.report_campaigns%rowtype;
  v_org_ids uuid[];
begin
  perform public.assert_report_campaign_admin();
  select * into v_campaign from public.report_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_report_campaign(p_campaign_id) then raise exception 'REPORT_CAMPAIGN_SCOPE_DENIED'; end if;

  if v_campaign.status = 'PUBLISHED' then
    campaign_id := v_campaign.id;
    resulting_status := v_campaign.status;
    select count(*)::integer into assignment_count from public.report_assignments a where a.campaign_id = v_campaign.id;
    return next;
    return;
  end if;
  if v_campaign.status <> 'DRAFT' then raise exception 'CAMPAIGN_NOT_DRAFT'; end if;

  select array_agg(distinct organization_id) into v_org_ids
  from unnest(coalesce(p_organization_ids, array[]::uuid[])) as organization_id
  where organization_id is not null;
  if coalesce(cardinality(v_org_ids), 0) = 0 then raise exception 'ORGANIZATION_REQUIRED'; end if;
  if exists (select 1 from public.organizations o where o.id = any(v_org_ids) and not o.is_active) then raise exception 'ORGANIZATION_INACTIVE'; end if;
  if (select count(*) from public.organizations where id = any(v_org_ids)) <> cardinality(v_org_ids) then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  if exists (select 1 from unnest(v_org_ids) as organization_id where not (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'))) then
    raise exception 'ASSIGNMENT_SCOPE_DENIED';
  end if;

  insert into public.report_assignments(campaign_id, organization_id, status)
  select v_campaign.id, organization_id, 'PENDING'
  from unnest(v_org_ids) as organization_id
  on conflict on constraint report_assignments_campaign_id_organization_id_key do nothing;

  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  select a.id, null, 'PENDING', auth.uid(), 'Phát hành đợt báo cáo'
  from public.report_assignments a where a.campaign_id = v_campaign.id;

  update public.report_campaigns
  set status = 'PUBLISHED', updated_by = auth.uid(), updated_at = now()
  where id = v_campaign.id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  select auth.uid(), 'REPORT_ASSIGNMENT_CREATED', 'report_assignment', a.id, a.organization_id,
    null, jsonb_build_object('campaign_id', v_campaign.id, 'status', 'PENDING')
  from public.report_assignments a where a.campaign_id = v_campaign.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  select auth.uid(), 'REPORT_CAMPAIGN_PUBLISHED', 'report_campaign', v_campaign.id, p.organization_id,
    jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'PUBLISHED')
  from public.profiles p where p.id = auth.uid();

  insert into public.notifications(
    user_id, type, title, body, action_url, source_entity_type, source_entity_id, event_key
  )
  select distinct
    p.id,
    'REPORT_CAMPAIGN_PUBLISHED',
    'Có đợt báo cáo mới',
    v_campaign.title,
    format('/cong-viec/bao-cao/%s', a.id),
    'report_assignment',
    a.id,
    format('REPORT_CAMPAIGN_PUBLISHED:%s:%s:%s', v_campaign.id, a.id, p.id)
  from public.report_assignments a
  join public.profiles p on p.organization_id = a.organization_id and p.account_status = 'ACTIVE'
  join public.user_roles ur on ur.user_id = p.id and ur.role_code = 'BRANCH_OFFICER'
  where a.campaign_id = v_campaign.id
    and (ur.scope_organization_id is null or ur.scope_organization_id = a.organization_id);

  campaign_id := v_campaign.id;
  resulting_status := 'PUBLISHED';
  select count(*)::integer into assignment_count from public.report_assignments a where a.campaign_id = v_campaign.id;
  return next;
end;
$$;

revoke all on function public.publish_report_campaign(uuid, uuid[]) from public, anon;
grant execute on function public.publish_report_campaign(uuid, uuid[]) to authenticated;
