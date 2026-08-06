-- 0004_admin_transactions.sql
-- RPCs for admin operations to ensure atomicity with audit logs

create or replace function public.admin_update_user_status(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_org_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set account_status = p_status, updated_at = now() where id = p_target_user_id;
  
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (p_actor_id, 'UPDATE_USER_STATUS', 'USER', p_target_user_id, p_org_id, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_assign_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role_code text,
  p_scope_org_id uuid,
  p_target_org_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_roles(user_id, role_code, scope_organization_id, granted_by)
  values (p_target_user_id, p_role_code, p_scope_org_id, p_actor_id);
  
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (p_actor_id, 'ASSIGN_ROLE', 'USER', p_target_user_id, p_target_org_id, jsonb_build_object('role_code', p_role_code, 'scope_organization_id', p_scope_org_id));
end $$;

create or replace function public.admin_revoke_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role_code text,
  p_scope_org_id uuid,
  p_target_org_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_scope_org_id is not null then
    delete from public.user_roles where user_id = p_target_user_id and role_code = p_role_code and scope_organization_id = p_scope_org_id;
  else
    delete from public.user_roles where user_id = p_target_user_id and role_code = p_role_code and scope_organization_id is null;
  end if;
  
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (p_actor_id, 'REVOKE_ROLE', 'USER', p_target_user_id, p_target_org_id, jsonb_build_object('role_code', p_role_code, 'scope_organization_id', p_scope_org_id));
end $$;

create or replace function public.admin_invite_user_db_setup(
  p_actor_id uuid,
  p_new_user_id uuid,
  p_full_name text,
  p_org_id uuid,
  p_role_code text,
  p_email text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Upsert profile
  insert into public.profiles (id, full_name, organization_id, account_status)
  values (p_new_user_id, p_full_name, p_org_id, 'INVITED')
  on conflict (id) do update set full_name = excluded.full_name, organization_id = excluded.organization_id, account_status = excluded.account_status, updated_at = now();

  -- Insert role if provided
  if p_role_code is not null then
    insert into public.user_roles (user_id, role_code, scope_organization_id, granted_by)
    values (p_new_user_id, p_role_code, p_org_id, p_actor_id);
  end if;

  -- Audit log
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (p_actor_id, 'INVITE_USER', 'USER', p_new_user_id, p_org_id, jsonb_build_object('role_code', p_role_code, 'email', p_email));
end $$;

-- Secure these RPCs
revoke all on function public.admin_update_user_status(uuid, uuid, text, uuid) from public;
revoke all on function public.admin_assign_role(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.admin_revoke_role(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.admin_invite_user_db_setup(uuid, uuid, text, uuid, text, text) from public;

-- We don't grant EXECUTE to authenticated here because these should ONLY be called by service_role from the Edge Function.
-- (The Edge Function connects with serviceRoleKey and has bypass RLS privileges anyway).
-- Wait, service_role has ALL PRIVILEGES on routines by default, so it can execute them.
