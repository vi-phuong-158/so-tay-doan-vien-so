import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/errors.js';
import { isUuid, parseCreatePayload, parseListQuery, parsePatchPayload } from '../src/memberValidation.js';

function assertApiError(fn, { status, code }) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ApiError);
    if (status !== undefined) assert.equal(err.status, status);
    if (code !== undefined) assert.equal(err.code, code);
    return true;
  });
}

test('isUuid: accepts a well-formed UUID and rejects everything else', () => {
  assert.equal(isUuid('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid("1' OR '1'='1"), false);
});

// --- parseCreatePayload -----------------------------------------------------------------------

test('parseCreatePayload: accepts the minimal required shape and defaults member_status to ACTIVE', () => {
  const payload = parseCreatePayload({ full_name: 'Nguyễn Văn A', work_unit_code: 'CDA' });
  assert.deepEqual(payload, { full_name: 'Nguyễn Văn A', work_unit_code: 'CDA', member_status: 'ACTIVE' });
});

test('parseCreatePayload: trims full_name/work_unit_code', () => {
  const payload = parseCreatePayload({ full_name: '  Nguyễn Văn A  ', work_unit_code: '  CDA  ' });
  assert.equal(payload.full_name, 'Nguyễn Văn A');
  assert.equal(payload.work_unit_code, 'CDA');
});

test('parseCreatePayload: rejects missing full_name', () => {
  assertApiError(() => parseCreatePayload({ work_unit_code: 'CDA' }), { status: 400, code: 'validation_error' });
});

test('parseCreatePayload: rejects blank/whitespace-only full_name', () => {
  assertApiError(() => parseCreatePayload({ full_name: '   ', work_unit_code: 'CDA' }), { status: 400 });
});

test('parseCreatePayload: rejects missing work_unit_code', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A' }), { status: 400 });
});

test('parseCreatePayload: rejects a protected field (member_id) with a distinct error code', () => {
  assertApiError(
    () => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', member_id: '123e4567-e89b-12d3-a456-426614174000' }),
    { status: 400, code: 'protected_field' }
  );
});

test('parseCreatePayload: rejects account_user_id (auth mapping is not part of ordinary Member CRUD)', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', account_user_id: 'x' }), {
    status: 400,
    code: 'protected_field',
  });
});

test('parseCreatePayload: rejects created_at/updated_at as protected, server-managed fields', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', created_at: '2020-01-01T00:00:00Z' }), {
    code: 'protected_field',
  });
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', updated_at: '2020-01-01T00:00:00Z' }), {
    code: 'protected_field',
  });
});

test('parseCreatePayload: rejects an unrecognized field with a distinct error code (mass-assignment protection)', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', is_admin: true }), {
    status: 400,
    code: 'unknown_field',
  });
});

test('parseCreatePayload: rejects an invalid member_status enum value', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', member_status: 'DELETED' }), {
    status: 400,
  });
});

test('parseCreatePayload: rejects an invalid gender/political_theory_level/youth_position/youth_board_position value', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', gender: 'OTHER' }), { status: 400 });
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', political_theory_level: 'SUPER' }), {
    status: 400,
  });
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', youth_position: 'CHU_TICH' }), {
    status: 400,
  });
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', youth_board_position: 'TRUONG_BAN' }), {
    status: 400,
  });
});

test('parseCreatePayload: rejects a malformed date_of_birth and a future date_of_birth', () => {
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', date_of_birth: '01/01/2000' }), {
    status: 400,
  });
  assertApiError(() => parseCreatePayload({ full_name: 'A', work_unit_code: 'CDA', date_of_birth: '2999-01-01' }), {
    status: 400,
  });
});

test('parseCreatePayload: accepts a well-formed full payload', () => {
  const payload = parseCreatePayload({
    full_name: 'Trần Thị B',
    work_unit_code: 'CDA',
    date_of_birth: '2000-05-01',
    gender: 'NỮ',
    job_title: 'Bí thư',
    member_status: 'ACTIVE',
    political_theory_level: 'SO_CAP',
    youth_position: 'BI_THU',
    youth_board_position: 'TRUONG_BAN_THANH_NIEN',
    external_ref_note: 'ghi chú',
  });
  assert.equal(payload.full_name, 'Trần Thị B');
  assert.equal(payload.date_of_birth, '2000-05-01');
  assert.equal(payload.youth_board_position, 'TRUONG_BAN_THANH_NIEN');
});

test('parseCreatePayload: SQL/script-like text in free-text fields is accepted as literal data, not evaluated', () => {
  const payload = parseCreatePayload({
    full_name: "Robert'); DROP TABLE members;--",
    work_unit_code: 'CDA',
    external_ref_note: "1' OR '1'='1",
  });
  assert.equal(payload.full_name, "Robert'); DROP TABLE members;--");
  assert.equal(payload.external_ref_note, "1' OR '1'='1");
});

