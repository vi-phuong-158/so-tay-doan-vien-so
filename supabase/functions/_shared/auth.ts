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
  if (error || !data.user) throw new Error('UNAUTHENTICATED');
  return data.user;
}

export async function requireAnyRole(adminClient: SupabaseClient, userId: string, roles: string[], targetOrgId?: string) {
  // 1. Check if profile exists and is ACTIVE
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('account_status, organization_id')
    .eq('id', userId)
    .single();
    
  if (profileError || !profile || profile.account_status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED'); // Even if JWT is valid, profile is locked/missing
  }

  // 2. Check roles and scope
  const { data: userRoles, error: rolesError } = await adminClient
    .from('user_roles')
    .select('role_code, scope_organization_id')
    .eq('user_id', userId)
    .in('role_code', roles);

  if (rolesError) throw rolesError;
  if (!userRoles || userRoles.length === 0) throw new Error('FORBIDDEN');

  // If no targetOrgId provided, having any of the required roles is enough
  if (!targetOrgId) return;

  // If targetOrgId provided, verify scope
  const hasScope = userRoles.some(role => 
    role.role_code === 'SYSTEM_ADMIN' || // Sysadmin has global scope
    role.scope_organization_id === null || // Global scope
    role.scope_organization_id === targetOrgId
  );

  if (!hasScope) throw new Error('FORBIDDEN');
}
