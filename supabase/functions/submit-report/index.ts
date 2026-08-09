import { clients, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, fileExtension, safeFileName, safeText } from '../_shared/validation.ts';
import { buildReportVersionPath } from './contract.ts';

type InputFile = { storage_path: string; original_name: string; checksum?: string };
type Payload = { assignment_id: string; summary?: string; submit_note?: string; files: InputFile[] };
type VerifiedFile = {
  storage_path: string; original_name: string; safe_name: string;
  mime_type: string | null; size_bytes: number; checksum: string | null;
};
type MovedFile = { from: string; to: string };

const BUCKET = 'report-submissions-private';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const movedFiles: MovedFile[] = [];
  try {
    const { userClient, adminClient } = clients(request);
    await requireUser(userClient);
    const body = await readJson<Payload>(request);
    const assignmentId = assertUuid(body.assignment_id);
    if (!Array.isArray(body.files) || body.files.length < 1) throw new Error('FILE_REQUIRED');

    // Load assignment + campaign constraints. The admin client read is RLS-independent; the RPC
    // below re-checks the caller's role/organization/lifecycle, so this is only for constraints.
    const { data: assignment, error: assignmentError } = await adminClient
      .from('report_assignments')
      .select('id,organization_id,campaign_id,report_submissions(version_number),report_campaigns(allowed_extensions,max_file_size_mb,max_files)')
      .eq('id', assignmentId).single();
    if (assignmentError) throw assignmentError;
    const campaign = Array.isArray(assignment.report_campaigns) ? assignment.report_campaigns[0] : assignment.report_campaigns;
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    if (body.files.length > Number(campaign.max_files)) throw new Error('TOO_MANY_FILES');

    const prefix = `${assignment.campaign_id}/${assignment.organization_id}/${assignmentId}/`;
    const maxBytes = Number(campaign.max_file_size_mb) * 1024 * 1024;
    const existingSubmissions = Array.isArray(assignment.report_submissions) ? assignment.report_submissions : [];
    const expectedVersion = existingSubmissions.reduce((latest: number, row: { version_number?: number }) => Math.max(latest, Number(row.version_number) || 0), 0) + 1;

    // Verify EVERY file against Storage. Client-declared size/mime/path are never trusted:
    // the object must actually exist under the assignment's own prefix, and its real size and
    // content type come from Storage metadata.
    const verifiedFiles: VerifiedFile[] = [];
    const seenPaths = new Set<string>();
    for (const file of body.files) {
      if (!file.storage_path || !file.original_name) throw new Error('INVALID_FILE_METADATA');
      if (!campaign.allowed_extensions.includes(fileExtension(file.original_name))) throw new Error('FILE_TYPE_NOT_ALLOWED');
      const pathSegments = file.storage_path.split('/');
      if (!file.storage_path.startsWith(prefix) || pathSegments.length !== 5 || pathSegments[3] !== 'staging' || file.storage_path.includes('..')) {
        throw new Error('FILE_SCOPE_INVALID');
      }
      if (seenPaths.has(file.storage_path)) throw new Error('DUPLICATE_FILE_PATH');
      seenPaths.add(file.storage_path);

      const slash = file.storage_path.lastIndexOf('/');
      const folder = file.storage_path.slice(0, slash);
      const objectName = file.storage_path.slice(slash + 1);
      const { data: listed, error: listError } = await adminClient.storage.from(BUCKET).list(folder, { limit: 100, search: objectName });
      if (listError) throw listError;
      const object = listed?.find(o => o.name === objectName);
      if (!object) throw new Error('STORAGE_OBJECT_NOT_FOUND');
      const realSize = Number(object.metadata?.size);
      if (!Number.isFinite(realSize) || realSize <= 0) throw new Error('STORAGE_OBJECT_NOT_FOUND');
      if (realSize > maxBytes) throw new Error('FILE_TOO_LARGE');

      verifiedFiles.push({
        storage_path: '',
        original_name: file.original_name,
        safe_name: safeFileName(file.original_name),
        mime_type: object.metadata?.mimetype ?? null,
        size_bytes: realSize,
        checksum: file.checksum ?? null,
      });
    }

    // Move verified objects into an immutable version namespace before committing metadata. If
    // the version check or database transaction rejects the request, the catch block moves them
    // back to their owned staging paths so a retry cannot leave a finalized orphan.
    for (let index = 0; index < verifiedFiles.length; index += 1) {
      const sourcePath = body.files[index].storage_path;
      const objectName = sourcePath.split('/').at(-1);
      const targetPath = buildReportVersionPath(prefix, expectedVersion, objectName || '');
      const { error: moveError } = await adminClient.storage.from(BUCKET).move(sourcePath, targetPath);
      if (moveError) throw moveError;
      movedFiles.push({ from: sourcePath, to: targetPath });
      verifiedFiles[index].storage_path = targetPath;
    }

    // Atomic finalize: submission version + file rows + notification in a single transaction.
    // The expected version makes a stale/double-click request fail closed under the assignment
    // row lock instead of creating another version.
    const { data: rows, error: rpcError } = await userClient.rpc('create_report_submission_with_files', {
      p_assignment_id: assignmentId,
      p_summary: safeText(body.summary, 5000),
      p_submit_note: safeText(body.submit_note, 2000),
      p_files: verifiedFiles,
      p_expected_version: expectedVersion,
    });
    if (rpcError) throw rpcError;
    const created = rows?.[0];
    if (!created) throw new Error('SUBMISSION_CREATE_FAILED');

    return json({ success: true, ...created }, 201);
  } catch (error) {
    for (const moved of [...movedFiles].reverse()) {
      const { error: rollbackError } = await clients(request).adminClient.storage.from(BUCKET).move(moved.to, moved.from);
      if (rollbackError) await clients(request).adminClient.storage.from(BUCKET).remove([moved.to]);
    }
    const message = String(error);
    return errorResponse(error,
      message.includes('UNAUTHENTICATED') ? 401
        : ['ACCOUNT_NOT_ACTIVE', 'REPORT_ROLE_DENIED', 'ASSIGNMENT_SCOPE_DENIED'].some(code => message.includes(code)) ? 403
          : message.includes('STALE_SUBMISSION_VERSION') ? 409 : 400
    );
  }
});
