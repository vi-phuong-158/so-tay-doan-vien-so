begin;

select plan(4);

select is(
  has_table_privilege('anon', 'public.quiz_questions', 'SELECT'),
  false,
  'anon cannot directly read quiz questions; attempts remain the only question delivery path'
);
select is(
  has_table_privilege('anon', 'public.quiz_options', 'SELECT'),
  false,
  'anon cannot directly read quiz answer options'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quiz_questions'
      and policyname = 'anon reads questions for public quizzes'
  ),
  'no dead anon quiz-question policy remains after Public-First closure'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'public_ai_rate_limits'
      and policyname = 'service role manages public AI quotas'
    and roles = array['service_role']::name[]
  ),
  'public AI quota table has an explicit service-role-only policy'
);

select * from finish();
rollback;
