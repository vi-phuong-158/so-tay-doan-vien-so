-- Sổ tay Đoàn viên số — schema nền tảng
create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_name text,
  parent_id uuid references public.organizations(id),
  organization_type text not null default 'YOUTH_UNIT',
  email text,
  phone text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  organization_id uuid references public.organizations(id),
  job_title text,
  phone text,
  account_status text not null default 'INVITED' check (account_status in ('INVITED','ACTIVE','SUSPENDED','ARCHIVED')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code text not null check (role_code in ('MEMBER','BRANCH_OFFICER','INNOVATION_MEMBER','YOUTH_ADMIN','SYSTEM_ADMIN')),
  scope_organization_id uuid references public.organizations(id),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  constraint user_roles_scope_unique unique nulls not distinct (user_id, role_code, scope_organization_id)
);

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and account_status = 'ACTIVE') $$;

create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.profiles where id = auth.uid() and account_status = 'ACTIVE' $$;

create or replace function public.has_role(required_role text) returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_active_user() and exists(select 1 from public.user_roles where user_id = auth.uid() and role_code = required_role) $$;

create or replace function public.has_role_in_scope(required_role text, target_org_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ 
  select public.is_active_user() and exists(
    select 1 from public.user_roles 
    where user_id = auth.uid() 
      and (role_code = 'SYSTEM_ADMIN' or (role_code = required_role and (scope_organization_id is null or scope_organization_id = target_org_id)))
  ) 
$$;

create or replace function public.can_access_document(doc_id uuid, target_user_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
declare
  doc record;
  doc_owner_org uuid;
  user_org uuid;
begin
  if not public.is_active_user() then return false; end if;
  select * into doc from public.documents where id = doc_id;
  if not found or doc.status != 'PUBLISHED' then return false; end if;
  
  if public.has_role('SYSTEM_ADMIN') or public.has_role('YOUTH_ADMIN') then return true; end if;
  if doc.visibility_level = 'PUBLIC' then return true; end if;
  if doc.visibility_level = 'INTERNAL_YOUTH' then return true; end if;
  
  if doc.visibility_level = 'ORGANIZATION_ONLY' then
    select organization_id into doc_owner_org from public.profiles where id = doc.created_by;
    select organization_id into user_org from public.profiles where id = target_user_id;
    if doc_owner_org = user_org then return true; end if;
  end if;
  
  return false;
end $$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, summary text, content text not null,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','WITHDRAWN')),
  audience_type text not null default 'ALL', publish_at timestamptz, expire_at timestamptz, action_url text,
  visibility_level text not null default 'INTERNAL_YOUTH' check (visibility_level in ('PUBLIC','INTERNAL_YOUTH','ORGANIZATION_ONLY','RESTRICTED')),
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.announcement_targets (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  organization_id uuid references public.organizations(id), role_code text, user_id uuid references public.profiles(id),
  check (num_nonnulls(organization_id, role_code, user_id) = 1)
);
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(), primary key (announcement_id, user_id)
);

create table if not exists public.report_campaigns (
  id uuid primary key default gen_random_uuid(), title text not null, description text, issuer text,
  open_at timestamptz not null, due_at timestamptz not null, close_at timestamptz,
  allow_late_submission boolean not null default false, allow_resubmission boolean not null default true,
  allowed_extensions text[] not null default array['pdf','doc','docx','xls','xlsx','jpg','jpeg','png'],
  max_file_size_mb integer not null default 20 check (max_file_size_mb between 1 and 100),
  max_files integer not null default 5 check (max_files between 1 and 20),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),
  reminder_policy jsonb not null default '{}'::jsonb,
  visibility_level text not null default 'INTERNAL_YOUTH',
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (due_at >= open_at), check (close_at is null or close_at >= due_at)
);
create table if not exists public.report_campaign_templates (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.report_campaigns(id) on delete cascade,
  storage_path text not null, file_name text not null, mime_type text, size_bytes bigint check (size_bytes >= 0), created_at timestamptz not null default now()
);
create table if not exists public.report_assignments (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.report_campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  status text not null default 'PENDING' check (status in ('PENDING','SUBMITTED','NEEDS_SUPPLEMENT','RESUBMITTED','ACCEPTED','OVERDUE','LATE_SUBMITTED','CLOSED','EXEMPTED')),
  due_at_override timestamptz, assigned_at timestamptz not null default now(), accepted_at timestamptz, exempted_at timestamptz,
  exempt_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, organization_id)
);
create table if not exists public.report_submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.report_assignments(id) on delete cascade,
  version_number integer not null check (version_number > 0), submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(), summary text, submit_note text, is_late boolean not null default false,
  review_status text not null default 'PENDING' check (review_status in ('PENDING','ACCEPTED','NEEDS_SUPPLEMENT')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(), unique (assignment_id, version_number)
);
create table if not exists public.report_submission_files (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.report_submissions(id) on delete cascade,
  storage_path text not null unique, original_name text not null, safe_name text not null, mime_type text, size_bytes bigint not null check (size_bytes >= 0),
  checksum text, uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.report_status_history (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.report_assignments(id) on delete cascade,
  from_status text, to_status text not null, changed_by uuid references public.profiles(id), reason text, created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), document_number text, title text not null, document_type text,
  issuing_authority text, issued_date date, effective_date date, expiry_date date, effect_status text,
  scope text, summary text, keywords text[] not null default '{}', storage_path text, source_url text,
  status text not null default 'DRAFT' check (status in ('DRAFT','PROCESSING','PENDING_REVIEW','PUBLISHED','REPLACED','EXPIRED','WITHDRAWN')),
  visibility_level text not null default 'INTERNAL_YOUTH', approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.document_relations (
  source_document_id uuid not null references public.documents(id) on delete cascade,
  target_document_id uuid not null references public.documents(id) on delete cascade,
  relation_type text not null, primary key (source_document_id, target_document_id, relation_type)
);
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null, section_path text, page_from integer, page_to integer, content text not null, content_hash text not null,
  embedding vector(768), review_status text not null default 'PENDING' check (review_status in ('PENDING','APPROVED','REJECTED')),
  visibility_level text not null default 'INTERNAL_YOUTH', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(document_id, chunk_index), unique(document_id, content_hash)
);

