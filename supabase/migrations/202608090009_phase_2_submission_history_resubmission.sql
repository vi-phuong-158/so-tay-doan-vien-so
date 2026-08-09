-- Phase 2 · P2-11 — immutable submission history and versioned finalized files.
--
-- P2-09 already serializes version allocation by locking report_assignments. This forward-only
-- migration keeps that invariant, requires finalized metadata to live under vN, and adds an
-- expected-version overload so a stale/double-click request fails instead of creating another
-- version. Notification creation remains inside the same database transaction as submission,
-- file metadata, assignment status and history.

create index if not exists idx_report_submission_files_submission
  on public.report_submission_files(submission_id);

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
  v_prefix text;
  v_version_prefix text;
  v_file jsonb;
  v_path text;
  v_segments text[];
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then
    raise exception 'FILE_REQUIRED';
  end if;
  if p_expected_version is not null and p_expected_version < 1 then
    raise exception 'INVALID_EXPECTED_VERSION';
  end if;

  -- The inner RPC locks the assignment and allocates the next version atomically.
  select * into v_created
  from public.create_report_submission(p_assignment_id, p_summary, p_submit_note);

  if p_expected_version is not null and v_created.version_number <> p_expected_version then
    raise exception 'STALE_SUBMISSION_VERSION';
  end if;

  select * into v_assignment
  from public.report_assignments
  where id = p_assignment_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;

  v_prefix := v_assignment.campaign_id::text || '/' || v_assignment.organization_id::text || '/' || p_assignment_id::text || '/';
  v_version_prefix := v_prefix || 'v' || v_created.version_number::text || '/';

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path';
    if coalesce(v_path, '') = '' or coalesce(v_file->>'original_name', '') = '' then
      raise exception 'INVALID_FILE_METADATA';
    end if;
    v_segments := string_to_array(v_path, '/');
    -- Finalized objects must have exactly campaign/org/assignment/vN/object segments.
    if array_length(v_segments, 1) <> 5
      or left(v_path, length(v_version_prefix)) <> v_version_prefix
      or position('..' in v_path) > 0
      or coalesce(v_segments[5], '') = '' then
      raise exception 'FILE_SCOPE_INVALID';
    end if;

    insert into public.report_submission_files(
      submission_id, storage_path, original_name, safe_name, mime_type, size_bytes, checksum, uploaded_by
    ) values (
      v_created.submission_id,
      v_path,
      v_file->>'original_name',
      coalesce(nullif(v_file->>'safe_name', ''), v_file->>'original_name'),
      v_file->>'mime_type',
      coalesce((v_file->>'size_bytes')::bigint, 0),
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

-- Preserve the existing four-argument contract for internal/test callers while routing it
-- through the same versioned implementation. Production submit-report uses the expected-version
-- overload below so stale requests fail closed before any duplicate version can commit.
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
  return query
  select * from public.create_report_submission_with_files(
    p_assignment_id, p_summary, p_submit_note, p_files, null
  );
end;
$$;

revoke all on function public.create_report_submission_with_files(uuid, text, text, jsonb, integer) from public, anon;
grant execute on function public.create_report_submission_with_files(uuid, text, text, jsonb, integer) to authenticated;
revoke all on function public.create_report_submission_with_files(uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_report_submission_with_files(uuid, text, text, jsonb) to authenticated;
