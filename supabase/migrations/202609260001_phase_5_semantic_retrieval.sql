-- P5 semantic retrieval: keep lexical retrieval, add pgvector evidence candidates,
-- and only search reviewed/current/retrieval-enabled evidence inside the caller's scope.

alter table public.document_chunks
  add column if not exists embedding_model text;

create index if not exists idx_document_chunks_embedding_model_p5
  on public.document_chunks (embedding_model)
  where embedding is not null;

create or replace function public.enforce_evidence_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.document_version_id is not null and old.review_status = 'APPROVED' then
    if new.document_id is distinct from old.document_id
       or new.document_version_id is distinct from old.document_version_id
       or new.article_id is distinct from old.article_id
       or new.content is distinct from old.content
       or new.content_hash is distinct from old.content_hash
       or new.locator is distinct from old.locator
       or new.selected_by is distinct from old.selected_by
       or new.selected_reason is distinct from old.selected_reason
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.embedding is distinct from old.embedding
       or new.embedding_model is distinct from old.embedding_model then
      raise exception 'APPROVED_EVIDENCE_IS_IMMUTABLE' using errcode = 'check_violation';
    end if;
    if new.review_status <> 'APPROVED' then
      raise exception 'APPROVED_EVIDENCE_CANNOT_REOPEN' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.search_published_knowledge(text, integer);
create function public.search_published_knowledge(
  p_query text,
  p_match_count integer default 24
)
returns table (
  article_id uuid,
  evidence_id uuid,
  document_id uuid,
  document_version_id uuid,
  title text,
  evidence_text text,
  locator jsonb,
  rank real,
  exact_match boolean
)
language sql stable security invoker set search_path = public
as $$
  with input as (
    select btrim(left(coalesce(p_query, ''), 2000)) as raw_query,
           plainto_tsquery('simple', left(btrim(coalesce(p_query, '')), 2000)) as query,
           least(greatest(coalesce(p_match_count, 24), 1), 48) as match_count
  ), candidates as (
    select a.id as article_id, e.id as evidence_id, a.document_id, a.document_version_id,
           a.title, e.content as evidence_text, e.locator,
           greatest(
             ts_rank_cd(to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '')), input.query),
             ts_rank_cd(to_tsvector('simple', e.content), input.query)
           )::real as rank,
           strpos(lower(coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '') || ' ' || e.content), lower(input.raw_query)) > 0 as exact_match
      from input
      join public.knowledge_articles a on true
      join public.documents d on d.id = a.document_id
      join public.document_versions v on v.id = a.document_version_id and v.document_id = d.id
      join public.document_chunks e on e.article_id = a.id and e.document_version_id = v.id
     where input.raw_query <> ''
       and a.review_status = 'APPROVED' and a.is_current and a.retrieval_enabled
       and d.status = 'PUBLISHED' and d.source_class <> 'CLASS_E_SUPERSEDED'
       and d.retrieval_enabled and d.current_version_id = v.id and v.is_current
       and e.review_status = 'APPROVED'
       and public.can_access_document(d.id)
       and (input.query <> ''::tsquery and (
         to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '')) @@ input.query
         or to_tsvector('simple', e.content) @@ input.query
       ) or strpos(lower(coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '') || ' ' || e.content), lower(input.raw_query)) > 0)
  )
  select candidates.article_id, candidates.evidence_id, candidates.document_id,
         candidates.document_version_id, candidates.title, candidates.evidence_text,
         candidates.locator, candidates.rank, candidates.exact_match
    from candidates
   order by candidates.exact_match desc, candidates.rank desc, candidates.article_id, candidates.evidence_id
   limit (select match_count from input);
$$;

