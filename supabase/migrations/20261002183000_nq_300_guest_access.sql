-- NQ_300 is a public, free practice quiz. Anonymous Auth supplies a per-browser owner id
-- for attempts; this does not grant access to the rest of the authenticated application.

update public.learning_topics topic
set visibility_level = 'PUBLIC', updated_at = now()
from public.quizzes quiz
where quiz.topic_id = topic.id
  and quiz.bank_code = 'NQ_300'
  and quiz.status = 'PUBLISHED'
  and topic.status = 'PUBLISHED';

create table quiz_private.nq_guest_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table quiz_private.nq_guest_accounts enable row level security;
revoke all on table quiz_private.nq_guest_accounts from public, anon, authenticated;

create or replace function public.is_nq_300_guest()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
    and exists (
      select 1 from quiz_private.nq_guest_accounts guest
      where guest.user_id = auth.uid()
    );
$$;
revoke all on function public.is_nq_300_guest() from public, anon, authenticated;
grant execute on function public.is_nq_300_guest() to authenticated;

create or replace function public.can_access_nq_300_guest_topic(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_nq_300_guest()
    and exists (
      select 1
      from public.learning_topics topic
      join public.quizzes quiz on quiz.topic_id = topic.id
      where topic.id = p_topic_id
        and topic.status = 'PUBLISHED'
        and topic.visibility_level = 'PUBLIC'
        and quiz.bank_code = 'NQ_300'
        and quiz.status = 'PUBLISHED'
    );
$$;
revoke all on function public.can_access_nq_300_guest_topic(uuid) from public, anon, authenticated;
grant execute on function public.can_access_nq_300_guest_topic(uuid) to authenticated;

create or replace function public.can_access_nq_300_guest_quiz(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_nq_300_guest()
    and exists (
      select 1
      from public.quizzes quiz
      join public.learning_topics topic on topic.id = quiz.topic_id
      where quiz.id = p_quiz_id
        and quiz.bank_code = 'NQ_300'
        and quiz.status = 'PUBLISHED'
        and topic.status = 'PUBLISHED'
        and topic.visibility_level = 'PUBLIC'
    );
$$;
revoke all on function public.can_access_nq_300_guest_quiz(uuid) from public, anon, authenticated;
grant execute on function public.can_access_nq_300_guest_quiz(uuid) to authenticated;

create policy "NQ quiz guests read the published NQ topic"
on public.learning_topics for select to authenticated
using (public.can_access_nq_300_guest_topic(id));

create policy "NQ quiz guests read only NQ quiz metadata"
on public.quizzes for select to authenticated
using (public.can_access_nq_300_guest_quiz(id));

-- Restrictive guards prevent other permissive policies from widening guest access.
create policy "NQ quiz guests are limited to NQ topic metadata"
on public.learning_topics as restrictive for select to authenticated
using (not public.is_nq_300_guest() or public.can_access_nq_300_guest_topic(id));

create policy "NQ quiz guests are limited to NQ quiz metadata"
on public.quizzes as restrictive for select to authenticated
using (not public.is_nq_300_guest() or public.can_access_nq_300_guest_quiz(id));

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

  insert into quiz_private.nq_guest_accounts(user_id)
  values (guest_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object('ready', true);
end;
$$;
revoke all on function public.ensure_nq_quiz_guest() from public, anon, authenticated;
grant execute on function public.ensure_nq_quiz_guest() to authenticated;

-- Preserve the audited lifecycle implementation and change only its auth gate.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.nq_attempt(text,uuid,uuid,uuid)'::regprocedure);
  definition := replace(definition,
    'if auth.uid() is null or not public.is_active_user() then raise exception ''ACCOUNT_NOT_ACTIVE''; end if;',
    'if auth.uid() is null or (not public.is_active_user() and not public.is_nq_300_guest()) then raise exception ''ACCOUNT_NOT_ACTIVE''; end if;');
  definition := replace(definition,
    'if bank.id is null or not public.can_access_quiz(bank.id) then raise exception ''QUIZ_NOT_ACCESSIBLE''; end if;',
    'if bank.id is null or (public.is_nq_300_guest() and not public.can_access_nq_300_guest_quiz(bank.id)) or (not public.is_nq_300_guest() and not public.can_access_quiz(bank.id)) then raise exception ''QUIZ_NOT_ACCESSIBLE''; end if;');
  if definition not like '%public.is_nq_300_guest()%' then
    raise exception 'NQ attempt auth guard replacement did not match';
  end if;
  if definition not like '%public.can_access_nq_300_guest_quiz(bank.id)%' then
    raise exception 'NQ attempt guest scope replacement did not match';
  end if;
  if definition like '%if auth.uid() is null or not public.is_active_user() then%'
    or definition like '%if bank.id is null or not public.can_access_quiz(bank.id) then%'
  then
    raise exception 'NQ attempt access guard replacement did not match';
  end if;
  execute definition;
end;
$$;
revoke all on function public.nq_attempt(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.nq_attempt(text,uuid,uuid,uuid) to authenticated;

do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.lookup_nq_questions(text,integer)'::regprocedure);
  definition := replace(definition,
    'if auth.uid() is null or not public.is_active_user() then raise exception ''ACCOUNT_NOT_ACTIVE''; end if;',
    'if auth.uid() is null or (not public.is_active_user() and not public.is_nq_300_guest()) then raise exception ''ACCOUNT_NOT_ACTIVE''; end if;');
  definition := replace(definition,
    'if bank is null or not public.can_access_quiz(bank) then raise exception ''QUIZ_NOT_ACCESSIBLE''; end if;',
    'if bank is null or (public.is_nq_300_guest() and not public.can_access_nq_300_guest_quiz(bank)) or (not public.is_nq_300_guest() and not public.can_access_quiz(bank)) then raise exception ''QUIZ_NOT_ACCESSIBLE''; end if;');
  if definition like '%if auth.uid() is null or not public.is_active_user() then%'
    or definition like '%if bank is null or not public.can_access_quiz(bank) then%'
  then
    raise exception 'NQ lookup auth guard replacement did not match';
  end if;
  if definition not like '%public.can_access_nq_300_guest_quiz(bank)%' then
    raise exception 'NQ lookup guest scope replacement did not match';
  end if;
  execute definition;
end;
$$;
revoke all on function public.lookup_nq_questions(text,integer) from public,anon,authenticated;
grant execute on function public.lookup_nq_questions(text,integer) to authenticated;

-- Keep anonymous Auth tables bounded without disturbing permanent accounts.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'nq-quiz-guest-cleanup') then
    perform cron.schedule(
      'nq-quiz-guest-cleanup',
      '17 3 * * *',
      $cleanup$
        delete from auth.users account
        using quiz_private.nq_guest_accounts guest
        where account.id = guest.user_id
          and account.is_anonymous is true
          and guest.created_at < now() - interval '30 days';
      $cleanup$
    );
  end if;
end;
$$;
