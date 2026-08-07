import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function clients(request: Request): { userClient: SupabaseClient; adminClient: SupabaseClient } {
  const authorization = request.headers.get('Authorization') || '';
  return {
    userClient: createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } }),
    adminClient: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function requireUser(userClient: SupabaseClient): Promise<User> {
  const { data, error } = await userClient.auth.getUser();
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
    
  if (profileError || !profile || profile.account_status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
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
    
  if (profileError || !profile || profile.account_status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
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

