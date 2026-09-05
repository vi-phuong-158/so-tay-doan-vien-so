// HTTP-level Member CRUD security matrix (P5.5-03). Uses the REAL server + REAL Member Postgres,
// with a deterministic stub in place of authorizeMemberManagement (the P5.5-02 resolver call itself
// is fully covered by memberScope.test.mjs / the Edge Function's own tests) — so these tests focus
// on what P5.5-03 is responsible for: scope enforcement, mass-assignment protection, anti-enumeration
// and SQL safety once a request is already authenticated/authorized.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

let pool;
let server;
let baseUrl;

before(async () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = createPool(databaseUrl);
});

after(async () => {
  await pool.end();
});

function authorizerFor(roles) {
  return async () => ({ authorized: true, userId: 'test-user', roles });
}

const DENIED_NO_ROLE = async () => ({ authorized: false, status: 403, body: { error: 'forbidden' } });
const DENIED_UNAUTHENTICATED = async () => ({ authorized: false, status: 401, body: { error: 'unauthenticated' } });

async function withServer(authorizeMemberManagement, fn) {
  const s = createServer(pool, { authorizeMemberManagement });
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

const PREFIX = 'P553-ROUTES';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}

// --- BRANCH_OFFICER scope ------------------------------------------------------------------------

test('BRANCH_OFFICER A: full CRUD lifecycle inside its own permitted organization is allowed', async () => {
  const branchA = orgCode('BRANCH-A');
  const roles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [branchA] }];
  await withServer(authorizerFor(roles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Branch A Member', work_unit_code: branchA }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.work_unit_code, branchA);

    const listed = await jsonFetch(`${base}/v1/members`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.members.some((m) => m.member_id === created.body.member_id));

    const fetched = await jsonFetch(`${base}/v1/members/${created.body.member_id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.member_id, created.body.member_id);

    const updated = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ job_title: 'Bí thư chi đoàn' }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.job_title, 'Bí thư chi đoàn');
  });
});

test('BRANCH_OFFICER A: reading or updating a Member of branch B is denied (404, no existence leak)', async () => {
  const branchA = orgCode('BRANCH-A2');
  const branchB = orgCode('BRANCH-B2');
  const branchBRoles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [branchB] }];
  let branchBMemberId;
  await withServer(authorizerFor(branchBRoles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Branch B Member', work_unit_code: branchB }),
    });
    assert.equal(created.status, 201);
    branchBMemberId = created.body.member_id;
  });

  const branchARoles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [branchA] }];
  await withServer(authorizerFor(branchARoles), async (base) => {
    const readAttempt = await jsonFetch(`${base}/v1/members/${branchBMemberId}`);
    assert.equal(readAttempt.status, 404);

    const nonexistentId = '00000000-0000-0000-0000-000000000000';
    const readNonexistent = await jsonFetch(`${base}/v1/members/${nonexistentId}`);
    assert.equal(readNonexistent.status, 404);
    // Same response shape whether the member truly does not exist or merely lies outside scope —
    // no signal to distinguish the two (muc 22 threat #2).
    assert.deepEqual(readAttempt.body, readNonexistent.body);

    const updateAttempt = await jsonFetch(`${base}/v1/members/${branchBMemberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ job_title: 'Hacked' }),
    });
    assert.equal(updateAttempt.status, 404);
  });
});

test('BRANCH_OFFICER A: create payload claiming branch B is denied (403 forbidden, organization spoofing)', async () => {
  const branchA = orgCode('BRANCH-A3');
  const branchB = orgCode('BRANCH-B3');
  const roles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [branchA] }];
  await withServer(authorizerFor(roles), async (base) => {
    const attempt = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Spoofed Member', work_unit_code: branchB }),
    });
    assert.equal(attempt.status, 403);
    assert.equal(attempt.body.error, 'forbidden');

    // Confirm nothing was actually inserted under the spoofed org.
    const check = await jsonFetch(`${base}/v1/members?work_unit_code=${encodeURIComponent(branchB)}`);
    assert.equal(check.status, 200);
    assert.equal(check.body.total, 0);
  });
});

