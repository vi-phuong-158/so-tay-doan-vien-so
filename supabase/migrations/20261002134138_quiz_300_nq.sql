-- One fixed self-study bank, reusing the Phase 4 question/attempt/answer model.
alter table public.quizzes add column bank_code text;
create unique index quizzes_bank_code_unique on public.quizzes(bank_code) where bank_code is not null;
alter table public.quiz_questions add column question_number integer check (question_number between 1 and 300);
create unique index quiz_question_number_unique on public.quiz_questions(quiz_id, question_number)
  where question_number is not null;
alter table public.quiz_options add column source_label text check (source_label in ('A','B','C','D'));
create unique index quiz_option_label_unique on public.quiz_options(question_id, source_label)
  where source_label is not null;

-- Contains the immutable sampled question/option order, text and grading key.
-- Never grant client access: a JSON snapshot on public.quiz_attempts would leak its key.
create schema if not exists quiz_private;
revoke all on schema quiz_private from public, anon, authenticated;
create table quiz_private.attempt_snapshots (
  attempt_id uuid primary key references public.quiz_attempts(id) on delete cascade,
  expires_at timestamptz not null,
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','SUBMITTED','EXPIRED')),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) = 30),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object')
);
alter table quiz_private.attempt_snapshots enable row level security;
revoke all on table quiz_private.attempt_snapshots from public, anon, authenticated;