create or replace function public.search_semantic_knowledge(
  p_query_embedding vector(768),
  p_embedding_model text,
  p_match_count integer default 24,
  p_similarity_threshold real default 0.55
)
returns table (
  article_id uuid,
  evidence_id uuid,
  document_id uuid,
  document_version_id uuid,
  title text,
  evidence_text text,
  locator jsonb,
  similarity real
)
language sql stable security invoker set search_path = public
as $$
  with eligible as materialized (
    select a.id as article_id, e.id as evidence_id, d.id as document_id,
           v.id as document_version_id, a.title, e.content as evidence_text,
           e.locator, e.embedding
      from public.document_chunks e
      join public.knowledge_articles a on a.id = e.article_id
      join public.documents d on d.id = a.document_id
      join public.document_versions v on v.id = a.document_version_id and v.document_id = d.id
     where p_query_embedding is not null
       and p_embedding_model is not null and btrim(p_embedding_model) <> ''
       and e.embedding is not null and vector_dims(e.embedding) = 768
       and e.embedding_model = p_embedding_model
       and a.review_status = 'APPROVED' and a.is_current and a.retrieval_enabled
       and d.status = 'PUBLISHED' and d.source_class <> 'CLASS_E_SUPERSEDED'
       and d.retrieval_enabled and d.current_version_id = v.id and v.is_current
       and e.document_version_id = v.id and e.review_status = 'APPROVED'
       and public.can_access_document(d.id)
  ), ranked as (
    select eligible.*,
           (1 - (eligible.embedding <=> p_query_embedding))::real as similarity
      from eligible
  )
  select ranked.article_id, ranked.evidence_id, ranked.document_id,
         ranked.document_version_id, ranked.title, ranked.evidence_text,
         ranked.locator, ranked.similarity
    from ranked
   where ranked.similarity >= greatest(0, least(coalesce(p_similarity_threshold, 0.55), 1))
   order by ranked.similarity desc, ranked.article_id, ranked.evidence_id
   limit least(greatest(coalesce(p_match_count, 24), 1), 48);
$$;

revoke all on function public.search_published_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.search_published_knowledge(text, integer) to authenticated;
revoke all on function public.search_semantic_knowledge(vector, text, integer, real) from public, anon, authenticated;
grant execute on function public.search_semantic_knowledge(vector, text, integer, real) to authenticated;

create or replace function public.store_knowledge_evidence_embeddings(
  p_article_id uuid,
  p_embedding_model text,
  p_embeddings jsonb
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_article public.knowledge_articles%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_hash text;
begin
  if p_article_id is null or p_embedding_model is null or btrim(p_embedding_model) = ''
     or jsonb_typeof(p_embeddings) is distinct from 'array' then
    raise exception 'INVALID_EVIDENCE_EMBEDDINGS';
  end if;
  if jsonb_array_length(p_embeddings) > 12 then raise exception 'INVALID_EVIDENCE_EMBEDDINGS'; end if;
  select * into v_article from public.knowledge_articles where id = p_article_id for update;
  if not found or v_article.review_status not in ('DRAFT', 'PENDING_REVIEW') then
    raise exception 'KNOWLEDGE_ARTICLE_NOT_EMBEDDABLE';
  end if;
  for v_item in select value from jsonb_array_elements(p_embeddings) loop
    v_hash := coalesce(v_item->>'content_hash', '');
    if length(v_hash) <> 64 or jsonb_typeof(v_item->'embedding') is distinct from 'array' then
      raise exception 'EMBEDDING_DIMENSION_INVALID';
    end if;
    if jsonb_array_length(v_item->'embedding') <> 768 then
      raise exception 'EMBEDDING_DIMENSION_INVALID';
    end if;
    update public.document_chunks e
       set embedding = (v_item->'embedding')::text::vector(768), embedding_model = p_embedding_model
     where e.article_id = p_article_id and e.content_hash = v_hash and e.review_status = 'PENDING';
    if not found then raise exception 'EVIDENCE_EMBEDDING_TARGET_NOT_FOUND'; end if;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'EVIDENCE_EMBEDDINGS_REQUIRED'; end if;
  return v_count;
end;
$$;

revoke all on function public.store_knowledge_evidence_embeddings(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.store_knowledge_evidence_embeddings(uuid, text, jsonb) to service_role;

comment on column public.document_chunks.embedding_model is
  'Embedding model identity. Semantic retrieval only compares query and evidence vectors from the same configured model.';
comment on function public.search_semantic_knowledge(vector, text, integer, real) is
  'Scoped semantic evidence search. Authorization, publication, current-version, retrieval opt-in, article approval and evidence approval filters execute in SQL.';
