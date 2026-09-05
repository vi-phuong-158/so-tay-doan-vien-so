import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ApiError } from '../src/errors.js';
import { createOrganizationDirectory, loadOrganizationDirectoryConfig } from '../src/organizationDirectory.js';

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

test('loadOrganizationDirectoryConfig: fails closed when SUPABASE_URL is missing', () => {
  assert.throws(() => loadOrganizationDirectoryConfig({ SUPABASE_ANON_KEY: 'k' }), /SUPABASE_URL is required/);
});

test('loadOrganizationDirectoryConfig: fails closed when SUPABASE_ANON_KEY is missing', () => {
  assert.throws(() => loadOrganizationDirectoryConfig({ SUPABASE_URL: 'http://x' }), /SUPABASE_ANON_KEY is required/);
});

test('loadOrganizationDirectoryConfig: accepts a valid config', () => {
  const config = loadOrganizationDirectoryConfig({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'k' });
  assert.deepEqual(config, { supabaseUrl: 'http://x', supabaseAnonKey: 'k' });
});

test('organizationCodeExists: sends a GET request with the anon apikey and the caller\'s own bearer token, never a write', async () => {
  let received;
  const server = http.createServer((req, res) => {
    received = { method: req.method, url: req.url, headers: req.headers };
    sendJson(res, 200, [{ code: 'CDA' }]);
  });
  const port = await listenEphemeral(server);
  try {
    const check = createOrganizationDirectory({ supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'anon-key-123' });
    const result = await check('CDA', 'user-jwt-abc');
    assert.equal(result, true);
    assert.equal(received.method, 'GET');
    assert.match(received.url, /^\/rest\/v1\/organizations\?select=code&code=eq\.CDA&limit=1$/);
    assert.equal(received.headers.apikey, 'anon-key-123');
    assert.equal(received.headers.authorization, 'Bearer user-jwt-abc');
  } finally {
    server.close();
  }
});

test('organizationCodeExists: returns false for a well-formed but empty result (organization does not exist)', async () => {
  const server = http.createServer((req, res) => sendJson(res, 200, []));
  const port = await listenEphemeral(server);
  try {
    const check = createOrganizationDirectory({ supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'k' });
    assert.equal(await check('NOPE', 'token'), false);
  } finally {
    server.close();
  }
});

test('organizationCodeExists: URL-encodes the code, so a code containing query-string metacharacters cannot alter the request', async () => {
  let received;
  const server = http.createServer((req, res) => {
    received = req.url;
    sendJson(res, 200, []);
  });
  const port = await listenEphemeral(server);
  try {
    const check = createOrganizationDirectory({ supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'k' });
    await check('CDA&select=*', 'token');
    // The injected "&select=*" must appear as a literal, percent-encoded part of the `code=eq.`
    // value, never as a second top-level query parameter.
    assert.ok(received.startsWith('/rest/v1/organizations?select=code&code=eq.CDA%26select%3D'));
  } finally {
    server.close();
  }
});

test('organizationCodeExists: a non-2xx response from Supabase is a 503 ApiError, never treated as "does not exist" or "exists"', async () => {
  const server = http.createServer((req, res) => sendJson(res, 500, { message: 'internal error detail' }));
  const port = await listenEphemeral(server);
  try {
    const check = createOrganizationDirectory({ supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'k' });
    await assert.rejects(
      () => check('CDA', 'token'),
      (err) => err instanceof ApiError && err.status === 503 && err.code === 'organization_directory_unavailable'
    );
  } finally {
    server.close();
  }
});

test('organizationCodeExists: a malformed (non-JSON) response body is a 503 ApiError, not a crash', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('not json');
  });
  const port = await listenEphemeral(server);
  try {
    const check = createOrganizationDirectory({ supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'k' });
    await assert.rejects(
      () => check('CDA', 'token'),
      (err) => err instanceof ApiError && err.status === 503
    );
  } finally {
    server.close();
  }
});

test('organizationCodeExists: an unreachable Supabase host is a 503 ApiError, never a fallback "assume valid"', async () => {
  const check = createOrganizationDirectory({ supabaseUrl: 'http://127.0.0.1:1', supabaseAnonKey: 'k' });
  await assert.rejects(
    () => check('CDA', 'token'),
    (err) => err instanceof ApiError && err.status === 503
  );
});
