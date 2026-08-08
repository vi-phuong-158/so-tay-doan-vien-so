-- Storage buckets, column grants and transactional RPCs.
insert into storage.buckets (id, name, public, file_size_limit) values
  ('documents-private','documents-private',false,52428800),
  ('report-templates-private','report-templates-private',false,52428800),
  ('report-submissions-private','report-submissions-private',false,104857600),
  ('learning-resources-private','learning-resources-private',false,52428800),
  ('innovation-private','innovation-private',false,52428800),
  ('innovation-public-media','innovation-public-media',true,20971520)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- Prevent users from changing organization/role/status through PostgREST.
revoke update on public.profiles from authenticated;
grant update (full_name, job_title, phone, last_seen_at) on public.profiles to authenticated;

create or replace function public.create_report_submission(
  p_assignment_id uuid,
  p_summary text default null,
  p_submit_note text default null
) returns table(submission_id uuid, version_number integer, resulting_status text)
language plpgsql security definer set search_path = public
as $$
declare
  v_assignment public.report_assignments%rowtype;
  v_campaign public.report_campaigns%rowtype;
  v_version integer;
  v_status text;
begin
  if not public.is_active_user() or not public.has_role('BRANCH_OFFICER') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_assignment from public.report_assignments where id = p_assignment_id for update;
  if not found or v_assignment.organization_id <> public.current_org_id() then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  select * into v_campaign from public.report_campaigns where id = v_assignment.campaign_id;
  if v_campaign.status <> 'PUBLISHED' then raise exception 'CAMPAIGN_NOT_OPEN'; end if;
  if now() < v_campaign.open_at then raise exception 'CAMPAIGN_NOT_OPEN'; end if;
  if now() > coalesce(v_campaign.close_at, v_campaign.due_at) and not v_campaign.allow_late_submission then raise exception 'SUBMISSION_CLOSED'; end if;
  if v_assignment.status in ('ACCEPTED','EXEMPTED','CLOSED') then raise exception 'ASSIGNMENT_CLOSED'; end if;
  if exists(select 1 from public.report_submissions where assignment_id=p_assignment_id)
     and not (v_campaign.allow_resubmission or v_assignment.status='NEEDS_SUPPLEMENT') then raise exception 'RESUBMISSION_NOT_ALLOWED'; end if;

  select coalesce(max(s.version_number),0)+1 into v_version from public.report_submissions s where s.assignment_id=p_assignment_id;
  v_status := case when now() > coalesce(v_assignment.due_at_override,v_campaign.due_at) then 'LATE_SUBMITTED'
                   when v_assignment.status='NEEDS_SUPPLEMENT' then 'RESUBMITTED' else 'SUBMITTED' end;

  insert into public.report_submissions(assignment_id,version_number,submitted_by,summary,submit_note,is_late)
  values(p_assignment_id,v_version,auth.uid(),nullif(trim(p_summary),''),nullif(trim(p_submit_note),''),v_status='LATE_SUBMITTED')
  returning id into submission_id;

  update public.report_assignments set status=v_status, updated_at=now() where id=p_assignment_id;
  insert into public.report_status_history(assignment_id,from_status,to_status,changed_by,reason)
  values(p_assignment_id,v_assignment.status,v_status,auth.uid(),'Nộp báo cáo phiên bản '||v_version);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,organization_id,after_data)
  values(auth.uid(),'REPORT_SUBMITTED','report_submission',submission_id,v_assignment.organization_id,jsonb_build_object('version',v_version,'status',v_status));

  version_number := v_version; resulting_status := v_status; return next;
end $$;
revoke all on function public.create_report_submission(uuid,text,text) from public;
grant execute on function public.create_report_submission(uuid,text,text) to authenticated;

create or replace function public.transition_problem_status(p_problem_id uuid,p_new_status text,p_public_content text default null,p_internal_content text default null)
returns public.innovation_problems
language plpgsql security definer set search_path=public
as $$
declare v_old public.innovation_problems%rowtype; v_result public.innovation_problems%rowtype;
begin
  if not (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN') or public.has_role('INNOVATION_MEMBER')) then raise exception 'FORBIDDEN'; end if;
  if p_new_status not in ('NEW','SCREENING','NEEDS_INFO','ACCEPTED','ASSIGNED','RESEARCHING','PROPOSED','PILOTING','COMPLETED','ON_HOLD','DECLINED') then raise exception 'INVALID_STATUS'; end if;
  select * into v_old from public.innovation_problems where id=p_problem_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.innovation_problems set status=p_new_status,updated_at=now() where id=p_problem_id returning * into v_result;
  insert into public.innovation_problem_updates(problem_id,update_type,public_content,internal_content,from_status,to_status,created_by)
  values(p_problem_id,'STATUS_CHANGE',nullif(trim(p_public_content),''),nullif(trim(p_internal_content),''),v_old.status,p_new_status,auth.uid());
  return v_result;
end $$;
revoke all on function public.transition_problem_status(uuid,text,text,text) from public;
grant execute on function public.transition_problem_status(uuid,text,text,text) to authenticated;

create or replace function public.mark_overdue_assignments() returns integer
language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
  update public.report_assignments a set status='OVERDUE',updated_at=now()
  from public.report_campaigns c
  where c.id=a.campaign_id and c.status='PUBLISHED'
    and now()>coalesce(a.due_at_override,c.due_at)
    and a.status='PENDING';
  get diagnostics v_count = row_count; return v_count;
end $$;
revoke all on function public.mark_overdue_assignments() from public;

-- Storage access via JWT + RLS
create policy "public innovation media read" on storage.objects for select using (bucket_id='innovation-public-media');
create policy "admins manage public innovation media" on storage.objects for all
using (bucket_id='innovation-public-media' and (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN')))
with check (bucket_id='innovation-public-media' and (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN')));


