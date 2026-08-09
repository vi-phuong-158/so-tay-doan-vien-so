-- Phase 2 · P2-04 — Atomic submission finalize (submission + files in one transaction).
-- Source of truth: docs/phase-2/01-report-state-machine.md §8 (RPT-F06/F07) and audit S7.
--
-- Problem (S7): submit-report created the submission via create_report_submission() and then
-- inserted report_submission_files in a SEPARATE statement. A failure on the file insert left a
-- half-completed submission (a version with no files).
--
-- Fix: this wrapper RPC creates the submission AND inserts its files inside a single transaction.
-- Any failure (bad file scope, constraint violation, or a lifecycle error raised by the inner
-- create_report_submission) rolls the whole call back — no orphaned submission, no orphaned files.
--
-- Division of labour with the Edge Function (submit-report, hardened in P2-04):
--   * Edge Function: verifies each Storage object EXISTS and reads its REAL size/mime (never trusts
--     the browser-declared values), validates extension/count, and passes verified metadata here.
--   * This RPC: re-binds every file path to the assignment's own {campaign}/{org}/{assignment}/
--     prefix (defense-in-depth against a direct caller) and finalizes atomically.
--
-- Does NOT change create_report_submission (P2-02) or review-report (P2-05).

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
declare
  v_created record;
  v_assignment public.report_assignments%rowtype;
  v_prefix text;
  v_file jsonb;
  v_path text;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) < 1 then
    raise exception 'FILE_REQUIRED';
  end if;

  -- Create the submission. All authz/lifecycle/version/atomic-version checks live in this call
  -- (P2-02). If it raises, the whole wrapper transaction rolls back.
  select * into v_created from public.create_report_submission(p_assignment_id, p_summary, p_submit_note);

  -- Bind file paths to the assignment's own campaign/organization/assignment prefix.
  select * into v_assignment from public.report_assignments where id = p_assignment_id;
  v_prefix := v_assignment.campaign_id::text || '/' || v_assignment.organization_id::text || '/' || p_assignment_id::text || '/';

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_path := v_file->>'storage_path';
    if coalesce(v_path, '') = '' or coalesce(v_file->>'original_name', '') = '' then
      raise exception 'INVALID_FILE_METADATA';
    end if;
    -- Reject anything outside the assignment's own prefix or containing traversal.
    if left(v_path, length(v_prefix)) <> v_prefix or position('..' in v_path) > 0 then
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

  submission_id := v_created.submission_id;
  version_number := v_created.version_number;
  resulting_status := v_created.resulting_status;
  return next;
end $$;

revoke all on function public.create_report_submission_with_files(uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_report_submission_with_files(uuid, text, text, jsonb) to authenticated;
