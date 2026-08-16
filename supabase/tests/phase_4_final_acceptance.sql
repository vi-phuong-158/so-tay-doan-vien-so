-- Phase 4 / P4-06 integrated acceptance.
--
-- This is deliberately database/service-level evidence for the product journey:
-- Documents -> Learning -> Quiz. It uses rollback-bounded synthetic fixtures and does not
-- attempt the two runtime gates that require external actors/connections (P4-02R/P4-04R2).

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
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Admin creates the complete bounded fixture through the trusted authoring surfaces.
create temp table p4_document on commit drop as
  select public.create_document_draft(
    'P4-06 integrated document', 'GUIDE', null, 'Ban Thanh nien', current_date,
    null, null, null, 'Synthetic acceptance fixture', '{}', 'ORGANIZATION_ONLY',
    '22222222-2222-2222-2222-222222222222'
  ) as id;

create temp table p4_topic on commit drop as
  select public.create_learning_topic_draft(
    'P4-06 integrated topic', 'Synthetic acceptance fixture', 'Verify the complete journey',
    null, null, 'ORGANIZATION_ONLY', '22222222-2222-2222-2222-222222222222'
  ) as id;

create temp table p4_resource on commit drop as
  select public.upsert_learning_resource(
    (select id from p4_topic), 'TEXT', 'Integrated resource', 'Bounded fixture content', null, null, 0, null
  ) as id;

create temp table p4_quiz on commit drop as
  select public.create_quiz_draft(
    (select id from p4_topic), 'P4-06 integrated quiz', 'Synthetic acceptance fixture',
    50, null, 1, false, false
  ) as id;

create temp table p4_question on commit drop as
  select public.upsert_quiz_question(
    (select id from p4_quiz), 'SINGLE', 'Which answer is correct?', 'Post-submit explanation', 1, 0, null
  ) as id;

create temp table p4_correct_option on commit drop as
  select public.upsert_quiz_option((select id from p4_question), 'Correct', true, 0, null) as id;
select public.upsert_quiz_option((select id from p4_question), 'Incorrect', false, 1, null);

select lives_ok(
  format($$select public.attach_document_source_file('%s', '%s/source/synthetic.pdf', 1024)$$,
    (select id from p4_document), (select id from p4_document)),
  'admin attaches a bounded document source path through the trusted RPC'
);
select lives_ok($$select public.publish_document((select id from p4_document))$$,
  'admin publishes the synthetic document');
select lives_ok($$select public.set_learning_topic_status((select id from p4_topic), 'PUBLISHED')$$,
  'admin publishes the synthetic learning topic');
select lives_ok($$select public.set_quiz_status((select id from p4_quiz), 'PUBLISHED')$$,
  'admin publishes the validated synthetic quiz');

-- Org A member completes the end-user journey. Direct authoring reads remain closed.
select set_auth_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select is((select count(*)::integer from public.documents where id = (select id from p4_document)), 1,
  'Org A member reads the published organization-only document');
select is((select count(*)::integer from public.learning_topics where id = (select id from p4_topic)), 1,
  'Org A member reads the published organization-only topic');
select is((select count(*)::integer from public.learning_resources where id = (select id from p4_resource)), 1,
  'Org A member reads the resource through its accessible parent topic');
select is((select count(*)::integer from public.quizzes where id = (select id from p4_quiz)), 1,
  'Org A member opens the published quiz through the topic access boundary');
select throws_ok($$select count(*) from public.quiz_options$$, null,
  'Org A member cannot directly read quiz options or is_correct');

create temp table p4_attempt on commit drop as
  select * from public.start_quiz_attempt((select id from p4_quiz));
create temp table p4_safe_questions on commit drop as
  select * from public.get_attempt_questions((select attempt_id from p4_attempt));
select is((select count(*)::integer from p4_safe_questions), 2,
  'quiz delivery returns the two safe option rows');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'pg_temp' and table_name = 'p4_safe_questions' and column_name = 'is_correct'
), 'safe quiz delivery payload has no answer-key column');
select lives_ok(format($$select * from public.submit_quiz_attempt('%s', '[{"question_id":"%s","selected_option_ids":["%s"]}]'::jsonb)$$,
    (select attempt_id from p4_attempt), (select id from p4_question), (select id from p4_correct_option)),
  'member submits through the server-scored attempt RPC');
select is((select passed from public.quiz_attempts where id = (select attempt_id from p4_attempt)), true,
  'server-owned scoring records a passed result');

