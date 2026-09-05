import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  MemberScopeError,
  createMemberManagementAuthorizer,
  deriveMemberManagementAuthorization,
  extractBearerToken,
  loadResolverConfig,
  resolveMemberScope,
} from '../src/memberScope.js';

function listenEphemeral(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

test('extractBearerToken: parses "Bearer <token>" case-insensitively', () => {
  assert.equal(extractBearerToken('Bearer abc123'), 'abc123');
  assert.equal(extractBearerToken('bearer abc123'), 'abc123');
});

test('extractBearerToken: returns null for missing, malformed, or non-Bearer headers', () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken('abc123'), null);
  assert.equal(extractBearerToken('Basic abc123'), null);
});

test('loadResolverConfig: fails closed when MEMBER_SCOPE_RESOLVER_URL is missing', () => {
  assert.throws(() => loadResolverConfig({ MEMBER_SCOPE_RESOLVER_SECRET: 's' }), /MEMBER_SCOPE_RESOLVER_URL is required/);
});

test('loadResolverConfig: fails closed when MEMBER_SCOPE_RESOLVER_SECRET is missing', () => {
  assert.throws(() => loadResolverConfig({ MEMBER_SCOPE_RESOLVER_URL: 'http://x' }), /MEMBER_SCOPE_RESOLVER_SECRET is required/);
});

test('loadResolverConfig: accepts a valid config', () => {
  const config = loadResolverConfig({ MEMBER_SCOPE_RESOLVER_URL: 'http://x', MEMBER_SCOPE_RESOLVER_SECRET: 's' });
  assert.deepEqual(config, { resolverUrl: 'http://x', resolverSecret: 's' });
});

test('deriveMemberManagementAuthorization: empty/missing roles denies', () => {
  assert.deepEqual(deriveMemberManagementAuthorization({ roles: [] }), { authorized: false });
  assert.deepEqual(deriveMemberManagementAuthorization({}), { authorized: false });
  assert.deepEqual(deriveMemberManagementAuthorization(null), { authorized: false });
});

test('deriveMemberManagementAuthorization: filters out roles with an unexpected role_code', () => {
  const scope = { roles: [{ role_code: 'SYSTEM_ADMIN', is_global: true, org_codes: [] }, { role_code: 'MEMBER', is_global: false, org_codes: [] }] };
  assert.deepEqual(deriveMemberManagementAuthorization(scope), { authorized: false });
});

test('deriveMemberManagementAuthorization: rejects malformed role shapes (missing/wrong-typed fields) instead of crashing', () => {
  const scope = {
    roles: [
      { role_code: 'YOUTH_ADMIN' }, // missing is_global/org_codes
      { role_code: 'YOUTH_ADMIN', is_global: 'yes', org_codes: [] }, // is_global not boolean
      { role_code: 'YOUTH_ADMIN', is_global: true, org_codes: 'CDA' }, // org_codes not an array
      null,
    ],
  };
  assert.deepEqual(deriveMemberManagementAuthorization(scope), { authorized: false });
});

test('deriveMemberManagementAuthorization: accepts a well-formed YOUTH_ADMIN/BRANCH_OFFICER role', () => {
  const role = { role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] };
  assert.deepEqual(deriveMemberManagementAuthorization({ roles: [role] }), { authorized: true, roles: [role] });
});

test('resolveMemberScope: throws missing_authorization when no token is given', async () => {
  await assert.rejects(
    () => resolveMemberScope(null, { resolverUrl: 'http://unused', resolverSecret: 's' }),
    (err) => err instanceof MemberScopeError && err.reason === 'missing_authorization'
  );
});

test('resolveMemberScope: sends the bearer token and shared secret, returns the parsed body on 200', async () => {
  let receivedHeaders;
  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    sendJson(res, 200, { user_id: 'user-1', account_status: 'ACTIVE', roles: [] });
  });
  const port = await listenEphemeral(server);
  try {
    const body = await resolveMemberScope('token-abc', {
      resolverUrl: `http://127.0.0.1:${port}`,
      resolverSecret: 'shared-secret',
    });
    assert.equal(receivedHeaders.authorization, 'Bearer token-abc');
    assert.equal(receivedHeaders['x-member-api-secret'], 'shared-secret');
    assert.deepEqual(body, { user_id: 'user-1', account_status: 'ACTIVE', roles: [] });
  } finally {
    server.close();
  }
});

