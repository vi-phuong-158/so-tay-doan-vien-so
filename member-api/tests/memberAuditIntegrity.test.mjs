// P5.5-07R — audit integrity regression: proves a client cannot forge an audit trail. Complements
// memberAudit.test.mjs (which proves the HAPPY-PATH semantics of what gets written) by proving the
// NEGATIVE space: every audit-shaped field a PATCH/POST body could carry is rejected outright by
// the existing memberValidation.js allowlist (never silently absorbed or partially applied), the
// actor always comes from the P5.5-02 authorization resolver, a rejected/out-of-scope request never
// produces a "success" audit row, and a failure inside the mutation transaction rolls back the
// audit INSERT together with the mutation — never leaving one without the other.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';
import { createMember, getMemberById, updateMember } from '../src/memberRepository.js';

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

const TEST_ACTOR_ID = '00000000-0000-0000-0000-000000000004';
const FORGED_ACTOR_ID = '00000000-0000-0000-0000-000000000099';

function authorizerFor(roles) {
  return async () => ({ authorized: true, userId: TEST_ACTOR_ID, roles });
}

async function withServer(authorizeMemberManagement, fn, { checkOrganizationExists = async () => true } = {}) {
  const s = createServer(pool, { authorizeMemberManagement, checkOrganizationExists });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const port = s.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    s.close();
  }
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json();
  return { status: res.status, body };
}

const PREFIX = 'P557R-AUDIT-INTEGRITY';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}

async function auditCountFor(memberId) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM member_audit_logs WHERE member_id = $1', [memberId]);
  return rows[0].n;
}

const GLOBAL_ROLES = [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }];
const FORGEABLE_FIELDS = ['before_data', 'after_data', 'actor_user_id', 'audit_id', 'import_job_id'];

// --- forged fields on CREATE ------------------------------------------------------------------

for (const forgedField of FORGEABLE_FIELDS) {
  test(`POST /v1/members: a forged "${forgedField}" field is rejected, never silently absorbed`, async () => {
    const org = orgCode(`CREATE-${forgedField}`);
    await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
      const result = await jsonFetch(`${base}/v1/members`, {
        method: 'POST',
        body: JSON.stringify({ full_name: 'Forged Create', work_unit_code: org, [forgedField]: 'attacker-supplied' }),
      });
      assert.equal(result.status, 400);
      assert.ok(['unknown_field', 'protected_field'].includes(result.body.error), `unexpected error code: ${result.body.error}`);
    });
  });
}

test('POST /v1/members: a forged nested "audit" object is rejected as an unknown field', async () => {
  const org = orgCode('CREATE-nested-audit');
  await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
    const result = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Forged Nested',
        work_unit_code: org,
        audit: { actor_user_id: FORGED_ACTOR_ID, before_data: {}, after_data: {} },
      }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'unknown_field');
  });
});

// --- forged fields on UPDATE -------------------------------------------------------------------

for (const forgedField of FORGEABLE_FIELDS) {
  test(`PATCH /v1/members/:id: a forged "${forgedField}" field is rejected and produces zero new audit rows`, async () => {
    const org = orgCode(`PATCH-${forgedField}`);
    await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
      const created = await jsonFetch(`${base}/v1/members`, {
        method: 'POST',
        body: JSON.stringify({ full_name: 'Patch Target', work_unit_code: org }),
      });
      assert.equal(created.status, 201);
      const countBefore = await auditCountFor(created.body.member_id);
      assert.equal(countBefore, 1); // the CREATE's own audit row

      const patched = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ job_title: 'Should not apply', [forgedField]: 'attacker-supplied' }),
      });
      assert.equal(patched.status, 400);
      assert.ok(['unknown_field', 'protected_field'].includes(patched.body.error), `unexpected error code: ${patched.body.error}`);

      // Rejected request: no new audit row, and the legitimate job_title change carried in the
      // SAME body never partially applies either — validation rejects the whole request (muc 22).
      const countAfter = await auditCountFor(created.body.member_id);
      assert.equal(countAfter, countBefore);
      const reFetched = await jsonFetch(`${base}/v1/members/${created.body.member_id}`);
      assert.notEqual(reFetched.body.job_title, 'Should not apply');
    });
  });
}

