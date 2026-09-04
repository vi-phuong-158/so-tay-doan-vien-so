import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { encode as base64url } from 'https://deno.land/std@0.177.0/encoding/base64url.ts';

const FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/resolve-member-scope';
// Matches supabase/functions/.env — a local/CI-only fixture, not a production secret.
const RESOLVER_SECRET = 'local-dev-only-member-scope-secret-not-for-production';

const USER_IDS: Record<string, string> = {
  'suspended@test.local': '99999999-9999-9999-9999-999999999999',
  'member@test.local': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'innovation@test.local': 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'sysadmin@test.local': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'sysadmin2@test.local': 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2',
  'youthadmin@test.local': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'youthadmina@test.local': '11112222-3333-4444-5555-666677778888',
  'officera@test.local': 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'officerb@test.local': 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'dualadmin@test.local': 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
};

async function signIn(email: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const userId = USER_IDS[email];
  if (!userId) throw new Error(`Unknown test email: ${email}`);

  let jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!jwtSecret || jwtSecret === 'null' || jwtSecret === 'undefined') {
    jwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'supabase',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: userId,
    email,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    role: 'authenticated',
    aal: 'aal1',
    is_anonymous: false,
    ...overrides,
  };

  const encoder = new TextEncoder();
  const b64Header = base64url(encoder.encode(JSON.stringify(header)));
  const b64Payload = base64url(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${b64Header}.${b64Payload}`;

  const key = await crypto.subtle.importKey('raw', encoder.encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsignedToken));
  const b64Signature = base64url(signature);

  return `${unsignedToken}.${b64Signature}`;
}

function call(token: string | null, secret: string | null, method = 'POST') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers['Authorization'] = `Bearer ${token}`;
  if (secret !== null) headers['x-member-api-secret'] = secret;
  return fetch(FUNCTION_URL, { method, headers, body: method === 'POST' ? '{}' : undefined });
}

function sortRoles(roles: Array<{ role_code: string; is_global: boolean; org_codes: string[] }>) {
  return roles
    .map((r) => ({ ...r, org_codes: [...r.org_codes].sort() }))
    .sort((a, b) => a.role_code.localeCompare(b.role_code));
}

Deno.test('resolve-member-scope: missing shared secret is rejected (403) even with a valid JWT', async () => {
  const token = await signIn('youthadmin@test.local');
  const res = await call(token, null);
  assertEquals(res.status, 403);
  await res.text();
});

Deno.test('resolve-member-scope: wrong shared secret is rejected (403)', async () => {
  const token = await signIn('youthadmin@test.local');
  const res = await call(token, 'wrong-secret');
  assertEquals(res.status, 403);
  await res.text();
});

Deno.test('resolve-member-scope: missing Authorization header is rejected (401)', async () => {
  const res = await call(null, RESOLVER_SECRET);
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('resolve-member-scope: malformed bearer token is rejected (401)', async () => {
  const res = await call('not-a-real-jwt', RESOLVER_SECRET);
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('resolve-member-scope: forged JWT signature is rejected (401)', async () => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, sub: USER_IDS['sysadmin@test.local'], role: 'authenticated' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const forgedToken = `${header}.${payload}.invalid_signature_attempting_forgery`;
  const res = await call(forgedToken, RESOLVER_SECRET);
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('resolve-member-scope: expired JWT is rejected (401)', async () => {
  const token = await signIn('youthadmin@test.local', { exp: Math.floor(Date.now() / 1000) - 3600 });
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('resolve-member-scope: suspended account is rejected (401) despite a valid, unexpired JWT', async () => {
  const token = await signIn('suspended@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('resolve-member-scope: GET is rejected (405)', async () => {
  const token = await signIn('youthadmin@test.local');
  const res = await call(token, RESOLVER_SECRET, 'GET');
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test('resolve-member-scope: MEMBER role resolves with zero Member Management roles', async () => {
  const token = await signIn('member@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.account_status, 'ACTIVE');
  assertEquals(body.roles, []);
});

Deno.test('resolve-member-scope: INNOVATION_MEMBER role resolves with zero Member Management roles', async () => {
  const token = await signIn('innovation@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.roles, []);
});

Deno.test('resolve-member-scope: a lone global SYSTEM_ADMIN resolves with ZERO Member Management roles', async () => {
  const token = await signIn('sysadmin@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.roles, []);
});

Deno.test('resolve-member-scope: a lone org-scoped SYSTEM_ADMIN resolves with ZERO Member Management roles', async () => {
  const token = await signIn('sysadmin2@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.roles, []);
});

Deno.test('resolve-member-scope: YOUTH_ADMIN scoped to the parent org sees itself and every descendant', async () => {
  const token = await signIn('youthadmin@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(sortRoles(body.roles), [
    { role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CĐA', 'CĐB', 'CĐC', 'TĐ'].sort() },
  ]);
});

Deno.test('resolve-member-scope: YOUTH_ADMIN scoped to a leaf org does not get a sibling org (cross-org spoof prevention)', async () => {
  const token = await signIn('youthadmina@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(sortRoles(body.roles), [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CĐA'] }]);
});

Deno.test('resolve-member-scope: BRANCH_OFFICER of org A does not get org B (cross-org spoof prevention)', async () => {
  const tokenA = await signIn('officera@test.local');
  const resA = await call(tokenA, RESOLVER_SECRET);
  assertEquals(resA.status, 200);
  const bodyA = await resA.json();
  assertEquals(sortRoles(bodyA.roles), [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CĐA'] }]);

  const tokenB = await signIn('officerb@test.local');
  const resB = await call(tokenB, RESOLVER_SECRET);
  assertEquals(resB.status, 200);
  const bodyB = await resB.json();
  assertEquals(sortRoles(bodyB.roles), [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CĐB'] }]);
});

Deno.test('resolve-member-scope: SYSTEM_ADMIN + YOUTH_ADMIN dual role resolves to exactly the YOUTH_ADMIN scope, never global', async () => {
  const token = await signIn('dualadmin@test.local');
  const res = await call(token, RESOLVER_SECRET);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(sortRoles(body.roles), [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CĐC'] }]);
});

Deno.test('resolve-member-scope: error responses never leak internals', async () => {
  const res = await call('garbage-token', RESOLVER_SECRET);
  const body = await res.json();
  const serialized = JSON.stringify(body);
  assertEquals(/service_role/i.test(serialized), false);
  assertEquals(/postgres/i.test(serialized), false);
  assertEquals(serialized.includes(RESOLVER_SECRET), false);
});
