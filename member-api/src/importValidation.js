// P5.5-05 — Excel import: header contract and per-row field validation/normalization.
// Mirrors memberValidation.js's allowlist/enum rules exactly (reuses the same constants) so an
// imported row can never end up more permissive than a row created through ordinary POST
// /v1/members. This module never touches the database or the network — it is pure per-row
// validation; organization existence/scope and cross-row dedup are separate steps
// (organizationDirectory.js / importDedup.js) because they need batched I/O.
import {
  GENDER_VALUES,
  MEMBER_STATUS_VALUES,
  POLITICAL_THEORY_LEVEL_VALUES,
  YOUTH_BOARD_POSITION_VALUES,
  YOUTH_POSITION_VALUES,
} from './memberValidation.js';

// Literal header contract (muc 10: "khong doc Excel roi insert thang" — the shape of what is
// accepted has to be explicit and versioned, not "whatever column order/names happen to match").
// Headers are the same snake_case names as the Member API/DB fields, deliberately — this avoids
// inventing a second, Vietnamese-label taxonomy that the architecture document never specified,
// and keeps "missing header"/"duplicate header" checks a plain string comparison. A downloadable
// template with these exact headers is a P5.5-06 frontend concern, not this module's.
export const REQUIRED_HEADERS = ['full_name', 'work_unit_code'];
export const OPTIONAL_HEADERS = [
  'date_of_birth',
  'gender',
  'job_title',
  'member_status',
  'political_theory_level',
  'youth_position',
  'youth_board_position',
  'external_ref_note',
];
export const KNOWN_HEADERS = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);

// Safety bounds enforced before/while parsing — muc D ("oversized input") and defense against a
// crafted workbook trying to force pathological memory/CPU use far beyond the ~3,000-row pilot.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 10000;

export class ImportParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImportParseError';
    this.code = code;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value) {
  if (value === null || value === undefined) return { value: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { error: 'Ngày sinh không hợp lệ.' };
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return { value: `${y}-${m}-${d}` };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return { value: null };
    if (!DATE_PATTERN.test(trimmed)) {
      return { error: 'Ngày sinh phải là ô định dạng ngày trong Excel hoặc chuỗi ISO (YYYY-MM-DD).' };
    }
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return { error: 'Ngày sinh không hợp lệ.' };
    return { value: trimmed };
  }
  return { error: 'Ngày sinh phải là ô định dạng ngày trong Excel hoặc chuỗi ISO (YYYY-MM-DD).' };
}

function requireNonBlankString(value, field, maxLength, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ field, code: 'required', message: `Trường "${field}" là bắt buộc.` });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push({ field, code: 'too_long', message: `Trường "${field}" vượt quá ${maxLength} ký tự.` });
    return null;
  }
  return trimmed;
}

function optionalString(value, field, maxLength, errors) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    errors.push({ field, code: 'invalid_type', message: `Trường "${field}" phải là văn bản.` });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) {
    errors.push({ field, code: 'too_long', message: `Trường "${field}" vượt quá ${maxLength} ký tự.` });
    return null;
  }
  return trimmed;
}

function optionalEnum(value, field, allowed, errors) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!allowed.includes(trimmed)) {
    errors.push({ field, code: 'invalid_enum', message: `Trường "${field}" phải là một trong: ${allowed.join(', ')}.` });
    return null;
  }
  return trimmed;
}

// One raw row (already header-mapped to plain JS values by importParser.js) -> { status, errors,
// normalized }. Only field-shape validation happens here — organization existence/scope
// (importRoutes.js, batched via organizationDirectory.js) and cross-row/existing-member dedup
// (importDedup.js) are applied afterward, only to rows that come out of this step as VALID.
export function validateImportRow(rawRow) {
  const errors = [];

  const normalized = {};

  const fullName = requireNonBlankString(rawRow.full_name, 'full_name', 200, errors);
  if (fullName !== null) normalized.full_name = fullName;

  const workUnitCode = requireNonBlankString(rawRow.work_unit_code, 'work_unit_code', 100, errors);
  if (workUnitCode !== null) normalized.work_unit_code = workUnitCode;

  const dobResult = toIsoDateString(rawRow.date_of_birth ?? null);
  if (dobResult.error) {
    errors.push({ field: 'date_of_birth', code: 'invalid_date', message: dobResult.error });
  } else if (dobResult.value) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (new Date(`${dobResult.value}T00:00:00Z`).getTime() > today.getTime()) {
      errors.push({ field: 'date_of_birth', code: 'future_date', message: 'Ngày sinh không được ở tương lai.' });
    } else {
      normalized.date_of_birth = dobResult.value;
    }
  }

  const gender = optionalEnum(rawRow.gender, 'gender', GENDER_VALUES, errors);
  if (gender !== null) normalized.gender = gender;

  const jobTitle = optionalString(rawRow.job_title, 'job_title', 200, errors);
  if (jobTitle !== null) normalized.job_title = jobTitle;

  const memberStatusRaw = rawRow.member_status;
  if (memberStatusRaw === null || memberStatusRaw === undefined || String(memberStatusRaw).trim() === '') {
    normalized.member_status = 'ACTIVE';
  } else {
    const memberStatus = optionalEnum(memberStatusRaw, 'member_status', MEMBER_STATUS_VALUES, errors);
    if (memberStatus !== null) normalized.member_status = memberStatus;
  }

  const politicalTheoryLevel = optionalEnum(
    rawRow.political_theory_level,
    'political_theory_level',
    POLITICAL_THEORY_LEVEL_VALUES,
    errors
  );
  if (politicalTheoryLevel !== null) normalized.political_theory_level = politicalTheoryLevel;

  const youthPosition = optionalEnum(rawRow.youth_position, 'youth_position', YOUTH_POSITION_VALUES, errors);
  if (youthPosition !== null) normalized.youth_position = youthPosition;

  const youthBoardPosition = optionalEnum(
    rawRow.youth_board_position,
    'youth_board_position',
    YOUTH_BOARD_POSITION_VALUES,
    errors
  );
  if (youthBoardPosition !== null) normalized.youth_board_position = youthBoardPosition;

  const externalRefNote = optionalString(rawRow.external_ref_note, 'external_ref_note', 500, errors);
  if (externalRefNote !== null) normalized.external_ref_note = externalRefNote;

  return {
    status: errors.length > 0 ? 'INVALID' : 'VALID',
    errors,
    normalized,
  };
}
