import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

const FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/admin-users';

const USER_IDS: Record<string, string> = {
  'suspended@test.local': '99999999-9999-9999-9999-999999999999',
  'youthadmina@test.local': '11112222-3333-4444-5555-666677778888',
  'youthadmin@test.local': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'sysadmin@test.local': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

async function signIn(email: string): Promise<string> {
  const userId = USER_IDS[email];
  if (!userId) throw new Error(`Unknown test email: ${email}`);

  let jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!jwtSecret || jwtSecret === 'null' || jwtSecret === 'undefined') {
    jwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: userId,
    email: email,
    role: 'authenticated',
    iss: 'supabase',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}
  };

  const encoder = new TextEncoder();
  const b64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${b64Header}.${b64Payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsignedToken));
  const b64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsignedToken}.${b64Signature}`;
}

Deno.test('admin-users: malformed JWT is rejected (401)', async () => {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer malformed.jwt.token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', email: 'test@example.com', full_name: 'Test', organization_id: '11111111-1111-1111-1111-111111111111' })
  });

  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('admin-users: forged JWT signature attempting to claim SYSTEM_ADMIN sub is rejected (401)', async () => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Claiming to be SYSTEM_ADMIN
    email: 'sysadmin@test.local',
    role: 'authenticated'
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const forgedSignature = 'invalid_signature_attempting_forgery_1234567890';
  const forgedToken = `${header}.${payload}.${forgedSignature}`;

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${forgedToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', email: 'test@example.com', full_name: 'Test', organization_id: '11111111-1111-1111-1111-111111111111' })
  });

  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('admin-users: inactive accounts are blocked', async () => {
  const token = await signIn('suspended@test.local');

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'invite', email: 'test@example.com', full_name: 'Test', organization_id: '11111111-1111-1111-1111-111111111111' })
  });

  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('admin-users: Youth Admin out of scope is blocked', async () => {
  const token = await signIn('youthadmina@test.local'); // Org CĐA

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    // Trying to invite into Org CĐB
    body: JSON.stringify({ action: 'invite', email: 'test2@test.local', full_name: 'Test 2', organization_id: '33333333-3333-3333-3333-333333333333' })
  });

  assertEquals(res.status, 403);
  await res.text();
});

Deno.test('admin-users: Cannot self-suspend', async () => {
  const token = await signIn('youthadmin@test.local');

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_status', target_user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', status: 'SUSPENDED' })
  });

  assertEquals(res.status, 403);
  await res.text();
});

Deno.test('admin-users: Cannot modify any SYSTEM_ADMIN', async () => {
  const token = await signIn('youthadmin@test.local');

  // Trying to suspend default sysadmin
  const res1 = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_status', target_user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'SUSPENDED' })
  });
  assertEquals(res1.status, 403);
  await res1.text();

  // Trying to suspend second sysadmin (sysadmin2@test.local with a non-standard UUID in Org CĐA)
  const res2 = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_status', target_user_id: 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', status: 'SUSPENDED' })
  });
  assertEquals(res2.status, 403);
  await res2.text();
});

Deno.test('admin-users: assign/revoke role within scope works', async () => {
  const token = await signIn('youthadmin@test.local'); // Org TĐ (has scope over CĐA)

  // Assign role to Officer A in CĐA
  const resAssign = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'assign_role', target_user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', role_code: 'YOUTH_ADMIN', scope_organization_id: '22222222-2222-2222-2222-222222222222' })
  });

  assertEquals(resAssign.status, 200);
  await resAssign.text();

  // Revoke role
  const resRevoke = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revoke_role', target_user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', role_code: 'YOUTH_ADMIN', scope_organization_id: '22222222-2222-2222-2222-222222222222' })
  });

  assertEquals(resRevoke.status, 200);
  await resRevoke.text();
});