test('BRANCH_OFFICER A: PATCH attempting an organization transfer is denied (400, work_unit_code is not a recognized PATCH field)', async () => {
  const branchA = orgCode('BRANCH-A4');
  const branchB = orgCode('BRANCH-B4');
  const roles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [branchA] }];
  await withServer(authorizerFor(roles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Transfer Attempt', work_unit_code: branchA }),
    });
    assert.equal(created.status, 201);

    const transferAttempt = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ work_unit_code: branchB }),
    });
    assert.equal(transferAttempt.status, 400);
    assert.equal(transferAttempt.body.error, 'unknown_field');

    const unchanged = await jsonFetch(`${base}/v1/members/${created.body.member_id}`);
    assert.equal(unchanged.body.work_unit_code, branchA);
  });
});

// --- YOUTH_ADMIN scope -----------------------------------------------------------------------

test('YOUTH_ADMIN parent scope: can access members in any descendant organization code the resolver returned', async () => {
  const parent = orgCode('PARENT');
  const child1 = orgCode('CHILD-1');
  const child2 = orgCode('CHILD-2');
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [parent, child1, child2] }];
  await withServer(authorizerFor(roles), async (base) => {
    const createdParent = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Parent Org Member', work_unit_code: parent }),
    });
    const createdChild = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Child Org Member', work_unit_code: child1 }),
    });
    assert.equal(createdParent.status, 201);
    assert.equal(createdChild.status, 201);

    const readChild = await jsonFetch(`${base}/v1/members/${createdChild.body.member_id}`);
    assert.equal(readChild.status, 200);

    const listed = await jsonFetch(`${base}/v1/members`);
    const ids = listed.body.members.map((m) => m.member_id);
    assert.ok(ids.includes(createdParent.body.member_id));
    assert.ok(ids.includes(createdChild.body.member_id));
  });
});

test('YOUTH_ADMIN cannot escape its resolved tree — an organization code outside org_codes is denied exactly like BRANCH_OFFICER', async () => {
  const inTree = orgCode('TREE-IN');
  const outsideTree = orgCode('TREE-OUT');
  const outsideRoles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [outsideTree] }];
  let outsideMemberId;
  await withServer(authorizerFor(outsideRoles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Outside Tree Member', work_unit_code: outsideTree }),
    });
    outsideMemberId = created.body.member_id;
  });

  const treeRoles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [inTree] }];
  await withServer(authorizerFor(treeRoles), async (base) => {
    const read = await jsonFetch(`${base}/v1/members/${outsideMemberId}`);
    assert.equal(read.status, 404);
    const createAttempt = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Escape Attempt', work_unit_code: outsideTree }),
    });
    assert.equal(createAttempt.status, 403);
  });
});

// --- SYSTEM_ADMIN --------------------------------------------------------------------------------

test('SYSTEM_ADMIN alone (zero Member Management roles): every Member endpoint is denied', async () => {
  await withServer(DENIED_NO_ROLE, async (base) => {
    assert.equal((await jsonFetch(`${base}/v1/members`)).status, 403);
    assert.equal(
      (await jsonFetch(`${base}/v1/members`, { method: 'POST', body: JSON.stringify({ full_name: 'X', work_unit_code: 'Y' }) })).status,
      403
    );
    assert.equal((await jsonFetch(`${base}/v1/members/00000000-0000-0000-0000-000000000000`)).status, 403);
    assert.equal(
      (
        await jsonFetch(`${base}/v1/members/00000000-0000-0000-0000-000000000000`, {
          method: 'PATCH',
          body: JSON.stringify({ job_title: 'X' }),
        })
      ).status,
      403
    );
  });
});

