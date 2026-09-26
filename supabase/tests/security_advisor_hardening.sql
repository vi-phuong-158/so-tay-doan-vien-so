begin;

select plan(1);

select results_eq(
  $$ select count(*)::integer
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'set_updated_at', 'enforce_knowledge_article_immutability',
          'enforce_evidence_provenance', 'enforce_evidence_immutability',
          'enforce_ingestion_job_provenance', 'enforce_document_source_immutability',
          'prevent_ingestion_event_mutation', 'enforce_document_state_axis_separation',
          'enforce_document_version_immutability', 'enforce_knowledge_article_provenance'
        )
        and p.proconfig @> array['search_path=public']::text[] $$,
  array[10],
  'All public trigger helpers pin search_path to public'
);

select * from finish();
rollback;
