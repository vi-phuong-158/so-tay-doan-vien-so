-- Phase 2 · P2-15 acceptance blocker fix — close direct submission RPC bypass.
--
-- submit-report is the trusted boundary that verifies and moves Storage objects into vN before
-- finalizing database metadata. The five-argument RPC remains callable with the user's JWT so it
-- must independently prove that every finalized object exists and that client metadata matches
-- Storage. The legacy four-argument overload cannot provide stale-request protection and is no
-- longer an authenticated API.

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
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then
    raise exception 'FILE_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'INVALID_EXPECTED_VERSION';
  end if;

  -- The inner RPC locks the assignment, enforces actor/scope/lifecycle rules and allocates the
  -- next immutable version. Any later exception rolls this mutation back atomically.
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
      v_created.submission_id,
      v_path,
      v_original_name,
      v_safe_name,
      v_actual_mime,
      v_actual_size,
      nullif(v_file->>'checksum', ''),
      auth.uid()
    );
  end loop;

  insert into public.notifications(user_id, type, title, body, action_url)
  values (
    auth.uid(),
    'REPORT_SUBMITTED',
    'Đã nộp báo cáo',
    format('Phiên bản %s đã được ghi nhận.', v_created.version_number),
    format('/cong-viec/bao-cao/%s', p_assignment_id)
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
