import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { clients, requireScopedRole, requireUser } from '../_shared/auth.ts';

serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const { userClient, adminClient } = clients(req);
    const user = await requireUser(userClient);
    const payload = await req.json();
    const { action } = payload;

    if (action === 'invite') {
      const { email, full_name, organization_id, role_code } = payload;
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], organization_id);
      
      if (role_code === 'SYSTEM_ADMIN') throw new Error('Cannot grant SYSTEM_ADMIN');

      // Invite user using admin client
      const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name }
      });
      if (inviteError) throw inviteError;
      
      const newUserId = authData.user.id;
      
      // Upsert profile
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: newUserId,
        full_name,
        organization_id,
        account_status: 'ACTIVE'
      });
      if (profileError) throw profileError;

      // Assign role if provided
      if (role_code) {
        await adminClient.from('user_roles').insert({
          user_id: newUserId,
          role_code,
          scope_organization_id: organization_id,
          granted_by: user.id
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUserId }), { headers });
    }

    if (action === 'update_status') {
      const { target_user_id, status } = payload;
      
      // Get target user's org
      const { data: targetProfile } = await adminClient.from('profiles').select('organization_id').eq('id', target_user_id).single();
      if (!targetProfile) throw new Error('User not found');
      
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], targetProfile.organization_id);

      const { error } = await adminClient.from('profiles').update({ account_status: status }).eq('id', target_user_id);
      if (error) throw error;
      
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'assign_role') {
      const { target_user_id, role_code, scope_organization_id } = payload;
      if (role_code === 'SYSTEM_ADMIN') throw new Error('Cannot grant SYSTEM_ADMIN');
      
      await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], scope_organization_id);
      
      const { error } = await adminClient.from('user_roles').insert({
        user_id: target_user_id,
        role_code,
        scope_organization_id,
        granted_by: user.id
      });
      
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    throw new Error('Invalid action');
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      } 
    });
  }
});
