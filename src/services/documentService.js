export const DOCUMENTS_BUCKET = 'documents-private';

export const DOCUMENT_PAGE_SIZE = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Business codes raised by the P4-01 RPCs. Anything outside this allowlist is normalized to a
// generic failure so raw PostgreSQL/PostgREST detail never reaches the UI.
const BUSINESS_ERROR_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE',
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_SCOPE_DENIED',
  'DOCUMENT_NOT_EDITABLE',
  'INVALID_DOCUMENT_TITLE',
  'INVALID_DOCUMENT_DATES',
  'INVALID_DOCUMENT_TRANSITION',
  'INVALID_VISIBILITY_LEVEL',
  'INVALID_STORAGE_PATH',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_TOO_LARGE',
  'ORGANIZATION_REQUIRED'
]);

// The effect-status filter is presentational and derived from dates, so the values the UI may
// send are fixed here rather than trusted from the caller.
export const DOCUMENT_EFFECT_FILTERS = ['ALL', 'EFFECTIVE', 'EXPIRED'];

const DOCUMENT_SELECT = `
  id,
  document_number,
  title,
  document_type,
  issuing_authority,
  issued_date,
  effective_date,
  expiry_date,
  effect_status,
  scope,
  summary,
  keywords,
  storage_path,
  source_url,
  status,
  visibility_level,
  created_at
`;

export class DocumentServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'DocumentServiceError';
    this.code = code;
    this.cause = cause;
  }
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new DocumentServiceError('INVALID_ID', `${fieldName} must be a UUID.`, undefined);
  }
}

function getBusinessCode(error) {
  const candidates = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return candidates.find((candidate) => BUSINESS_ERROR_CODES.has(candidate));
}

export function normalizeDocumentError(error) {
  if (error instanceof DocumentServiceError) return error;

  const businessCode = getBusinessCode(error);
  if (businessCode) {
    return new DocumentServiceError(businessCode, businessCode, error);
  }

  if (error?.status === 401 || error?.status === 403) {
    return new DocumentServiceError(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required to access documents.',
      error
    );
  }

  return new DocumentServiceError('REQUEST_FAILED', 'Unable to complete the document request.', error);
}

/**
 * Derives the display effect status. The database column is optional free text, so when it is
 * absent the dates decide — the UI must never invent a status the server did not imply.
 */
export function deriveEffectStatus(row, now = new Date()) {
  if (row?.effect_status) return row.effect_status;
  if (row?.expiry_date && new Date(row.expiry_date) < now) return 'Hết hiệu lực';
  return 'Còn hiệu lực';
}

export function mapDocumentRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    documentNumber: row.document_number,
    title: row.title,
    documentType: row.document_type,
    issuingAuthority: row.issuing_authority,
    issuedDate: row.issued_date,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    effectStatus: deriveEffectStatus(row),
    scope: row.scope,
    summary: row.summary,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    storagePath: row.storage_path,
    sourceUrl: row.source_url,
    status: row.status,
    visibilityLevel: row.visibility_level,
    // Presence of a source file is exposed; the signed URL itself is never precomputed here.
    hasSourceFile: Boolean(row.storage_path)
  };
}

export function mapRelationRow(row) {
  if (!row) return null;
  const target = Array.isArray(row.documents) ? row.documents[0] : row.documents;
  if (!target) return null;

  return {
    relationType: row.relation_type,
    document: mapDocumentRow(target)
  };
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeDocumentError(error);
  }
}

/**
 * Creates the document data boundary around the application's existing Supabase client.
 *
 * Every read below relies on RLS (public.can_access_document) for authorization — this layer adds
 * input validation and shaping only, and deliberately does not attempt any client-side filtering
 * that could be mistaken for a security control. Writes go through the P4-01 SECURITY DEFINER
 * RPCs, never direct table mutations.
 */
