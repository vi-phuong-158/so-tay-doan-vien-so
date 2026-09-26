-- P5.5 closure: enforce the innovation problem authorization contract inside the
-- SECURITY DEFINER status-transition RPC. The table RLS policy cannot protect
-- this function because the function deliberately runs with the owner's rights.
create or replace function public.transition_problem_status(
  p_problem_id uuid,
  p_new_status text,
  p_public_content text default null,
  p_internal_content text default null
)
returns public.innovation_problems
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.innovation_problems%rowtype;
  v_result public.innovation_problems%rowtype;
  v_is_assigned boolean;
begin
  if not public.is_active_user() then
    raise exception 'FORBIDDEN';
  end if;

  if p_new_status not in (
    'NEW', 'SCREENING', 'NEEDS_INFO', 'ACCEPTED', 'ASSIGNED',
    'RESEARCHING', 'PROPOSED', 'PILOTING', 'COMPLETED', 'ON_HOLD', 'DECLINED'
  ) then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_old
  from public.innovation_problems
  where id = p_problem_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_is_assigned := exists (
    select 1
    from public.innovation_problem_assignments
    where problem_id = v_old.id
      and assigned_user_id = auth.uid()
  );

  if not (
    public.has_role('SYSTEM_ADMIN')
    or public.has_role_in_scope('YOUTH_ADMIN', v_old.organization_id)
    or (public.has_role('INNOVATION_MEMBER') and v_is_assigned)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.innovation_problems
  set status = p_new_status, updated_at = now()
  where id = p_problem_id
  returning * into v_result;

  insert into public.innovation_problem_updates (
    problem_id, update_type, public_content, internal_content,
    from_status, to_status, created_by
  )
  values (
    p_problem_id, 'STATUS_CHANGE', nullif(trim(p_public_content), ''),
    nullif(trim(p_internal_content), ''), v_old.status, p_new_status, auth.uid()
  );

  return v_result;
end;
$$;

-- The browser calls update-innovation-problem only with an authenticated user.
-- Keep the authenticated RPC contract and remove an unnecessary anonymous grant.
revoke execute on function public.transition_problem_status(uuid, text, text, text) from anon;
grant execute on function public.transition_problem_status(uuid, text, text, text) to authenticated;