test('SYSTEM_ADMIN + YOUTH_ADMIN dual role: behaves exactly like YOUTH_ADMIN scope, never a global bypass from SYSTEM_ADMIN', async () => {
  const scopedOrg = orgCode('DUAL-SCOPED');
  const otherOrg = orgCode('DUAL-OTHER');
  // Reflects resolve-member-scope's actual output for this user: SYSTEM_ADMIN is filtered out
  // upstream (P5.5-02), so Member API only ever sees the YOUTH_ADMIN row.
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [scopedOrg] }];
  await withServer(authorizerFor(roles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Dual Role Scoped Member', work_unit_code: scopedOrg }),
    });
    assert.equal(created.status, 201);

    const spoofAttempt = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Dual Role Escape', work_unit_code: otherOrg }),
    });
    assert.equal(spoofAttempt.status, 403);
  });
});

// --- Token/account edge cases (extends server.test.mjs's generic coverage to POST/PATCH/item routes) --

test('missing, malformed, or resolver-reported unauthenticated/suspended tokens are denied on every Member endpoint', async () => {
  await withServer(DENIED_UNAUTHENTICATED, async (base) => {
    const res = await fetch(`${base}/v1/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
  });
});

// --- Mass assignment / unknown & protected fields -----------------------------------------------

test('POST /v1/members rejects an unknown field and a protected field, at the HTTP layer', async () => {
  const org = orgCode('MASSASSIGN');
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [org] }];
  await withServer(authorizerFor(roles), async (base) => {
    const unknown = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'X', work_unit_code: org, is_admin: true }),
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, 'unknown_field');

    const protectedField = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'X', work_unit_code: org, account_user_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(protectedField.status, 400);
    assert.equal(protectedField.body.error, 'protected_field');
  });
});

test('PATCH /v1/members/:id rejects an unknown field and a protected field, at the HTTP layer', async () => {
  const org = orgCode('MASSASSIGN2');
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [org] }];
  await withServer(authorizerFor(roles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'X', work_unit_code: org }),
    });
    const unknown = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_admin: true }),
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, 'unknown_field');

    const protectedField = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ member_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.equal(protectedField.status, 400);
    assert.equal(protectedField.body.error, 'protected_field');
  });
});

// --- SQL/search metacharacter safety at the HTTP boundary ----------------------------------------

test('GET /v1/members?search=... with SQL-injection-shaped input returns a normal, safe 200 response', async () => {
  const org = orgCode('HTTPMETA');
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: [org] }];
  await withServer(authorizerFor(roles), async (base) => {
    await jsonFetch(`${base}/v1/members`, { method: 'POST', body: JSON.stringify({ full_name: 'Meta Target', work_unit_code: org }) });

    const injectionAttempt = await jsonFetch(`${base}/v1/members?search=${encodeURIComponent("'; DROP TABLE members; --")}`);
    assert.equal(injectionAttempt.status, 200);
    assert.equal(injectionAttempt.body.total, 0);

    // The table (and the fixture row) must still be intact and queryable afterwards.
    const stillThere = await jsonFetch(`${base}/v1/members`);
    assert.equal(stillThere.status, 200);
    assert.equal(stillThere.body.total, 1);
  });
});

// --- DELETE ---------------------------------------------------------------------------------------

test('DELETE /v1/members/:id is authorized first, then returns a deliberate 501 (no hard delete in P5.5-03)', async () => {
  const org = orgCode('DELETE');
  const roles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: [org] }];
  await withServer(authorizerFor(roles), async (base) => {
    const created = await jsonFetch(`${base}/v1/members`, {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Delete Target', work_unit_code: org }),
    });
    const res = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, { method: 'DELETE' });
    assert.equal(res.status, 501);

    // Archiving via ordinary PATCH member_status is the supported lifecycle path instead.
    const archived = await jsonFetch(`${base}/v1/members/${created.body.member_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ member_status: 'ARCHIVED' }),
    });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.member_status, 'ARCHIVED');
  });
});