export function createDocumentService(client) {
  return {
    /**
     * Bounded, deterministic page of documents the caller is allowed to see.
     * Ordering is (issued_date desc, id desc) so the keyset is stable even when several documents
     * share an issue date.
     */
    async listDocuments({
      page = 0,
      pageSize = DOCUMENT_PAGE_SIZE,
      search = '',
      documentType = '',
      issuingAuthority = '',
      year = '',
      effect = 'ALL'
    } = {}) {
      if (!Number.isInteger(page) || page < 0) {
        throw new DocumentServiceError('INVALID_PAGE', 'Page must be a non-negative integer.', undefined);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new DocumentServiceError('INVALID_PAGE_SIZE', 'Page size must be between 1 and 100.', undefined);
      }
      if (effect && !DOCUMENT_EFFECT_FILTERS.includes(effect)) {
        throw new DocumentServiceError('INVALID_FILTER', 'Unsupported effect filter.', undefined);
      }
      // Validate every input before touching the query builder, so an invalid filter never
      // results in a partially-built request being issued.
      let parsedYear = null;
      if (year) {
        parsedYear = Number(year);
        if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2200) {
          throw new DocumentServiceError('INVALID_FILTER', 'Year filter is out of range.', undefined);
        }
      }

      const from = page * pageSize;
      let query = client
        .from('documents')
        .select(DOCUMENT_SELECT, { count: 'exact' })
        .order('issued_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      const term = String(search ?? '').trim();
      if (term) {
        // Escape PostgREST's or() delimiters so a crafted term cannot break out of the filter.
        const safe = term.replace(/[(),*]/g, ' ').trim();
        if (safe) query = query.or(`title.ilike.%${safe}%,document_number.ilike.%${safe}%`);
      }
      if (documentType) query = query.eq('document_type', documentType);
      if (issuingAuthority) query = query.eq('issuing_authority', issuingAuthority);
      if (parsedYear !== null) {
        query = query.gte('issued_date', `${parsedYear}-01-01`).lte('issued_date', `${parsedYear}-12-31`);
      }
      if (effect === 'EFFECTIVE') {
        query = query.or(`expiry_date.is.null,expiry_date.gte.${new Date().toISOString().slice(0, 10)}`);
      } else if (effect === 'EXPIRED') {
        query = query.lt('expiry_date', new Date().toISOString().slice(0, 10));
      }

      try {
        const { data, error, count } = await query;
        if (error) throw error;
        const items = (data ?? []).map(mapDocumentRow);
        return {
          items,
          total: count ?? items.length,
          page,
          pageSize,
          hasMore: count == null ? items.length === pageSize : from + items.length < count
        };
      } catch (error) {
        throw normalizeDocumentError(error);
      }
    },

    /**
     * A single document. An id that does not exist and an id the caller may not read are
     * intentionally indistinguishable — both surface as DOCUMENT_NOT_FOUND.
     */
    async getDocument(documentId) {
      assertUuid(documentId, 'documentId');

      const rows = await unwrap(
        client.from('documents').select(DOCUMENT_SELECT).eq('id', documentId).limit(1)
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) {
        throw new DocumentServiceError('DOCUMENT_NOT_FOUND', 'DOCUMENT_NOT_FOUND', undefined);
      }
      return mapDocumentRow(row);
    },

    /**
     * Related documents. RLS hides any relation whose other endpoint the caller cannot read, so
     * this returns only what is genuinely disclosable.
     */
    async getDocumentRelations(documentId) {
      assertUuid(documentId, 'documentId');

      const rows = await unwrap(
        client
          .from('document_relations')
          .select(`relation_type, documents:target_document_id (${DOCUMENT_SELECT})`)
          .eq('source_document_id', documentId)
      );
      return (rows ?? []).map(mapRelationRow).filter(Boolean);
    },

    /**
     * Short-lived signed URL for a document's source file.
     *
     * Called only in response to an explicit user action — never prefetched during list or detail
     * rendering — and the resulting URL is never persisted or logged.
     */
    async getDocumentDownloadUrl(storagePath, { expiresIn = 60 } = {}) {
      if (typeof storagePath !== 'string' || !storagePath || storagePath.includes('..')) {
        throw new DocumentServiceError('INVALID_STORAGE_PATH', 'A valid storage path is required.', undefined);
      }
      const segments = storagePath.split('/');
      if (segments.length < 3 || !UUID_PATTERN.test(segments[0]) || segments[1] !== 'source') {
        throw new DocumentServiceError('INVALID_STORAGE_PATH', 'A valid document storage path is required.', undefined);
      }
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
        throw new DocumentServiceError('INVALID_EXPIRY', 'Signed URL expiry must be between 1 and 3600 seconds.', undefined);
      }

      const data = await unwrap(
        client.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresIn)
      );
      return data.signedUrl;
    },

    /** Distinct filter options, derived from the rows the caller can actually see. */
    async getFilterOptions() {
      const rows = await unwrap(
        client.from('documents').select('document_type, issuing_authority, issued_date').limit(500)
      );
      const types = new Set();
      const authorities = new Set();
      const years = new Set();
      for (const row of rows ?? []) {
        if (row.document_type) types.add(row.document_type);
        if (row.issuing_authority) authorities.add(row.issuing_authority);
        if (row.issued_date) years.add(String(row.issued_date).slice(0, 4));
      }
      return {
        documentTypes: [...types].sort(),
        issuingAuthorities: [...authorities].sort(),
        years: [...years].sort((a, b) => b.localeCompare(a))
      };
    }
  };
}
