// P5.5-05 — Excel import route handlers: upload -> parse -> validate -> stage -> preview ->
// confirm -> commit (muc 9/10). Wired from server.js AFTER authorizeMemberManagement has already
// approved the request and resolveEffectiveOrgScope has computed `scope` — same contract as
// memberRoutes.js. This module additionally enforces the narrower "only YOUTH_ADMIN may import"
// rule (muc 7/12: BRANCH_OFFICER is not an import-capable role, unlike ordinary Member CRUD).
import { ApiError } from './errors.js';
import { detectDuplicates } from './importDedup.js';
import {
  cancelImportJob,
  canAccessImportJob,
  confirmImportJob,
  createImportJob,
  finalizeParsedJob,
  getImportJob,
  listImportJobRows,
  markJobFailed,
} from './importRepository.js';
import { parseImportWorkbook } from './importParser.js';
import { ImportParseError, MAX_IMPORT_FILE_BYTES } from './importValidation.js';
import { validateImportRow } from './importValidation.js';
import { isOrgCodeInScope } from './scope.js';

const IMPORT_PREFIX = '/v1/members/import';
const JOB_ID_PATTERN = /^\/v1\/members\/import\/([^/]+)$/;
const JOB_ROWS_PATTERN = /^\/v1\/members\/import\/([^/]+)\/rows$/;
const JOB_CONFIRM_PATTERN = /^\/v1\/members\/import\/([^/]+)\/confirm$/;
const JOB_CANCEL_PATTERN = /^\/v1\/members\/import\/([^/]+)\/cancel$/;

export function matchImportRoute(pathname) {
  if (!pathname.startsWith(IMPORT_PREFIX)) return null;
  if (pathname === IMPORT_PREFIX) return { kind: 'upload' };
  let match = JOB_CONFIRM_PATTERN.exec(pathname);
  if (match) return { kind: 'confirm', id: decodeURIComponent(match[1]) };
  match = JOB_CANCEL_PATTERN.exec(pathname);
  if (match) return { kind: 'cancel', id: decodeURIComponent(match[1]) };
  match = JOB_ROWS_PATTERN.exec(pathname);
  if (match) return { kind: 'jobRows', id: decodeURIComponent(match[1]) };
  match = JOB_ID_PATTERN.exec(pathname);
  if (match) return { kind: 'job', id: decodeURIComponent(match[1]) };
  return null;
}

// muc 7/12: only YOUTH_ADMIN may import (global or scoped) — BRANCH_OFFICER's CRUD write
// permission (P5.5-03 owner decision) does not extend to bulk import.
function requireYouthAdminRole(roles) {
  const hasYouthAdmin = roles.some((role) => role.role_code === 'YOUTH_ADMIN');
  if (!hasYouthAdmin) {
    throw new ApiError(403, 'forbidden', 'Only YOUTH_ADMIN may import members.');
  }
}

const MAX_FILENAME_LENGTH = 255;

function sanitizeFilename(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim().replace(/[/\\]/g, '_');
  if (trimmed === '') return null;
  return trimmed.slice(0, MAX_FILENAME_LENGTH);
}

function buildRowError(field, code, message) {
  return { field, code, message };
}

const ROW_OVERRIDE_ACTIONS = new Set(['CREATE_NEW', 'SKIP']);
const MAX_ROW_OVERRIDES = 10000;

