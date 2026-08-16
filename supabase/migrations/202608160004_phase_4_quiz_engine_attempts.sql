-- Phase 4 / P4-04: quiz engine & attempts.
--
-- quizzes/quiz_questions/quiz_options/quiz_attempts/quiz_answers already exist
-- (202607300001_initial_schema.sql) with the exact field set docs/01-product-spec.md §8.5
-- describes. This migration does NOT rebuild that model. It closes two real defects the P4-04
-- baseline survey found in the shipped access model, and adds the trusted attempt lifecycle that
-- never existed.
--
-- Defect 1 -- visibility-blind quiz reads (same bug class P4-03 fixed for learning_topics):
--   create policy "active users read published quizzes" on quizzes
--     for select using (is_active_user() and status='PUBLISHED');
--   create policy "active users read quiz questions" on quiz_questions
--     for select using (is_active_user() and exists(select 1 from quizzes q where q.id=quiz_id
--       and q.status='PUBLISHED'));
-- Neither policy looks at the parent learning_topics row at all. A PUBLISHED quiz attached to a
-- DRAFT topic, an ORGANIZATION_ONLY topic of a different organization, or a RESTRICTED topic was
-- therefore directly readable by ANY active user via plain REST/SELECT, bypassing every visibility
-- rule P4-03 established. Fixed below with can_access_quiz(), which delegates to
-- can_access_learning_topic().
--
-- Defect 2 -- scoring bypass via direct quiz_attempts insert (the actual critical finding here;
-- not the exact "is_correct exposed" scenario the task asked us to check for -- that one turned
-- out to already be closed, see below):
--   grant select, insert, update on table public.quiz_attempts to authenticated;
--   create policy "users insert own attempts" on quiz_attempts for insert with check (user_id=auth.uid());
-- RLS WITH CHECK restricts which ROWS may be inserted (only rows where user_id = the caller), but
-- it does not restrict which COLUMNS may be set. Any authenticated client could therefore call
-- PostgREST directly with
--   insert into quiz_attempts (quiz_id, user_id, score, passed, attempt_number, submitted_at)
--   values (<any quiz>, auth.uid(), 100, true, 1, now())
-- and it would succeed under RLS -- a complete, self-supplied "passed" result with no question
-- ever answered, bypassing scoring, attempt-limit and time-limit logic entirely. This migration
-- revokes INSERT (and UPDATE, defensively -- there was already no UPDATE policy, so this was not
-- independently exploitable, but the grant existed and did nothing useful) on quiz_attempts and
-- quiz_answers from authenticated. All attempt creation and finalization now go through
-- start_quiz_attempt/submit_quiz_attempt, which run as SECURITY DEFINER and therefore run with the
-- owning (superuser, in this project's migration/Supabase setup) role's privileges, bypassing RLS
-- for their own writes -- the same mechanism every other trusted RPC in this repository already
-- relies on (see publish_document, create_learning_topic_draft, etc.).
--
-- What was already correct and is preserved as-is:
--   -- quiz_options deliberately has no frontend SELECT policy because is_correct must not leak.
-- quiz_options ships with RLS enabled and ZERO select policy, so `authenticated`'s table-level
-- SELECT grant is neutralized by RLS: a direct `select * from quiz_options` already returns zero
-- rows for a normal user, and is_correct was never actually reachable via direct table access.
-- This migration keeps that shape (no end-user policy on quiz_options) and adds only a scoped
-- admin ALL policy so a future authoring UI has somewhere trusted to write to.
--
-- One additional hardening, not strictly a security defect but tightened to match product intent
-- ("Hiển thị đáp án sau khi hoàn thành tùy cấu hình" -- docs/01-product-spec.md §7.6): the shipped
-- quiz_questions policy exposed `explanation` to any user who could read a PUBLISHED quiz, even
-- before they had attempted it, which can leak a hint toward the correct answer. quiz_questions is
-- given the same treatment as quiz_options -- no general end-user SELECT policy -- and explanation
-- text is now returned only via the post-submission result RPC, scoped to the caller's own
-- completed attempt.
--
-- Out of scope, untouched: AI/RAG, embeddings, document_chunks, quiz authoring UI (a future task;
-- the minimal admin write surface added here is direct-table RLS, following the same precedent
-- P4-01 used for document_relations -- not a new RPC surface, since no UI consumes it yet).

-- =====================================================================================
-- 1. Light data-integrity constraints (schema already matches spec; these are conservative adds)
-- =====================================================================================
alter table public.quizzes drop constraint if exists quizzes_pass_score_check;
alter table public.quizzes add constraint quizzes_pass_score_check
  check (pass_score between 0 and 100);
alter table public.quizzes drop constraint if exists quizzes_time_limit_check;
alter table public.quizzes add constraint quizzes_time_limit_check
  check (time_limit_minutes is null or time_limit_minutes between 1 and 1440);
alter table public.quizzes drop constraint if exists quizzes_max_attempts_check;
alter table public.quizzes add constraint quizzes_max_attempts_check
  check (max_attempts is null or max_attempts between 1 and 100);

alter table public.quiz_questions drop constraint if exists quiz_questions_type_check;
alter table public.quiz_questions add constraint quiz_questions_type_check
  check (question_type in ('SINGLE', 'MULTIPLE'));
alter table public.quiz_questions drop constraint if exists quiz_questions_points_check;
alter table public.quiz_questions add constraint quiz_questions_points_check
  check (points > 0 and points <= 1000);

alter table public.quiz_attempts drop constraint if exists quiz_attempts_score_check;
alter table public.quiz_attempts add constraint quiz_attempts_score_check
  check (score is null or score between 0 and 100);
alter table public.quiz_attempts drop constraint if exists quiz_attempts_attempt_number_check;
alter table public.quiz_attempts add constraint quiz_attempts_attempt_number_check
  check (attempt_number >= 1);
-- submitted_at/score/passed move together: a row is either "in progress" (all null) or
-- "finalized" (all set). No half-finalized state is representable.
alter table public.quiz_attempts drop constraint if exists quiz_attempts_finalization_check;
alter table public.quiz_attempts add constraint quiz_attempts_finalization_check
  check (
    (submitted_at is null and score is null and passed is null)
    or (submitted_at is not null and score is not null and passed is not null)
  );

-- =====================================================================================
-- 2. Access helpers
-- =====================================================================================
-- Reused directly from P4-03: whether the caller may administer content owned by p_org.
-- A quiz's manage-authority is the manage-authority of its parent topic; a quiz with no topic
-- (topic_id is nullable in the shipped schema) has no organization to check against, so only a
-- SYSTEM_ADMIN can manage or preview it -- conservative by construction, not an oversight.
create or replace function public.can_manage_quiz_content(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic_id is null then public.has_role('SYSTEM_ADMIN')
    else public.can_manage_learning_topic(
      (select t.owner_organization_id from public.learning_topics t where t.id = p_topic_id)
    )
  end;
$$;

revoke all on function public.can_manage_quiz_content(uuid) from public, anon, authenticated;
-- Referenced from a policy on quizzes/quiz_questions/quiz_options, and those tables already grant
-- SELECT to anon -- so anon must be able to EXECUTE this or RLS evaluation raises
-- `permission denied for function` instead of denying. This is the exact regression P4-02 hit
-- with can_manage_document and P4-03 hit with can_manage_learning_topic; granted up front here.
grant execute on function public.can_manage_quiz_content(uuid) to anon, authenticated;

create or replace function public.can_access_quiz(p_quiz_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  quiz record;
begin
  if not public.is_active_user() then return false; end if;

  select * into quiz from public.quizzes where id = p_quiz_id;
  if not found then return false; end if;

  -- Content admins of the owning topic see the quiz in any status, so they can review it before
  -- publishing. A topicless quiz is admin-only (SYSTEM_ADMIN), never end-user visible.
  if public.can_manage_quiz_content(quiz.topic_id) then return true; end if;

  if quiz.topic_id is null then return false; end if;
  if quiz.status <> 'PUBLISHED' then return false; end if;

  -- The actual fix for defect 1: delegate to the same visibility ladder P4-03 already proved
  -- correct (PUBLIC/INTERNAL_YOUTH open, ORGANIZATION_ONLY org-matched, RESTRICTED admin-only,
  -- DRAFT/CLOSED/ARCHIVED topics invisible) instead of re-deriving it here.
  return public.can_access_learning_topic(quiz.topic_id);
end $$;

revoke all on function public.can_access_quiz(uuid) from public, anon, authenticated;
grant execute on function public.can_access_quiz(uuid) to anon, authenticated;

-- =====================================================================================
-- 3. Replace the visibility-blind policies; remove the pre-attempt explanation leak
-- =====================================================================================
drop policy if exists "active users read published quizzes" on public.quizzes;
drop policy if exists "active users read accessible quizzes" on public.quizzes;
create policy "active users read accessible quizzes" on public.quizzes
for select using (public.can_access_quiz(id));

drop policy if exists "content admins manage quizzes" on public.quizzes;
create policy "content admins manage quizzes" on public.quizzes
for all
using (public.can_manage_quiz_content(topic_id))
with check (public.can_manage_quiz_content(topic_id));

-- No general end-user policy on quiz_questions (matches quiz_options' existing posture): question
-- text/points/order are served only through get_attempt_questions, and `explanation` only through
-- the post-submission result RPC, scoped to the caller's own completed attempt.
drop policy if exists "active users read quiz questions" on public.quiz_questions;
drop policy if exists "content admins manage quiz questions" on public.quiz_questions;
create policy "content admins manage quiz questions" on public.quiz_questions
for all
using (
  exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_manage_quiz_content(q.topic_id))
)
with check (
  exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_manage_quiz_content(q.topic_id))
);

-- quiz_options: unchanged for end users (still zero select policy); add the admin path that never
-- existed, so a future authoring UI can manage options without a table grant workaround.
drop policy if exists "content admins manage quiz options" on public.quiz_options;
create policy "content admins manage quiz options" on public.quiz_options
for all
using (
  exists (
    select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
    where qq.id = question_id and public.can_manage_quiz_content(q.topic_id)
  )
)
with check (
  exists (
    select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
    where qq.id = question_id and public.can_manage_quiz_content(q.topic_id)
  )
);

-- =====================================================================================
-- 4. Grants -- admin content write opens (bounded by the policies above); attempt tables close
-- =====================================================================================
grant insert, update, delete on table public.quizzes to authenticated;
grant insert, update, delete on table public.quiz_questions to authenticated;
grant select, insert, update, delete on table public.quiz_options to authenticated;

-- quiz_questions/quiz_options now carry no end-user policy at all -- everything routes through
-- get_attempt_questions/get_attempt_result. anon's table-level SELECT grant is therefore dead
-- weight that RLS already neutralizes (as it always has for quiz_options), but it is revoked
-- outright rather than left in place: matching the stricter precedent this codebase already uses
-- for email_queue/email_logs (fully revoked from anon/authenticated) rather than the looser one
-- quiz_options originally shipped with (granted, relying solely on the missing policy). One fewer
-- grant to reason about if a policy is ever added back carelessly.
revoke select on table public.quiz_questions from anon, authenticated;
revoke select on table public.quiz_options from anon;
grant select on table public.quiz_questions to authenticated; -- admin-only ALL policy still gates every row

-- Defect 2 fix: close the direct-insert scoring bypass. All attempt creation/finalization is now
-- RPC-only. SELECT stays -- "users read own attempts"/"users read own answers" are correct as-is
-- and are the surface a completed result is read back through.
revoke insert, update, delete on table public.quiz_attempts from authenticated;
revoke insert, update, delete on table public.quiz_answers from authenticated;

-- =====================================================================================
-- 5. Indexes
-- =====================================================================================
create index if not exists idx_quizzes_topic on public.quizzes (topic_id, status);
create index if not exists idx_quiz_questions_quiz_order on public.quiz_questions (quiz_id, sort_order, id);
create index if not exists idx_quiz_options_question_order on public.quiz_options (question_id, sort_order, id);
create index if not exists idx_quiz_attempts_quiz_user on public.quiz_attempts (quiz_id, user_id, attempt_number desc);
create index if not exists idx_quiz_attempts_active on public.quiz_attempts (quiz_id, user_id) where submitted_at is null;

-- =====================================================================================
-- 6. Trusted attempt lifecycle
-- =====================================================================================

-- Intro/preview payload. Deliberately does NOT create or touch any attempt row -- viewing the
-- intro screen must never consume an attempt slot. Returns quiz-level facts only; no
-- questions/options at all, so there is nothing here that could ever be an answer key.
create or replace function public.get_quiz_intro(p_quiz_id uuid)
returns table(
  quiz_id uuid,
  title text,
  description text,
  pass_score numeric,
  time_limit_minutes integer,
  max_attempts integer,
  question_count integer,
  attempts_used integer,
  attempts_remaining integer,
  has_active_attempt boolean,
  topic_open boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  quiz record;
  topic record;
  v_used integer;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_access_quiz(p_quiz_id) then raise exception 'QUIZ_NOT_ACCESSIBLE'; end if;

  select * into quiz from public.quizzes where id = p_quiz_id;
  select * into topic from public.learning_topics where id = quiz.topic_id;

  select count(*)::integer into v_used
  from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.user_id = auth.uid();

  return query select
    quiz.id,
    quiz.title,
    quiz.description,
    quiz.pass_score,
    quiz.time_limit_minutes,
    quiz.max_attempts,
    (select count(*)::integer from public.quiz_questions qq where qq.quiz_id = p_quiz_id),
    v_used,
    case when quiz.max_attempts is null then null else greatest(quiz.max_attempts - v_used, 0) end,
    exists (
      select 1 from public.quiz_attempts a
      where a.quiz_id = p_quiz_id and a.user_id = auth.uid() and a.submitted_at is null
    ),
    (topic.close_at is null or topic.close_at > now());
end $$;

revoke all on function public.get_quiz_intro(uuid) from public, anon, authenticated;
grant execute on function public.get_quiz_intro(uuid) to authenticated;

-- Start (or resume) an attempt. This is the only place a quiz_attempts row is ever created.
--
-- Resume convention (documented, not incidental): if the caller already has an unsubmitted
-- attempt for this quiz that has not expired, that same attempt is returned rather than creating
-- a new one -- a page refresh or re-clicking Start must not burn an attempt slot. An unsubmitted
-- attempt that HAS expired is left exactly as it is (submitted_at stays permanently null; it is a
-- dead, terminal row) and does not block starting a fresh attempt, provided max_attempts is not
-- exhausted -- an abandoned/expired attempt still counts toward the limit, so idling cannot be
-- used to obtain unlimited retries, but it also cannot trap the user in a permanently unusable
-- state if they simply never finished in time.
--
-- Concurrency: a transaction-scoped advisory lock keyed on (quiz_id, user_id) serializes
-- concurrent start requests from the same user for the same quiz. Under READ COMMITTED, the
-- second caller blocks until the first transaction commits, then re-reads the now-committed
-- max(attempt_number) -- so two simultaneous "Start" clicks can never observe the same "next
-- number" and race into a duplicate (the unique(quiz_id,user_id,attempt_number) constraint is the
-- backstop if that reasoning is ever wrong).
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns table(
  attempt_id uuid,
  quiz_id uuid,
  attempt_number integer,
  started_at timestamptz,
  expires_at timestamptz,
  resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quiz record;
  topic record;
  v_existing public.quiz_attempts%rowtype;
  v_expires timestamptz;
  v_count integer;
  v_next integer;
  v_new public.quiz_attempts%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if not public.can_access_quiz(p_quiz_id) then raise exception 'QUIZ_NOT_ACCESSIBLE'; end if;

  select * into quiz from public.quizzes where id = p_quiz_id;
  if quiz.status <> 'PUBLISHED' then raise exception 'QUIZ_NOT_PUBLISHED'; end if;

  select * into topic from public.learning_topics where id = quiz.topic_id;
  if topic.close_at is not null and topic.close_at <= now() then
    raise exception 'TOPIC_CLOSED';
  end if;

  if not exists (select 1 from public.quiz_questions qq where qq.quiz_id = p_quiz_id) then
    raise exception 'QUIZ_HAS_NO_QUESTIONS';
  end if;

  select * into v_existing from public.quiz_attempts a
  where a.quiz_id = p_quiz_id and a.user_id = auth.uid() and a.submitted_at is null
  order by a.attempt_number desc limit 1
  for update;

  if found then
    v_expires := case when quiz.time_limit_minutes is null then null
      else v_existing.started_at + make_interval(mins => quiz.time_limit_minutes) end;
    if v_expires is null or v_expires > now() then
      return query select v_existing.id, v_existing.quiz_id, v_existing.attempt_number,
        v_existing.started_at, v_expires, true;
      return;
    end if;
    -- Expired and unsubmitted: leave it as a dead row (see comment above) and fall through to
    -- start a fresh attempt, subject to the same max_attempts check every path goes through.
  end if;

  perform pg_advisory_xact_lock(hashtext(p_quiz_id::text || auth.uid()::text));

  select count(*)::integer into v_count
  from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.user_id = auth.uid();
  if quiz.max_attempts is not null and v_count >= quiz.max_attempts then
    raise exception 'MAX_ATTEMPTS_REACHED';
  end if;

  select coalesce(max(a.attempt_number), 0) + 1 into v_next
  from public.quiz_attempts a where a.quiz_id = p_quiz_id and a.user_id = auth.uid();

  insert into public.quiz_attempts (quiz_id, user_id, attempt_number)
  values (p_quiz_id, auth.uid(), v_next)
  returning * into v_new;

  v_expires := case when quiz.time_limit_minutes is null then null
    else v_new.started_at + make_interval(mins => quiz.time_limit_minutes) end;

  return query select v_new.id, v_new.quiz_id, v_new.attempt_number, v_new.started_at, v_expires, false;
end $$;

revoke all on function public.start_quiz_attempt(uuid) from public, anon, authenticated;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;

-- Safe question/option payload for an attempt the caller owns. Callable for a fresh attempt and
-- again on resume -- both return the identical order, because the order is a pure deterministic
-- function of (attempt_id, shuffle flags), not something stored or re-rolled per call.
--
-- Shuffle strategy: when shuffle_questions/shuffle_options is set, order by
-- md5(attempt_id || row_id); otherwise by the authored sort_order. Both branches are cast to text
-- so a single ORDER BY expression covers either case, with the row id as a final, always-present
-- tiebreaker. This needs no extra column or table to persist the chosen order -- attempt_id is
-- already permanent, so the derived order is exactly as stable as the attempt row itself.
create or replace function public.get_attempt_questions(p_attempt_id uuid)
returns table(
  question_id uuid,
  question_type text,
  question_text text,
  points numeric,
  question_order integer,
  option_id uuid,
  option_text text,
  option_order integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  attempt record;
  quiz record;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into attempt from public.quiz_attempts a where a.id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if attempt.user_id <> auth.uid() then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;

  select * into quiz from public.quizzes where id = attempt.quiz_id;

  return query
  select
    qq.id, qq.question_type, qq.question_text, qq.points,
    row_number() over (
      order by case when quiz.shuffle_questions then md5(p_attempt_id::text || qq.id::text)
                    else lpad(qq.sort_order::text, 10, '0') end,
        qq.id
    )::integer as question_order,
    qo.id, qo.option_text,
    row_number() over (
      partition by qq.id
      order by case when quiz.shuffle_options then md5(p_attempt_id::text || qo.id::text)
                    else lpad(qo.sort_order::text, 10, '0') end,
        qo.id
    )::integer as option_order
  from public.quiz_questions qq
  join public.quiz_options qo on qo.question_id = qq.id
  where qq.quiz_id = attempt.quiz_id
  order by question_order, option_order;
  -- No is_correct column anywhere in this SELECT list -- the answer key cannot leak through this
  -- function even if a future edit adds a column to quiz_options, because the column list here is
  -- explicit, not `select *`.
end $$;

revoke all on function public.get_attempt_questions(uuid) from public, anon, authenticated;
grant execute on function public.get_attempt_questions(uuid) to authenticated;

-- Submit and score. The only place quiz_answers is ever written and the only place an attempt is
-- ever finalized. p_answers shape: jsonb array of
--   {"question_id": "<uuid>", "selected_option_ids": ["<uuid>", ...]}
-- Scoring rule: a question is correct iff the submitted option-id set is exactly equal to the set
-- of options with is_correct = true for that question (this reduces to ordinary single-choice
-- grading for SINGLE questions and is the standard exact-match rule for MULTIPLE ones; there is no
-- partial credit, matching the schema's single awarded_points-per-question shape).
create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns table(
  attempt_id uuid,
  score numeric,
  passed boolean,
  submitted_at timestamptz,
  attempt_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.quiz_attempts%rowtype;
  quiz record;
  v_expires timestamptz;
  v_total_points numeric := 0;
  v_earned numeric := 0;
  v_score numeric;
  v_passed boolean;
  item jsonb;
  v_question_id uuid;
  v_selected uuid[];
  q record;
  v_correct uuid[];
  v_is_correct boolean;
  v_points numeric;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'INVALID_SUBMISSION';
  end if;

  select * into attempt from public.quiz_attempts a where a.id = p_attempt_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if attempt.user_id <> auth.uid() then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;
  -- Re-checked after the row lock: this is what makes two concurrent submissions of the same
  -- attempt resolve deterministically -- the second caller blocks on FOR UPDATE, then sees
  -- submitted_at already set once the first commits, and is rejected. Nothing about scoring runs
  -- twice, and there is a single, stable terminal error code for the caller to react to.
  if attempt.submitted_at is not null then raise exception 'ATTEMPT_ALREADY_SUBMITTED'; end if;

  select * into quiz from public.quizzes where id = attempt.quiz_id;

  -- Fail closed on expiry: nothing is scored or written for a late submission.
  if quiz.time_limit_minutes is not null then
    v_expires := attempt.started_at + make_interval(mins => quiz.time_limit_minutes);
    if now() > v_expires then raise exception 'ATTEMPT_EXPIRED'; end if;
  end if;

  -- Validate every submitted question/option id belongs to this quiz before scoring anything, so
  -- a malformed or hostile payload fails before any write -- not partway through. A UUID cast on
  -- a non-UUID string raises a raw Postgres error (22P02); caught here and turned into the same
  -- clean INVALID_SUBMISSION code the caller already has to handle, rather than leaking a
  -- database-shaped error message to the frontend.
  begin
    for item in select * from jsonb_array_elements(p_answers)
    loop
      if item->>'question_id' is null then raise exception 'INVALID_SUBMISSION'; end if;
      v_question_id := (item->>'question_id')::uuid;
      if not exists (select 1 from public.quiz_questions qq where qq.id = v_question_id and qq.quiz_id = attempt.quiz_id) then
        raise exception 'INVALID_QUESTION_FOR_QUIZ';
      end if;
      select array(select (jsonb_array_elements_text(coalesce(item->'selected_option_ids', '[]'::jsonb)))::uuid)
        into v_selected;
      if exists (
        select 1 from unnest(v_selected) as sel(id)
        where not exists (select 1 from public.quiz_options qo where qo.id = sel.id and qo.question_id = v_question_id)
      ) then
        raise exception 'INVALID_OPTION_FOR_QUESTION';
      end if;
    end loop;
  exception
    when invalid_text_representation then
      raise exception 'INVALID_SUBMISSION';
  end;

  -- Score every question belonging to the quiz -- not just the ones the client bothered to send,
  -- so an omitted question is scored as unanswered (0 points) rather than silently absent from
  -- quiz_answers. This is what guarantees "successful submission writes exactly the expected
  -- answer rows": one row per quiz question, always.
  for q in select * from public.quiz_questions qq where qq.quiz_id = attempt.quiz_id
  loop
    select coalesce(array_agg(qo.id order by qo.id), '{}') into v_correct
    from public.quiz_options qo where qo.question_id = q.id and qo.is_correct = true;

    v_selected := '{}';
    select array(select (jsonb_array_elements_text(coalesce(elem->'selected_option_ids', '[]'::jsonb)))::uuid order by 1)
      into v_selected
    from jsonb_array_elements(p_answers) elem
    where (elem->>'question_id')::uuid = q.id;
    v_selected := coalesce(v_selected, '{}');

    v_is_correct := (v_selected = v_correct);
    v_points := case when v_is_correct then q.points else 0 end;

    insert into public.quiz_answers (attempt_id, question_id, selected_option_ids, is_correct, awarded_points)
    values (p_attempt_id, q.id, v_selected, v_is_correct, v_points);

    v_total_points := v_total_points + q.points;
    v_earned := v_earned + v_points;
  end loop;

  v_score := case when v_total_points > 0 then round((v_earned / v_total_points) * 100, 2) else 0 end;
  v_passed := v_score >= quiz.pass_score;

  update public.quiz_attempts
  set score = v_score, passed = v_passed, submitted_at = now()
  where id = p_attempt_id
  returning * into attempt;

  -- Never the answer key: only the final numeric outcome.
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, organization_id, after_data)
  values (auth.uid(), 'QUIZ_ATTEMPT_SUBMITTED', 'quiz_attempt', p_attempt_id,
    (select owner_organization_id from public.learning_topics where id = quiz.topic_id),
    jsonb_build_object('quiz_id', attempt.quiz_id, 'score', v_score, 'passed', v_passed,
      'attempt_number', attempt.attempt_number));

  return query select attempt.id, attempt.score, attempt.passed, attempt.submitted_at, attempt.attempt_number;
end $$;

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

-- Result detail for a completed attempt: per-question correctness, awarded points and
-- explanation. Deliberately gated on submitted_at IS NOT NULL -- there is no code path that
-- returns this for an in-progress attempt, so an answer key can never be disclosed pre-submission
-- through this function either.
create or replace function public.get_attempt_result(p_attempt_id uuid)
returns table(
  question_id uuid,
  question_text text,
  explanation text,
  points numeric,
  selected_option_ids uuid[],
  correct_option_ids uuid[],
  is_correct boolean,
  awarded_points numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  attempt record;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;

  select * into attempt from public.quiz_attempts a where a.id = p_attempt_id;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if attempt.user_id <> auth.uid()
    and not exists (
      select 1 from public.quizzes q join public.learning_topics t on t.id = q.topic_id
      where q.id = attempt.quiz_id and public.can_manage_learning_topic(t.owner_organization_id)
    )
    and not public.has_role('SYSTEM_ADMIN')
  then
    raise exception 'ATTEMPT_SCOPE_DENIED';
  end if;
  if attempt.submitted_at is null then raise exception 'ATTEMPT_NOT_SUBMITTED'; end if;

  return query
  select
    qq.id, qq.question_text, qq.explanation, qq.points,
    ans.selected_option_ids,
    coalesce((select array_agg(qo.id order by qo.id) from public.quiz_options qo
              where qo.question_id = qq.id and qo.is_correct = true), '{}'),
    ans.is_correct, ans.awarded_points
  from public.quiz_questions qq
  join public.quiz_answers ans on ans.question_id = qq.id and ans.attempt_id = p_attempt_id
  where qq.quiz_id = attempt.quiz_id
  order by qq.sort_order, qq.id;
end $$;

revoke all on function public.get_attempt_result(uuid) from public, anon, authenticated;
grant execute on function public.get_attempt_result(uuid) to authenticated;
