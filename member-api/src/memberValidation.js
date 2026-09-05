// P5.5-03 — input validation and mass-assignment protection for Member CRUD. Every field a client
// can set is explicitly allowlisted per operation; anything else (unknown or protected) is a hard
// 400, never silently dropped or silently accepted. See
// docs/phase-5-5/00-member-management-architecture.md muc 5 (data model / field classification).
import { ApiError } from './errors.js';

export const MEMBER_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'ARCHIVED'];
export const GENDER_VALUES = ['NAM', 'NỮ', 'KHÁC'];
export const POLITICAL_THEORY_LEVEL_VALUES = ['SO_CAP', 'TRUNG_CAP', 'CAO_CAP'];
export const YOUTH_POSITION_VALUES = ['BI_THU', 'PHO_BI_THU', 'UY_VIEN'];
export const YOUTH_BOARD_POSITION_VALUES = ['TRUONG_BAN_THANH_NIEN', 'PHO_BAN_THANH_NIEN'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// member_id/created_at/updated_at are server-managed (DB default/trigger). account_user_id is an
// authorization mapping set only via a separate, not-yet-built linking workflow (muc 11) — never
// through ordinary Member CRUD, on create or patch. These are rejected everywhere, not merely
// "unknown" — the distinct error code makes intent explicit in tests/logs.
const PROTECTED_FIELDS = new Set(['member_id', 'created_at', 'updated_at', 'account_user_id']);

const CREATABLE_FIELDS = new Set([
  'full_name',
  'date_of_birth',
  'gender',
  'work_unit_code',
  'job_title',
  'member_status',
  'political_theory_level',
  'youth_position',
  'youth_board_position',
  'external_ref_note',
]);

// work_unit_code is deliberately absent: organization transfer must never happen through an
// ordinary PATCH (owner decision on P5.5-03 scope; muc 6 immutability contract). A dedicated,
// audited transfer workflow is a separate future task, not this endpoint.
const PATCHABLE_FIELDS = new Set([
  'full_name',
  'date_of_birth',
  'gender',
  'job_title',
  'member_status',
  'political_theory_level',
  'youth_position',
  'youth_board_position',
  'external_ref_note',
]);

function assertNoProtectedOrUnknownFields(body, allowedFields) {
  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.has(key)) {
      throw new ApiError(400, 'protected_field', `Field "${key}" cannot be set directly.`);
    }
    if (!allowedFields.has(key)) {
      throw new ApiError(400, 'unknown_field', `Field "${key}" is not a recognized Member field.`);
    }
  }
}

function requireNonBlankString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'validation_error', `Field "${field}" is required and must be a non-blank string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(400, 'validation_error', `Field "${field}" exceeds the maximum length of ${maxLength}.`);
  }
  return trimmed;
}

function validateOptionalString(value, field, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'validation_error', `Field "${field}" must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(400, 'validation_error', `Field "${field}" exceeds the maximum length of ${maxLength}.`);
  }
  return trimmed === '' ? null : trimmed;
}