// POST /v1/members/import/:jobId/confirm body — optional per-row disposition for rows the
// preview flagged POSSIBLE_DUPLICATE/WARNING (muc E/F: ambiguous rows are excluded from commit by
// default; a human can explicitly override a specific row to still create it as a new, separate
// record — this endpoint never supports merging into the candidate, only create-or-skip).
function parseConfirmPayload(body) {
  if (body === null || body === undefined) return [];
  const rowOverrides = body.row_overrides;
  if (rowOverrides === undefined || rowOverrides === null) return [];
  if (!Array.isArray(rowOverrides)) {
    throw new ApiError(400, 'validation_error', 'Field "row_overrides" must be an array.');
  }
  if (rowOverrides.length > MAX_ROW_OVERRIDES) {
    throw new ApiError(400, 'validation_error', `Field "row_overrides" exceeds the maximum of ${MAX_ROW_OVERRIDES} entries.`);
  }
  return rowOverrides.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ApiError(400, 'validation_error', `row_overrides[${index}] must be an object.`);
    }
    const rowNumber = entry.row_number;
    if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
      throw new ApiError(400, 'validation_error', `row_overrides[${index}].row_number must be a positive integer.`);
    }
    const action = entry.action;
    if (typeof action !== 'string' || !ROW_OVERRIDE_ACTIONS.has(action)) {
      throw new ApiError(400, 'validation_error', `row_overrides[${index}].action must be one of: CREATE_NEW, SKIP.`);
    }
    return { row_number: rowNumber, action };
  });
}

function parseRowsQuery(searchParams) {
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const offsetRaw = Number(searchParams.get('offset'));
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : undefined;
  const rowStatus = searchParams.get('row_status');
  const ALLOWED = ['VALID', 'INVALID', 'POSSIBLE_DUPLICATE', 'WARNING'];
  if (rowStatus !== null && rowStatus !== '' && !ALLOWED.includes(rowStatus)) {
    throw new ApiError(400, 'validation_error', `Query param "row_status" must be one of: ${ALLOWED.join(', ')}.`);
  }
  return { limit, offset, rowStatus: rowStatus || undefined };
}

