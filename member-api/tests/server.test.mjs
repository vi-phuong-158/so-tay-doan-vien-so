import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createMemberManagementAuthorizer } from '../src/memberScope.js';

const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

// Fast, deterministic "unreachable database": a closed local port refuses the connection
// immediately (unlike an unresolvable hostname, which can hang on DNS).
const UNREACHABLE_DATABASE_URL = 'postgresql://127.0.0.1:1/nope';

function listenEphemeral(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

test('GET /healthz returns 200 without depending on the database', async () => {
  const pool = createPool(UNREACHABLE_DATABASE_URL);
  const server = createServer(pool);
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('GET /readyz returns 200 when the database is reachable', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool);
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /readyz fails closed with a bounded 503 (no internals leaked) when the database is unavailable', async () => {
  const pool = createPool(UNREACHABLE_DATABASE_URL);
  const server = createServer(pool);
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.equal(res.status, 503);
    // Exact-shape assertion: any leaked connection string, hostname, or stack trace would fail this.
    assert.deepEqual(await res.json(), { status: 'error', reason: 'database_unavailable' });
  } finally {
    server.close();
  }
});

// P5.5-02 note: /v1/members used to always return 501 regardless of any Authorization header
// (P5.5-01 placeholder, before the authorization bridge existed). It now enforces authorization
// FIRST — unauthenticated/unauthorized requests get 401/403, exactly like /v1/member-scope — and
// only falls through to 501 once a request is authenticated AND authorized, because Member CRUD/list
// itself is still not implemented until P5.5-03. See authorization boundary tests below for the full
// matrix; this section only re-covers "never returns member-shaped data" for the authorized case.
//
// server.js always calls the injected authorizeMemberManagement(header) — that function itself is
// responsible for deciding "no token -> 401" without a network call. So these tests use the REAL
// createMemberManagementAuthorizer wired to a fetch stub that throws if ever invoked, to prove the
// resolver network call is skipped entirely when there is no usable Authorization header.
function authorizerWithUncalledFetch() {
  return createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 'unused' }, async () => {
    throw new Error('the resolver must not be called when there is no usable Authorization header');
  });
}

test('GET /v1/members with no Authorization header denies (401) without ever calling the resolver', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool, { authorizeMemberManagement: authorizerWithUncalledFetch() });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/members`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'unauthenticated');
    assert.ok(!('data' in body) && !('members' in body));
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/members with a malformed Authorization header denies (401) without ever calling the resolver', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool, { authorizeMemberManagement: authorizerWithUncalledFetch() });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/members`, { headers: { Authorization: 'not-a-bearer-token' } });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/members denies (403) when the resolver says the caller has no Member Management role', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool, {
    authorizeMemberManagement: async () => ({ authorized: false, status: 403, body: { error: 'forbidden' } }),
  });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/members`, { headers: { Authorization: 'Bearer some-token' } });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'forbidden');
    assert.ok(!('data' in body) && !('members' in body));
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/members with a valid authorized assertion still returns 501, never member data (P5.5-03 not implemented yet)', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool, {
    authorizeMemberManagement: async () => ({
      authorized: true,
      userId: 'user-1',
      roles: [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }],
    }),
  });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/members`, { headers: { Authorization: 'Bearer some-token' } });
    assert.equal(res.status, 501);
    const body = await res.json();
    assert.equal(body.error, 'not_implemented');
    assert.ok(!('data' in body) && !('members' in body));
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/members ignores client-supplied X-Role/X-Organization headers entirely (server-side authorization only)', async () => {
  const pool = createPool(databaseUrl);
  // The stub always denies — proving the spoofed headers below have no effect on the outcome,
  // because authorizeMemberManagement never receives them (only the Authorization header is passed).
  const server = createServer(pool, {
    authorizeMemberManagement: async () => ({ authorized: false, status: 403, body: { error: 'forbidden' } }),
  });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/members`, {
      headers: {
        Authorization: 'Bearer some-token',
        'X-Role': 'SYSTEM_ADMIN',
        'X-Organization': 'CDA',
      },
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/member-scope denies (401) with no Authorization header', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool, { authorizeMemberManagement: authorizerWithUncalledFetch() });
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/member-scope`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
    await pool.end();
  }
});

test('GET /v1/member-scope denies (403) when unauthorized, and returns 200 with the resolved scope when authorized', async () => {
  const pool = createPool(databaseUrl);
  const deniedServer = createServer(pool, {
    authorizeMemberManagement: async () => ({ authorized: false, status: 403, body: { error: 'forbidden' } }),
  });
  const deniedPort = await listenEphemeral(deniedServer);
  try {
    const res = await fetch(`http://127.0.0.1:${deniedPort}/v1/member-scope`, { headers: { Authorization: 'Bearer x' } });
    assert.equal(res.status, 403);
  } finally {
    deniedServer.close();
  }

  const roles = [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CDA'] }];
  const allowedServer = createServer(pool, {
    authorizeMemberManagement: async () => ({ authorized: true, userId: 'user-1', roles }),
  });
  const allowedPort = await listenEphemeral(allowedServer);
  try {
    const res = await fetch(`http://127.0.0.1:${allowedPort}/v1/member-scope`, { headers: { Authorization: 'Bearer x' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user_id: 'user-1', roles });
  } finally {
    allowedServer.close();
    await pool.end();
  }
});

test('unknown route returns 404', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool);
  const port = await listenEphemeral(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await pool.end();
  }
});

test('loadConfig fails closed (throws) when MEMBER_DATABASE_URL is missing — no insecure default', () => {
  assert.throws(() => loadConfig({}), /MEMBER_DATABASE_URL is required/);
});

test('loadConfig throws on an invalid PORT rather than silently accepting it', () => {
  assert.throws(() => loadConfig({ MEMBER_DATABASE_URL: 'postgresql://x', PORT: 'not-a-number' }));
});

test('loadConfig fails closed (throws) when MEMBER_SCOPE_RESOLVER_URL is missing — no "authorization disabled" fallback', () => {
  assert.throws(
    () => loadConfig({ MEMBER_DATABASE_URL: 'postgresql://x', MEMBER_SCOPE_RESOLVER_SECRET: 's' }),
    /MEMBER_SCOPE_RESOLVER_URL is required/
  );
});

test('loadConfig fails closed (throws) when MEMBER_SCOPE_RESOLVER_SECRET is missing', () => {
  assert.throws(
    () => loadConfig({ MEMBER_DATABASE_URL: 'postgresql://x', MEMBER_SCOPE_RESOLVER_URL: 'http://x' }),
    /MEMBER_SCOPE_RESOLVER_SECRET is required/
  );
});

test('loadConfig accepts a valid minimal config and defaults PORT to 8080', () => {
  const config = loadConfig({
    MEMBER_DATABASE_URL: 'postgresql://x',
    MEMBER_SCOPE_RESOLVER_URL: 'http://127.0.0.1:54321/functions/v1/resolve-member-scope',
    MEMBER_SCOPE_RESOLVER_SECRET: 'test-secret',
  });
  assert.equal(config.databaseUrl, 'postgresql://x');
  assert.equal(config.port, 8080);
  assert.equal(config.memberScopeResolverUrl, 'http://127.0.0.1:54321/functions/v1/resolve-member-scope');
  assert.equal(config.memberScopeResolverSecret, 'test-secret');
});
