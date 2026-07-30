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

export async function requireAnyRole(adminClient: SupabaseClient, userId: string, roles: string[]) {
  const { data, error } = await adminClient.from('user_roles').select('role_code').eq('user_id', userId).in('role_code', roles);
  if (error) throw error;
  if (!data?.length) throw new Error('FORBIDDEN');
}
