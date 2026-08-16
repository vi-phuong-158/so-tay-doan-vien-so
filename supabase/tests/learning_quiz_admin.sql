-- Phase 4 · P4-05 acceptance — trusted Learning + Quiz admin authoring.
-- The test deliberately reads is_correct only through the scoped admin RPC and proves that
-- authenticated direct table access is closed after the migration.

begin;
select no_plan();

create or replace function set_auth_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function reset_auth() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select reset_auth();

insert into public.learning_topics (id, title, description, status, visibility_level, owner_organization_id, created_by)
values ('5e000001-0000-4000-8000-000000000001', 'P4-05 Admin Topic', 'd', 'DRAFT', 'INTERNAL_YOUTH',
  '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

insert into public.quizzes (id, topic_id, title, pass_score, status)
values ('5f000001-0000-4000-8000-000000000001', '5e000001-0000-4000-8000-000000000001', 'P4-05 Quiz', 50, 'DRAFT')
on conflict (id) do nothing;

-- A scoped admin can list and read the bounded admin model.
select set_auth_user('11112222-3333-4444-5555-666677778888');
select ok((select count(*) from public.get_admin_learning_topics(null, null, null, null, 20, 0)
  where id = '5e000001-0000-4000-8000-000000000001') = 1,
  'admin list returns only scoped learning topics');
select lives_ok($$select * from public.get_admin_learning_topic('5e000001-0000-4000-8000-000000000001')$$,
  'scoped admin can open a topic');
select lives_ok($$select public.create_quiz_draft('5e000001-0000-4000-8000-000000000001', 'Created quiz', null, 60, null, null, false, false)$$,
  'scoped admin creates a quiz draft through the trusted RPC');

create temp table p405_question on commit drop as
  select public.upsert_quiz_question('5f000001-0000-4000-8000-000000000001', 'SINGLE', 'Câu 1', 'Giải thích', 1, 0, null) as id;
create temp table p405_correct_option on commit drop as
  select public.upsert_quiz_option((select id from p405_question), 'Đáp án đúng', true, 0, null) as id;
select public.upsert_quiz_option((select id from p405_question), 'Đáp án sai', false, 1, null);
select ok((select option_is_correct from public.get_admin_quiz_authoring('5f000001-0000-4000-8000-000000000001')
  where option_id = (select id from p405_correct_option)),
  'trusted admin authoring read returns is_correct after scope validation');

-- Publishing validates the complete question/option contract server-side.
select lives_ok($$select public.set_quiz_status('5f000001-0000-4000-8000-000000000001', 'PUBLISHED')$$,
  'a quiz with a single correct answer and two options passes publication validation');

-- A member sees neither authoring rows nor answer keys and cannot mutate tables directly.
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select throws_ok($$select count(*) from public.quiz_options$$, null,
  'member direct quiz_options read remains closed');
select throws_ok($$insert into public.quiz_options(question_id, option_text, is_correct)
  values ((select id from p405_question), 'hostile', true)$$, null,
  'member cannot plant an answer key through direct insert');
select throws_ok($$update public.quizzes set title = 'hostile' where id = '5f000001-0000-4000-8000-000000000001'$$,
  null, 'member cannot update quiz metadata directly');

-- Historical attempts lock scoring content but allow cosmetic metadata edits.
select reset_auth();
update public.learning_topics set status = 'PUBLISHED' where id = '5e000001-0000-4000-8000-000000000001';
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
create temp table p405_attempt as select * from public.start_quiz_attempt('5f000001-0000-4000-8000-000000000001');
select public.submit_quiz_attempt((select attempt_id from p405_attempt), format('[{"question_id":"%s","selected_option_ids":["%s"]}]',
  (select id from p405_question), (select id from p405_correct_option))::jsonb);
select set_auth_user('11112222-3333-4444-5555-666677778888');
select lives_ok($$select public.update_quiz_metadata('5f000001-0000-4000-8000-000000000001', 'Renamed', 'cosmetic', 50, null, null, false, false)$$,
  'submitted quiz still permits cosmetic title/description edits');
select throws_ok($$select public.update_quiz_metadata('5f000001-0000-4000-8000-000000000001', 'Renamed', 'cosmetic', 70, null, null, false, false)$$,
  'QUIZ_HAS_ATTEMPTS_IMMUTABLE', 'submitted quiz blocks scoring-affecting metadata changes');
select throws_ok(format($$select public.upsert_quiz_option('%s', 'changed', false, 0, '%s')$$,
  (select id from p405_question), (select id from p405_correct_option)), 'QUIZ_CONTENT_NOT_EDITABLE',
  'submitted quiz blocks answer-key changes');

select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('quizzes', 'quiz_questions', 'quiz_options')
    and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), 0,
  'authenticated has no direct quiz authoring DML grant');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('quiz_questions', 'quiz_options')
    and grantee = 'authenticated' and privilege_type = 'SELECT'), 0,
  'authenticated has no direct answer-key/question select grant');
select is((select count(*)::integer from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('quiz_has_submitted_attempts', 'validate_quiz_for_publish', 'set_learning_topic_status',
      'get_admin_learning_topics', 'get_admin_learning_topic', 'get_admin_learning_resources', 'get_admin_quizzes',
      'get_admin_quiz_authoring', 'reorder_learning_resources', 'create_quiz_draft', 'update_quiz_metadata',
      'set_quiz_status', 'upsert_quiz_question', 'delete_quiz_question', 'upsert_quiz_option', 'delete_quiz_option',
      'reorder_quiz_questions', 'reorder_quiz_options')
    and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'every P4-05 SECURITY DEFINER function pins search_path');

select reset_auth();
select * from finish();
rollback;
