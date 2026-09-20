import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.1';

function getRequiredEnv(key: string, fallbackKey?: string): string {
  const val = Deno.env.get(key) || (fallbackKey ? Deno.env.get(fallbackKey) : undefined);
  if (!val) {
    const missing = fallbackKey ? `${key} or ${fallbackKey}` : key;
    throw new Error(`CONFIGURATION_ERROR: Missing required environment variable: ${missing}`);
  }
  return val;
}

export function clients(request: Request): { userClient: SupabaseClient; adminClient: SupabaseClient } {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY');

  const authorization = request.headers.get('Authorization') || '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  (userClient as any)._authorization = authorization;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userClient, adminClient };
}

type PublicFirstAuthorization = 'GUEST' | 'USER_TOKEN';

function configuredPublicApiKeys(): string[] {
  const keys = new Set<string>();
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const singlePublishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (legacyAnonKey) keys.add(legacyAnonKey);
  if (singlePublishableKey) keys.add(singlePublishableKey);

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys);
      if (parsed && typeof parsed === 'object') {
        for (const value of Object.values(parsed)) {
          if (typeof value === 'string') keys.add(value);
        }
      }
    } catch {
      throw new Error('CONFIGURATION_ERROR');
    }
  }

  if (keys.size === 0) throw new Error('CONFIGURATION_ERROR');
  return [...keys];
}

export function classifyPublicFirstAuthorization(
  authorization: string | null,
  apiKey: string | null,
  acceptedApiKeys: string[],
): PublicFirstAuthorization {
  if (!apiKey || !acceptedApiKeys.includes(apiKey)) throw new Error('INVALID_API_KEY');
  if (!authorization) return 'GUEST';

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('UNAUTHENTICATED');
  if (match[1] === apiKey) return 'GUEST';
  return 'USER_TOKEN';
}

// Public functions run with platform JWT verification disabled so modern publishable keys can
// reach them. A request therefore has to prove it comes through a configured public application
// key. Any bearer other than that key is treated as a user credential and must validate with Auth;
// an invalid, expired, or forged bearer can never downgrade itself to the guest path.
export async function optionalPublicFirstUser(request: Request, userClient: SupabaseClient): Promise<User | null> {
  const authKind = classifyPublicFirstAuthorization(
    request.headers.get('Authorization'),
    request.headers.get('apikey'),
    configuredPublicApiKeys(),
  );
  return authKind === 'GUEST' ? null : requireUser(userClient);
}

export async function requireUser(userClient: SupabaseClient): Promise<User> {
  const authHeader = (userClient as any)._authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const { data, error } = await (token ? userClient.auth.getUser(token) : userClient.auth.getUser());

  if (error || !data?.user) {
    throw new Error('UNAUTHENTICATED');
  }

  return data.user;
}

export async function requireGlobalRole(adminClient: SupabaseClient, userId: string, roles: string[]) {
  // 1. Check if profile exists and is ACTIVE
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('account_status')
    .eq('id', userId)
    .single();
    
  if (profileError) throw profileError;
  if (!profile || profile.account_status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED: Account inactive or missing profile');
  }

  // 2. Check roles globally (any scope or specific role)
  const { data: userRoles, error: rolesError } = await adminClient
    .from('user_roles')
    .select('role_code')
    .eq('user_id', userId)
    .in('role_code', roles);

  if (rolesError) throw rolesError;
  if (!userRoles || userRoles.length === 0) throw new Error('FORBIDDEN');
}

export const requireAnyRole = requireGlobalRole;

export async function requireScopedRole(adminClient: SupabaseClient, userId: string, roles: string[], targetOrgId: string) {
  if (!targetOrgId) throw new Error('BAD_REQUEST');

  // 1. Check if profile exists and is ACTIVE
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('account_status')
    .eq('id', userId)
    .single();
    
  if (profileError) throw profileError;
  if (!profile || profile.account_status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED: Account inactive or missing profile');
  }

  // 2. Check roles
  const { data: userRoles, error: rolesError } = await adminClient
    .from('user_roles')
    .select('role_code, scope_organization_id')
    .eq('user_id', userId)
    .in('role_code', [...roles, 'SYSTEM_ADMIN']); // Include SYSTEM_ADMIN as they have global access

  if (rolesError) throw rolesError;
  if (!userRoles || userRoles.length === 0) throw new Error('FORBIDDEN');

  // 3. Verify scope
  for (const role of userRoles) {
    if (role.role_code === 'SYSTEM_ADMIN' || role.scope_organization_id === null) return; // Has global scope
    if (role.scope_organization_id === targetOrgId) return; // Exact match

    // Check recursive scope
    const { data: inScope } = await adminClient.rpc('is_organization_in_scope', {
      scope_org_id: role.scope_organization_id,
      target_org_id: targetOrgId
    });

    if (inScope) return;
  }

  throw new Error('FORBIDDEN');
}

