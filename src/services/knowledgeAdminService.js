const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const KNOWLEDGE_REVIEW_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'];

export class KnowledgeAdminError extends Error {
  constructor(code, message = code, cause) {
    super(message);
    this.name = 'KnowledgeAdminError';
    this.code = code;
    this.cause = cause;
  }
}

const BUSINESS_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE', 'DOCUMENT_SCOPE_DENIED', 'DOCUMENT_NOT_FOUND', 'DOCUMENT_VERSION_NOT_FOUND',
  'EXTERNAL_AI_NOT_ALLOWED', 'SOURCE_NOT_FOUND', 'MODEL_CONFIGURATION_MISSING', 'MODEL_INVALID_OUTPUT',
  'SOURCE_CHECKSUM_MISMATCH', 'OCR_REQUIRED', 'UNSUPPORTED_FILE_TYPE', 'EVIDENCE_NOT_FOUND',
  'ARTICLE_EVIDENCE_INCOMPLETE', 'INVALID_REVIEW_TRANSITION', 'INVALID_REVIEW_ACTION',
  'GENERATION_IN_PROGRESS', 'GENERATION_RETRY_REQUIRES_EXPLICIT_REGENERATION_KEY'
]);

function normalizeError(error) {
  if (error instanceof KnowledgeAdminError) return error;
  const message = [error?.code, error?.message, error?.context?.error].find(Boolean);
  const code = [...BUSINESS_CODES].find(item => typeof message === 'string' && message.includes(item));
  return new KnowledgeAdminError(code ?? 'REQUEST_FAILED', code ?? 'Không thể hoàn tất thao tác tri thức.', error);
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeError(error);
  }
}

function assertUuid(value, code = 'INVALID_ID') {
  if (!UUID_PATTERN.test(String(value ?? ''))) throw new KnowledgeAdminError(code, code);
  return value;
}

function mapArticle(row) {
  if (!row) return null;
  return {
    id: row.id, documentId: row.document_id, documentVersionId: row.document_version_id,
    articleKey: row.article_key, revisionNumber: row.revision_number, title: row.title,
    summary: row.summary, content: row.content ?? {}, contentText: row.content_text ?? '',
    reviewStatus: row.review_status, generationKind: row.generation_kind, provider: row.provider,
    model: row.model, promptVersion: row.prompt_version,
    warnings: Array.isArray(row.warnings) ? row.warnings : [], retrievalEnabled: row.retrieval_enabled,
    isCurrent: row.is_current, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    reviewNote: row.review_note, createdAt: row.created_at
  };
}

function mapEvidence(row) {
  return {
    id: row.id, articleId: row.article_id, documentId: row.document_id,
    documentVersionId: row.document_version_id, content: row.content, contentHash: row.content_hash,
    evidenceKind: row.evidence_kind, locator: row.locator ?? {}, reviewStatus: row.review_status,
    selectedBy: row.selected_by, selectedReason: row.selected_reason,
    approvedBy: row.approved_by, approvedAt: row.approved_at
  };
}

export function createKnowledgeAdminService(client) {
  return {
    async getDocument(documentId) {
      assertUuid(documentId);
      return unwrap(client.from('documents').select('id,title,document_number,status,visibility_level,ai_processing_allowed,current_version_id,storage_path').eq('id', documentId).single());
    },
    async listArticles(documentId) {
      assertUuid(documentId);
      const rows = await unwrap(client.from('knowledge_articles').select('*').eq('document_id', documentId).order('article_key').order('revision_number', { ascending: false }));
      return (rows ?? []).map(mapArticle);
    },
    async getEvidence(articleId) {
      assertUuid(articleId);
      const rows = await unwrap(client.from('document_chunks').select('id,article_id,document_id,document_version_id,content,content_hash,evidence_kind,locator,review_status,selected_by,selected_reason,approved_by,approved_at').eq('article_id', articleId).order('page_from'));
      return (rows ?? []).map(mapEvidence);
    },
    async setAiProcessingAllowed(documentId, allowed) {
      assertUuid(documentId);
      if (typeof allowed !== 'boolean') throw new KnowledgeAdminError('INVALID_AI_POLICY');
      return unwrap(client.rpc('set_document_ai_processing_allowed', { p_document_id: documentId, p_allowed: allowed }));
    },
    async generate(documentId, { articleKey = 'overview', regenerationKey, generatorVersion } = {}) {
      assertUuid(documentId);
      if (!/^[a-z0-9][a-z0-9._-]{0,199}$/i.test(articleKey)) throw new KnowledgeAdminError('INVALID_ARTICLE_KEY', 'Article key không hợp lệ.');
      if (regenerationKey && !/^[a-z0-9_-]{8,100}$/i.test(regenerationKey)) throw new KnowledgeAdminError('INVALID_REGENERATION_KEY', 'Mã tạo lại không hợp lệ.');
      const { data, error } = await client.functions.invoke('generate-knowledge-article', {
        body: { document_id: documentId, article_key: articleKey, regeneration_key: regenerationKey, generator_version: generatorVersion }
      });
      if (error) throw normalizeError(error);
      if (!data?.success) throw normalizeError(data?.error ?? 'GENERATION_FAILED');
      return data;
    },
    async review(articleId, action, reviewNote = '') {
      assertUuid(articleId);
      if (!['APPROVE', 'REJECT', 'REQUEST_REGENERATION'].includes(action)) throw new KnowledgeAdminError('INVALID_REVIEW_ACTION');
      return unwrap(client.rpc('review_knowledge_article', {
        p_article_id: articleId, p_action: action, p_review_note: String(reviewNote ?? '').slice(0, 2000) || null
      }));
    }
  };
}

export { mapArticle, mapEvidence };
