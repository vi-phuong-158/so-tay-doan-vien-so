import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemberServiceError,
  buildMemberPayload,
  createMemberService,
  mapImportJob,
  mapImportJobRow,
  mapMemberRow,
} from '../src/services/memberService.js';

function fakeClient({ session = { access_token: 'test-token' }, organizations = [] } = {}) {
  return {
    auth: {
      async getSession() {
        return { data: { session } };
      },
    },
    from(table) {
      assert.equal(table, 'organizations');
      return {
        select() { return this; },
        order() { return { data: organizations, error: null }; },
      };
    },
  };
}

function fakeFetch(responses) {
  let call = 0;
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const response = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return {
      ok: response.status < 400,
      status: response.status,
      headers: { get: () => null },
      json: async () => response.body,
    };
  };
  fn.calls = calls;
  return fn;
}

test('mapMemberRow: converts server snake_case to camelCase and never surfaces account_user_id (server never sends it)', () => {
  const mapped = mapMemberRow({
    member_id: 'm1',
    full_name: 'Nguyễn Văn A',
    date_of_birth: '1998-05-20',
    gender: 'NAM',
    work_unit_code: 'ORG-1',
    job_title: 'Đội trưởng',
    member_status: 'ACTIVE',
    political_theory_level: null,
    youth_position: 'BI_THU',
    youth_board_position: null,
    external_ref_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(mapped.id, 'm1');
  assert.equal(mapped.fullName, 'Nguyễn Văn A');
  assert.equal(mapped.workUnitCode, 'ORG-1');
  assert.equal(mapped.youthPosition, 'BI_THU');
  assert.ok(!('account_user_id' in mapped) && !('accountUserId' in mapped));
});

test('mapMemberRow: null passthrough', () => {
  assert.equal(mapMemberRow(null), null);
});

test('mapImportJob / mapImportJobRow: convert server shape to camelCase', () => {
  const job = mapImportJob({
    import_job_id: 'j1',
    status: 'READY_FOR_CONFIRM',
    source_filename: 'roster.xlsx',
    total_rows: 10,
    valid_rows: 8,
    invalid_rows: 2,
    possible_duplicate_rows: 0,
    warning_rows: 0,
    committed_count: 0,
    failure_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(job.id, 'j1');
  assert.equal(job.totalRows, 10);
  assert.equal(job.validRows, 8);

  const row = mapImportJobRow({
    row_number: 2,
    row_status: 'INVALID',
    normalized_data: { full_name: 'A' },
    errors: [{ field: 'work_unit_code', code: 'required', message: 'x' }],
    duplicate_candidate_member_id: null,
    duplicate_reason: null,
    committed_member_id: null,
  });
  assert.equal(row.rowNumber, 2);
  assert.equal(row.rowStatus, 'INVALID');
  assert.equal(row.errors.length, 1);
});

test('buildMemberPayload: create includes work_unit_code, patch never does (P5.5-03 immutability contract)', () => {
  const form = {
    fullName: '  Nguyễn Văn A  ',
    workUnitCode: 'ORG-1',
    dateOfBirth: '',
    gender: '',
    jobTitle: '  ',
    memberStatus: 'ACTIVE',
    politicalTheoryLevel: '',
    youthPosition: '',
    youthBoardPosition: '',
    externalRefNote: '',
  };
  const createPayload = buildMemberPayload(form, { includeWorkUnitCode: true });
  assert.equal(createPayload.full_name, 'Nguyễn Văn A');
  assert.equal(createPayload.work_unit_code, 'ORG-1');
  assert.ok(!('job_title' in createPayload), 'blank optional fields must be omitted, not sent as empty string');

  const patchPayload = buildMemberPayload(form, { includeWorkUnitCode: false });
  assert.ok(!('work_unit_code' in patchPayload), 'work_unit_code must never be sent on an update payload');
});

test('createMemberService.listMembers: sends the right query params and maps the response', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { members: [{ member_id: 'm1', full_name: 'A', work_unit_code: 'ORG-1', member_status: 'ACTIVE' }], total: 1, limit: 20, offset: 0 } }]);
  const service = createMemberService(fakeClient(), { baseUrl: 'http://member-api.test', fetchImpl });

  const result = await service.listMembers({ search: 'A', memberStatus: 'ACTIVE' });
  assert.equal(result.items.length, 1);
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);

  const requestedUrl = new URL(fetchImpl.calls[0].url);
  assert.equal(requestedUrl.pathname, '/v1/members');
  assert.equal(requestedUrl.searchParams.get('search'), 'A');
  assert.equal(requestedUrl.searchParams.get('member_status'), 'ACTIVE');
  assert.equal(fetchImpl.calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('createMemberService: no baseUrl configured throws NOT_CONFIGURED before ever calling fetch', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: {} }]);
  const service = createMemberService(fakeClient(), { fetchImpl });
  await assert.rejects(() => service.listMembers(), (error) => {
    assert.ok(error instanceof MemberServiceError);
    assert.equal(error.code, 'NOT_CONFIGURED');
    return true;
  });
  assert.equal(fetchImpl.calls.length, 0);
});

