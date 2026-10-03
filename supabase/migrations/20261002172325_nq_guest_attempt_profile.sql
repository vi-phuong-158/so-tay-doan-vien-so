-- Existing quiz_attempts.user_id references public.profiles, so each guest needs a
-- minimal non-member profile before the attempt RPC can create its first row.
create or replace function public.ensure_nq_quiz_guest()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  guest_id uuid := auth.uid();
begin
  if guest_id is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
  then
    raise exception 'NQ_GUEST_SESSION_REQUIRED';
  end if;

  if not exists (
    select 1 from public.quizzes quiz
    join public.learning_topics topic on topic.id = quiz.topic_id
    where quiz.bank_code = 'NQ_300'
      and quiz.status = 'PUBLISHED'
      and topic.status = 'PUBLISHED'
      and topic.visibility_level = 'PUBLIC'
  ) then
    raise exception 'QUIZ_NOT_PUBLISHED';
  end if;

  insert into public.profiles(id, full_name, account_status)
  values (guest_id, 'Khách làm bài', 'INVITED')
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.profiles
    where id = guest_id and account_status in ('INVITED', 'ACTIVE')
  ) then
    raise exception 'NQ_GUEST_PROFILE_INVALID';
  end if;

  insert into quiz_private.nq_guest_accounts(user_id)
  values (guest_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object('ready', true);
end;
$$;
revoke all on function public.ensure_nq_quiz_guest() from public, anon, authenticated;
grant execute on function public.ensure_nq_quiz_guest() to authenticated;