async function handleUpload({ req, res, pool, scope, sendJson, userId, checkOrganizationCodesExist, bearerToken }) {
  const filename = sanitizeFilename(req.headers['x-import-filename']);

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMPORT_FILE_BYTES) {
      throw new ApiError(413, 'payload_too_large', `File exceeds the maximum allowed size of ${MAX_IMPORT_FILE_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    throw new ApiError(400, 'empty_upload', 'No file content was received.');
  }
  const buffer = Buffer.concat(chunks);

  // The job row is created BEFORE we know whether the workbook parses, so even a malformed
  // workbook leaves a traceable, terminal FAILED job (muc 10) instead of a bare error the client
  // cannot look back up.
  const job = await createImportJob(pool, { createdByUserId: userId, sourceFilename: filename });

  let parsed;
  try {
    parsed = await parseImportWorkbook(buffer);
  } catch (error) {
    if (error instanceof ImportParseError) {
      await markJobFailed(pool, { importJobId: job.import_job_id, reasonCode: error.code });
      sendJson(res, 400, { error: error.code, message: error.message, import_job_id: job.import_job_id });
      return;
    }
    throw error;
  }

  const fieldValidated = parsed.rows.map(({ rowNumber, data }) => ({ rowNumber, ...validateImportRow(data) }));

  // Batched organization existence + scope check (muc D/threat #7) — one directory call for every
  // distinct work_unit_code in the batch, not one call per row.
  const stillValid = fieldValidated.filter((row) => row.status === 'VALID');
  const candidateCodes = [...new Set(stillValid.map((row) => row.normalized.work_unit_code))];
  const existingCodes = candidateCodes.length > 0 ? await checkOrganizationCodesExist(candidateCodes, bearerToken) : new Set();

  for (const row of stillValid) {
    const code = row.normalized.work_unit_code;
    if (!existingCodes.has(code)) {
      row.status = 'INVALID';
      row.errors.push(buildRowError('work_unit_code', 'unknown_organization', `Đơn vị "${code}" không tồn tại.`));
    } else if (!isOrgCodeInScope(scope, code)) {
      row.status = 'INVALID';
      row.errors.push(buildRowError('work_unit_code', 'organization_out_of_scope', `Đơn vị "${code}" nằm ngoài phạm vi được phép của bạn.`));
    }
  }

  // Dedup soft-match only over rows that are still cleanly VALID after field + org/scope checks.
  const rowsForDedup = fieldValidated.filter((row) => row.status === 'VALID');
  const duplicates = await detectDuplicates(pool, rowsForDedup);

  const summary = { total: fieldValidated.length, valid: 0, invalid: 0, possibleDuplicate: 0, warning: 0 };
  const finalRows = fieldValidated.map((row) => {
    const duplicate = duplicates.get(row.rowNumber);
    let status = row.status;
    let duplicateCandidateMemberId = null;
    let duplicateReason = null;
    if (status === 'VALID' && duplicate) {
      status = duplicate.status;
      duplicateCandidateMemberId = duplicate.candidateMemberId;
      duplicateReason = duplicate.reason;
    }
    if (status === 'VALID') summary.valid += 1;
    else if (status === 'INVALID') summary.invalid += 1;
    else if (status === 'POSSIBLE_DUPLICATE') summary.possibleDuplicate += 1;
    else if (status === 'WARNING') summary.warning += 1;
    return {
      rowNumber: row.rowNumber,
      status,
      normalized: row.normalized,
      errors: row.errors,
      duplicateCandidateMemberId,
      duplicateReason,
    };
  });

  await finalizeParsedJob(pool, { importJobId: job.import_job_id, rows: finalRows, summary });

  sendJson(res, 201, {
    import_job_id: job.import_job_id,
    status: 'READY_FOR_CONFIRM',
    total_rows: summary.total,
    valid_rows: summary.valid,
    invalid_rows: summary.invalid,
    possible_duplicate_rows: summary.possibleDuplicate,
    warning_rows: summary.warning,
  });
}

export async function handleImportRoute({ req, res, url, pool, scope, route, sendJson, readJsonBody, userId, roles, checkOrganizationCodesExist, bearerToken }) {
  requireYouthAdminRole(roles);

  if (route.kind === 'upload') {
    if (req.method !== 'POST') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    await handleUpload({ req, res, pool, scope, sendJson, userId, checkOrganizationCodesExist, bearerToken });
    return;
  }

  if (route.kind === 'job') {
    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const job = await getImportJob(pool, { importJobId: route.id });
    if (!job || !canAccessImportJob(job, { actorUserId: userId, scope })) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  if (route.kind === 'jobRows') {
    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const job = await getImportJob(pool, { importJobId: route.id });
    if (!job || !canAccessImportJob(job, { actorUserId: userId, scope })) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const { limit, offset, rowStatus } = parseRowsQuery(url.searchParams);
    const result = await listImportJobRows(pool, { importJobId: route.id, limit, offset, rowStatus });
    sendJson(res, 200, result);
    return;
  }

  if (route.kind === 'confirm') {
    if (req.method !== 'POST') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const job = await getImportJob(pool, { importJobId: route.id });
    if (!job || !canAccessImportJob(job, { actorUserId: userId, scope })) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const body = await readJsonBody(req);
    const rowOverrides = parseConfirmPayload(body);
    const result = await confirmImportJob(pool, { importJobId: route.id, scope, rowOverrides });
    if (result.outcome === 'not_found') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    if (result.outcome === 'conflict') {
      sendJson(res, 409, { error: 'conflict', message: `Job is in status ${result.status}, not READY_FOR_CONFIRM.` });
      return;
    }
    if (result.outcome === 'already_committed') {
      sendJson(res, 200, result.job);
      return;
    }
    sendJson(res, 200, result.job);
    return;
  }

  if (route.kind === 'cancel') {
    if (req.method !== 'POST') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const job = await getImportJob(pool, { importJobId: route.id });
    if (!job || !canAccessImportJob(job, { actorUserId: userId, scope })) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const result = await cancelImportJob(pool, { importJobId: route.id });
    if (result.outcome === 'not_found') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    if (result.outcome === 'conflict') {
      sendJson(res, 409, { error: 'conflict', message: `Job is in status ${result.status}, cannot cancel.` });
      return;
    }
    sendJson(res, 200, result.job);
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}
