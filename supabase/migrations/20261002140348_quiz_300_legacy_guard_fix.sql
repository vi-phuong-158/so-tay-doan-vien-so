-- Forward fix: the legacy submit function declares a record named q. A guard's
-- table alias q was resolved as that unassigned record by PL/pgSQL. Avoid collisions
-- without changing the legacy grader, its return shape, grants or other quizzes.
do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.get_attempt_questions(uuid)'::regprocedure,
    'public.submit_quiz_attempt(uuid,jsonb)'::regprocedure,
    'public.get_attempt_result(uuid)'::regprocedure
  ] loop
    definition := replace(pg_get_functiondef(signature),
      'join public.quizzes q on q.id=a.quiz_id where a.id=p_attempt_id and q.bank_code=''NQ_300''',
      'join public.quizzes nq_guard_bank on nq_guard_bank.id=a.quiz_id where a.id=p_attempt_id and nq_guard_bank.bank_code=''NQ_300''');
    execute definition;
  end loop;
end $$;
