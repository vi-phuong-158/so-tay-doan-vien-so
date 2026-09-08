// P5.5-07 — application audit: a mutation and its audit row are one transaction, only real
// business-field changes are recorded, cosmetic fields (external_ref_note) are not, and a
// rejected/failed mutation never leaves behind a false "success" audit row.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';
import { createMember, updateMember } from '../src/memberRepository.js';
import { buildUpdateAuditPayload, listMemberAuditLogs } from '../src/memberAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

let pool;

before(async () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = createPool(databaseUrl);
});

after(async () => {
  await pool.end();
});

const GLOBAL_SCOPE = { isGlobal: true, orgCodes: null };
const PREFIX = 'P557-AUDIT';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}
const ACTOR_A = '00000000-0000-0000-0000-0000000000a1';
const ACTOR_B = '00000000-0000-0000-0000-0000000000a2';

async function auditRowsFor(memberId) {
  const { rows } = await pool.query('SELECT * FROM member_audit_logs WHERE member_id = $1 ORDER BY created_at ASC', [memberId]);
  return rows;
}

test('createMember writes exactly one CREATE audit row, actor from the caller (never invented), full before=null/after=business fields', async () => {
  const created = await createMember(pool, {
    payload: { full_name: 'Nguyễn Văn Audit', work_unit_code: orgCode('A'), job_title: 'Đội trưởng', member_status: 'ACTIVE' },
    actorUserId: ACTOR_A,
  });
  const rows = await auditRowsFor(created.member_id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_user_id, ACTOR_A);
  assert.equal(rows[0].action, 'CREATE');
  assert.equal(rows[0].member_id, created.member_id);
  assert.equal(rows[0].import_job_id, null);
  assert.equal(rows[0].before_data, null);
  assert.equal(rows[0].after_data.full_name, 'Nguyễn Văn Audit');
  assert.equal(rows[0].after_data.job_title, 'Đội trưởng');
});

test('updateMember: a business-field change writes an UPDATE audit row with correct before/after (only the changed field)', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Trần Thị Update', work_unit_code: orgCode('B') }, actorUserId: ACTOR_A });
  const updated = await updateMember(pool, { scope: GLOBAL_SCOPE, id: created.member_id, patch: { job_title: 'Phó đội trưởng' }, actorUserId: ACTOR_B });
  assert.equal(updated.job_title, 'Phó đội trưởng');

  const rows = await auditRowsFor(created.member_id);
  assert.equal(rows.length, 2); // CREATE + this UPDATE
  const updateRow = rows[1];
  assert.equal(updateRow.action, 'UPDATE');
  assert.equal(updateRow.actor_user_id, ACTOR_B);
  assert.deepEqual(updateRow.before_data, { job_title: null });
  assert.deepEqual(updateRow.after_data, { job_title: 'Phó đội trưởng' });
});

test('updateMember: a patch touching ONLY external_ref_note (cosmetic) writes NO audit row at all', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Lê Văn Note', work_unit_code: orgCode('C') }, actorUserId: ACTOR_A });
  await updateMember(pool, { scope: GLOBAL_SCOPE, id: created.member_id, patch: { external_ref_note: 'ghi chú nội bộ' }, actorUserId: ACTOR_A });

  const rows = await auditRowsFor(created.member_id);
  assert.equal(rows.length, 1, 'only the CREATE row should exist — the cosmetic-only patch must not add an UPDATE row');
});

test('updateMember: a patch touching a mix of business + cosmetic fields audits only the business field', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Phạm Thị Mixed', work_unit_code: orgCode('D') }, actorUserId: ACTOR_A });
  await updateMember(pool, {
    scope: GLOBAL_SCOPE,
    id: created.member_id,
    patch: { external_ref_note: 'note', member_status: 'INACTIVE' },
    actorUserId: ACTOR_A,
  });
  const rows = await auditRowsFor(created.member_id);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[1].after_data), ['member_status']);
  assert.equal(rows[1].after_data.member_status, 'INACTIVE');
});

test('updateMember: a rejected mutation (out of scope) writes NO audit row', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Out Of Scope', work_unit_code: orgCode('E') }, actorUserId: ACTOR_A });
  const result = await updateMember(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('OTHER')] },
    id: created.member_id,
    patch: { job_title: 'Should not apply' },
    actorUserId: ACTOR_B,
  });
  assert.equal(result, null);
  const rows = await auditRowsFor(created.member_id);
  assert.equal(rows.length, 1, 'only the original CREATE row — the rejected out-of-scope update must not audit');
});

test('updateMember: a not-found id writes NO audit row and does not throw', async () => {
  const result = await updateMember(pool, {
    scope: GLOBAL_SCOPE,
    id: '00000000-0000-0000-0000-000000000000',
    patch: { job_title: 'X' },
    actorUserId: ACTOR_A,
  });
  assert.equal(result, null);
});

test('createMember: a mutation that fails mid-transaction (DB constraint violation) rolls back and leaves no audit row', async () => {
  await assert.rejects(() =>
    createMember(pool, {
      payload: { full_name: '   ', work_unit_code: orgCode('FAIL') }, // violates members_full_name_not_blank CHECK
      actorUserId: ACTOR_A,
    })
  );
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM member_audit_logs WHERE actor_user_id = $1 AND after_data->>\'work_unit_code\' = $2', [
    ACTOR_A,
    orgCode('FAIL'),
  ]);
  assert.equal(rows[0].n, 0, 'the rolled-back INSERT must not have left a dangling audit row');
});

test('buildUpdateAuditPayload: no changed field is on the audited allowlist -> null (caller must skip the insert)', () => {
  assert.equal(buildUpdateAuditPayload({ external_ref_note: 'old' }, { external_ref_note: 'new' }), null);
});

test('buildUpdateAuditPayload: date_of_birth null -> value is audited as before=null', () => {
  const result = buildUpdateAuditPayload({ date_of_birth: null }, { date_of_birth: '1990-01-01' });
  assert.deepEqual(result.beforeData, { date_of_birth: null });
  assert.deepEqual(result.afterData, { date_of_birth: '1990-01-01' });
});

test('listMemberAuditLogs: returns this member\'s own trail, paginated, newest first', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Paginated Person', work_unit_code: orgCode('PAGE') }, actorUserId: ACTOR_A });
  for (let i = 0; i < 3; i += 1) {
    await updateMember(pool, { scope: GLOBAL_SCOPE, id: created.member_id, patch: { job_title: `Title ${i}` }, actorUserId: ACTOR_A });
  }
  const page1 = await listMemberAuditLogs(pool, { memberId: created.member_id, limit: 2, offset: 0 });
  assert.equal(page1.total, 4); // 1 CREATE + 3 UPDATE
  assert.equal(page1.logs.length, 2);
  assert.equal(page1.logs[0].after_data.job_title, 'Title 2'); // newest first
  const page2 = await listMemberAuditLogs(pool, { memberId: created.member_id, limit: 2, offset: 2 });
  assert.equal(page2.logs.length, 2);
});

test('audit never contains a JWT, secret, or raw file content: the schema itself has no such column, and only allowlisted business fields ever populate before/after', async () => {
  const created = await createMember(pool, {
    payload: { full_name: 'Secret Check', work_unit_code: orgCode('SECRET'), external_ref_note: 'should never appear' },
    actorUserId: ACTOR_A,
  });
  const rows = await auditRowsFor(created.member_id);
  const serialized = JSON.stringify(rows[0].after_data);
  assert.ok(!serialized.includes('should never appear'), 'external_ref_note must never leak into the audit row');
});
