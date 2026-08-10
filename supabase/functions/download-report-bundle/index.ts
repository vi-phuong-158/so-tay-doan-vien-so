import { zipSync, strToU8 } from 'npm:fflate@0.8.2';
import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, readJson } from '../_shared/http.ts';
import { assertUuid, safeFileName } from '../_shared/validation.ts';
import { BUNDLE_TIMEOUT_MS, getBundleHttpStatus, MAX_BUNDLE_BYTES, MAX_BUNDLE_FILES, uniqueArchivePath } from './contract.ts';

type BundleBody = { campaign_id: string; status?: string | null; search?: string | null };

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

async function rpc<T>(client: any, name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data as T;
}

function normalizeStatus(value: unknown): string | null {
  const status = String(value ?? '').trim().toUpperCase();
  const allowed = ['PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'COMPLETED', 'OVERDUE', 'LATE_SUBMITTED', 'EXEMPTED'];
  if (!status || status === 'ALL') return null;
  if (!allowed.includes(status)) throw new Error('INVALID_DASHBOARD_FILTER');
  return status;
}

async function readPrivateObject(adminClient: any, storagePath: string, declaredSize: number): Promise<Uint8Array> {
  if (!storagePath || storagePath.includes('\0') || storagePath.startsWith('/') || storagePath.split('/').some(part => part === '..' || part === '')) throw new Error('STORAGE_OBJECT_NOT_FOUND');
  const download = adminClient.storage.from('report-submissions-private').download(storagePath);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('BUNDLE_TIMEOUT')), BUNDLE_TIMEOUT_MS); });
  let result: any;
  try {
    result = await Promise.race([download, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const { data: blob, error } = result;
  if (error || !blob) throw new Error('STORAGE_OBJECT_NOT_FOUND');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength !== declaredSize || bytes.byteLength > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_FILE_METADATA_MISMATCH');
  return bytes;
}

async function writeAudit(adminClient: any, userId: string, campaignId: string, status: string | null, search: string | null, fileCount: number, totalBytes: number) {
  const { error } = await adminClient.from('audit_logs').insert({
    actor_user_id: userId,
    action: 'REPORT_BUNDLE_DOWNLOADED',
    entity_type: 'report_campaign',
    entity_id: campaignId,
    after_data: { status, search, file_count: fileCount, total_bytes: totalBytes }
  });
  if (error) throw new Error('AUDIT_LOG_FAILED');
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);
  try {
    const { userClient, adminClient } = clients(request);
    const user = await requireUser(userClient);
    const body = await readJson<BundleBody>(request);
    const campaignId = assertUuid(body.campaign_id);
    const status = normalizeStatus(body.status);
    const search = body.search == null ? null : String(body.search).trim();
    if (search && search.length > 100) throw new Error('INVALID_DASHBOARD_FILTER');
    const dashboardRows = await rpc<any[]>(userClient, 'get_report_dashboard', { p_campaign_id: campaignId });
    const campaign = dashboardRows[0];
    if (!campaign) throw new Error('REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN');
    const scopedAssignments = (await rpc<any[]>(userClient, 'get_report_dashboard_assignments', {
      p_campaign_id: campaignId, p_status: status, p_search: search || null
    })) || [];
    const assignmentIds = scopedAssignments.map(row => row.assignment_id).filter(Boolean);
    const latestByAssignment = new Map<string, any>();
    if (assignmentIds.length) {
      const { data, error } = await adminClient
        .from('report_submissions')
        .select('id,assignment_id,version_number,report_submission_files(id,storage_path,original_name,safe_name,size_bytes)')
        .in('assignment_id', assignmentIds)
        .order('version_number', { ascending: false });
      if (error) throw error;
      for (const submission of data || []) if (!latestByAssignment.has(submission.assignment_id)) latestByAssignment.set(submission.assignment_id, submission);
    }
    const archive: Record<string, Uint8Array> = {};
    const usedPaths = new Set<string>();
    let fileCount = 0;
    let totalBytes = 0;
    const campaignName = safeFileName(campaign.title);
    for (const assignment of scopedAssignments) {
      const submission = latestByAssignment.get(assignment.assignment_id);
      if (!submission) continue;
      for (const file of asArray(submission.report_submission_files)) {
        fileCount += 1;
        if (fileCount > MAX_BUNDLE_FILES) throw new Error('BUNDLE_FILE_LIMIT_EXCEEDED');
        const declaredSize = Number(file.size_bytes);
        if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_FILE_METADATA_MISMATCH');
        const bytes = await readPrivateObject(adminClient, file.storage_path, declaredSize);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_BUNDLE_BYTES) throw new Error('BUNDLE_SIZE_LIMIT_EXCEEDED');
        const orgCode = safeFileName(assignment.organization_code || 'don-vi');
        const orgLabel = safeFileName(assignment.organization_name || 'don-vi');
        const orgName = assignment.organization_name && assignment.organization_code && orgCode !== orgLabel
          ? `${orgCode}-${orgLabel}`
          : orgCode;
        const fileName = safeFileName(file.original_name || file.safe_name || 'tep');
        const zipPath = uniqueArchivePath(`${campaignName}/${orgName}/v${submission.version_number}/${fileName}`, usedPaths);
        archive[zipPath] = bytes;
      }
    }
    archive['README.txt'] = strToU8(`Gói báo cáo: ${campaign.title}\nSố tệp: ${fileCount}\nTổng dung lượng: ${totalBytes} bytes\n`);
    await writeAudit(adminClient, user.id, campaignId, status, search || null, fileCount, totalBytes);
    const zipped = zipSync(archive, { level: 6 });
    const filename = `bao-cao-${safeFileName(campaign.title)}-${new Date().toISOString().slice(0, 10)}.zip`;
    return new Response(zipped, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(error, getBundleHttpStatus(message));
  }
});
