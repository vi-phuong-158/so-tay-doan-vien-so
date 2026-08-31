-- Phase 5 closure: reviewed evidence retrieval and fail-closed Ask AI controls.
-- Retrieval remains anchored to approved evidence; embeddings stay optional.

create or replace function public.set_document_retrieval_enabled(
  p_document_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_document from public.documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_document.owner_organization_id) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;
  if p_enabled and (v_document.status <> 'PUBLISHED' or v_document.source_class = 'CLASS_E_SUPERSEDED') then
    raise exception 'DOCUMENT_NOT_RETRIEVABLE';
  end if;
  update public.documents set retrieval_enabled = coalesce(p_enabled, false), updated_at = now() where id = v_document.id;
  return true;
end;
$$;

revoke all on function public.set_document_retrieval_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_document_retrieval_enabled(uuid, boolean) to authenticated;

create or replace function public.set_knowledge_article_retrieval_enabled(
  p_article_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article public.knowledge_articles%rowtype;
  v_document public.documents%rowtype;
begin
  if not public.is_active_user() then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  select * into v_article from public.knowledge_articles where id = p_article_id for update;
  if not found then raise exception 'KNOWLEDGE_ARTICLE_NOT_FOUND'; end if;
  select * into v_document from public.documents where id = v_article.document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.can_manage_document(v_document.owner_organization_id) then raise exception 'DOCUMENT_SCOPE_DENIED'; end if;
  if p_enabled and (v_article.review_status <> 'APPROVED' or not v_article.is_current or not v_document.retrieval_enabled) then
    raise exception 'KNOWLEDGE_ARTICLE_NOT_RETRIEVABLE';
  end if;
  update public.knowledge_articles set retrieval_enabled = coalesce(p_enabled, false), updated_at = now() where id = v_article.id;
  return true;
end;
$$;

revoke all on function public.set_knowledge_article_retrieval_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_knowledge_article_retrieval_enabled(uuid, boolean) to authenticated;

create index if not exists idx_knowledge_articles_retrieval_search_p5
  on public.knowledge_articles
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content_text, '')))
  where review_status = 'APPROVED' and is_current and retrieval_enabled;

create index if not exists idx_document_chunks_evidence_search_p5
  on public.document_chunks
  using gin (to_tsvector('simple', content))
  where review_status = 'APPROVED' and article_id is not null;

create or replace function public.search_published_knowledge(
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
security invoker
set search_path = public
as $$
  with input as (
    select plainto_tsquery('simple', left(btrim(coalesce(p_query, '')), 2000)) as query,
           least(greatest(coalesce(p_match_count, 8), 1), 12) as match_count
  )
  select a.id, e.id, a.document_id, a.document_version_id, a.title, e.content, e.locator,
         greatest(
           ts_rank_cd(to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '')), input.query),
           ts_rank_cd(to_tsvector('simple', e.content), input.query)
         )::real as rank
    from input
    join public.knowledge_articles a on true
    join public.documents d on d.id = a.document_id
    join public.document_chunks e on e.article_id = a.id
   where input.query <> ''::tsquery
     and a.review_status = 'APPROVED'
     and a.is_current
     and a.retrieval_enabled
     and d.retrieval_enabled
     and e.review_status = 'APPROVED'
     and (
       to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content_text, '')) @@ input.query
       or to_tsvector('simple', e.content) @@ input.query
     )
   order by rank desc, a.updated_at desc, e.id
   limit (select match_count from input);
$$;

revoke all on function public.search_published_knowledge(text, integer) from public, anon, authenticated;
grant execute on function public.search_published_knowledge(text, integer) to authenticated;