function validateOptionalEnum(value, field, allowed) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ApiError(400, 'validation_error', `Field "${field}" must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function validateRequiredEnum(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ApiError(400, 'validation_error', `Field "${field}" must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function validateOptionalDate(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ApiError(400, 'validation_error', `Field "${field}" must be an ISO date (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'validation_error', `Field "${field}" is not a valid calendar date.`);
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date.getTime() > today.getTime()) {
    throw new ApiError(400, 'validation_error', `Field "${field}" cannot be in the future.`);
  }
  return value;
}

// POST /v1/members — full_name and work_unit_code are required; member_status defaults to ACTIVE
// (matching the DB default) when not explicitly supplied.
export function parseCreatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'validation_error', 'Request body must be a JSON object.');
  }
  assertNoProtectedOrUnknownFields(body, CREATABLE_FIELDS);

  const payload = {
    full_name: requireNonBlankString(body.full_name, 'full_name', 200),
    work_unit_code: requireNonBlankString(body.work_unit_code, 'work_unit_code', 100),
    member_status: body.member_status === undefined ? 'ACTIVE' : validateRequiredEnum(body.member_status, 'member_status', MEMBER_STATUS_VALUES),
  };

  const dateOfBirth = validateOptionalDate(body.date_of_birth, 'date_of_birth');
  if (dateOfBirth !== null) payload.date_of_birth = dateOfBirth;
  const gender = validateOptionalEnum(body.gender, 'gender', GENDER_VALUES);
  if (gender !== null) payload.gender = gender;
  const jobTitle = validateOptionalString(body.job_title, 'job_title', 200);
  if (jobTitle !== null) payload.job_title = jobTitle;
  const politicalTheoryLevel = validateOptionalEnum(body.political_theory_level, 'political_theory_level', POLITICAL_THEORY_LEVEL_VALUES);
  if (politicalTheoryLevel !== null) payload.political_theory_level = politicalTheoryLevel;
  const youthPosition = validateOptionalEnum(body.youth_position, 'youth_position', YOUTH_POSITION_VALUES);
  if (youthPosition !== null) payload.youth_position = youthPosition;
  const youthBoardPosition = validateOptionalEnum(body.youth_board_position, 'youth_board_position', YOUTH_BOARD_POSITION_VALUES);
  if (youthBoardPosition !== null) payload.youth_board_position = youthBoardPosition;
  const externalRefNote = validateOptionalString(body.external_ref_note, 'external_ref_note', 500);
  if (externalRefNote !== null) payload.external_ref_note = externalRefNote;

  return payload;
}

// PATCH /v1/members/:id — explicit allowlist; only fields actually present in the body are
// touched. `null` is accepted for nullable columns to explicitly clear them, except member_status
// (NOT NULL in the schema — muc 5) which must always resolve to one of the four enum values.
export function parsePatchPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'validation_error', 'Request body must be a JSON object.');
  }
  if (Object.keys(body).length === 0) {
    throw new ApiError(400, 'validation_error', 'Request body must include at least one field to update.');
  }
  assertNoProtectedOrUnknownFields(body, PATCHABLE_FIELDS);

  const patch = {};
  if ('full_name' in body) patch.full_name = requireNonBlankString(body.full_name, 'full_name', 200);
  if ('date_of_birth' in body) {
    patch.date_of_birth = body.date_of_birth === null ? null : validateOptionalDate(body.date_of_birth, 'date_of_birth');
  }
  if ('gender' in body) {
    patch.gender = body.gender === null ? null : validateOptionalEnum(body.gender, 'gender', GENDER_VALUES);
  }
  if ('job_title' in body) patch.job_title = validateOptionalString(body.job_title, 'job_title', 200);
  if ('member_status' in body) {
    if (body.member_status === null) {
      throw new ApiError(400, 'validation_error', 'Field "member_status" cannot be null.');
    }
    patch.member_status = validateRequiredEnum(body.member_status, 'member_status', MEMBER_STATUS_VALUES);
  }
  if ('political_theory_level' in body) {
    patch.political_theory_level =
      body.political_theory_level === null
        ? null
        : validateOptionalEnum(body.political_theory_level, 'political_theory_level', POLITICAL_THEORY_LEVEL_VALUES);
  }
  if ('youth_position' in body) {
    patch.youth_position =
      body.youth_position === null ? null : validateOptionalEnum(body.youth_position, 'youth_position', YOUTH_POSITION_VALUES);
  }
  if ('youth_board_position' in body) {
    patch.youth_board_position =
      body.youth_board_position === null
        ? null
        : validateOptionalEnum(body.youth_board_position, 'youth_board_position', YOUTH_BOARD_POSITION_VALUES);
  }
  if ('external_ref_note' in body) patch.external_ref_note = validateOptionalString(body.external_ref_note, 'external_ref_note', 500);

  return patch;
}

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_SEARCH_LENGTH = 200;
const MAX_WORK_UNIT_CODE_FILTER_LENGTH = 100;

// GET /v1/members query string. Every value here ends up as a bound query parameter, never
// interpolated into SQL text (see memberRepository.js) — validation here is about shape/bounds,
// not injection safety, which parameterization already guarantees.
export function parseListQuery(searchParams) {
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;

  const offsetRaw = Number(searchParams.get('offset'));
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

  const filters = {};

  const workUnitCode = searchParams.get('work_unit_code');
  if (workUnitCode !== null && workUnitCode.trim() !== '') {
    filters.workUnitCode = validateOptionalString(workUnitCode, 'work_unit_code', MAX_WORK_UNIT_CODE_FILTER_LENGTH);
  }

  const memberStatus = searchParams.get('member_status');
  if (memberStatus !== null && memberStatus.trim() !== '') {
    filters.memberStatus = validateOptionalEnum(memberStatus, 'member_status', MEMBER_STATUS_VALUES);
  }

  const search = searchParams.get('search');
  if (search !== null) {
    const trimmed = search.trim().slice(0, MAX_SEARCH_LENGTH);
    if (trimmed !== '') filters.search = trimmed;
  }

  return { limit, offset, filters };
}
