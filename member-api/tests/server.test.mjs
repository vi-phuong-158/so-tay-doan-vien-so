import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';
import { loadConfig } from '../src/config.js';

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

test('GET /v1/members always denies (501) and never returns member-shaped data, with or without an auth header', async () => {
  const pool = createPool(databaseUrl);
  const server = createServer(pool);
  const port = await listenEphemeral(server);
  try {
    const withoutAuth = await fetch(`http://127.0.0.1:${port}/v1/members`);
    assert.equal(withoutAuth.status, 501);
    const withoutAuthBody = await withoutAuth.json();
    assert.equal(withoutAuthBody.error, 'not_implemented');
    assert.ok(!('data' in withoutAuthBody) && !('members' in withoutAuthBody));

    const withAuth = await fetch(`http://127.0.0.1:${port}/v1/members`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    assert.equal(withAuth.status, 501);
    const withAuthBody = await withAuth.json();
    assert.equal(withAuthBody.error, 'not_implemented');
    assert.ok(!('data' in withAuthBody) && !('members' in withAuthBody));
  } finally {
    server.close();
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

test('loadConfig accepts a valid minimal config and defaults PORT to 8080', () => {
  const config = loadConfig({ MEMBER_DATABASE_URL: 'postgresql://x' });
  assert.equal(config.databaseUrl, 'postgresql://x');
  assert.equal(config.port, 8080);
});
