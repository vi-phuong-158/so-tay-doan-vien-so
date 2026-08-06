import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { clients, requireScopedRole, requireUser, requireGlobalRole } from '../_shared/auth.ts';

export const handler = async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const { userClient, adminClient } = clients(req);
    const user = await requireUser(userClient);
    const payload = await req.json();
    const { action } = payload;

    if (action === 'invite') {
      const { email, full_name, organization_id, role_code } = payload;
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], organization_id);
      if (role_code === 'SYSTEM_ADMIN') throw new Error('FORBIDDEN: Cannot grant SYSTEM_ADMIN');

      const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name } });
      if (inviteError) throw inviteError;
      const newUserId = authData.user.id;
      
      const { error: dbError } = await adminClient.rpc('admin_invite_user_db_setup', {
        p_actor_id: user.id,
        p_new_user_id: newUserId,
        p_full_name: full_name,
        p_org_id: organization_id,
        p_role_code: role_code || null,
        p_email: email
      });
      
      if (dbError) {
        await adminClient.auth.admin.deleteUser(newUserId);
        throw dbError;
      }

      return new Response(JSON.stringify({ success: true, user_id: newUserId }), { headers });
    }

    if (action === 'update_status') {
      const { target_user_id, status } = payload;
      if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) throw new Error('BAD_REQUEST: Invalid status');
      if (target_user_id === user.id) throw new Error('FORBIDDEN: Cannot modify own status');
      if (target_user_id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') throw new Error('FORBIDDEN: Cannot modify SYSTEM_ADMIN');

      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');
      
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);

      const { error } = await adminClient.rpc('admin_update_user_status', {
        p_actor_id: user.id,
        p_target_user_id: target_user_id,
        p_status: status,
        p_org_id: targetProfile.organization_id
      });
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'assign_role') {
      const { target_user_id, role_code, scope_organization_id } = payload;
      if (role_code === 'SYSTEM_ADMIN') throw new Error('FORBIDDEN: Cannot grant SYSTEM_ADMIN');
      if (!['MEMBER', 'BRANCH_OFFICER', 'INNOVATION_MEMBER', 'YOUTH_ADMIN'].includes(role_code)) throw new Error('BAD_REQUEST: Invalid role');
      
      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');
      
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], scope_organization_id);
      
      const { error } = await adminClient.rpc('admin_assign_role', {
        p_actor_id: user.id,
        p_target_user_id: target_user_id,
        p_role_code: role_code,
        p_scope_org_id: scope_organization_id,
        p_target_org_id: targetProfile.organization_id
      });
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'revoke_role') {
      const { target_user_id, role_code, scope_organization_id } = payload;
      
      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');

      if (role_code === 'SYSTEM_ADMIN') {
        await requireGlobalRole(adminClient, user.id, ['SYSTEM_ADMIN']);
      } else {
        await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);
        if (scope_organization_id) {
          await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], scope_organization_id);
        }
      }

      const { error } = await adminClient.rpc('admin_revoke_role', {
        p_actor_id: user.id,
        p_target_user_id: target_user_id,
        p_role_code: role_code,
        p_scope_org_id: scope_organization_id || null,
        p_target_org_id: targetProfile.organization_id
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    throw new Error('BAD_REQUEST: Invalid action');
  } catch (err: any) {
    let status = 400;
    if (err.message.startsWith('UNAUTHENTICATED')) status = 401;
    else if (err.message.startsWith('FORBIDDEN')) status = 403;
    else if (err.message.startsWith('NOT_FOUND')) status = 404;
    else if (err.code === '23505') status = 409; // unique violation

    return new Response(JSON.stringify({ error: err.message }), { 
      status, 
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } 
    });
  }
};

if (import.meta.main) {
  serve(handler);
}
