import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const FUNCTION_URL = 'http://127.0.0.1:54321/functions/v1/admin-users';

const USER_IDS: Record<string, string> = {
  'suspended@test.local': '99999999-9999-9999-9999-999999999999',
  'youthadmina@test.local': '11112222-3333-4444-5555-666677778888',
  'youthadmin@test.local': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'sysadmin@test.local': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

async function signIn(email: string): Promise<string> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email
  });

  if (linkError || !linkData?.properties?.email_otp) {
    throw new Error(`generateLink failed for ${email}: ` + JSON.stringify(linkError));
  }

  const { data: otpData, error: otpError } = await userClient.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'magiclink'
  });

  if (otpError || !otpData?.session?.access_token) {
    throw new Error(`verifyOtp failed for ${email}: ` + JSON.stringify(otpError));
  }

  return otpData.session.access_token;
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