// --- parsePatchPayload -------------------------------------------------------------------------

test('parsePatchPayload: rejects an empty body', () => {
  assertApiError(() => parsePatchPayload({}), { status: 400 });
});

test('parsePatchPayload: rejects work_unit_code — organization is immutable through this endpoint', () => {
  assertApiError(() => parsePatchPayload({ work_unit_code: 'OTHER-ORG' }), { status: 400, code: 'unknown_field' });
});

test('parsePatchPayload: rejects work_unit_code even when set to the member\'s own current value', () => {
  // No-op "transfer" attempts are rejected the same as a real one — the field itself is never
  // accepted on this endpoint, regardless of value.
  assertApiError(() => parsePatchPayload({ job_title: 'X', work_unit_code: 'CDA' }), { code: 'unknown_field' });
});

test('parsePatchPayload: rejects protected fields (member_id, account_user_id, created_at, updated_at)', () => {
  assertApiError(() => parsePatchPayload({ member_id: '123e4567-e89b-12d3-a456-426614174000' }), { code: 'protected_field' });
  assertApiError(() => parsePatchPayload({ account_user_id: '123e4567-e89b-12d3-a456-426614174000' }), {
    code: 'protected_field',
  });
  assertApiError(() => parsePatchPayload({ created_at: '2020-01-01T00:00:00Z' }), { code: 'protected_field' });
  assertApiError(() => parsePatchPayload({ updated_at: '2020-01-01T00:00:00Z' }), { code: 'protected_field' });
});

test('parsePatchPayload: rejects an unknown field', () => {
  assertApiError(() => parsePatchPayload({ role: 'SYSTEM_ADMIN' }), { code: 'unknown_field' });
});

test('parsePatchPayload: rejects member_status set to null (NOT NULL column)', () => {
  assertApiError(() => parsePatchPayload({ member_status: null }), { status: 400 });
});

test('parsePatchPayload: accepts null for nullable optional fields to explicitly clear them', () => {
  const patch = parsePatchPayload({ job_title: null, gender: null, youth_position: null });
  assert.deepEqual(patch, { job_title: null, gender: null, youth_position: null });
});

test('parsePatchPayload: accepts a single allowlisted field update', () => {
  assert.deepEqual(parsePatchPayload({ member_status: 'ARCHIVED' }), { member_status: 'ARCHIVED' });
});

// --- parseListQuery ------------------------------------------------------------------------------

function searchParamsOf(obj) {
  return new URLSearchParams(obj);
}

test('parseListQuery: defaults limit=20 offset=0 with no params', () => {
  const { limit, offset, filters } = parseListQuery(searchParamsOf({}));
  assert.equal(limit, 20);
  assert.equal(offset, 0);
  assert.deepEqual(filters, {});
});

test('parseListQuery: clamps an oversized limit to 100', () => {
  const { limit } = parseListQuery(searchParamsOf({ limit: '99999' }));
  assert.equal(limit, 100);
});

test('parseListQuery: ignores a negative/non-numeric limit and offset, falling back to defaults', () => {
  assert.equal(parseListQuery(searchParamsOf({ limit: '-5' })).limit, 20);
  assert.equal(parseListQuery(searchParamsOf({ limit: 'abc' })).limit, 20);
  assert.equal(parseListQuery(searchParamsOf({ offset: '-1' })).offset, 0);
  assert.equal(parseListQuery(searchParamsOf({ offset: 'abc' })).offset, 0);
});

test('parseListQuery: rejects an invalid member_status filter value', () => {
  assertApiError(() => parseListQuery(searchParamsOf({ member_status: 'DELETED' })), { status: 400 });
});

test('parseListQuery: passes through search/work_unit_code as plain strings, bounded in length', () => {
  const longSearch = 'a'.repeat(500);
  const { filters } = parseListQuery(searchParamsOf({ search: longSearch, work_unit_code: 'CDA' }));
  assert.equal(filters.search.length, 200);
  assert.equal(filters.workUnitCode, 'CDA');
});

test('parseListQuery: SQL-metacharacter-laden search/filter values are accepted as literal text, not rejected or specially parsed', () => {
  const { filters } = parseListQuery(
    searchParamsOf({ search: "'; DROP TABLE members; --", work_unit_code: "CDA' OR '1'='1" })
  );
  assert.equal(filters.search, "'; DROP TABLE members; --");
  assert.equal(filters.workUnitCode, "CDA' OR '1'='1");
});