create table if not exists public.learning_topics (
  id uuid primary key default gen_random_uuid(), title text not null, description text, objectives text,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),
  open_at timestamptz, close_at timestamptz, visibility_level text not null default 'INTERNAL_YOUTH',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.learning_resources (
  id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.learning_topics(id) on delete cascade,
  resource_type text not null, title text not null, content text, storage_path text, external_url text, sort_order integer not null default 0
);
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(), topic_id uuid references public.learning_topics(id) on delete cascade,
  title text not null, description text, pass_score numeric(5,2) not null default 70, time_limit_minutes integer,
  max_attempts integer, shuffle_questions boolean not null default false, shuffle_options boolean not null default false,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','CLOSED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_type text not null default 'SINGLE', question_text text not null, explanation text, points numeric(8,2) not null default 1, sort_order integer not null default 0
);
create table if not exists public.quiz_options (
  id uuid primary key default gen_random_uuid(), question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_text text not null, is_correct boolean not null default false, sort_order integer not null default 0
);
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, started_at timestamptz not null default now(), submitted_at timestamptz,
  score numeric(8,2), passed boolean, attempt_number integer not null, unique(quiz_id,user_id,attempt_number)
);
create table if not exists public.quiz_answers (
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade, question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}', is_correct boolean, awarded_points numeric(8,2), primary key(attempt_id,question_id)
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  title text, mode text not null default 'DOCUMENT_LOOKUP', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check(role in ('user','assistant','system')), content text not null, model text, latency_ms integer, token_usage jsonb,
  status text not null default 'COMPLETED', created_at timestamptz not null default now()
);
create table if not exists public.ai_message_sources (
  message_id uuid not null references public.ai_messages(id) on delete cascade, document_id uuid not null references public.documents(id),
  chunk_id uuid references public.document_chunks(id), rank integer not null, similarity numeric, quoted_excerpt text,
  primary key(message_id,document_id,chunk_id)
);
create table if not exists public.ai_feedback (
  message_id uuid not null references public.ai_messages(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check(rating between 1 and 5), comment text, created_at timestamptz not null default now(), primary key(message_id,user_id)
);

create table if not exists public.innovation_projects (
  id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, project_status text not null,
  project_category text, lead_organization_id uuid references public.organizations(id), team_name text, problem_statement text, objectives text,
  solution_summary text, technology_summary text, implementation_scope text, progress_percent integer not null default 0 check(progress_percent between 0 and 100),
  results_summary text, replication_potential text, contact_user_id uuid references public.profiles(id), visibility_level text not null default 'INTERNAL_YOUTH',
  publish_status text not null default 'DRAFT' check(publish_status in ('DRAFT','PENDING_REVIEW','PUBLISHED','WITHDRAWN')),
  approved_by uuid references public.profiles(id), approved_at timestamptz, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.innovation_project_media (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.innovation_projects(id) on delete cascade,
  media_type text not null, storage_path text not null, caption text, sort_order integer not null default 0
);
create table if not exists public.innovation_problems (
  id uuid primary key default gen_random_uuid(), title text not null, submitted_by uuid not null references public.profiles(id),
  organization_id uuid not null references public.organizations(id), current_process text, pain_point text not null, frequency text, impact text,
  desired_outcome text, urgency text not null default 'MEDIUM', current_tools text, visibility_level text not null default 'ORGANIZATION_ONLY',
  status text not null default 'NEW' check(status in ('NEW','SCREENING','NEEDS_INFO','ACCEPTED','ASSIGNED','RESEARCHING','PROPOSED','PILOTING','COMPLETED','ON_HOLD','DECLINED')),
  assigned_team_id uuid references public.organizations(id), public_summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.innovation_problem_files (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.innovation_problems(id) on delete cascade,
  storage_path text not null, original_name text not null, mime_type text, size_bytes bigint check(size_bytes >= 0), created_at timestamptz not null default now()
);
create table if not exists public.innovation_problem_assignments (
  problem_id uuid not null references public.innovation_problems(id) on delete cascade, assigned_user_id uuid not null references public.profiles(id),
  assignment_role text, assigned_by uuid references public.profiles(id), assigned_at timestamptz not null default now(), primary key(problem_id,assigned_user_id)
);
create table if not exists public.innovation_problem_updates (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.innovation_problems(id) on delete cascade,
  update_type text not null, public_content text, internal_content text, from_status text, to_status text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.innovation_solution_artifacts (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.innovation_problems(id) on delete cascade,
  artifact_type text, title text not null, description text, storage_path text, external_url text, visibility_level text not null default 'RESTRICTED'
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, title text not null, body text, action_url text, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(), template_code text not null, recipient_email text not null, recipient_name text,
  payload jsonb not null default '{}'::jsonb, scheduled_at timestamptz not null default now(),
  status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  attempt_count integer not null default 0, idempotency_key text unique, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(), queue_id uuid references public.email_queue(id) on delete set null,
  provider text, provider_message_id text, status text, sent_at timestamptz, delivered_at timestamptz, error_code text, error_message text, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.profiles(id), action text not null,
  entity_type text not null, entity_id uuid, organization_id uuid references public.organizations(id), before_data jsonb, after_data jsonb,
  ip_hash text, user_agent text, created_at timestamptz not null default now()
);

create index if not exists idx_report_assignment_org_status on public.report_assignments(organization_id,status);
create index if not exists idx_report_campaign_due on public.report_campaigns(status,due_at);
create index if not exists idx_documents_publish on public.documents(status,effect_status,issued_date desc);
create index if not exists idx_problem_owner_status on public.innovation_problems(submitted_by,status);
create index if not exists idx_notifications_user_unread on public.notifications(user_id,read_at,created_at desc);
create index if not exists idx_email_queue_pending on public.email_queue(status,scheduled_at);
create index if not exists idx_document_chunks_embedding on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Updated-at triggers
DO $$ declare r record; begin
  for r in select unnest(array['organizations','profiles','announcements','report_campaigns','report_assignments','documents','document_chunks','learning_topics','quizzes','ai_conversations','innovation_projects','innovation_problems','email_queue']) as t loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', r.t, r.t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', r.t, r.t);
  end loop;
end $$;

-- RLS
DO $$ declare r record; begin
  for r in select unnest(array['organizations','profiles','user_roles','announcements','announcement_targets','announcement_reads','report_campaigns','report_campaign_templates','report_assignments','report_submissions','report_submission_files','report_status_history','documents','document_relations','document_chunks','learning_topics','learning_resources','quizzes','quiz_questions','quiz_options','quiz_attempts','quiz_answers','ai_conversations','ai_messages','ai_message_sources','ai_feedback','innovation_projects','innovation_project_media','innovation_problems','innovation_problem_files','innovation_problem_assignments','innovation_problem_updates','innovation_solution_artifacts','notifications','email_queue','email_logs','audit_logs']) as t loop
    execute format('alter table public.%I enable row level security', r.t);
  end loop;
end $$;

create policy "active users read organizations" on public.organizations for select using (public.is_active_user());
create policy "users read own profile" on public.profiles for select using (id = auth.uid() or public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "users update safe own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and organization_id = public.current_org_id());
create policy "admins manage profiles" on public.profiles for all using (public.has_role('SYSTEM_ADMIN')) with check (public.has_role('SYSTEM_ADMIN'));
create policy "users read own roles" on public.user_roles for select using (user_id = auth.uid() or public.has_role_in_scope('YOUTH_ADMIN', scope_organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "system admins manage roles" on public.user_roles for all using (public.has_role('SYSTEM_ADMIN')) with check (public.has_role('SYSTEM_ADMIN'));

create policy "active users read published announcements" on public.announcements for select using (public.is_active_user() and status = 'PUBLISHED' and (publish_at is null or publish_at <= now()) and (expire_at is null or expire_at > now()));
create policy "content admins manage announcements" on public.announcements for all using (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN'));
create policy "users manage own announcement reads" on public.announcement_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "active users read published report campaigns" on public.report_campaigns for select using (public.is_active_user() and status in ('PUBLISHED','CLOSED'));
create policy "admins manage report campaigns" on public.report_campaigns for all using (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN'));
create policy "organization reads own assignments" on public.report_assignments for select using (organization_id = public.current_org_id() or public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "admins manage assignments" on public.report_assignments for all using (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "organization reads own submissions" on public.report_submissions for select using (exists(select 1 from public.report_assignments a where a.id = assignment_id and (a.organization_id = public.current_org_id() or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id) or public.has_role('SYSTEM_ADMIN'))));
create policy "branch officers insert own submissions" on public.report_submissions for insert with check (submitted_by = auth.uid() and public.has_role('BRANCH_OFFICER') and exists(select 1 from public.report_assignments a where a.id = assignment_id and a.organization_id = public.current_org_id()));
create policy "authorized read submission files" on public.report_submission_files for select using (exists(select 1 from public.report_submissions s join public.report_assignments a on a.id=s.assignment_id where s.id=submission_id and (a.organization_id=public.current_org_id() or public.has_role_in_scope('YOUTH_ADMIN', a.organization_id) or public.has_role('SYSTEM_ADMIN'))));

create policy "active users read published documents" on public.documents for select using (public.can_access_document(id, auth.uid()));
create policy "content admins manage documents" on public.documents for all using (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN'));
create policy "content admins read chunks" on public.document_chunks for select using (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles p where p.id = d.created_by)) or public.has_role('SYSTEM_ADMIN'))));
create policy "content admins manage chunks" on public.document_chunks for all using (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles p where p.id = d.created_by)) or public.has_role('SYSTEM_ADMIN')))) with check (exists(select 1 from public.documents d where d.id = document_id and (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles p where p.id = d.created_by)) or public.has_role('SYSTEM_ADMIN'))));

