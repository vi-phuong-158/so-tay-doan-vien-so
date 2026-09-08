// P5.5-06 — data boundary between the frontend and the standalone Member API (member-api/, NOT a
// Supabase Edge Function). `client` is the app's existing Supabase client, used ONLY to (a) read
// the current session's access token to send as `Authorization: Bearer <token>` on every request —
// the Member API is the trust boundary; this layer never computes an authorization decision itself
// (docs/phase-5-5/00-member-management-architecture.md mục 13/24: frontend enforcement is UX only)
// — and (b) read Supabase's own `organizations` table (already RLS-readable by any active user) to
// populate the work_unit_code picker, since `/member-metadata` does not exist yet (deferred to a
// later subphase). `baseUrl`/`fetchImpl` are explicit constructor params (never `import.meta.env`
// read inside this file) so this module stays importable/testable under plain `node --test`, same
// convention as every other `create*Service(client)` factory in this codebase.
const MEMBER_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'ARCHIVED'];
const GENDER_VALUES = ['NAM', 'NỮ', 'KHÁC'];
const POLITICAL_THEORY_LEVEL_VALUES = ['SO_CAP', 'TRUNG_CAP', 'CAO_CAP'];
const YOUTH_POSITION_VALUES = ['BI_THU', 'PHO_BI_THU', 'UY_VIEN'];
const YOUTH_BOARD_POSITION_VALUES = ['TRUONG_BAN_THANH_NIEN', 'PHO_BAN_THANH_NIEN'];
const SORT_VALUES = ['full_name_asc', 'updated_at_desc'];

export {
  MEMBER_STATUS_VALUES,
  GENDER_VALUES,
  POLITICAL_THEORY_LEVEL_VALUES,
  YOUTH_POSITION_VALUES,
  YOUTH_BOARD_POSITION_VALUES,
  SORT_VALUES,
};

export const MEMBER_LIST_PAGE_SIZE = 20;

// Business codes the Member API (member-api/src/errors.js + route handlers) actually returns.
// Anything outside this allowlist normalizes to a generic failure so raw internals never reach
// the UI — same discipline as documentService.js's BUSINESS_ERROR_CODES.
const BUSINESS_ERROR_CODES = new Set([
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_error',
  'unknown_organization',
  'organization_out_of_scope',
  'protected_field',
  'unknown_field',
  'payload_too_large',
  'invalid_json',
  'empty_upload',
  'malformed_workbook',
  'missing_header',
  'duplicate_header',
  'too_many_rows',
  'invalid_row_override',
  'conflict',
  'scope_changed',
  'database_unavailable',
  'organization_directory_unavailable',
  'not_implemented',
]);

export class MemberServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'MemberServiceError';
    this.code = code;
    this.cause = cause;
  }
}

