import { normalizeSafeFileName } from '../lib/status.mjs';

export const REPORT_SUBMISSIONS_BUCKET = 'report-submissions-private';
export const REPORT_TEMPLATES_BUCKET = 'report-templates-private';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_ERROR_CODES = new Set([
  'REPORT_NOT_OPEN',
  'REPORT_CLOSED',
  'LATE_SUBMISSION_NOT_ALLOWED',
  'RESUBMISSION_NOT_ALLOWED',
  'INVALID_REPORT_TRANSITION',
  'INVALID_ACTION',
  'REASON_REQUIRED',
  'ACCOUNT_NOT_ACTIVE',
  'ASSIGNMENT_NOT_FOUND',
  'ASSIGNMENT_SCOPE_DENIED',
  'STALE_SUBMISSION_VERSION',
  'REPORT_ALREADY_ACCEPTED',
  'REPORT_EXEMPTED',
  'FILE_SCOPE_INVALID',
  'FILE_TOO_LARGE',
  'FILE_TYPE_NOT_ALLOWED',
  'TOO_MANY_FILES',
  'DUPLICATE_FILE_PATH',
  'STORAGE_OBJECT_NOT_FOUND'
]);

const ASSIGNMENT_SELECT = `
  id,
  status,
  organization_id,
  due_at_override,
  report_campaigns (
    id,
    title,
    description,
    issuer,
    open_at,
    due_at,
    close_at,
    status,
    allow_late_submission,
    allow_resubmission,
    allowed_extensions,
    max_file_size_mb,
    max_files
  )
`;

const SUBMISSION_SELECT = `
  id,
  assignment_id,
  version_number,
  submitted_at,
  submitted_by,
  summary,
  submit_note,
  is_late,
  review_status,
  reviewed_at,
  review_note,
  profiles!report_submissions_submitted_by_fkey (
    id,
    full_name,
    organization_id
  ),
  report_submission_files (
    id,
    original_name,
    safe_name,
    mime_type,
    size_bytes,
    storage_path
  )
`;

const TEMPLATE_SELECT = 'id, campaign_id, storage_path, file_name, mime_type, size_bytes, created_at';

export class ReportServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ReportServiceError';
    this.code = code;
    this.cause = cause;
  }
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new ReportServiceError('INVALID_ID', `${fieldName} must be a UUID.`, undefined);
  }
}

function getBusinessCode(error) {
  const candidates = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return candidates.find((candidate) => BUSINESS_ERROR_CODES.has(candidate));
}

export function normalizeReportError(error) {
  if (error instanceof ReportServiceError) return error;

  const businessCode = getBusinessCode(error);
  if (businessCode) {
    return new ReportServiceError(businessCode, businessCode, error);
  }

  if (error?.status === 401 || error?.status === 403) {
    return new ReportServiceError(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required to access report data.',
      error
    );
  }

  return new ReportServiceError('REQUEST_FAILED', 'Unable to complete the report request.', error);
}

function mapCampaignRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    issuer: row.issuer,
    openAt: row.open_at,
    dueAt: row.due_at,
    closeAt: row.close_at,
    status: row.status,
    allowLateSubmission: row.allow_late_submission,
    allowResubmission: row.allow_resubmission,
    allowedExtensions: row.allowed_extensions,
    maxFileSizeMb: row.max_file_size_mb,
    maxFiles: row.max_files
  };
}

export function mapAssignmentRow(row) {
  const campaign = Array.isArray(row.report_campaigns)
    ? row.report_campaigns[0]
    : row.report_campaigns;

  return {
    id: row.id,
    status: row.status,
    organizationId: row.organization_id,
    dueAtOverride: row.due_at_override,
    campaign: mapCampaignRow(campaign)
  };
}

export function mapSubmissionRow(row) {
  const submittedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    versionNumber: row.version_number,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    submittedByProfile: submittedProfile ? {
      id: submittedProfile.id,
      fullName: submittedProfile.full_name,
      organizationId: submittedProfile.organization_id
    } : null,
    summary: row.summary,
    submitNote: row.submit_note,
    isLate: row.is_late,
    reviewStatus: row.review_status,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    files: (row.report_submission_files || []).map((file) => ({
      id: file.id,
      originalName: file.original_name,
      safeName: file.safe_name,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      storagePath: file.storage_path
    }))
  };
}

export function buildReportUploadPath({ campaignId, organizationId, assignmentId, objectId, fileName }) {
  assertUuid(campaignId, 'campaignId');
  assertUuid(organizationId, 'organizationId');
  assertUuid(assignmentId, 'assignmentId');
  assertUuid(objectId, 'objectId');

  const safeFileName = normalizeSafeFileName(fileName);
  if (!safeFileName) {
    throw new ReportServiceError('INVALID_FILE_NAME', 'A file name is required.', undefined);
  }

  return `${campaignId}/${organizationId}/${assignmentId}/staging/${objectId}-${safeFileName}`;
}

function assertStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath || storagePath.includes('..')) {
    throw new ReportServiceError('INVALID_STORAGE_PATH', 'A valid storage path is required.', undefined);
  }
}