create policy "active users read published topics" on public.learning_topics for select using (public.is_active_user() and status='PUBLISHED');
create policy "active users read resources" on public.learning_resources for select using (public.is_active_user() and exists(select 1 from public.learning_topics t where t.id=topic_id and t.status='PUBLISHED'));
create policy "active users read published quizzes" on public.quizzes for select using (public.is_active_user() and status='PUBLISHED');
create policy "active users read quiz questions" on public.quiz_questions for select using (public.is_active_user() and exists(select 1 from public.quizzes q where q.id=quiz_id and q.status='PUBLISHED'));
-- quiz_options deliberately has no frontend SELECT policy because is_correct must not leak.
create policy "users read own attempts" on public.quiz_attempts for select using (user_id=auth.uid() or public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = user_id)) or public.has_role('SYSTEM_ADMIN'));
create policy "users insert own attempts" on public.quiz_attempts for insert with check (user_id=auth.uid());
create policy "users read own answers" on public.quiz_answers for select using (exists(select 1 from public.quiz_attempts a where a.id=attempt_id and (a.user_id=auth.uid() or public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles p where p.id = a.user_id)) or public.has_role('SYSTEM_ADMIN'))));

create policy "users manage own ai conversations" on public.ai_conversations for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "users read own ai messages" on public.ai_messages for select using (exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy "users read own ai sources" on public.ai_message_sources for select using (exists(select 1 from public.ai_messages m join public.ai_conversations c on c.id=m.conversation_id where m.id=message_id and c.user_id=auth.uid()));
create policy "users manage own ai feedback" on public.ai_feedback for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "active users read published projects" on public.innovation_projects for select using (public.is_active_user() and publish_status='PUBLISHED');
create policy "innovation admins manage projects" on public.innovation_projects for all using (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', (select organization_id from public.profiles where id = created_by)) or public.has_role('SYSTEM_ADMIN'));
create policy "users read own or assigned problems" on public.innovation_problems for select using (submitted_by=auth.uid() or exists(select 1 from public.innovation_problem_assignments a where a.problem_id=id and a.assigned_user_id=auth.uid()) or public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "users submit problems for own org" on public.innovation_problems for insert with check (submitted_by=auth.uid() and organization_id=public.current_org_id());
create policy "admins manage problems" on public.innovation_problems for update using (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN')) with check (public.has_role_in_scope('YOUTH_ADMIN', organization_id) or public.has_role('SYSTEM_ADMIN'));
create policy "problem participants read public updates" on public.innovation_problem_updates for select using (exists(select 1 from public.innovation_problems p where p.id=problem_id and (p.submitted_by=auth.uid() or exists(select 1 from public.innovation_problem_assignments a where a.problem_id=p.id and a.assigned_user_id=auth.uid()) or public.has_role_in_scope('YOUTH_ADMIN', p.organization_id) or public.has_role('SYSTEM_ADMIN'))) and (internal_content is null or public.has_role_in_scope('INNOVATION_MEMBER', p.organization_id) or public.has_role_in_scope('YOUTH_ADMIN', p.organization_id) or public.has_role('SYSTEM_ADMIN')));

create policy "users read own notifications" on public.notifications for select using (user_id=auth.uid());
create policy "users mark own notifications read" on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
-- email_queue, email_logs, audit_logs and quiz_options intentionally have no anon/authenticated direct access policies.

create or replace function public.match_document_chunks(query_embedding vector(768), match_count integer default 8)
returns table(chunk_id uuid, document_id uuid, content text, section_path text, page_from integer, page_to integer, similarity float)
language sql stable security definer set search_path=public
as $$
  select c.id, c.document_id, c.content, c.section_path, c.page_from, c.page_to, 1-(c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.review_status='APPROVED' and public.can_access_document(c.document_id, auth.uid())
  order by c.embedding <=> query_embedding limit greatest(1,least(match_count,20));
$$;
revoke all on function public.match_document_chunks(vector,integer) from public;
grant execute on function public.match_document_chunks(vector,integer) to authenticated;
