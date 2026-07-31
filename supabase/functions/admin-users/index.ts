import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { clients, requireScopedRole, requireUser, requireGlobalRole } from '../_shared/auth.ts';

serve(async (req) => {
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

    const logAudit = async (actionName: string, targetId: string, orgId: string, details: any) => {
      await adminClient.from('audit_logs').insert({
        actor_user_id: user.id,
        action: actionName,
        entity_type: 'USER',
        entity_id: targetId,
        organization_id: orgId,
        after_data: details
      });
    };

    if (action === 'invite') {
      const { email, full_name, organization_id, role_code } = payload;
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], organization_id);
      if (role_code === 'SYSTEM_ADMIN') throw new Error('FORBIDDEN: Cannot grant SYSTEM_ADMIN');

      const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name } });
      if (inviteError) throw inviteError;
      const newUserId = authData.user.id;
      
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: newUserId,
        full_name,
        organization_id,
        account_status: 'INVITED'
      });
      if (profileError) throw profileError;

      if (role_code) {
        const { error: roleError } = await adminClient.from('user_roles').insert({
          user_id: newUserId,
          role_code,
          scope_organization_id: organization_id,
          granted_by: user.id
        });
        if (roleError) {
          // Best effort rollback
          await adminClient.auth.admin.deleteUser(newUserId);
          throw roleError;
        }
      }

      await logAudit('INVITE_USER', newUserId, organization_id, { role_code, email });
      return new Response(JSON.stringify({ success: true, user_id: newUserId }), { headers });
    }

    if (action === 'update_status') {
      const { target_user_id, status } = payload;
      if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) throw new Error('BAD_REQUEST: Invalid status');
      if (target_user_id === user.id) throw new Error('FORBIDDEN: Cannot modify own status');

      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');

      // Check if target is SYSTEM_ADMIN
      const { data: targetRoles } = await adminClient.from('user_roles').select('role_code').eq('user_id', target_user_id);
      const isTargetSysAdmin = targetRoles?.some(r => r.role_code === 'SYSTEM_ADMIN');

      if (isTargetSysAdmin) {
        // Only SYSTEM_ADMIN can modify SYSTEM_ADMIN
        await requireGlobalRole(adminClient, user.id, ['SYSTEM_ADMIN']);
      } else {
        await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);
      }

      const { error } = await adminClient.from('profiles').update({ account_status: status }).eq('id', target_user_id);
      if (error) throw error;
      
      await logAudit('UPDATE_USER_STATUS', target_user_id, targetProfile.organization_id, { status });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'assign_role') {
      const { target_user_id, role_code, scope_organization_id } = payload;
      if (role_code === 'SYSTEM_ADMIN') throw new Error('FORBIDDEN: Cannot grant SYSTEM_ADMIN');
      if (!['MEMBER', 'BRANCH_OFFICER', 'INNOVATION_MEMBER', 'YOUTH_ADMIN'].includes(role_code)) throw new Error('BAD_REQUEST: Invalid role');
      
      // Verify target user's true organization matches scope
      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');
      
      // Verify caller has scope over both target's org AND the scope they are granting
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], scope_organization_id);
      
      const { error } = await adminClient.from('user_roles').insert({
        user_id: target_user_id,
        role_code,
        scope_organization_id,
        granted_by: user.id
      });
      if (error) throw error;
      
      await logAudit('ASSIGN_ROLE', target_user_id, targetProfile.organization_id, { role_code, scope_organization_id });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'revoke_role') {
      const { target_user_id, role_code, scope_organization_id } = payload;
      
      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('NOT_FOUND: User not found');

      // Cannot revoke SYSTEM_ADMIN unless you are SYSTEM_ADMIN
      if (role_code === 'SYSTEM_ADMIN') {
        await requireGlobalRole(adminClient, user.id, ['SYSTEM_ADMIN']);
      } else {
        await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);
        if (scope_organization_id) {
          await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], scope_organization_id);
        }
      }

      let query = adminClient.from('user_roles').delete().eq('user_id', target_user_id).eq('role_code', role_code);
      if (scope_organization_id) {
        query = query.eq('scope_organization_id', scope_organization_id);
      } else {
        query = query.is('scope_organization_id', null);
      }

      const { error } = await query;
      if (error) throw error;

      await logAudit('REVOKE_ROLE', target_user_id, targetProfile.organization_id, { role_code, scope_organization_id });
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
});
