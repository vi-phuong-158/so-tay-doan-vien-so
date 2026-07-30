import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, fileExtension, safeText } from '../_shared/validation.ts';

type InputFile = { storage_path: string; original_name: string; safe_name?: string; mime_type?: string; size_bytes: number; checksum?: string };
type Payload = { assignment_id: string; summary?: string; submit_note?: string; files: InputFile[] };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userClient, adminClient } = clients(request); const user = await requireUser(userClient);
    const body = await readJson<Payload>(request); const assignmentId = assertUuid(body.assignment_id);
    if (!Array.isArray(body.files) || body.files.length < 1) throw new Error('FILE_REQUIRED');
    const { data: assignment, error: assignmentError } = await adminClient.from('report_assignments').select('id,organization_id,campaign_id,report_campaigns(allowed_extensions,max_file_size_mb,max_files)').eq('id', assignmentId).single();
    if (assignmentError) throw assignmentError;
    const campaign = Array.isArray(assignment.report_campaigns) ? assignment.report_campaigns[0] : assignment.report_campaigns;
    if (body.files.length > Number(campaign.max_files)) throw new Error('TOO_MANY_FILES');
    for (const file of body.files) {
      if (!file.storage_path || !file.original_name || !Number.isFinite(file.size_bytes)) throw new Error('INVALID_FILE_METADATA');
      if (!campaign.allowed_extensions.includes(fileExtension(file.original_name))) throw new Error('FILE_TYPE_NOT_ALLOWED');
      if (file.size_bytes > Number(campaign.max_file_size_mb) * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
      if (!file.storage_path.includes(`/${assignmentId}/`)) throw new Error('INVALID_STORAGE_PATH');
    }
    const { data: submissionRows, error: rpcError } = await userClient.rpc('create_report_submission', { p_assignment_id: assignmentId, p_summary: safeText(body.summary, 5000), p_submit_note: safeText(body.submit_note, 2000) });
    if (rpcError) throw rpcError; const created = submissionRows?.[0]; if (!created) throw new Error('SUBMISSION_CREATE_FAILED');
    const rows = body.files.map(file => ({ submission_id: created.submission_id, storage_path: file.storage_path, original_name: file.original_name, safe_name: file.safe_name || file.original_name, mime_type: file.mime_type || null, size_bytes: file.size_bytes, checksum: file.checksum || null, uploaded_by: user.id }));
    const { error: fileError } = await adminClient.from('report_submission_files').insert(rows); if (fileError) throw fileError;
    await adminClient.from('notifications').insert({ user_id: user.id, type: 'REPORT_SUBMITTED', title: 'Đã nộp báo cáo', body: `Phiên bản ${created.version_number} đã được ghi nhận.`, action_url: `/cong-viec/bao-cao/${assignment.campaign_id}` });
    return json({ success: true, ...created }, 201);
  } catch (error) { return errorResponse(error, String(error).includes('UNAUTHENTICATED') ? 401 : 400); }
});