export function mapMemberRow(row) {
  if (!row) return null;
  return {
    id: row.member_id,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    workUnitCode: row.work_unit_code,
    jobTitle: row.job_title,
    memberStatus: row.member_status,
    politicalTheoryLevel: row.political_theory_level,
    youthPosition: row.youth_position,
    youthBoardPosition: row.youth_board_position,
    externalRefNote: row.external_ref_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapImportJob(row) {
  if (!row) return null;
  return {
    id: row.import_job_id,
    status: row.status,
    sourceFilename: row.source_filename,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    invalidRows: row.invalid_rows,
    possibleDuplicateRows: row.possible_duplicate_rows,
    warningRows: row.warning_rows,
    committedCount: row.committed_count,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapImportJobRow(row) {
  if (!row) return null;
  return {
    rowNumber: row.row_number,
    rowStatus: row.row_status,
    normalizedData: row.normalized_data,
    errors: row.errors ?? [],
    duplicateCandidateMemberId: row.duplicate_candidate_member_id,
    duplicateReason: row.duplicate_reason,
    committedMemberId: row.committed_member_id,
  };
}

// Only fields a create/edit form is ever allowed to send — mirrors member-api/src/memberValidation.js's
// CREATABLE_FIELDS/PATCHABLE_FIELDS allowlist. Sending anything else is rejected server-side anyway
// (fail-closed), but shaping the payload here keeps the request minimal and the intent explicit.
function buildMemberPayload(form, { includeWorkUnitCode }) {
  const payload = { full_name: form.fullName?.trim() ?? '' };
  if (includeWorkUnitCode) payload.work_unit_code = form.workUnitCode?.trim() ?? '';
  if (form.dateOfBirth) payload.date_of_birth = form.dateOfBirth;
  if (form.gender) payload.gender = form.gender;
  if (form.jobTitle?.trim()) payload.job_title = form.jobTitle.trim();
  if (form.memberStatus) payload.member_status = form.memberStatus;
  if (form.politicalTheoryLevel) payload.political_theory_level = form.politicalTheoryLevel;
  if (form.youthPosition) payload.youth_position = form.youthPosition;
  if (form.youthBoardPosition) payload.youth_board_position = form.youthBoardPosition;
  if (form.externalRefNote?.trim()) payload.external_ref_note = form.externalRefNote.trim();
  return payload;
}

export { buildMemberPayload };

function normalizeMemberError(error) {
  if (error instanceof MemberServiceError) return error;
  return new MemberServiceError('REQUEST_FAILED', 'Không thể kết nối tới Member API. Thử lại sau.', error);
}

async function parseErrorBody(response) {
  try {
    const body = await response.json();
    const code = BUSINESS_ERROR_CODES.has(body?.error) ? body.error : null;
    return { code, message: typeof body?.message === 'string' ? body.message : null, body };
  } catch {
    return { code: null, message: null, body: null };
  }
}

function createHttpClient(client, { baseUrl, fetchImpl = fetch } = {}) {
  return async function request(path, { method = 'GET', body, headers = {}, rawBody = false } = {}) {
    if (!baseUrl) {
      throw new MemberServiceError('NOT_CONFIGURED', 'Member API chưa được cấu hình (VITE_MEMBER_API_URL).', undefined);
    }

    let session;
    try {
      const result = await client.auth.getSession();
      session = result?.data?.session;
    } catch (error) {
      throw new MemberServiceError('AUTHENTICATION_REQUIRED', 'Không thể xác thực phiên đăng nhập.', error);
    }
    if (!session?.access_token) {
      throw new MemberServiceError('AUTHENTICATION_REQUIRED', 'Bạn cần đăng nhập để thực hiện thao tác này.', undefined);
    }

    const requestHeaders = { Authorization: `Bearer ${session.access_token}`, ...headers };
    let requestBody = body;
    if (body !== undefined && !rawBody) {
      requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers: requestHeaders, body: requestBody });
    } catch (error) {
      throw new MemberServiceError('REQUEST_FAILED', 'Không thể kết nối tới Member API. Thử lại sau.', error);
    }

    if (!response.ok) {
      const { code, message, body } = await parseErrorBody(response);
      // `body` (the full parsed JSON, e.g. { error, message, import_job_id } from a malformed-
      // workbook upload) is attached as `cause` so a caller can read extra fields the server sent
      // alongside the error code — never used to build the message shown to the user.
      if (response.status === 401) {
        throw new MemberServiceError('AUTHENTICATION_REQUIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', body);
      }
      if (response.status === 403) {
        throw new MemberServiceError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', body);
      }
      if (response.status === 404) {
        throw new MemberServiceError('NOT_FOUND', 'Không tìm thấy dữ liệu yêu cầu.', body);
      }
      throw new MemberServiceError(code ?? 'REQUEST_FAILED', message ?? 'Yêu cầu tới Member API thất bại.', body);
    }

    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  };
}

const MAX_LIST_LIMIT = 100;

export function createMemberService(client, options = {}) {
  const request = createHttpClient(client, options);

  return {
    async getScope() {
      try {
        return await request('/v1/member-scope');
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    /** Distinct organization codes/names — read directly from Supabase's own `organizations`
     * table (already RLS-readable), never a Member API-side copy (mục 6). Used to populate the
     * work_unit_code picker; scope filtering for the picker (a UX convenience, not a security
     * control — the Member API re-validates scope on every write regardless) is done by the
     * caller using the result of getScope(). */
    async getOrganizationDirectory() {
      const { data, error } = await client.from('organizations').select('id, code, name, short_name').order('name');
      if (error) throw normalizeMemberError(error);
      return (data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.short_name || row.name }));
    },

    async listMembers({
      page = 0,
      pageSize = MEMBER_LIST_PAGE_SIZE,
      search = '',
      workUnitCode = '',
      memberStatus = '',
      youthPosition = '',
      youthBoardPosition = '',
      politicalTheoryLevel = '',
      sort = 'full_name_asc',
    } = {}) {
      const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_LIST_LIMIT));
      const params = new URLSearchParams();
      params.set('limit', String(boundedPageSize));
      params.set('offset', String(page * boundedPageSize));
      if (search.trim()) params.set('search', search.trim());
      if (workUnitCode) params.set('work_unit_code', workUnitCode);
      if (memberStatus) params.set('member_status', memberStatus);
      if (youthPosition) params.set('youth_position', youthPosition);
      if (youthBoardPosition) params.set('youth_board_position', youthBoardPosition);
      if (politicalTheoryLevel) params.set('political_theory_level', politicalTheoryLevel);
      if (sort) params.set('sort', sort);

      try {
        const result = await request(`/v1/members?${params.toString()}`);
        const items = (result?.members ?? []).map(mapMemberRow);
        const total = result?.total ?? items.length;
        const offset = result?.offset ?? page * boundedPageSize;
        return { items, total, page, pageSize: boundedPageSize, hasMore: offset + items.length < total };
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async getMember(id) {
      try {
        const row = await request(`/v1/members/${encodeURIComponent(id)}`);
        return mapMemberRow(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async createMember(form) {
      try {
        const row = await request('/v1/members', { method: 'POST', body: buildMemberPayload(form, { includeWorkUnitCode: true }) });
        return mapMemberRow(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async updateMember(id, form) {
      try {
        const row = await request(`/v1/members/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: buildMemberPayload(form, { includeWorkUnitCode: false }),
        });
        return mapMemberRow(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async setMemberStatus(id, memberStatus) {
      try {
        const row = await request(`/v1/members/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { member_status: memberStatus },
        });
        return mapMemberRow(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async uploadImport(file) {
      try {
        const result = await request('/v1/members/import', {
          method: 'POST',
          body: file,
          rawBody: true,
          headers: { 'X-Import-Filename': file.name ?? '' },
        });
        return mapImportJob(result);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async getImportJob(jobId) {
      try {
        const row = await request(`/v1/members/import/${encodeURIComponent(jobId)}`);
        return mapImportJob(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async listImportJobRows(jobId, { limit = 50, offset = 0, rowStatus = '' } = {}) {
      const params = new URLSearchParams();
      params.set('limit', String(Math.max(1, Math.min(limit, MAX_LIST_LIMIT))));
      params.set('offset', String(Math.max(0, offset)));
      if (rowStatus) params.set('row_status', rowStatus);
      try {
        const result = await request(`/v1/members/import/${encodeURIComponent(jobId)}/rows?${params.toString()}`);
        return {
          rows: (result?.rows ?? []).map(mapImportJobRow),
          total: result?.total ?? 0,
          limit: result?.limit ?? limit,
          offset: result?.offset ?? offset,
        };
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async confirmImport(jobId, rowOverrides = []) {
      try {
        const row = await request(`/v1/members/import/${encodeURIComponent(jobId)}/confirm`, {
          method: 'POST',
          body: { row_overrides: rowOverrides },
        });
        return mapImportJob(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },

    async cancelImport(jobId) {
      try {
        const row = await request(`/v1/members/import/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
        return mapImportJob(row);
      } catch (error) {
        throw normalizeMemberError(error);
      }
    },
  };
}