test('resolveMemberScope: a 401 from the resolver maps to reason "unauthenticated"', async () => {
  const server = http.createServer((req, res) => sendJson(res, 401, { error: 'UNAUTHENTICATED' }));
  const port = await listenEphemeral(server);
  try {
    await assert.rejects(
      () => resolveMemberScope('token', { resolverUrl: `http://127.0.0.1:${port}`, resolverSecret: 's' }),
      (err) => err instanceof MemberScopeError && err.reason === 'unauthenticated'
    );
  } finally {
    server.close();
  }
});

test('resolveMemberScope: a 403 from the resolver maps to reason "resolver_error" (not unauthenticated)', async () => {
  const server = http.createServer((req, res) => sendJson(res, 403, { error: 'FORBIDDEN' }));
  const port = await listenEphemeral(server);
  try {
    await assert.rejects(
      () => resolveMemberScope('token', { resolverUrl: `http://127.0.0.1:${port}`, resolverSecret: 's' }),
      (err) => err instanceof MemberScopeError && err.reason === 'resolver_error'
    );
  } finally {
    server.close();
  }
});

test('resolveMemberScope: malformed JSON body maps to reason "resolver_malformed_response"', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('not json');
  });
  const port = await listenEphemeral(server);
  try {
    await assert.rejects(
      () => resolveMemberScope('token', { resolverUrl: `http://127.0.0.1:${port}`, resolverSecret: 's' }),
      (err) => err instanceof MemberScopeError && err.reason === 'resolver_malformed_response'
    );
  } finally {
    server.close();
  }
});

test('resolveMemberScope: a well-formed 200 body missing required fields maps to reason "resolver_malformed_response"', async () => {
  const server = http.createServer((req, res) => sendJson(res, 200, { ok: true }));
  const port = await listenEphemeral(server);
  try {
    await assert.rejects(
      () => resolveMemberScope('token', { resolverUrl: `http://127.0.0.1:${port}`, resolverSecret: 's' }),
      (err) => err instanceof MemberScopeError && err.reason === 'resolver_malformed_response'
    );
  } finally {
    server.close();
  }
});

test('resolveMemberScope: network failure (unreachable resolver) maps to reason "resolver_unreachable"', async () => {
  await assert.rejects(
    () => resolveMemberScope('token', { resolverUrl: 'http://127.0.0.1:1/nope', resolverSecret: 's' }),
    (err) => err instanceof MemberScopeError && err.reason === 'resolver_unreachable'
  );
});

test('createMemberManagementAuthorizer: denies (401) with no Authorization header, never calling fetch', async () => {
  const authorize = createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 's' }, async () => {
    throw new Error('fetch must not be called');
  });
  const result = await authorize(undefined);
  assert.deepEqual(result, { authorized: false, status: 401, body: { error: 'unauthenticated', reason: 'missing_authorization' } });
});

test('createMemberManagementAuthorizer: resolver unauthenticated -> 401', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({}), { status: 401 });
  const authorize = createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 's' }, fetchImpl);
  const result = await authorize('Bearer token');
  assert.deepEqual(result, { authorized: false, status: 401, body: { error: 'unauthenticated' } });
});

test('createMemberManagementAuthorizer: resolver unreachable fails closed with 403, not a crash or a 5xx retry signal', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const authorize = createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 's' }, fetchImpl);
  const result = await authorize('Bearer token');
  assert.deepEqual(result, { authorized: false, status: 403, body: { error: 'forbidden' } });
});

test('createMemberManagementAuthorizer: authenticated but zero Member Management roles -> 403', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ user_id: 'user-1', account_status: 'ACTIVE', roles: [] }), { status: 200 });
  const authorize = createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 's' }, fetchImpl);
  const result = await authorize('Bearer token');
  assert.deepEqual(result, { authorized: false, status: 403, body: { error: 'forbidden' } });
});

test('createMemberManagementAuthorizer: authorized case returns userId and roles, unmodified', async () => {
  const roles = [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }];
  const fetchImpl = async () =>
    new Response(JSON.stringify({ user_id: 'user-1', account_status: 'ACTIVE', roles }), { status: 200 });
  const authorize = createMemberManagementAuthorizer({ resolverUrl: 'http://unused', resolverSecret: 's' }, fetchImpl);
  const result = await authorize('Bearer token');
  assert.deepEqual(result, { authorized: true, userId: 'user-1', roles });
});
