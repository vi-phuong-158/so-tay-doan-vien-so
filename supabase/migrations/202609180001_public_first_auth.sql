-- Public-first is a database contract: anon receives only published PUBLIC rows.
-- Private buckets remain private; the Edge Function validates a public parent before signing.

create policy "anon reads published public documents" on public.documents
for select to anon
using (status = 'PUBLISHED' and visibility_level = 'PUBLIC');

grant select on table public.document_relations to anon;
create policy "anon reads relations between public documents" on public.document_relations
for select to anon using (
  exists (select 1 from public.documents source_document
          where source_document.id = source_document_id
            and source_document.status = 'PUBLISHED'
            and source_document.visibility_level = 'PUBLIC')
  and exists (select 1 from public.documents target_document
              where target_document.id = target_document_id
                and target_document.status = 'PUBLISHED'
                and target_document.visibility_level = 'PUBLIC')
);

create policy "anon reads published public learning topics" on public.learning_topics
for select to anon
using (status = 'PUBLISHED' and visibility_level = 'PUBLIC');

create policy "anon reads resources for public learning topics" on public.learning_resources
for select to anon using (
  exists (select 1 from public.learning_topics topic
          where topic.id = topic_id
            and topic.status = 'PUBLISHED'
            and topic.visibility_level = 'PUBLIC')
);

create policy "anon reads quizzes for public learning topics" on public.quizzes
for select to anon using (
  status = 'PUBLISHED'
  and exists (select 1 from public.learning_topics topic
              where topic.id = topic_id
                and topic.status = 'PUBLISHED'
                and topic.visibility_level = 'PUBLIC')
);

create policy "anon reads questions for public quizzes" on public.quiz_questions
for select to anon using (
  exists (select 1 from public.quizzes quiz
          join public.learning_topics topic on topic.id = quiz.topic_id
          where quiz.id = quiz_id
            and quiz.status = 'PUBLISHED'
            and topic.status = 'PUBLISHED'
            and topic.visibility_level = 'PUBLIC')
);

grant select on table public.innovation_projects to anon;
create policy "anon reads published public innovation projects" on public.innovation_projects
for select to anon
using (publish_status = 'PUBLISHED' and visibility_level = 'PUBLIC');

-- The public retrieval function deliberately does not reuse the authenticated scope function.
-- Its predicates are fixed here; callers cannot provide a visibility level or document id.
create or replace function public.search_public_knowledge(
  p_query text,
  p_match_count integer default 8
)
returns table (
  article_id uuid,
  evidence_id uuid,
  document_id uuid,
  document_version_id uuid,
  title text,
  evidence_text text,
  locator jsonb,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select plainto_tsquery('simple', left(btrim(coalesce(p_query, '')), 2000)) as query,
           least(greatest(coalesce(p_match_count, 8), 1), 8) as match_count
  )
  select article.id, evidence.id, article.document_id, article.document_version_id,
         article.title, evidence.content, evidence.locator,
         greatest(
           ts_rank_cd(to_tsvector('simple', coalesce(article.title, '') || ' ' || coalesce(article.summary, '') || ' ' || coalesce(article.content_text, '')), input.query),
           ts_rank_cd(to_tsvector('simple', evidence.content), input.query)
         )::real as rank
    from input
    join public.knowledge_articles article on true
    join public.documents document on document.id = article.document_id
    join public.document_chunks evidence on evidence.article_id = article.id
   where input.query <> ''::tsquery
     and document.status = 'PUBLISHED'
     and document.visibility_level = 'PUBLIC'
     and document.retrieval_enabled
     and article.review_status = 'APPROVED'
     and article.is_current
     and article.retrieval_enabled
     and evidence.review_status = 'APPROVED'
     and (
       to_tsvector('simple', coalesce(article.title, '') || ' ' || coalesce(article.summary, '') || ' ' || coalesce(article.content_text, '')) @@ input.query
       or to_tsvector('simple', evidence.content) @@ input.query
     )
   order by rank desc, article.updated_at desc, evidence.id
   limit (select match_count from input);
$$;

revoke all on function public.search_public_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.search_public_knowledge(text, integer) to anon, authenticated;

-- A hashed, time-bucketed key is the only public-AI telemetry retained. The table and counter
-- RPC are service-role-only, so clients cannot reset or inspect quotas.
create table if not exists public.public_ai_rate_limits (
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (request_key, window_started_at)
);
alter table public.public_ai_rate_limits enable row level security;
revoke all on table public.public_ai_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_ai_quota(
  p_request_key text,
  p_max_requests integer default 20
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if p_request_key !~ '^[a-f0-9]{64}$' or p_max_requests < 1 or p_max_requests > 100 then
    raise exception 'INVALID_PUBLIC_AI_QUOTA_INPUT';
  end if;

  insert into public.public_ai_rate_limits (request_key, window_started_at, request_count)
  values (p_request_key, v_window, 1)
  on conflict (request_key, window_started_at) do update
    set request_count = public.public_ai_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_public_ai_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_public_ai_quota(text, integer) to service_role;

create index if not exists idx_public_ai_rate_limits_expiry
  on public.public_ai_rate_limits (window_started_at);