create function public.nq_attempt(
  p_action text, p_attempt_id uuid default null, p_question_id uuid default null, p_option_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bank public.quizzes%rowtype;
  attempt public.quiz_attempts%rowtype;
  state quiz_private.attempt_snapshots%rowtype;
  payload jsonb;
  question jsonb;
  v_questions jsonb;
  v_correct integer := 0;
  v_answered integer := 0;
  v_selected uuid;
  v_number integer;
  v_now timestamptz;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if p_action is null or p_action not in ('resume','start','answer','submit','read') then raise exception 'INVALID_SUBMISSION'; end if;
  select * into bank from public.quizzes where bank_code = 'NQ_300';
  if bank.id is null or not public.can_access_quiz(bank.id) then raise exception 'QUIZ_NOT_ACCESSIBLE'; end if;
  -- Serializes start, autosave and finalize across tabs and concurrent requests.
  perform pg_advisory_xact_lock(hashtext(bank.id::text || auth.uid()::text));
  if p_attempt_id is not null then
    select * into attempt from public.quiz_attempts where id = p_attempt_id for update;
    if attempt.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
    if attempt.user_id <> auth.uid() or attempt.quiz_id <> bank.id then raise exception 'ATTEMPT_SCOPE_DENIED'; end if;
  elsif p_action in ('start','resume') then
    select * into attempt from public.quiz_attempts
      where quiz_id = bank.id and user_id = auth.uid() order by attempt_number desc limit 1 for update;
  else
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  v_now := clock_timestamp();
  if p_action = 'start' and (attempt.id is null or attempt.submitted_at is not null) then
    if bank.status <> 'PUBLISHED' then raise exception 'QUIZ_NOT_PUBLISHED'; end if;
    if exists (select 1 from public.learning_topics where id = bank.topic_id and close_at <= v_now) then raise exception 'TOPIC_CLOSED'; end if;
    if (select count(*) from public.quiz_questions where quiz_id = bank.id and question_number is not null) <> 300 then
      raise exception 'QUIZ_BANK_INCOMPLETE';
    end if;
    select coalesce(max(attempt_number), 0) + 1 into v_number from public.quiz_attempts
      where quiz_id = bank.id and user_id = auth.uid();
    insert into public.quiz_attempts(quiz_id,user_id,attempt_number,started_at)
      values(bank.id,auth.uid(),v_number,v_now) returning * into attempt;
    select jsonb_agg(jsonb_build_object('id', q.id, 'question_number',q.question_number,
      'text',q.question_text,'correct_option_id',(select o.id from public.quiz_options o where o.question_id=q.id and o.is_correct),
      'options',(select jsonb_agg(jsonb_build_object('id',o.id,'text',o.option_text) order by random())
        from public.quiz_options o where o.question_id=q.id)) order by q.draw)
      into v_questions
      from (select qq.*, random() as draw from public.quiz_questions qq
        where qq.quiz_id=bank.id and qq.question_number is not null order by draw limit 30) q;
    if exists (select 1 from jsonb_array_elements(v_questions) q
      where q->>'correct_option_id' is null or jsonb_array_length(q->'options') <> 4) then raise exception 'QUIZ_BANK_INCOMPLETE'; end if;
    insert into quiz_private.attempt_snapshots(attempt_id,expires_at,questions)
      values(attempt.id,v_now + interval '20 minutes',v_questions);
  end if;
  if attempt.id is null then return null; end if;
  select * into state from quiz_private.attempt_snapshots where attempt_id=attempt.id for update;
  if state.attempt_id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  v_now := clock_timestamp();
  if p_action = 'answer' and attempt.submitted_at is not null then raise exception 'ATTEMPT_ALREADY_SUBMITTED'; end if;
  if p_action = 'answer' and v_now < state.expires_at then
    select q into question from jsonb_array_elements(state.questions) q where q->>'id'=p_question_id::text;
    if question is null then raise exception 'INVALID_QUESTION_FOR_QUIZ'; end if;
    if p_option_id is not null and not exists (select 1 from jsonb_array_elements(question->'options') o where o->>'id'=p_option_id::text) then
      raise exception 'INVALID_OPTION_FOR_QUESTION';
    end if;
    state.answers := jsonb_set(state.answers, array[p_question_id::text], to_jsonb(coalesce(p_option_id::text,'')));
    update quiz_private.attempt_snapshots set answers=state.answers where attempt_id=attempt.id;
  end if;
  -- Late traffic cannot save new answers. Any read/start/submit lazily finalizes at the
  -- immutable deadline using answers already accepted by the server, even after reconnect.
  if attempt.submitted_at is null and (p_action='submit' or v_now >= state.expires_at) then
    for question in select value from jsonb_array_elements(state.questions) loop
      v_selected := nullif(state.answers->>(question->>'id'),'')::uuid;
      if v_selected is not null then v_answered := v_answered + 1; end if;
      if v_selected::text = question->>'correct_option_id' then v_correct := v_correct + 1; end if;
      insert into public.quiz_answers(attempt_id,question_id,selected_option_ids,is_correct,awarded_points)
        values(attempt.id,(question->>'id')::uuid,
          case when v_selected is null then '{}'::uuid[] else array[v_selected] end,
          coalesce(v_selected::text=question->>'correct_option_id',false),
          case when v_selected::text=question->>'correct_option_id' then 1 else 0 end);
    end loop;
    update public.quiz_attempts set submitted_at=least(v_now,state.expires_at),
      score=round(v_correct::numeric/30*100,2), passed=false where id=attempt.id returning * into attempt;
    state.status := case when v_now >= state.expires_at then 'EXPIRED' else 'SUBMITTED' end;
    update quiz_private.attempt_snapshots set status=state.status where attempt_id=attempt.id;
  end if;
  if attempt.submitted_at is not null then
    select count(*) filter(where is_correct),count(*) filter(where cardinality(selected_option_ids)>0)
      into v_correct,v_answered from public.quiz_answers where attempt_id=attempt.id;
  end if;
  select jsonb_agg(case when attempt.submitted_at is null then q - 'correct_option_id' else q end order by ord)
    into payload from jsonb_array_elements(state.questions) with ordinality as e(q,ord);
  return jsonb_build_object('attempt_id',attempt.id,'started_at',attempt.started_at,'expires_at',state.expires_at,
    'server_now',clock_timestamp(),'status',state.status,'submitted_at',attempt.submitted_at,
    'questions',payload,'answers',state.answers) ||
    case when attempt.submitted_at is null then '{}'::jsonb else
      jsonb_build_object('correct',v_correct,'wrong',v_answered-v_correct,'unanswered',30-v_answered,
        'percentage',attempt.score,'elapsed_seconds',floor(extract(epoch from attempt.submitted_at-attempt.started_at))) end;
end $$;
revoke all on function public.nq_attempt(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.nq_attempt(text,uuid,uuid,uuid) to authenticated;

create function public.lookup_nq_questions(p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare bank uuid; term text := btrim(coalesce(p_search,'')); number_text text; result jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select id into bank from public.quizzes where bank_code='NQ_300';
  if bank is null or not public.can_access_quiz(bank) then raise exception 'QUIZ_NOT_ACCESSIBLE'; end if;
  if p_offset is null or p_offset < 0 or p_offset > 300 or length(term)>200 then raise exception 'INVALID_SUBMISSION'; end if;
  number_text := substring(term from '(?i)^(?:câu\s*)?([0-9]{1,3})$');
  select coalesce(jsonb_agg(jsonb_build_object('question_number',q.question_number,'text',q.question_text,
    'options',(select jsonb_agg(jsonb_build_object('label',o.source_label,'text',o.option_text) order by o.source_label)
      from public.quiz_options o where o.question_id=q.id),
    'correct_answer',(select o.source_label from public.quiz_options o where o.question_id=q.id and o.is_correct))
    order by q.question_number),'[]') into result
  from (select qq.* from public.quiz_questions qq where qq.quiz_id=bank and
    case when number_text is not null then qq.question_number=number_text::integer else
      strpos(lower(qq.question_text),lower(term))>0 or exists(select 1 from public.quiz_options o
        where o.question_id=qq.id and strpos(lower(o.option_text),lower(term))>0) end
    order by qq.question_number limit 20 offset p_offset) q;
  return result;
end $$;
revoke all on function public.lookup_nq_questions(text,integer) from public,anon,authenticated;
grant execute on function public.lookup_nq_questions(text,integer) to authenticated;

-- Keep the older multi-question Quiz engine unchanged for existing quizzes, but prevent
-- it from creating/scoring a 300-question attempt or bypassing this bank's snapshots.
do $$ declare name text; definition text; guard text; signature regprocedure;
begin
  foreach name in array array['start_quiz_attempt','get_attempt_questions','submit_quiz_attempt','get_attempt_result'] loop
    signature := case name when 'start_quiz_attempt' then 'public.start_quiz_attempt(uuid)'::regprocedure
      when 'get_attempt_questions' then 'public.get_attempt_questions(uuid)'::regprocedure
      when 'submit_quiz_attempt' then 'public.submit_quiz_attempt(uuid,jsonb)'::regprocedure
      else 'public.get_attempt_result(uuid)'::regprocedure end;
    definition := pg_get_functiondef(signature);
    guard := case when name='start_quiz_attempt' then
      'if exists(select 1 from public.quizzes where id=p_quiz_id and bank_code=''NQ_300'') then raise exception ''NQ_ATTEMPT_REQUIRED''; end if;'
      else 'if exists(select 1 from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id where a.id=p_attempt_id and q.bank_code=''NQ_300'') then raise exception ''NQ_ATTEMPT_REQUIRED''; end if;' end;
    execute regexp_replace(definition, '(?i)\mbegin\M', 'begin ' || guard);
  end loop;
end $$;
