// P5.5-05 — soft-match dedup detection against a real Member Postgres. Every fixture in this file
// uses a unique work_unit_code prefix so assertions never depend on rows inserted by other test
// files sharing this database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';
import { createMember as createMemberRaw } from '../src/memberRepository.js';
import { detectDuplicates } from '../src/importDedup.js';

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

const PREFIX = 'P555-DEDUP';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}

// P5.5-07: createMember now requires actorUserId. Dedup fixtures here don't exercise the audit
// trail itself (see memberAudit.test.mjs) — a fixed test actor keeps every call site unchanged.
const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000002';
function createMember(pool, args) {
  return createMemberRaw(pool, { actorUserId: TEST_ACTOR_ID, ...args });
}

function row(rowNumber, fullName, workUnitCode, dateOfBirth = null) {
  return { rowNumber, normalized: { full_name: fullName, work_unit_code: workUnitCode, date_of_birth: dateOfBirth } };
}

test('detectDuplicates: an empty batch returns no signals without querying', async () => {
  const result = await detectDuplicates(pool, []);
  assert.equal(result.size, 0);
});

test('detectDuplicates: matching name+work_unit_code+equal DOB against an existing member is POSSIBLE_DUPLICATE', async () => {
  const existing = await createMember(pool, {
    payload: { full_name: 'Nguyễn Văn Dedup A', work_unit_code: orgCode('A'), date_of_birth: '1990-01-01' },
  });
  const result = await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup A', orgCode('A'), '1990-01-01')]);
  const signal = result.get(1);
  assert.equal(signal.status, 'POSSIBLE_DUPLICATE');
  assert.equal(signal.candidateMemberId, existing.member_id);
});

test('detectDuplicates: accent-insensitive name match still counts (dau/khong dau)', async () => {
  await createMember(pool, { payload: { full_name: 'Trần Thị Kế Toán', work_unit_code: orgCode('ACCENT'), date_of_birth: '1990-01-01' } });
  const result = await detectDuplicates(pool, [row(1, 'Tran Thi Ke Toan', orgCode('ACCENT'), '1990-01-01')]);
  assert.equal(result.get(1).status, 'POSSIBLE_DUPLICATE');
});

test('detectDuplicates: matching name+work_unit_code but missing DOB on the import row is WARNING, not POSSIBLE_DUPLICATE', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Văn Dedup B', work_unit_code: orgCode('B'), date_of_birth: '1990-01-01' } });
  const result = await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup B', orgCode('B'), null)]);
  assert.equal(result.get(1).status, 'WARNING');
});

test('detectDuplicates: matching name+work_unit_code but missing DOB on the EXISTING member is WARNING', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Văn Dedup C', work_unit_code: orgCode('C') } });
  const result = await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup C', orgCode('C'), '1990-01-01')]);
  assert.equal(result.get(1).status, 'WARNING');
});

test('detectDuplicates: same name+work_unit_code but DIFFERENT non-null DOB on both sides is not flagged at all (treated as a different person)', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Văn Dedup D', work_unit_code: orgCode('D'), date_of_birth: '1990-01-01' } });
  const result = await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup D', orgCode('D'), '1995-06-15')]);
  assert.equal(result.has(1), false);
});

test('detectDuplicates: same name but a DIFFERENT work_unit_code is never flagged', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Văn Dedup E', work_unit_code: orgCode('E1') } });
  const result = await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup E', orgCode('E2'))]);
  assert.equal(result.has(1), false);
});

test('detectDuplicates: never auto-merges — the signal is advisory metadata only, no members table row is touched', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Văn Dedup F', work_unit_code: orgCode('F'), date_of_birth: '1990-01-01' } });
  const before = await pool.query('SELECT count(*)::int AS n FROM members');
  await detectDuplicates(pool, [row(1, 'Nguyễn Văn Dedup F', orgCode('F'), '1990-01-01')]);
  const after = await pool.query('SELECT count(*)::int AS n FROM members');
  assert.equal(after.rows[0].n, before.rows[0].n);
});

test('detectDuplicates: two rows in the SAME batch with matching name+work_unit_code+DOB flag each other (in-batch, no candidateMemberId)', async () => {
  const result = await detectDuplicates(pool, [
    row(1, 'Phạm Thị In Batch', orgCode('G'), '1992-03-03'),
    row(2, 'Phạm Thị In Batch', orgCode('G'), '1992-03-03'),
  ]);
  assert.equal(result.get(1).status, 'POSSIBLE_DUPLICATE');
  assert.equal(result.get(1).candidateMemberId, null);
  assert.equal(result.get(2).status, 'POSSIBLE_DUPLICATE');
  assert.ok(result.get(1).reason.includes('#2'));
  assert.ok(result.get(2).reason.includes('#1'));
});

// P5.5-07R — import edge-case regression: NFC vs NFD Unicode forms of the same Vietnamese name
// (identical when read by a human, different bytes) must still be recognized as a duplicate —
// otherwise a re-imported roster typed on a different OS/keyboard (which can produce either
// normalization form) would silently create a second record instead of flagging a possible dupe.
test('detectDuplicates: NFC and NFD Unicode forms of the same name are recognized as the same person (soft-match survives Unicode normalization form)', async () => {
  const nfc = 'Nguyễn Thị Unicode'.normalize('NFC');
  const nfd = 'Nguyễn Thị Unicode'.normalize('NFD');
  assert.notEqual(nfc, nfd, 'test fixture sanity: NFC and NFD must actually differ byte-for-byte');

  const existing = await createMember(pool, { payload: { full_name: nfc, work_unit_code: orgCode('UNICODE'), date_of_birth: '1990-01-01' } });
  const result = await detectDuplicates(pool, [row(1, nfd, orgCode('UNICODE'), '1990-01-01')]);
  const signal = result.get(1);
  assert.equal(signal?.status, 'POSSIBLE_DUPLICATE');
  assert.equal(signal.candidateMemberId, existing.member_id);
});

test('detectDuplicates: an existing-member match takes priority over an in-batch match for the same row', async () => {
  const existing = await createMember(pool, {
    payload: { full_name: 'Hoàng Văn Priority', work_unit_code: orgCode('H'), date_of_birth: '1991-02-02' },
  });
  const result = await detectDuplicates(pool, [
    row(1, 'Hoàng Văn Priority', orgCode('H'), '1991-02-02'),
    row(2, 'Hoàng Văn Priority', orgCode('H'), '1991-02-02'),
  ]);
  assert.equal(result.get(1).candidateMemberId, existing.member_id);
  assert.equal(result.get(2).candidateMemberId, existing.member_id);
});
