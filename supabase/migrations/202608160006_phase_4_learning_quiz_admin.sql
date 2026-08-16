-- Phase 4 / P4-05: trusted Learning + Quiz authoring workflow.
--
-- Admin authoring is intentionally a separate trust boundary from end-user delivery:
--   * admin read RPCs may return quiz_options.is_correct after scope checks;
--   * authenticated direct DML is revoked from Quiz content tables;
--   * end-user Quiz RPCs remain unchanged and never call these authoring functions.
--
-- Historical-attempt policy:
--   * once a quiz has a submitted attempt, question/option rows and scoring-affecting quiz
--     settings are immutable;
--   * title/description may receive cosmetic edits;
--   * the quiz may be CLOSED, but a corrected assessment must be created as a new quiz.

-- =====================================================================================
-- 1. Shared helpers and publication validation
-- =====================================================================================
create or replace function public.quiz_has_submitted_attempts(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quiz_attempts a
    where a.quiz_id = p_quiz_id and a.submitted_at is not null
  );
$$;

revoke all on function public.quiz_has_submitted_attempts(uuid) from public, anon, authenticated;

create or replace function public.validate_quiz_for_publish(p_quiz_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes%rowtype;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if v_quiz.title is null or btrim(v_quiz.title) = '' then raise exception 'INVALID_QUIZ_TITLE'; end if;
  if v_quiz.pass_score < 0 or v_quiz.pass_score > 100 then raise exception 'INVALID_PASS_SCORE'; end if;
  if v_quiz.time_limit_minutes is not null and v_quiz.time_limit_minutes not between 1 and 1440 then
    raise exception 'INVALID_TIME_LIMIT';
  end if;
  if v_quiz.max_attempts is not null and v_quiz.max_attempts not between 1 and 100 then
    raise exception 'INVALID_MAX_ATTEMPTS';
  end if;
  if not exists (select 1 from public.quiz_questions q where q.quiz_id = p_quiz_id) then
    raise exception 'QUIZ_REQUIRES_QUESTION';
  end if;
  if exists (
    select 1 from public.quiz_questions q
    where q.quiz_id = p_quiz_id
      and (q.question_text is null or btrim(q.question_text) = '' or q.points <= 0)
  ) then
    raise exception 'INVALID_QUESTION';
  end if;
  if exists (
    select 1 from public.quiz_questions q
    where q.quiz_id = p_quiz_id
      and (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
  ) then
    raise exception 'QUESTION_REQUIRES_OPTIONS';
  end if;
  if exists (
    select 1 from public.quiz_questions q
    where q.quiz_id = p_quiz_id and q.question_type = 'SINGLE'
      and (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) <> 1
  ) then
    raise exception 'SINGLE_REQUIRES_ONE_CORRECT';
  end if;
  if exists (
    select 1 from public.quiz_questions q
    where q.quiz_id = p_quiz_id and q.question_type = 'MULTIPLE'
      and (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) < 1
  ) then
    raise exception 'MULTIPLE_REQUIRES_CORRECT';
  end if;
end;
$$;

revoke all on function public.validate_quiz_for_publish(uuid) from public, anon, authenticated;

-- P4-03's transition function is strengthened for the admin publication contract.
create or replace function public.set_learning_topic_status(p_topic_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic public.learning_topics%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_status not in ('PUBLISHED', 'CLOSED', 'ARCHIVED') then raise exception 'INVALID_TOPIC_TRANSITION'; end if;
  select * into v_topic from public.learning_topics where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_learning_topic(v_topic.owner_organization_id) then raise exception 'LEARNING_SCOPE_DENIED'; end if;
  if not (
    (p_status = 'PUBLISHED' and v_topic.status in ('DRAFT', 'CLOSED'))
    or (p_status = 'CLOSED' and v_topic.status = 'PUBLISHED')
    or (p_status = 'ARCHIVED' and v_topic.status in ('DRAFT', 'PUBLISHED', 'CLOSED'))
  ) then raise exception 'INVALID_TOPIC_TRANSITION'; end if;
  if p_status = 'PUBLISHED' then
    if v_topic.title is null or btrim(v_topic.title) = '' then raise exception 'INVALID_TOPIC_TITLE'; end if;
    if v_topic.visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then
      raise exception 'INVALID_VISIBILITY_LEVEL';
    end if;
    if v_topic.visibility_level = 'ORGANIZATION_ONLY' and v_topic.owner_organization_id is null then
      raise exception 'ORGANIZATION_REQUIRED';
    end if;
    if v_topic.open_at is not null and v_topic.close_at is not null and v_topic.close_at <= v_topic.open_at then
      raise exception 'INVALID_TOPIC_WINDOW';
    end if;
  end if;
  update public.learning_topics set status = p_status, updated_by = auth.uid(), updated_at = now() where id = p_topic_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), case p_status when 'PUBLISHED' then 'LEARNING_TOPIC_PUBLISHED'
    when 'CLOSED' then 'LEARNING_TOPIC_CLOSED' else 'LEARNING_TOPIC_ARCHIVED' end,
    'learning_topic', p_topic_id, v_topic.owner_organization_id,
    jsonb_build_object('status', v_topic.status), jsonb_build_object('status', p_status));
  return true;
end;
$$;

revoke all on function public.set_learning_topic_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_learning_topic_status(uuid, text) to authenticated;

-- =====================================================================================
-- 2. Bounded admin read models
-- =====================================================================================
create or replace function public.get_admin_learning_topics(
  p_search text default null,
  p_status text default null,
  p_visibility_level text default null,
  p_owner_organization_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, title text, description text, objectives text, status text, open_at timestamptz, close_at timestamptz,
  visibility_level text, owner_organization_id uuid, owner_organization_name text,
  resource_count bigint, quiz_count bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not (public.has_role('YOUTH_ADMIN') or public.has_role('SYSTEM_ADMIN')) then raise exception 'LEARNING_SCOPE_DENIED'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then raise exception 'INVALID_PAGE'; end if;
  if p_status is not null and p_status not in ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED') then raise exception 'INVALID_TOPIC_STATUS'; end if;
  if p_visibility_level is not null and p_visibility_level not in ('PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED') then raise exception 'INVALID_VISIBILITY_LEVEL'; end if;
  return query
  select t.id, t.title, t.description, t.objectives, t.status, t.open_at, t.close_at, t.visibility_level,
    t.owner_organization_id, o.name,
    (select count(*) from public.learning_resources r where r.topic_id = t.id),
    (select count(*) from public.quizzes q where q.topic_id = t.id),
    count(*) over ()
  from public.learning_topics t
  left join public.organizations o on o.id = t.owner_organization_id
  where public.can_manage_learning_topic(t.owner_organization_id)
    and (p_search is null or btrim(p_search) = '' or t.title ilike '%' || btrim(p_search) || '%')
    and (p_status is null or t.status = p_status)
    and (p_visibility_level is null or t.visibility_level = p_visibility_level)
    and (p_owner_organization_id is null or t.owner_organization_id = p_owner_organization_id)
  order by t.updated_at desc, t.id desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_admin_learning_topics(text, text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_admin_learning_topics(text, text, text, uuid, integer, integer) to authenticated;

create or replace function public.get_admin_learning_topic(p_topic_id uuid)
returns table(id uuid, title text, description text, objectives text, status text, open_at timestamptz, close_at timestamptz,
  visibility_level text, owner_organization_id uuid, owner_organization_name text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  return query
  select t.id, t.title, t.description, t.objectives, t.status, t.open_at, t.close_at, t.visibility_level,
    t.owner_organization_id, o.name, t.created_at, t.updated_at
  from public.learning_topics t left join public.organizations o on o.id = t.owner_organization_id
  where t.id = p_topic_id and public.can_manage_learning_topic(t.owner_organization_id);
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.get_admin_learning_topic(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_learning_topic(uuid) to authenticated;

create or replace function public.get_admin_learning_resources(p_topic_id uuid)
returns table(id uuid, topic_id uuid, resource_type text, title text, content text, storage_path text, external_url text, sort_order integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_manage_learning_topic((select owner_organization_id from public.learning_topics where id = p_topic_id)) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;
  return query select r.id, r.topic_id, r.resource_type, r.title, r.content, r.storage_path, r.external_url, r.sort_order
    from public.learning_resources r where r.topic_id = p_topic_id order by r.sort_order, r.id;
end;
$$;

revoke all on function public.get_admin_learning_resources(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_learning_resources(uuid) to authenticated;

create or replace function public.get_admin_quizzes(p_topic_id uuid)
returns table(id uuid, topic_id uuid, title text, description text, pass_score numeric, time_limit_minutes integer,
  max_attempts integer, shuffle_questions boolean, shuffle_options boolean, status text,
  question_count bigint, submitted_attempt_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_manage_quiz_content(p_topic_id) then raise exception 'LEARNING_SCOPE_DENIED'; end if;
  return query
  select q.id, q.topic_id, q.title, q.description, q.pass_score, q.time_limit_minutes, q.max_attempts,
    q.shuffle_questions, q.shuffle_options, q.status,
    (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id),
    (select count(*) from public.quiz_attempts a where a.quiz_id = q.id and a.submitted_at is not null)
  from public.quizzes q where q.topic_id = p_topic_id order by q.updated_at desc, q.id desc;
end;
$$;

revoke all on function public.get_admin_quizzes(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_quizzes(uuid) to authenticated;

create or replace function public.get_admin_quiz_authoring(p_quiz_id uuid)
returns table(
  quiz_id uuid, topic_id uuid, quiz_title text, quiz_description text, pass_score numeric, time_limit_minutes integer,
  max_attempts integer, shuffle_questions boolean, shuffle_options boolean, quiz_status text,
  submitted_attempt_count bigint, question_id uuid, question_type text, question_text text, explanation text,
  question_points numeric, question_sort_order integer, option_id uuid, option_text text, option_is_correct boolean,
  option_sort_order integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and public.can_manage_quiz_content(q.topic_id)) then
    raise exception 'QUIZ_SCOPE_DENIED';
  end if;
  return query
  select q.id, q.topic_id, q.title, q.description, q.pass_score, q.time_limit_minutes, q.max_attempts,
    q.shuffle_questions, q.shuffle_options, q.status,
    (select count(*) from public.quiz_attempts a where a.quiz_id = q.id and a.submitted_at is not null),
    qq.id, qq.question_type, qq.question_text, qq.explanation, qq.points, qq.sort_order,
    qo.id, qo.option_text, qo.is_correct, qo.sort_order
  from public.quizzes q
  left join public.quiz_questions qq on qq.quiz_id = q.id
  left join public.quiz_options qo on qo.question_id = qq.id
  where q.id = p_quiz_id
  order by qq.sort_order nulls last, qq.id nulls last, qo.sort_order nulls last, qo.id nulls last;
end;
$$;

revoke all on function public.get_admin_quiz_authoring(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_quiz_authoring(uuid) to authenticated;

-- =====================================================================================
-- 3. Learning resource reorder
-- =====================================================================================
create or replace function public.reorder_learning_resources(p_topic_id uuid, p_resource_ids uuid[])
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_manage_learning_topic((select owner_organization_id from public.learning_topics where id = p_topic_id)) then
    raise exception 'LEARNING_SCOPE_DENIED';
  end if;
  if p_resource_ids is null or cardinality(p_resource_ids) <> (select count(*) from public.learning_resources where topic_id = p_topic_id)
    or (select count(distinct x) from unnest(p_resource_ids) x) <> cardinality(p_resource_ids)
    or exists (select 1 from unnest(p_resource_ids) x where not exists (select 1 from public.learning_resources r where r.id = x and r.topic_id = p_topic_id)) then
    raise exception 'INVALID_RESOURCE_ORDER';
  end if;
  update public.learning_resources r set sort_order = x.ord - 1, updated_at = now()
  from unnest(p_resource_ids) with ordinality x(id, ord) where r.id = x.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'LEARNING_RESOURCES_REORDERED', 'learning_topic', p_topic_id,
    (select owner_organization_id from public.learning_topics where id = p_topic_id),
    jsonb_build_object('resource_count', cardinality(p_resource_ids)));
  return true;
end;
$$;

revoke all on function public.reorder_learning_resources(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_learning_resources(uuid, uuid[]) to authenticated;

-- =====================================================================================
-- 4. Quiz trusted mutations
-- =====================================================================================
create or replace function public.create_quiz_draft(
  p_topic_id uuid, p_title text, p_description text, p_pass_score numeric, p_time_limit_minutes integer,
  p_max_attempts integer, p_shuffle_questions boolean, p_shuffle_options boolean
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select owner_organization_id into v_org from public.learning_topics where id = p_topic_id;
  if not found then raise exception 'TOPIC_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content(p_topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 300 then raise exception 'INVALID_QUIZ_TITLE'; end if;
  if p_pass_score is null or p_pass_score not between 0 and 100 then raise exception 'INVALID_PASS_SCORE'; end if;
  if p_time_limit_minutes is not null and p_time_limit_minutes not between 1 and 1440 then raise exception 'INVALID_TIME_LIMIT'; end if;
  if p_max_attempts is not null and p_max_attempts not between 1 and 100 then raise exception 'INVALID_MAX_ATTEMPTS'; end if;
  insert into public.quizzes(topic_id, title, description, pass_score, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, status)
  values (p_topic_id, btrim(p_title), p_description, p_pass_score, p_time_limit_minutes, p_max_attempts,
    coalesce(p_shuffle_questions, false), coalesce(p_shuffle_options, false), 'DRAFT') returning id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'QUIZ_CREATED', 'quiz', v_id, v_org, jsonb_build_object('topic_id', p_topic_id, 'status', 'DRAFT'));
  return v_id;
end;
$$;

revoke all on function public.create_quiz_draft(uuid, text, text, numeric, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.create_quiz_draft(uuid, text, text, numeric, integer, integer, boolean, boolean) to authenticated;

create or replace function public.update_quiz_metadata(
  p_quiz_id uuid, p_title text, p_description text, p_pass_score numeric, p_time_limit_minutes integer,
  p_max_attempts integer, p_shuffle_questions boolean, p_shuffle_options boolean
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_quiz public.quizzes%rowtype; v_org uuid; v_attempted boolean;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 300 then raise exception 'INVALID_QUIZ_TITLE'; end if;
  if p_pass_score is null or p_pass_score not between 0 and 100 then raise exception 'INVALID_PASS_SCORE'; end if;
  if p_time_limit_minutes is not null and p_time_limit_minutes not between 1 and 1440 then raise exception 'INVALID_TIME_LIMIT'; end if;
  if p_max_attempts is not null and p_max_attempts not between 1 and 100 then raise exception 'INVALID_MAX_ATTEMPTS'; end if;
  v_attempted := public.quiz_has_submitted_attempts(p_quiz_id);
  if v_attempted and (
    p_pass_score is distinct from v_quiz.pass_score or p_time_limit_minutes is distinct from v_quiz.time_limit_minutes
    or p_max_attempts is distinct from v_quiz.max_attempts or p_shuffle_questions is distinct from v_quiz.shuffle_questions
    or p_shuffle_options is distinct from v_quiz.shuffle_options
  ) then raise exception 'QUIZ_HAS_ATTEMPTS_IMMUTABLE'; end if;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  update public.quizzes set title = btrim(p_title), description = p_description, pass_score = p_pass_score,
    time_limit_minutes = p_time_limit_minutes, max_attempts = p_max_attempts,
    shuffle_questions = coalesce(p_shuffle_questions, false), shuffle_options = coalesce(p_shuffle_options, false), updated_at = now()
  where id = p_quiz_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), 'QUIZ_UPDATED', 'quiz', p_quiz_id, v_org,
    jsonb_build_object('title', v_quiz.title, 'status', v_quiz.status), jsonb_build_object('title', btrim(p_title)));
  return true;
end;
$$;

revoke all on function public.update_quiz_metadata(uuid, text, text, numeric, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_quiz_metadata(uuid, text, text, numeric, integer, integer, boolean, boolean) to authenticated;

create or replace function public.set_quiz_status(p_quiz_id uuid, p_status text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_quiz public.quizzes%rowtype; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if p_status not in ('PUBLISHED', 'CLOSED') then raise exception 'INVALID_QUIZ_TRANSITION'; end if;
  if p_status = 'PUBLISHED' and v_quiz.status <> 'DRAFT' then raise exception 'INVALID_QUIZ_TRANSITION'; end if;
  if p_status = 'CLOSED' and v_quiz.status not in ('DRAFT', 'PUBLISHED') then raise exception 'INVALID_QUIZ_TRANSITION'; end if;
  if p_status = 'PUBLISHED' then perform public.validate_quiz_for_publish(p_quiz_id); end if;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  update public.quizzes set status = p_status, updated_at = now() where id = p_quiz_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, before_data, after_data)
  values (auth.uid(), case p_status when 'PUBLISHED' then 'QUIZ_PUBLISHED' else 'QUIZ_CLOSED' end,
    'quiz', p_quiz_id, v_org, jsonb_build_object('status', v_quiz.status), jsonb_build_object('status', p_status));
  return true;
end;
$$;

revoke all on function public.set_quiz_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_quiz_status(uuid, text) to authenticated;

create or replace function public.upsert_quiz_question(
  p_quiz_id uuid, p_question_type text, p_question_text text, p_explanation text, p_points numeric,
  p_sort_order integer, p_question_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_quiz public.quizzes%rowtype; v_id uuid; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if v_quiz.status <> 'DRAFT' then raise exception 'QUIZ_NOT_DRAFT'; end if;
  if public.quiz_has_submitted_attempts(p_quiz_id) then raise exception 'QUIZ_HAS_ATTEMPTS_IMMUTABLE'; end if;
  if p_question_type not in ('SINGLE', 'MULTIPLE') then raise exception 'INVALID_QUESTION_TYPE'; end if;
  if p_question_text is null or btrim(p_question_text) = '' or length(p_question_text) > 5000 then raise exception 'INVALID_QUESTION'; end if;
  if p_points is null or p_points <= 0 or p_points > 1000 then raise exception 'INVALID_POINTS'; end if;
  if p_sort_order is null or p_sort_order not between 0 and 10000 then raise exception 'INVALID_SORT_ORDER'; end if;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  if p_question_id is null then
    insert into public.quiz_questions(quiz_id, question_type, question_text, explanation, points, sort_order)
    values (p_quiz_id, p_question_type, btrim(p_question_text), p_explanation, p_points, p_sort_order) returning id into v_id;
  else
    update public.quiz_questions set question_type = p_question_type, question_text = btrim(p_question_text),
      explanation = p_explanation, points = p_points, sort_order = p_sort_order
    where id = p_question_id and quiz_id = p_quiz_id returning id into v_id;
    if v_id is null then raise exception 'QUESTION_NOT_FOUND'; end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), case when p_question_id is null then 'QUIZ_QUESTION_CREATED' else 'QUIZ_QUESTION_UPDATED' end,
    'quiz_question', v_id, v_org, jsonb_build_object('quiz_id', p_quiz_id));
  return v_id;
end;
$$;

revoke all on function public.upsert_quiz_question(uuid, text, text, text, numeric, integer, uuid) from public, anon, authenticated;
grant execute on function public.upsert_quiz_question(uuid, text, text, text, numeric, integer, uuid) to authenticated;

create or replace function public.delete_quiz_question(p_quiz_id uuid, p_question_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_quiz public.quizzes%rowtype; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if v_quiz.status <> 'DRAFT' or public.quiz_has_submitted_attempts(p_quiz_id) then raise exception 'QUIZ_CONTENT_NOT_DELETABLE'; end if;
  if not exists (select 1 from public.quiz_questions where id = p_question_id and quiz_id = p_quiz_id) then raise exception 'QUESTION_NOT_FOUND'; end if;
  delete from public.quiz_questions where id = p_question_id and quiz_id = p_quiz_id;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'QUIZ_QUESTION_DELETED', 'quiz_question', p_question_id, v_org, jsonb_build_object('quiz_id', p_quiz_id));
  return true;
end;
$$;

revoke all on function public.delete_quiz_question(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_quiz_question(uuid, uuid) to authenticated;

create or replace function public.upsert_quiz_option(
  p_question_id uuid, p_option_text text, p_is_correct boolean, p_sort_order integer, p_option_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_question public.quiz_questions%rowtype; v_quiz public.quizzes%rowtype; v_id uuid; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_question from public.quiz_questions where id = p_question_id;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  select * into v_quiz from public.quizzes where id = v_question.quiz_id;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if v_quiz.status <> 'DRAFT' or public.quiz_has_submitted_attempts(v_quiz.id) then raise exception 'QUIZ_CONTENT_NOT_EDITABLE'; end if;
  if p_option_text is null or btrim(p_option_text) = '' or length(p_option_text) > 2000 then raise exception 'INVALID_OPTION'; end if;
  if p_sort_order is null or p_sort_order not between 0 and 10000 then raise exception 'INVALID_SORT_ORDER'; end if;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  if p_option_id is null then
    insert into public.quiz_options(question_id, option_text, is_correct, sort_order)
    values (p_question_id, btrim(p_option_text), coalesce(p_is_correct, false), p_sort_order) returning id into v_id;
  else
    update public.quiz_options set option_text = btrim(p_option_text), is_correct = coalesce(p_is_correct, false), sort_order = p_sort_order
    where id = p_option_id and question_id = p_question_id returning id into v_id;
    if v_id is null then raise exception 'OPTION_NOT_FOUND'; end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), case when p_option_id is null then 'QUIZ_OPTION_CREATED' else 'QUIZ_OPTION_UPDATED' end,
    'quiz_option', v_id, v_org, jsonb_build_object('question_id', p_question_id));
  return v_id;
end;
$$;

revoke all on function public.upsert_quiz_option(uuid, text, boolean, integer, uuid) from public, anon, authenticated;
grant execute on function public.upsert_quiz_option(uuid, text, boolean, integer, uuid) to authenticated;

create or replace function public.delete_quiz_option(p_question_id uuid, p_option_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_question public.quiz_questions%rowtype; v_quiz public.quizzes%rowtype; v_org uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_question from public.quiz_questions where id = p_question_id;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  select * into v_quiz from public.quizzes where id = v_question.quiz_id;
  if not public.can_manage_quiz_content(v_quiz.topic_id) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if v_quiz.status <> 'DRAFT' or public.quiz_has_submitted_attempts(v_quiz.id) then raise exception 'QUIZ_CONTENT_NOT_DELETABLE'; end if;
  if not exists (select 1 from public.quiz_options where id = p_option_id and question_id = p_question_id) then raise exception 'OPTION_NOT_FOUND'; end if;
  delete from public.quiz_options where id = p_option_id and question_id = p_question_id;
  select owner_organization_id into v_org from public.learning_topics where id = v_quiz.topic_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'QUIZ_OPTION_DELETED', 'quiz_option', p_option_id, v_org, jsonb_build_object('question_id', p_question_id));
  return true;
end;
$$;

revoke all on function public.delete_quiz_option(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_quiz_option(uuid, uuid) to authenticated;

create or replace function public.reorder_quiz_questions(p_quiz_id uuid, p_question_ids uuid[])
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not exists (select 1 from public.quizzes where id = p_quiz_id) then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content((select topic_id from public.quizzes where id = p_quiz_id)) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if (select status from public.quizzes where id = p_quiz_id) <> 'DRAFT' or public.quiz_has_submitted_attempts(p_quiz_id) then raise exception 'QUIZ_CONTENT_NOT_EDITABLE'; end if;
  if p_question_ids is null or cardinality(p_question_ids) <> (select count(*) from public.quiz_questions where quiz_id = p_quiz_id)
    or (select count(distinct x) from unnest(p_question_ids) x) <> cardinality(p_question_ids)
    or exists (select 1 from unnest(p_question_ids) x where not exists (select 1 from public.quiz_questions q where q.id = x and q.quiz_id = p_quiz_id)) then
    raise exception 'INVALID_QUESTION_ORDER';
  end if;
  update public.quiz_questions q set sort_order = x.ord - 1 from unnest(p_question_ids) with ordinality x(id, ord) where q.id = x.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'QUIZ_QUESTIONS_REORDERED', 'quiz', p_quiz_id,
    jsonb_build_object('question_count', cardinality(p_question_ids)));
  return true;
end;
$$;

revoke all on function public.reorder_quiz_questions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_quiz_questions(uuid, uuid[]) to authenticated;

create or replace function public.reorder_quiz_options(p_question_id uuid, p_option_ids uuid[])
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_quiz_id uuid;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select q.quiz_id into v_quiz_id from public.quiz_questions q where q.id = p_question_id;
  if v_quiz_id is null then raise exception 'QUESTION_NOT_FOUND'; end if;
  if not public.can_manage_quiz_content((select qz.topic_id from public.quizzes qz where qz.id = v_quiz_id)) then raise exception 'QUIZ_SCOPE_DENIED'; end if;
  if (select status from public.quizzes where id = v_quiz_id) <> 'DRAFT' or public.quiz_has_submitted_attempts(v_quiz_id) then raise exception 'QUIZ_CONTENT_NOT_EDITABLE'; end if;
  if p_option_ids is null or cardinality(p_option_ids) <> (select count(*) from public.quiz_options where question_id = p_question_id)
    or (select count(distinct x) from unnest(p_option_ids) x) <> cardinality(p_option_ids)
    or exists (select 1 from unnest(p_option_ids) x where not exists (select 1 from public.quiz_options o where o.id = x and o.question_id = p_question_id)) then
    raise exception 'INVALID_OPTION_ORDER';
  end if;
  update public.quiz_options o set sort_order = x.ord - 1 from unnest(p_option_ids) with ordinality x(id, ord) where o.id = x.id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'QUIZ_OPTIONS_REORDERED', 'quiz_question', p_question_id,
    jsonb_build_object('option_count', cardinality(p_option_ids)));
  return true;
end;
$$;

revoke all on function public.reorder_quiz_options(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_quiz_options(uuid, uuid[]) to authenticated;

-- Direct table DML is not an authoring API. All authoring writes go through the functions above.
revoke insert, update, delete on public.quizzes, public.quiz_questions, public.quiz_options from authenticated;
revoke select on public.quiz_questions, public.quiz_options from authenticated;

-- Keep P4-04's end-user result/question RPC privileges unchanged and explicitly deny anonymous
-- access to every P4-05 authoring function.
