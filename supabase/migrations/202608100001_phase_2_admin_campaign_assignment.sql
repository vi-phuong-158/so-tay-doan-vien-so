-- Phase 2 · P2-12 — scoped campaign administration and atomic assignment publishing.
-- All write paths below resolve the actor from auth.uid(); the browser never supplies an
-- audit identity or inserts report assignments directly.

create or replace function public.can_manage_report_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.report_campaigns c
      join public.profiles creator on creator.id = c.created_by
      where c.id = p_campaign_id
        and (
          public.has_role_in_scope('YOUTH_ADMIN', creator.organization_id)
          or public.has_role('SYSTEM_ADMIN')
        )
    );
$$;

create or replace function public.can_read_report_template(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and (
      exists (
        select 1
        from public.report_assignments a
        where a.campaign_id = p_campaign_id
          and a.organization_id = public.current_org_id()
      )
      or public.can_manage_report_campaign(p_campaign_id)
    );
$$;

revoke all on function public.can_manage_report_campaign(uuid) from public;
grant execute on function public.can_manage_report_campaign(uuid) to anon, authenticated;
revoke all on function public.can_read_report_template(uuid) from public;
grant execute on function public.can_read_report_template(uuid) to anon, authenticated;

create or replace function public.assert_report_campaign_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN')) then
    raise exception 'REPORT_CAMPAIGN_SCOPE_DENIED';
  end if;
end;
$$;

revoke all on function public.assert_report_campaign_admin() from public;

create or replace function public.get_assignable_report_organizations()
returns table(id uuid, code text, name text, short_name text, organization_type text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_report_campaign_admin();

  return query
  select o.id, o.code, o.name, o.short_name, o.organization_type
  from public.organizations o
  where o.is_active
    and (
      public.has_role_in_scope('YOUTH_ADMIN', o.id)
      or public.has_role('SYSTEM_ADMIN')
    )
  order by o.name;
end;
$$;

create or replace function public.get_admin_report_campaigns()
returns table(
  id uuid, title text, description text, issuer text, open_at timestamptz, due_at timestamptz,
  close_at timestamptz, allow_late_submission boolean, allow_resubmission boolean,
  allowed_extensions text[], max_file_size_mb integer, max_files integer, reminder_policy jsonb,
  visibility_level text, status text, created_at timestamptz, updated_at timestamptz, assignment_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_report_campaign_admin();
  return query
  select c.id, c.title, c.description, c.issuer, c.open_at, c.due_at, c.close_at,
    c.allow_late_submission, c.allow_resubmission, c.allowed_extensions, c.max_file_size_mb,
    c.max_files, c.reminder_policy, c.visibility_level, c.status, c.created_at, c.updated_at,
    count(a.id)::integer
  from public.report_campaigns c
  left join public.report_assignments a on a.campaign_id = c.id
  where public.can_manage_report_campaign(c.id)
  group by c.id
  order by c.created_at desc;
end;
$$;

create or replace function public.get_admin_report_campaign(p_campaign_id uuid)
returns table(
  id uuid, title text, description text, issuer text, open_at timestamptz, due_at timestamptz,
  close_at timestamptz, allow_late_submission boolean, allow_resubmission boolean,
  allowed_extensions text[], max_file_size_mb integer, max_files integer, reminder_policy jsonb,
  visibility_level text, status text, created_at timestamptz, updated_at timestamptz, assignment_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_report_campaign_admin();
  if not public.can_manage_report_campaign(p_campaign_id) then
    return;
  end if;
  return query
  select c.id, c.title, c.description, c.issuer, c.open_at, c.due_at, c.close_at,
    c.allow_late_submission, c.allow_resubmission, c.allowed_extensions, c.max_file_size_mb,
    c.max_files, c.reminder_policy, c.visibility_level, c.status, c.created_at, c.updated_at,
    count(a.id)::integer
  from public.report_campaigns c
  left join public.report_assignments a on a.campaign_id = c.id
  where c.id = p_campaign_id
  group by c.id;
end;
$$;

create or replace function public.create_report_campaign(
  p_title text,
  p_description text,
  p_issuer text,
  p_open_at timestamptz,
  p_due_at timestamptz,
  p_close_at timestamptz,
  p_allow_late_submission boolean,
  p_allow_resubmission boolean,
  p_allowed_extensions text[],
  p_max_file_size_mb integer,
  p_max_files integer,
  p_reminder_policy jsonb,
  p_visibility_level text
) returns public.report_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_issuer text := nullif(btrim(coalesce(p_issuer, '')), '');
  v_extensions text[];
  v_campaign public.report_campaigns%rowtype;
begin
  perform public.assert_report_campaign_admin();
  if v_title is null or length(v_title) > 300 then raise exception 'INVALID_CAMPAIGN_TITLE'; end if;
  if p_open_at is null or p_due_at is null or p_due_at < p_open_at
    or (p_close_at is not null and p_close_at < p_due_at) then
    raise exception 'INVALID_CAMPAIGN_DATES';
  end if;
  if coalesce(p_max_file_size_mb, 0) not between 1 and 100 then raise exception 'INVALID_FILE_SIZE_LIMIT'; end if;
  if coalesce(p_max_files, 0) not between 1 and 20 then raise exception 'INVALID_FILE_COUNT_LIMIT'; end if;

  select array_agg(extension order by extension) into v_extensions
  from (
    select distinct lower(regexp_replace(btrim(value), '^\.', '')) as extension
    from unnest(coalesce(p_allowed_extensions, array[]::text[])) as value
    where btrim(value) <> ''
  ) normalized;
  if coalesce(cardinality(v_extensions), 0) = 0
    or exists (select 1 from unnest(v_extensions) as extension where extension !~ '^[a-z0-9]{1,12}$') then
    raise exception 'INVALID_FILE_EXTENSIONS';
  end if;
  if coalesce(p_visibility_level, '') not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
    raise exception 'INVALID_VISIBILITY_LEVEL';
  end if;

  insert into public.report_campaigns(
    title, description, issuer, open_at, due_at, close_at,
    allow_late_submission, allow_resubmission, allowed_extensions,
    max_file_size_mb, max_files, reminder_policy, visibility_level, status, created_by, updated_by
  ) values (
    v_title, nullif(btrim(coalesce(p_description, '')), ''), v_issuer, p_open_at, p_due_at, p_close_at,
    coalesce(p_allow_late_submission, false), coalesce(p_allow_resubmission, true), v_extensions,
    p_max_file_size_mb, p_max_files, coalesce(p_reminder_policy, '{}'::jsonb), p_visibility_level,
    'DRAFT', auth.uid(), auth.uid()
  ) returning * into v_campaign;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  select auth.uid(), 'REPORT_CAMPAIGN_CREATED', 'report_campaign', v_campaign.id, p.organization_id,
    jsonb_build_object('status', 'DRAFT', 'title', v_campaign.title)
  from public.profiles p where p.id = auth.uid();

  return v_campaign;
end;
$$;

create or replace function public.update_report_campaign_draft(
  p_campaign_id uuid,
  p_title text,
  p_description text,
  p_issuer text,
  p_open_at timestamptz,
  p_due_at timestamptz,
  p_close_at timestamptz,
  p_allow_late_submission boolean,
  p_allow_resubmission boolean,
  p_allowed_extensions text[],
  p_max_file_size_mb integer,
  p_max_files integer,
  p_reminder_policy jsonb,
  p_visibility_level text
) returns public.report_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.report_campaigns%rowtype;
begin
  perform public.assert_report_campaign_admin();
  select * into v_campaign from public.report_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_report_campaign(p_campaign_id) then raise exception 'REPORT_CAMPAIGN_SCOPE_DENIED'; end if;
  if v_campaign.status <> 'DRAFT' then raise exception 'CAMPAIGN_NOT_DRAFT'; end if;

  -- Reuse the create validator by validating a temporary value set before applying the update.
  if nullif(btrim(coalesce(p_title, '')), '') is null or length(btrim(p_title)) > 300 then raise exception 'INVALID_CAMPAIGN_TITLE'; end if;
  if p_open_at is null or p_due_at is null or p_due_at < p_open_at
    or (p_close_at is not null and p_close_at < p_due_at) then raise exception 'INVALID_CAMPAIGN_DATES'; end if;
  if coalesce(p_max_file_size_mb, 0) not between 1 and 100 then raise exception 'INVALID_FILE_SIZE_LIMIT'; end if;
  if coalesce(p_max_files, 0) not between 1 and 20 then raise exception 'INVALID_FILE_COUNT_LIMIT'; end if;
  if coalesce(p_visibility_level, '') not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then raise exception 'INVALID_VISIBILITY_LEVEL'; end if;

  update public.report_campaigns
  set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''),
      issuer = nullif(btrim(coalesce(p_issuer, '')), ''), open_at = p_open_at, due_at = p_due_at,
      close_at = p_close_at, allow_late_submission = coalesce(p_allow_late_submission, false),
      allow_resubmission = coalesce(p_allow_resubmission, true), allowed_extensions = p_allowed_extensions,
      max_file_size_mb = p_max_file_size_mb, max_files = p_max_files,
      reminder_policy = coalesce(p_reminder_policy, '{}'::jsonb), visibility_level = p_visibility_level,
      updated_by = auth.uid(), updated_at = now()
  where id = p_campaign_id
  returning * into v_campaign;

  if exists (select 1 from unnest(v_campaign.allowed_extensions) as extension where lower(regexp_replace(btrim(extension), '^\.', '')) !~ '^[a-z0-9]{1,12}$')
    or coalesce(cardinality(v_campaign.allowed_extensions), 0) = 0 then
    raise exception 'INVALID_FILE_EXTENSIONS';
  end if;

  update public.report_campaigns
  set allowed_extensions = array(
    select distinct lower(regexp_replace(btrim(extension), '^\.', ''))
    from unnest(v_campaign.allowed_extensions) as extension
    where btrim(extension) <> ''
    order by 1
  )
  where id = p_campaign_id
  returning * into v_campaign;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  select auth.uid(), 'REPORT_CAMPAIGN_UPDATED', 'report_campaign', p_campaign_id, p.organization_id,
    jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'DRAFT', 'title', v_campaign.title)
  from public.profiles p where p.id = auth.uid();
  return v_campaign;
end;
$$;

create or replace function public.register_report_campaign_template(
  p_campaign_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
) returns public.report_campaign_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.report_campaigns%rowtype;
  v_template public.report_campaign_templates%rowtype;
  v_segments text[] := string_to_array(coalesce(p_storage_path, ''), '/');
  v_extension text := lower(regexp_replace(split_part(coalesce(p_file_name, ''), '.', array_length(string_to_array(coalesce(p_file_name, ''), '.'), 1)), '^\.', ''));
begin
  perform public.assert_report_campaign_admin();
  select * into v_campaign from public.report_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if not public.can_manage_report_campaign(p_campaign_id) then raise exception 'REPORT_CAMPAIGN_SCOPE_DENIED'; end if;
  if v_campaign.status <> 'DRAFT' then raise exception 'CAMPAIGN_NOT_DRAFT'; end if;
  if coalesce(p_file_name, '') = '' or p_size_bytes is null or p_size_bytes < 1
    or p_size_bytes > v_campaign.max_file_size_mb::bigint * 1024 * 1024
    or not (v_extension = any(v_campaign.allowed_extensions)) then
    raise exception 'INVALID_TEMPLATE_METADATA';
  end if;
  if coalesce(array_length(v_segments, 1), 0) <> 2
    or v_segments[1] <> p_campaign_id::text
    or v_segments[2] !~ '^[0-9a-fA-F-]{36}-[A-Za-z0-9._-]+$'
    or position('..' in p_storage_path) > 0 then
    raise exception 'TEMPLATE_SCOPE_INVALID';
  end if;

  insert into public.report_campaign_templates(campaign_id, storage_path, file_name, mime_type, size_bytes)
  values (p_campaign_id, p_storage_path, p_file_name, nullif(p_mime_type, ''), p_size_bytes)
  returning * into v_template;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  select auth.uid(), 'REPORT_TEMPLATE_ATTACHED', 'report_campaign_template', v_template.id, p.organization_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'file_name', p_file_name)
  from public.profiles p where p.id = auth.uid();
  return v_template;
end;
$$;

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
  if exists (select 1 from public.organizations o where o.id = any(v_org_ids) and not o.is_active) then
    raise exception 'ORGANIZATION_INACTIVE';
  end if;
  if (select count(*) from public.organizations where id = any(v_org_ids)) <> cardinality(v_org_ids) then
    raise exception 'ORGANIZATION_NOT_FOUND';
  end if;
  if exists (
    select 1 from unnest(v_org_ids) as organization_id
    where not (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'))
  ) then raise exception 'ASSIGNMENT_SCOPE_DENIED'; end if;

  insert into public.report_assignments(campaign_id, organization_id, status)
  select v_campaign.id, organization_id, 'PENDING'
  from unnest(v_org_ids) as organization_id
  on conflict on constraint report_assignments_campaign_id_organization_id_key do nothing;

  insert into public.report_status_history(assignment_id, from_status, to_status, changed_by, reason)
  select a.id, null, 'PENDING', auth.uid(), 'Phát hành đợt báo cáo'
  from public.report_assignments a
  where a.campaign_id = v_campaign.id;

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

  campaign_id := v_campaign.id;
  resulting_status := 'PUBLISHED';
  select count(*)::integer into assignment_count from public.report_assignments a where a.campaign_id = v_campaign.id;
  return next;
end;
$$;

revoke all on function public.get_assignable_report_organizations() from public, anon;
grant execute on function public.get_assignable_report_organizations() to authenticated;
revoke all on function public.get_admin_report_campaigns() from public, anon;
grant execute on function public.get_admin_report_campaigns() to authenticated;
revoke all on function public.get_admin_report_campaign(uuid) from public, anon;
grant execute on function public.get_admin_report_campaign(uuid) to authenticated;
revoke all on function public.create_report_campaign(text, text, text, timestamptz, timestamptz, timestamptz, boolean, boolean, text[], integer, integer, jsonb, text) from public, anon;
grant execute on function public.create_report_campaign(text, text, text, timestamptz, timestamptz, timestamptz, boolean, boolean, text[], integer, integer, jsonb, text) to authenticated;
revoke all on function public.update_report_campaign_draft(uuid, text, text, text, timestamptz, timestamptz, timestamptz, boolean, boolean, text[], integer, integer, jsonb, text) from public, anon;
grant execute on function public.update_report_campaign_draft(uuid, text, text, text, timestamptz, timestamptz, timestamptz, boolean, boolean, text[], integer, integer, jsonb, text) to authenticated;
revoke all on function public.register_report_campaign_template(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_report_campaign_template(uuid, text, text, text, bigint) to authenticated;
revoke all on function public.publish_report_campaign(uuid, uuid[]) from public, anon;
grant execute on function public.publish_report_campaign(uuid, uuid[]) to authenticated;

-- Close write bypasses. Controlled RPCs remain SECURITY DEFINER and therefore keep their
-- transactional writes without restoring end-user table privileges.
revoke insert, update, delete on public.report_campaigns from authenticated;
revoke insert, update, delete on public.report_assignments from authenticated;
revoke insert, update, delete on public.report_campaign_templates from authenticated;
revoke insert, update, delete on public.report_status_history from authenticated;

drop policy if exists "admins manage campaign templates" on public.report_campaign_templates;
drop policy if exists "read campaign templates" on public.report_campaign_templates;
create policy "read campaign templates" on public.report_campaign_templates for select using (
  public.can_read_report_template(campaign_id)
);

drop policy if exists "assigned orgs read report templates" on storage.objects;
drop policy if exists "admins manage report templates" on storage.objects;
create policy "assigned orgs read report templates" on storage.objects for select using (
  bucket_id = 'report-templates-private'
  and public.can_read_report_template(public.uuid_or_null((string_to_array(name, '/'))[1]))
);
create policy "campaign managers upload template staging" on storage.objects for insert with check (
  bucket_id = 'report-templates-private'
  and public.can_manage_report_campaign(public.uuid_or_null((string_to_array(name, '/'))[1]))
  and array_length(string_to_array(name, '/'), 1) = 3
  and (string_to_array(name, '/'))[2] = 'staging'
  and (string_to_array(name, '/'))[3] ~ '^[0-9a-fA-F-]{36}-[A-Za-z0-9._-]+$'
);
create policy "campaign managers delete own template staging" on storage.objects for delete using (
  bucket_id = 'report-templates-private'
  and owner = auth.uid()
  and public.can_manage_report_campaign(public.uuid_or_null((string_to_array(name, '/'))[1]))
  and array_length(string_to_array(name, '/'), 1) = 3
  and (string_to_array(name, '/'))[2] = 'staging'
);
grant insert, delete on storage.objects to authenticated;