test('PATCH /v1/members/:id: a forged nested "audit" object is rejected as an unknown field', async () => {
  const org = orgCode('PATCH-nested-audit');
  await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Patch Nested Target', work_unit_code: org }),
    });
    const result = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ job_title: 'x', audit: { actor_user_id: FORGED_ACTOR_ID } }),
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'unknown_field');
  });
});

// --- actor derivation ----------------------------------------------------------------------------

test('actor_user_id on the audit row always comes from the authorization resolver, never from the request body', async () => {
  const org = orgCode('ACTOR-DERIVE');
  await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
    // A legitimate create carries no actor field at all (the client cannot send one — proven
    // above); the resulting audit row's actor must be exactly the authorizer's resolved userId.
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Actor Derive', work_unit_code: org }),
    });
    assert.equal(created.status, 201);
    const { rows } = await pool.query('SELECT actor_user_id FROM member_audit_logs WHERE member_id = $1', [created.body.member_id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, TEST_ACTOR_ID);
    assert.notEqual(rows[0].actor_user_id, FORGED_ACTOR_ID);
  });
});

// --- rejected/out-of-scope operations never produce a "success" audit row ------------------------

test('a 404 (out-of-scope PATCH target) writes zero audit rows', async () => {
  const orgA = orgCode('SCOPE-A');
  const orgB = orgCode('SCOPE-B');
  const scopedRoles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [orgB] }];

  let memberId;
  await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Out Of Scope', work_unit_code: orgA }),
    });
    memberId = created.body.member_id;
  });

  const countBefore = await auditCountFor(memberId);
  await withServer(authorizerFor(scopedRoles), async (base) => {
    const patched = await jsonFetch(`${base}/v1/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ job_title: 'attempted' }),
    });
    assert.equal(patched.status, 404);
  });
  assert.equal(await auditCountFor(memberId), countBefore);
});

test('a validation error (e.g. blank full_name) on PATCH writes zero audit rows', async () => {
  const org = orgCode('VALIDATION-REJECT');
  await withServer(authorizerFor(GLOBAL_ROLES), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Validation Target', work_unit_code: org }),
    });
    const countBefore = await auditCountFor(created.body.member_id);

    const patched = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ full_name: '   ' }),
    });
    assert.equal(patched.status, 400);
    assert.equal(await auditCountFor(created.body.member_id), countBefore);
  });
});

// --- transaction atomicity: mutation and its audit row commit/rollback together ------------------

test('updateMember: if the audit INSERT fails, the whole transaction rolls back — the member row is left unchanged and no audit row is left dangling', async () => {
  const org = orgCode('ATOMIC-ROLLBACK');
  const created = await createMember(pool, {
    actorUserId: TEST_ACTOR_ID,
    payload: { full_name: 'Atomic Rollback', work_unit_code: org, job_title: 'Original Title' },
  });

  // A pool-shaped wrapper whose connect() returns a client that behaves exactly like a real one,
  // except the specific audit INSERT statement throws — simulating an audit-write failure that
  // must never leave the member mutation applied on its own.
  const realClient = await pool.connect();
  const failingClient = {
    query(sql, params) {
      if (typeof sql === 'string' && sql.includes('INSERT INTO member_audit_logs')) {
        throw new Error('simulated audit insert failure');
      }
      return realClient.query(sql, params);
    },
    release: () => realClient.release(),
  };
  const fakePool = { connect: async () => failingClient };

  const scope = { isGlobal: true, orgCodes: [] };
  await assert.rejects(() =>
    updateMember(fakePool, { scope, id: created.member_id, patch: { job_title: 'Should Never Apply' }, actorUserId: TEST_ACTOR_ID })
  );

  const reFetched = await getMemberById(pool, { scope, id: created.member_id });
  assert.equal(reFetched.job_title, 'Original Title'); // unchanged — rolled back together with the audit insert
  assert.equal(await auditCountFor(created.member_id), 1); // only the original CREATE's audit row remains
});
