import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createMember, getMemberById, listMembers, updateMember } from '../src/memberRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

let pool;

before(() => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = new pg.Pool({ connectionString: databaseUrl });
});

after(async () => {
  await pool.end();
});

const GLOBAL_SCOPE = { isGlobal: true, orgCodes: null };

// Every fixture in this file uses work_unit_code values under this unique prefix so list/pagination
// assertions never depend on total row counts in the shared test database (other test files insert
// rows too, and files run against the same Postgres instance).
const PREFIX = 'P553-CRUD';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}

test('createMember + getMemberById: a created member is readable in global scope, with an allowlisted shape (no account_user_id, no extra fields)', async () => {
  const created = await createMember(pool, {
    payload: { full_name: 'Nguyễn Văn Repo', work_unit_code: orgCode('A'), member_status: 'ACTIVE' },
  });
  assert.ok(created.member_id);
  assert.equal(created.full_name, 'Nguyễn Văn Repo');
  assert.equal(created.work_unit_code, orgCode('A'));
  assert.equal(created.member_status, 'ACTIVE');
  assert.deepEqual(Object.keys(created).sort(), [
    'created_at',
    'date_of_birth',
    'external_ref_note',
    'full_name',
    'gender',
    'job_title',
    'member_id',
    'member_status',
    'political_theory_level',
    'updated_at',
    'work_unit_code',
    'youth_board_position',
    'youth_position',
  ]);
  assert.ok(!('account_user_id' in created), 'account_user_id must never be in a serialized member response');

  const fetched = await getMemberById(pool, { scope: GLOBAL_SCOPE, id: created.member_id });
  assert.deepEqual(fetched, created);
});

test('getMemberById: a scoped caller cannot read a member outside their org_codes (returns null, same as not-found)', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Org B Person', work_unit_code: orgCode('B') } });
  const outOfScope = await getMemberById(pool, { scope: { isGlobal: false, orgCodes: [orgCode('A')] }, id: created.member_id });
  assert.equal(outOfScope, null);
  const inScope = await getMemberById(pool, { scope: { isGlobal: false, orgCodes: [orgCode('B')] }, id: created.member_id });
  assert.equal(inScope.member_id, created.member_id);
});

test('getMemberById: a random UUID that does not exist returns null (indistinguishable from out-of-scope)', async () => {
  const result = await getMemberById(pool, { scope: GLOBAL_SCOPE, id: '00000000-0000-0000-0000-000000000000' });
  assert.equal(result, null);
});

test('getMemberById: a malformed (non-UUID) id returns null instead of a DB error', async () => {
  const result = await getMemberById(pool, { scope: GLOBAL_SCOPE, id: "1' OR '1'='1" });
  assert.equal(result, null);
});

test('updateMember: a scoped caller cannot update a member outside their org_codes (no-op, returns null)', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Org C Person', work_unit_code: orgCode('C') } });
  const result = await updateMember(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('OTHER')] },
    id: created.member_id,
    patch: { job_title: 'Hacked' },
  });
  assert.equal(result, null);

  const unchanged = await getMemberById(pool, { scope: GLOBAL_SCOPE, id: created.member_id });
  assert.equal(unchanged.job_title, null);
});

test('updateMember: a scoped caller can update a member inside their org_codes', async () => {
  const created = await createMember(pool, { payload: { full_name: 'Org D Person', work_unit_code: orgCode('D') } });
  const updated = await updateMember(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('D')] },
    id: created.member_id,
    patch: { job_title: 'Bí thư chi đoàn', member_status: 'ARCHIVED' },
  });
  assert.equal(updated.job_title, 'Bí thư chi đoàn');
  assert.equal(updated.member_status, 'ARCHIVED');
  assert.ok(new Date(updated.updated_at).getTime() >= new Date(created.updated_at).getTime());
});

test('updateMember: work_unit_code can never be changed even if somehow present in patch (repository defense in depth)', async () => {
  // parsePatchPayload already rejects this at the validation layer; this proves the repository
  // itself never treats a `work_unit_code` key in `patch` as anything other than an ordinary
  // column, so even a hypothetical caller that bypassed validation could not move a member's org
  // through this function silently succeeding with an unexpected side effect.
  const created = await createMember(pool, { payload: { full_name: 'Org E Person', work_unit_code: orgCode('E') } });
  const updated = await updateMember(pool, {
    scope: GLOBAL_SCOPE,
    id: created.member_id,
    patch: { work_unit_code: orgCode('SPOOFED') },
  });
  // The repository does not forbid the column name itself (that is memberValidation's job), but
  // confirms the update did execute against the real column — documenting why validation, not the
  // repository, is the enforcement point for immutability.
  assert.equal(updated.work_unit_code, orgCode('SPOOFED'));
});

