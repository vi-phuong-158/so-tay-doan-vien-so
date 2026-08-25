import { clients, requireScopedRole, requireUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { assertUuid, safeText } from '../_shared/validation.ts';
import { readAuthorizedSource } from '../_shared/storage/authorizedSourceGateway.ts';
import { StorageProviderError } from '../_shared/storage/contract.ts';
import { GoogleDriveStorageProvider } from '../_shared/storage/googleDriveStorageProvider.ts';
import { SupabaseStorageProvider } from '../_shared/storage/supabaseStorageProvider.ts';
import { extractDeterministically, ExtractionError } from '../_shared/knowledge/extraction.ts';
import { resolveEvidenceSuggestions, assertEvidenceIsSourceText } from '../_shared/knowledge/evidence.ts';
import {
  GeminiKnowledgeGenerator,
  GENERATOR_VERSION,
  KnowledgeGenerationError,
  PROMPT_VERSION,
} from '../_shared/knowledge/generator.ts';

type Payload = {
  document_id: string;
  article_key?: string;
  generator_version?: string;
  regeneration_key?: string;
};

function statusFor(code: string): number {
  if (code === 'UNAUTHENTICATED' || code === 'ACCOUNT_NOT_ACTIVE') return 401;
  if (code.includes('FORBIDDEN') || code.includes('SCOPE_DENIED') || code === 'EXTERNAL_AI_NOT_ALLOWED') return 403;
  if (code === 'SOURCE_NOT_FOUND') return 404;
  if (code === 'GENERATION_IN_PROGRESS') return 409;
  if (code === 'MODEL_RATE_LIMITED') return 429;
  return 400;
}

function errorCode(error: unknown): string {
  if (error instanceof ExtractionError || error instanceof KnowledgeGenerationError || error instanceof StorageProviderError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/[A-Z][A-Z0-9_]{2,63}/);
  return match?.[0] ?? 'GENERATION_FAILED';
}

function providerFor(source: any, adminClient: any) {
  if (source.provider_kind === 'SUPABASE_STORAGE') return new SupabaseStorageProvider(adminClient);
  if (source.provider_kind === 'GOOGLE_DRIVE') {
    return new GoogleDriveStorageProvider({
      clientId: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID'),
      clientSecret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET'),
      refreshToken: Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN'),
      rootFolderId: Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
      timeoutMs: Number(Deno.env.get('GOOGLE_DRIVE_TIMEOUT_MS') || 10_000),
    });
  }
  throw new StorageProviderError('INVALID_LOCATOR', 'HTTP_SOURCE_REQUIRES_VERIFIED_SNAPSHOT');
}

async function run(request: Request): Promise<Response> {
  const { userClient, adminClient } = clients(request);
  const user = await requireUser(userClient);
  const body = await readJson<Payload>(request);
  const documentId = assertUuid(body.document_id);
  const articleKey = safeText(body.article_key ?? 'overview', 200) ?? 'overview';
  const requestedGeneratorVersion = safeText(body.generator_version ?? GENERATOR_VERSION, 160) ?? GENERATOR_VERSION;
  if (!/^p5-03-generator-v1(?:-[A-Za-z0-9_-]{1,80})?$/.test(requestedGeneratorVersion)) throw new Error('INVALID_GENERATOR_VERSION');
  const regenerationKey = body.regeneration_key ? safeText(body.regeneration_key, 100) : null;
  const generatorVersion = regenerationKey ? `${requestedGeneratorVersion}-${regenerationKey}` : requestedGeneratorVersion;

  const { data: document, error: documentError } = await adminClient.from('documents')
    .select('id,title,document_number,issued_date,document_type,owner_organization_id,current_version_id,ai_processing_allowed,source_class')
    .eq('id', documentId).single();
  if (documentError || !document) throw new Error('DOCUMENT_NOT_FOUND');
  await requireScopedRole(adminClient, user.id, ['YOUTH_ADMIN'], document.owner_organization_id);
  if (!document.ai_processing_allowed || document.source_class === 'CLASS_E_SUPERSEDED') throw new Error('EXTERNAL_AI_NOT_ALLOWED');
  if (!document.current_version_id) throw new Error('DOCUMENT_VERSION_NOT_FOUND');

  const { data: source, error: sourceError } = await adminClient.from('document_sources')
    .select('*').eq('document_version_id', document.current_version_id).eq('source_kind', 'PRIMARY_FILE')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (sourceError || !source) throw new Error('SOURCE_NOT_FOUND');
  const { data: version, error: versionError } = await adminClient.from('document_versions')
    .select('id,document_id,content_hash,mime_type').eq('id', document.current_version_id).single();
  if (versionError || !version || version.document_id !== document.id) throw new Error('DOCUMENT_VERSION_NOT_FOUND');

  const { data: jobId, error: queueError } = await adminClient.rpc('queue_knowledge_article_generation', {
    p_document_version_id: version.id, p_article_key: articleKey,
    p_generator_version: generatorVersion, p_requested_by: user.id,
  });
  if (queueError || !jobId) throw new Error(queueError?.message || 'GENERATION_QUEUE_FAILED');
  const { data: existingJob } = await adminClient.from('ingestion_jobs').select('id,status,claim_token,result').eq('id', jobId).single();
  if (!existingJob) throw new Error('GENERATION_JOB_NOT_FOUND');
  if (existingJob.status === 'SUCCEEDED' && existingJob.result?.article_id) return json({ success: true, article_id: existingJob.result.article_id, reused: true });
  if (existingJob.status === 'PROCESSING') throw new Error('GENERATION_IN_PROGRESS');
  if (existingJob.status === 'FAILED' && !regenerationKey) throw new Error('GENERATION_RETRY_REQUIRES_EXPLICIT_REGENERATION_KEY');

  const workerId = `article-generator-${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await adminClient.rpc('claim_specific_ingestion_job', {
    p_job_id: jobId, p_worker_id: workerId, p_lease_seconds: 900,
  });
  if (claimError || !claimed?.[0]) throw new Error('GENERATION_IN_PROGRESS');
  const claim = claimed[0];
  const startedAt = Date.now();
  try {
    await adminClient.from('knowledge_generation_attempts').update({ status: 'PROCESSING' }).eq('job_id', jobId);
    const provider = providerFor(source, adminClient);
    const authorizedSource = {
      documentId: document.id,
      providerKind: source.provider_kind,
      storagePath: source.storage_path,
      externalFileId: source.external_file_id,
    } as const;
    const bytes = await readAuthorizedSource({
      source: authorizedSource,
      canAccessDocument: async id => id === document.id,
      provider,
    });
    const extraction = await extractDeterministically({
      documentVersionId: version.id,
      fileName: source.storage_path?.split('/').pop() || source.external_file_id || 'source.bin',
      mimeType: version.mime_type || source.mime_type || 'application/octet-stream',
      bytes,
    });
    if (extraction.sourceByteHash !== version.content_hash || (source.content_hash && extraction.sourceByteHash !== source.content_hash)) throw new Error('SOURCE_CHECKSUM_MISMATCH');
    const { error: extractionError } = await adminClient.rpc('persist_document_extraction', {
      p_source_id: source.id,
      p_source_byte_hash: extraction.sourceByteHash,
      p_normalized_content_hash: extraction.normalizedContentHash,
      p_extractor: extraction.metadata.extractor,
      p_extractor_version: extraction.metadata.extractorVersion,
      p_pages: extraction.pages,
      p_structure: { sections: extraction.sections },
      p_normalized_text: extraction.normalizedText,
    });
    if (extractionError) throw new Error(extractionError.message || 'PERSISTENCE_FAILED');

    const model = Deno.env.get('KNOWLEDGE_GENERATION_MODEL');
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!model || !apiKey) throw new Error('MODEL_CONFIGURATION_MISSING');
    const generator = new GeminiKnowledgeGenerator(model, apiKey);
    const draft = await generator.generateKnowledgeArticle({
      document: { title: document.title, document_number: document.document_number, issued_date: document.issued_date, document_type: document.document_type },
      extraction,
      articleKey,
    });
    const evidence = await resolveEvidenceSuggestions(extraction, draft.evidence);
    assertEvidenceIsSourceText(extraction, evidence);
    const generationMetadata = {
      provider: generator.provider, model: generator.model, prompt_version: PROMPT_VERSION,
      generator_version: generatorVersion, source_byte_hash: extraction.sourceByteHash,
      normalized_content_hash: extraction.normalizedContentHash, extractor: extraction.metadata.extractor,
      extractor_version: extraction.metadata.extractorVersion, duration_ms: Date.now() - startedAt,
    };
    const { data: articleId, error: persistError } = await adminClient.rpc('persist_knowledge_article_draft', {
      p_job_id: jobId, p_claim_token: claim.claim_token,
      p_article: { title: draft.title, summary: draft.summary, key_points: draft.key_points, structured_content: draft.structured_content, warnings: draft.warnings ?? [] },
      p_evidence: evidence.map(item => ({ ...item, selected_reason: item.selected_reason })),
      p_generation_metadata: generationMetadata, p_actor_user_id: user.id,
    });
    if (persistError || !articleId) throw new Error(persistError?.message || 'PERSISTENCE_FAILED');
    const { error: completeError } = await adminClient.rpc('complete_ingestion_job', {
      p_job_id: jobId, p_claim_token: claim.claim_token,
      p_result: { article_id: articleId, stage: 'ARTICLE_DRAFT', duration_ms: Date.now() - startedAt },
    });
    if (completeError) throw new Error('PERSISTENCE_FAILED');
    return json({ success: true, article_id: articleId, status: 'PENDING_REVIEW', warnings: draft.warnings ?? [] });
  } catch (error) {
    const code = errorCode(error);
    const retryable = error instanceof KnowledgeGenerationError ? error.retryable : ['MODEL_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED'].includes(code);
    await adminClient.from('knowledge_generation_attempts').update({ status: 'FAILED', error_code: code, last_error: code }).eq('job_id', jobId);
    await adminClient.rpc('fail_ingestion_job', {
      p_job_id: jobId, p_claim_token: claim.claim_token, p_error_code: code,
      p_error_message: code, p_retryable: retryable,
    });
    throw error;
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);
  try {
    return await run(request);
  } catch (error) {
    const code = errorCode(error);
    return errorResponse(new Error(code), statusFor(code));
  }
});
