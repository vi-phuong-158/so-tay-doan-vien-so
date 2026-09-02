-- P5-03R3: trigger functions are internal database implementation details.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default. These functions are invoked
-- only through their trigger bindings, never as client RPCs. Revoke the
-- default surface explicitly without altering intentional P5 RPC contracts.

revoke all on function public.enforce_ai_source_provenance() from public, anon, authenticated;
revoke all on function public.enforce_document_current_version() from public, anon, authenticated;
revoke all on function public.enforce_document_source_immutability() from public, anon, authenticated;
revoke all on function public.enforce_document_state_axis_separation() from public, anon, authenticated;
revoke all on function public.enforce_document_version_immutability() from public, anon, authenticated;
revoke all on function public.enforce_embedding_publication_gate() from public, anon, authenticated;
revoke all on function public.enforce_evidence_immutability() from public, anon, authenticated;
revoke all on function public.enforce_evidence_provenance() from public, anon, authenticated;
revoke all on function public.enforce_ingestion_job_provenance() from public, anon, authenticated;
revoke all on function public.enforce_knowledge_article_immutability() from public, anon, authenticated;
revoke all on function public.enforce_knowledge_article_provenance() from public, anon, authenticated;
revoke all on function public.prevent_ingestion_event_mutation() from public, anon, authenticated;
revoke all on function public.prevent_referenced_evidence_delete() from public, anon, authenticated;
revoke all on function public.prevent_referenced_version_delete() from public, anon, authenticated;
revoke all on function public.trg_queue_ingestion_for_source() from public, anon, authenticated;
revoke all on function public.trg_queue_ingestion_when_document_published() from public, anon, authenticated;