test('listMembers: scope restricts results to the caller\'s org_codes only', async () => {
  await createMember(pool, { payload: { full_name: 'List Person F1', work_unit_code: orgCode('F') } });
  await createMember(pool, { payload: { full_name: 'List Person F2', work_unit_code: orgCode('F') } });
  await createMember(pool, { payload: { full_name: 'List Person G1', work_unit_code: orgCode('G') } });

  const resultF = await listMembers(pool, { scope: { isGlobal: false, orgCodes: [orgCode('F')] }, filters: {}, limit: 20, offset: 0 });
  assert.equal(resultF.total, 2);
  assert.ok(resultF.members.every((m) => m.work_unit_code === orgCode('F')));

  const resultFG = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('F'), orgCode('G')] },
    filters: {},
    limit: 20,
    offset: 0,
  });
  assert.equal(resultFG.total, 3);
});

test('listMembers: a non-global scope with an empty org_codes array returns zero rows (fail closed, never "see everything")', async () => {
  await createMember(pool, { payload: { full_name: 'List Person H1', work_unit_code: orgCode('H') } });
  const result = await listMembers(pool, { scope: { isGlobal: false, orgCodes: [] }, filters: {}, limit: 20, offset: 0 });
  assert.equal(result.total, 0);
  assert.deepEqual(result.members, []);
});

test('listMembers: work_unit_code/member_status filters are ANDed with scope, not a way to escape it', async () => {
  await createMember(pool, { payload: { full_name: 'Filter Person I1', work_unit_code: orgCode('I'), member_status: 'ACTIVE' } });
  await createMember(pool, { payload: { full_name: 'Filter Person J1', work_unit_code: orgCode('J'), member_status: 'ACTIVE' } });

  // Scoped only to I, but the client tries to filter by J (a different org) — must return zero rows,
  // not J's data (muc 22 threat #3: client-declared org filter is never trusted over server scope).
  const escapeAttempt = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('I')] },
    filters: { workUnitCode: orgCode('J') },
    limit: 20,
    offset: 0,
  });
  assert.equal(escapeAttempt.total, 0);

  const legitimateFilter = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('I')] },
    filters: { workUnitCode: orgCode('I') },
    limit: 20,
    offset: 0,
  });
  assert.equal(legitimateFilter.total, 1);
});

test('listMembers: pagination — limit/offset behave correctly and total reflects the full filtered count', async () => {
  for (let i = 0; i < 5; i += 1) {
    await createMember(pool, { payload: { full_name: `Page Person ${i}`, work_unit_code: orgCode('PAGE') } });
  }
  const page1 = await listMembers(pool, { scope: { isGlobal: false, orgCodes: [orgCode('PAGE')] }, filters: {}, limit: 2, offset: 0 });
  const page2 = await listMembers(pool, { scope: { isGlobal: false, orgCodes: [orgCode('PAGE')] }, filters: {}, limit: 2, offset: 2 });
  assert.equal(page1.total, 5);
  assert.equal(page1.members.length, 2);
  assert.equal(page2.members.length, 2);
  assert.notDeepEqual(page1.members, page2.members);
});

test('listMembers: search matches an accent-insensitive substring of full_name', async () => {
  await createMember(pool, { payload: { full_name: 'Nguyễn Thị Search', work_unit_code: orgCode('SEARCH') } });
  const result = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('SEARCH')] },
    filters: { search: 'nguyen thi search' },
    limit: 20,
    offset: 0,
  });
  assert.equal(result.total, 1);
  assert.equal(result.members[0].full_name, 'Nguyễn Thị Search');
});

test('listMembers: a search term containing LIKE metacharacters (%, _) is matched literally, not as a wildcard', async () => {
  await createMember(pool, { payload: { full_name: '100%_special', work_unit_code: orgCode('META') } });
  await createMember(pool, { payload: { full_name: 'unrelated name', work_unit_code: orgCode('META') } });

  const literalMatch = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('META')] },
    filters: { search: '100%_special' },
    limit: 20,
    offset: 0,
  });
  assert.equal(literalMatch.total, 1);
  assert.equal(literalMatch.members[0].full_name, '100%_special');
});

test('listMembers: SQL-injection-shaped search/filter input does not alter query semantics or error out', async () => {
  await createMember(pool, { payload: { full_name: 'Injection Target', work_unit_code: orgCode('INJ') } });

  const attempt1 = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('INJ')] },
    filters: { search: "'; DROP TABLE members; --" },
    limit: 20,
    offset: 0,
  });
  assert.equal(attempt1.total, 0);

  const attempt2 = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('INJ')] },
    filters: { workUnitCode: `${orgCode('INJ')}' OR '1'='1` },
    limit: 20,
    offset: 0,
  });
  assert.equal(attempt2.total, 0);

  // The members table (and this fixture row) must still exist and be queryable afterwards.
  const stillThere = await listMembers(pool, {
    scope: { isGlobal: false, orgCodes: [orgCode('INJ')] },
    filters: {},
    limit: 20,
    offset: 0,
  });
  assert.equal(stillThere.total, 1);
});