-- Org B cannot bypass the parent scope with known IDs, and a suspended user fails closed.
select set_auth_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
select is((select count(*)::integer from public.documents where id = (select id from p4_document)), 0,
  'Org B cannot read Org A document by direct ID');
select is((select count(*)::integer from public.learning_topics where id = (select id from p4_topic)), 0,
  'Org B cannot read Org A topic by direct ID');
select is((select count(*)::integer from public.learning_resources where id = (select id from p4_resource)), 0,
  'Org B cannot read Org A resource by direct ID');
select is((select count(*)::integer from public.quizzes where id = (select id from p4_quiz)), 0,
  'Org B cannot read Org A quiz by direct ID');
select throws_ok($$select public.start_quiz_attempt((select id from p4_quiz))$$, 'QUIZ_NOT_ACCESSIBLE',
  'Org B cannot start Org A quiz by direct ID');
select throws_ok($$select public.get_admin_learning_topic((select id from p4_topic))$$, 'TOPIC_NOT_FOUND',
  'Org B cannot call the scoped learning admin RPC');

select reset_auth();
update public.profiles set account_status = 'SUSPENDED'
where id = '99999999-9999-9999-9999-999999999999';
select set_auth_user('99999999-9999-9999-9999-999999999999');
select is((select count(*)::integer from public.documents where id = (select id from p4_document)), 0,
  'suspended user cannot read an otherwise scoped document');
select is((select count(*)::integer from public.learning_topics where id = (select id from p4_topic)), 0,
  'suspended user cannot read an otherwise scoped topic');
select throws_ok($$select public.start_quiz_attempt((select id from p4_quiz))$$, 'ACCOUNT_NOT_ACTIVE',
  'suspended user cannot start a quiz');
select throws_ok($$select * from public.get_admin_learning_topics(null, null, null, null, 20, 0)$$, 'ACCOUNT_NOT_ACTIVE',
  'suspended user cannot use admin RPCs');

-- Submitted attempts freeze scoring structure but allow cosmetic metadata correction.
select reset_auth();
select set_auth_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select lives_ok($$select public.update_quiz_metadata((select id from p4_quiz), 'Renamed quiz', 'Cosmetic correction', 50, null, 1, false, false)$$,
  'admin may edit cosmetic quiz metadata after submission');
select throws_ok($$select public.update_quiz_metadata((select id from p4_quiz), 'Renamed quiz', 'Cosmetic correction', 80, null, 1, false, false)$$,
  'QUIZ_HAS_ATTEMPTS_IMMUTABLE', 'admin cannot change pass score after submission');
select throws_ok(format($$select public.upsert_quiz_question('%s', 'SINGLE', 'Changed', null, 1, 0, '%s')$$,
    (select id from p4_quiz), (select id from p4_question)), 'QUIZ_HAS_ATTEMPTS_IMMUTABLE',
  'admin cannot change question text after submission');
select throws_ok(format($$select public.upsert_quiz_option('%s', 'Changed', false, 0, '%s')$$,
    (select id from p4_question), (select id from p4_correct_option)), 'QUIZ_CONTENT_NOT_EDITABLE',
  'admin cannot change the correct option after submission');
select ok((select option_is_correct from public.get_admin_quiz_authoring((select id from p4_quiz))
  where option_id = (select id from p4_correct_option)),
  'scoped admin authoring RPC may still read the answer key');

select reset_auth();
select is((select score from public.quiz_attempts where id = (select attempt_id from p4_attempt)), 100::numeric,
  'historical score remains unchanged');
select is((select selected_option_ids from public.quiz_answers where attempt_id = (select attempt_id from p4_attempt)
  and question_id = (select id from p4_question)), array[(select id from p4_correct_option)]::uuid[],
  'historical selected answer remains unchanged');

-- Direct authoring grants and all Phase 4 private buckets remain constrained.
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('quizzes', 'quiz_questions', 'quiz_options')
    and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), 0,
  'authenticated has no direct quiz authoring DML grant');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('quiz_questions', 'quiz_options')
    and grantee = 'authenticated' and privilege_type = 'SELECT'), 0,
  'authenticated has no direct question or answer-key SELECT grant');
select is((select count(*)::integer from storage.buckets
  where id in ('documents-private', 'learning-resources-private') and public = false), 2,
  'Phase 4 document and learning buckets remain private');

select reset_auth();
select * from finish();
rollback;