function assertStagedStoragePath(storagePath) {
  assertStoragePath(storagePath);
  const segments = storagePath.split('/');
  if (segments.length !== 5 || segments[3] !== 'staging' || !UUID_PATTERN.test(segments[0]) || !UUID_PATTERN.test(segments[1]) || !UUID_PATTERN.test(segments[2])) {
    throw new ReportServiceError('INVALID_STORAGE_PATH', 'A valid staging storage path is required.', undefined);
  }
  const objectName = segments[4];
  if (!UUID_PATTERN.test(objectName.slice(0, 36)) || objectName[36] !== '-' || objectName.length < 38) {
    throw new ReportServiceError('INVALID_STORAGE_PATH', 'A valid staging storage path is required.', undefined);
  }
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeReportError(error);
  }
}

/**
 * Creates the report data boundary around the application's existing Supabase client.
 * The caller supplies the singleton from supabaseClient.js, keeping this module unit-testable.
 */
export function createReportService(client, { createObjectId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!client) throw new Error('A Supabase client is required.');

  return {
    async getMyAssignments(options = {}) {
      let query = client
        .from('report_assignments')
        .select(ASSIGNMENT_SELECT)
        .order('assigned_at', { ascending: false });

      if (options.status) query = query.eq('status', options.status);

      const data = await unwrap(query);
      return (data || []).map(mapAssignmentRow);
    },

    async getAssignment(assignmentId) {
      assertUuid(assignmentId, 'assignmentId');
      const data = await unwrap(
        client
          .from('report_assignments')
          .select(ASSIGNMENT_SELECT)
          .eq('id', assignmentId)
          .maybeSingle()
      );

      if (!data) {
        throw new ReportServiceError(
          'NOT_FOUND_OR_FORBIDDEN',
          'The report assignment was not found or is outside your scope.',
          undefined
        );
      }

      return mapAssignmentRow(data);
    },

    async getSubmissionHistory(assignmentId) {
      assertUuid(assignmentId, 'assignmentId');
      const data = await unwrap(
        client
          .from('report_submissions')
          .select(SUBMISSION_SELECT)
          .eq('assignment_id', assignmentId)
          .order('version_number', { ascending: false })
      );
      return (data || []).map((row, index) => ({
        ...mapSubmissionRow(row),
        isLatest: index === 0
      }));
    },

    async getCampaignTemplates(campaignId) {
      assertUuid(campaignId, 'campaignId');
      const data = await unwrap(
        client
          .from('report_campaign_templates')
          .select(TEMPLATE_SELECT)
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false })
      );
      return data || [];
    },

    async uploadReportFile({ campaignId, organizationId, assignmentId, file }) {
      if (!file || typeof file.name !== 'string') {
        throw new ReportServiceError('INVALID_FILE', 'A file with a name is required.', undefined);
      }

      const storagePath = buildReportUploadPath({
        campaignId,
        organizationId,
        assignmentId,
        objectId: createObjectId(),
        fileName: file.name
      });
      await unwrap(
        client.storage.from(REPORT_SUBMISSIONS_BUCKET).upload(storagePath, file, { upsert: false })
      );

      return { storagePath, originalName: file.name };
    },

    async removeStagedReportFile(storagePath) {
      assertStagedStoragePath(storagePath);
      await unwrap(client.storage.from(REPORT_SUBMISSIONS_BUCKET).remove([storagePath]));
      return { storagePath, removed: true };
    },

    async submitReport({ assignmentId, summary, submitNote, files }) {
      assertUuid(assignmentId, 'assignmentId');
      if (!Array.isArray(files) || files.length === 0) {
        throw new ReportServiceError('INVALID_FILES', 'At least one uploaded file is required.', undefined);
      }

      const payloadFiles = files.map((file) => {
        assertStoragePath(file?.storagePath);
        if (typeof file?.originalName !== 'string' || !file.originalName) {
          throw new ReportServiceError('INVALID_FILE', 'Each uploaded file needs its original name.', undefined);
        }
        return {
          storage_path: file.storagePath,
          original_name: file.originalName,
          ...(file.checksum ? { checksum: file.checksum } : {})
        };
      });

      return unwrap(client.functions.invoke('submit-report', {
        body: {
          assignment_id: assignmentId,
          ...(summary ? { summary } : {}),
          ...(submitNote ? { submit_note: submitNote } : {}),
          files: payloadFiles
        }
      }));
    },

    async reviewReport({ assignmentId, action, reason }) {
      assertUuid(assignmentId, 'assignmentId');
      if (!['ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED'].includes(action)) {
        throw new ReportServiceError('INVALID_ACTION', 'A valid review action is required.', undefined);
      }
      const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
      if ((action === 'NEEDS_SUPPLEMENT' || action === 'EXEMPTED') && !normalizedReason) {
        throw new ReportServiceError('REASON_REQUIRED', 'A reason is required for this review action.', undefined);
      }

      return unwrap(client.functions.invoke('review-report', {
        body: {
          assignment_id: assignmentId,
          action,
          ...(normalizedReason ? { reason: normalizedReason } : {})
        }
      }));
    },

    async getSignedFileUrl(storagePath, { bucket = REPORT_SUBMISSIONS_BUCKET, expiresIn = 60 } = {}) {
      if (![REPORT_SUBMISSIONS_BUCKET, REPORT_TEMPLATES_BUCKET].includes(bucket)) {
        throw new ReportServiceError('INVALID_BUCKET', 'The requested storage bucket is not allowed.', undefined);
      }
      assertStoragePath(storagePath);
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
        throw new ReportServiceError('INVALID_EXPIRY', 'Signed URL expiry must be between 1 and 3600 seconds.', undefined);
      }

      const data = await unwrap(client.storage.from(bucket).createSignedUrl(storagePath, expiresIn));
      return data.signedUrl;
    }
  };
}