test('createMemberService: no session/access token throws AUTHENTICATION_REQUIRED before calling fetch', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: {} }]);
  const service = createMemberService(fakeClient({ session: null }), { baseUrl: 'http://member-api.test', fetchImpl });
  await assert.rejects(() => service.listMembers(), (error) => {
    assert.equal(error.code, 'AUTHENTICATION_REQUIRED');
    return true;
  });
  assert.equal(fetchImpl.calls.length, 0);
});

test('createMemberService: a 403 response normalizes to FORBIDDEN, never leaking the raw body as the message', async () => {
  const fetchImpl = fakeFetch([{ status: 403, body: { error: 'forbidden' } }]);
  const service = createMemberService(fakeClient(), { baseUrl: 'http://member-api.test', fetchImpl });
  await assert.rejects(() => service.getMember('m1'), (error) => {
    assert.equal(error.code, 'FORBIDDEN');
    return true;
  });
});

test('createMemberService: a network failure (fetch throws) normalizes to REQUEST_FAILED', async () => {
  const service = createMemberService(fakeClient(), {
    baseUrl: 'http://member-api.test',
    fetchImpl: async () => { throw new Error('network down'); },
  });
  await assert.rejects(() => service.listMembers(), (error) => {
    assert.equal(error.code, 'REQUEST_FAILED');
    return true;
  });
});

test('createMemberService.uploadImport: a malformed-workbook error body (with import_job_id) is preserved on error.cause', async () => {
  const fetchImpl = fakeFetch([{ status: 400, body: { error: 'malformed_workbook', message: 'bad file', import_job_id: 'job-1' } }]);
  const service = createMemberService(fakeClient(), { baseUrl: 'http://member-api.test', fetchImpl });
  const file = { name: 'roster.xlsx' };
  await assert.rejects(() => service.uploadImport(file), (error) => {
    assert.equal(error.code, 'malformed_workbook');
    assert.equal(error.cause?.import_job_id, 'job-1');
    return true;
  });
});

test('createMemberService.updateMember: PATCH payload never includes work_unit_code', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { member_id: 'm1', full_name: 'A', work_unit_code: 'ORG-1', member_status: 'ACTIVE' } }]);
  const service = createMemberService(fakeClient(), { baseUrl: 'http://member-api.test', fetchImpl });
  await service.updateMember('m1', { fullName: 'A', workUnitCode: 'SHOULD-NOT-BE-SENT' });
  const sentBody = JSON.parse(fetchImpl.calls[0].options.body);
  assert.ok(!('work_unit_code' in sentBody));
});

test('getOrganizationDirectory: reads Supabase organizations table, never the Member API', async () => {
  const client = fakeClient({ organizations: [{ id: '1', code: 'ORG-1', name: 'Đơn vị 1', short_name: null }] });
  const service = createMemberService(client, { baseUrl: 'http://member-api.test', fetchImpl: fakeFetch([]) });
  const result = await service.getOrganizationDirectory();
  assert.deepEqual(result, [{ id: '1', code: 'ORG-1', name: 'Đơn vị 1' }]);
});
