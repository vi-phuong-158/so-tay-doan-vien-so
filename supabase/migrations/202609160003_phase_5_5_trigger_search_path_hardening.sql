-- Security Advisor defense-in-depth: pin every public trigger helper to the
-- intended schema. These functions are not SECURITY DEFINER, but a mutable
-- search_path is still avoidable ambiguity at a trust boundary.
alter function public.set_updated_at() set search_path = public;
alter function public.enforce_knowledge_article_immutability() set search_path = public;
alter function public.enforce_evidence_provenance() set search_path = public;
alter function public.enforce_evidence_immutability() set search_path = public;
alter function public.enforce_ingestion_job_provenance() set search_path = public;
alter function public.enforce_document_source_immutability() set search_path = public;
alter function public.prevent_ingestion_event_mutation() set search_path = public;
alter function public.enforce_document_state_axis_separation() set search_path = public;
alter function public.enforce_document_version_immutability() set search_path = public;
alter function public.enforce_knowledge_article_provenance() set search_path = public;
