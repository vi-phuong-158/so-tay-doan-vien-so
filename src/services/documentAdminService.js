// Explicit .js extension: Vite would resolve it either way, but `node --test` runs these modules
// as real ESM and requires the extension.
import { DOCUMENTS_BUCKET } from './documentService.js';

export const DOCUMENT_ADMIN_PAGE_SIZE = 20;

export const DOCUMENT_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REPLACED',
  'EXPIRED',
  'WITHDRAWN'
];

export const DOCUMENT_VISIBILITY_LEVELS = [
  'PUBLIC',
  'INTERNAL_YOUTH',
  'ORGANIZATION_ONLY',
  'RESTRICTED'
];

// Mirrors attach_document_source_file's server-side allowlist. This is a UX convenience that
// fails fast in the browser; the database re-derives the extension from the stored path and
// rejects independently, so removing this client check would not weaken the actual control.
export const ALLOWED_SOURCE_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
export const MAX_SOURCE_FILE_BYTES = 52428800; // 50 MiB — same bound as the RPC.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUSINESS_ERROR_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE',
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_SCOPE_DENIED',
  'DOCUMENT_NOT_EDITABLE',
  'DOCUMENT_HAS_NO_SOURCE',
  'INVALID_DOCUMENT_TITLE',
  'INVALID_DOCUMENT_DATES',
  'INVALID_DOCUMENT_TRANSITION',
  'INVALID_DOCUMENT_STATUS',
  'INVALID_DOCUMENT_YEAR',
  'INVALID_VISIBILITY_LEVEL',
  'INVALID_STORAGE_PATH',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_TOO_LARGE',
  'ORGANIZATION_REQUIRED'
]);

export class DocumentAdminError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'DocumentAdminError';
    this.code = code;
    this.cause = cause;
  }
}

function getBusinessCode(error) {
  const candidates = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return candidates.find((candidate) => BUSINESS_ERROR_CODES.has(candidate))
    // PostgREST wraps a RAISE EXCEPTION message; match a bare known token inside it too.
    ?? [...BUSINESS_ERROR_CODES].find((known) => typeof error?.message === 'string' && error.message.includes(known));
}

export function normalizeDocumentAdminError(error) {
  if (error instanceof DocumentAdminError) return error;

  const businessCode = getBusinessCode(error);
  if (businessCode) return new DocumentAdminError(businessCode, businessCode, error);

  if (error?.status === 401 || error?.status === 403) {
    return new DocumentAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.', error);
  }
  return new DocumentAdminError('REQUEST_FAILED', 'Unable to complete the document admin request.', error);
}

/** Strips characters that have meaning in a storage path, then bounds the length. */
export function normalizeSourceFileName(fileName) {
  const raw = String(fileName ?? '').trim();
  const base = raw.split(/[\\/]/).pop() ?? '';
  // Drop C0 controls and DEL by code point rather than with a regex: a control-character class
  // in a literal regex trips `no-control-regex`, and this reads more plainly anyway.
  const withoutControls = [...base]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');
  const cleaned = withoutControls
    .replace(/\.{2,}/g, '.')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 120);
  return cleaned || 'tai-lieu';
}

export function sourceFileExtension(fileName) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(fileName ?? ''));
  return match ? match[1].toLowerCase() : null;
}

/**
 * Client-side pre-flight for a chosen source file.
 * Returns a business code string when invalid, or null when acceptable.
 * The browser-declared MIME type is deliberately ignored — extension and size are what the
 * server re-checks, so those are what we check here too.
 */
export function validateSourceFile(file) {
  if (!file) return 'FILE_REQUIRED';
  const extension = sourceFileExtension(file.name);
  if (!extension || !ALLOWED_SOURCE_EXTENSIONS.includes(extension)) return 'FILE_TYPE_NOT_ALLOWED';
  if (typeof file.size === 'number' && (file.size <= 0 || file.size > MAX_SOURCE_FILE_BYTES)) {
    return 'FILE_TOO_LARGE';
  }
  return null;
}

/**
 * Every upload gets a fresh object id, so a replacement never overwrites the previous file and a
 * failed attach can never corrupt a good one. Matches the path contract enforced by both
 * attach_document_source_file and the documents-private INSERT policy.
 */
export function buildSourceStoragePath({ documentId, objectId, fileName }) {
  if (!UUID_PATTERN.test(String(documentId))) {
    throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
  }
  if (!UUID_PATTERN.test(String(objectId))) {
    throw new DocumentAdminError('INVALID_ID', 'objectId must be a UUID.', undefined);
  }
  return `${documentId}/source/${objectId}-${normalizeSourceFileName(fileName)}`;
}

export function mapAdminDocumentRow(row) {
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
    effectStatus: row.effect_status,
    scope: row.scope,
    summary: row.summary,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    storagePath: row.storage_path,
    sourceUrl: row.source_url,
    status: row.status,
    visibilityLevel: row.visibility_level,
    ownerOrganizationId: row.owner_organization_id,
    updatedAt: row.updated_at,
    hasSourceFile: Boolean(row.storage_path)
  };
}

/** Validates a create/update payload before any request leaves the browser. */
export function validateDocumentForm(form) {
  const errors = {};
  const title = String(form?.title ?? '').trim();
  if (!title) errors.title = 'Tên văn bản là bắt buộc.';
  else if (title.length > 500) errors.title = 'Tên văn bản tối đa 500 ký tự.';

  if (form?.visibilityLevel && !DOCUMENT_VISIBILITY_LEVELS.includes(form.visibilityLevel)) {
    errors.visibilityLevel = 'Mức hiển thị không hợp lệ.';
  }
  if (form?.effectiveDate && form?.expiryDate && form.expiryDate < form.effectiveDate) {
    errors.expiryDate = 'Ngày hết hiệu lực phải sau ngày hiệu lực.';
  }
  if (form?.sourceUrl) {
    const url = String(form.sourceUrl).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) errors.sourceUrl = 'Liên kết nguồn phải là http(s).';
  }
  return errors;
}

function parseKeywords(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeDocumentAdminError(error);
  }
}

/**
 * Administration boundary for documents.
 *
 * Every mutation goes through a P4-01/P4-02 SECURITY DEFINER RPC that re-validates role, scope and
 * state transition server-side. This layer never writes to public.documents directly — the
 * `authenticated` role has no INSERT/UPDATE/DELETE grant on that table, so a direct write would
 * fail anyway; routing through RPCs is what makes the transition rules authoritative.
 */
export function createDocumentAdminService(client, { createObjectId = () => globalThis.crypto.randomUUID() } = {}) {
  return {
    async listDocuments({
      page = 0,
      pageSize = DOCUMENT_ADMIN_PAGE_SIZE,
      search = '',
      status = '',
      documentType = '',
      issuingAuthority = '',
      visibilityLevel = '',
      year = ''
    } = {}) {
      if (!Number.isInteger(page) || page < 0) {
        throw new DocumentAdminError('INVALID_PAGE', 'Page must be a non-negative integer.', undefined);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new DocumentAdminError('INVALID_PAGE_SIZE', 'Page size must be between 1 and 100.', undefined);
      }
      if (status && !DOCUMENT_STATUSES.includes(status)) {
        throw new DocumentAdminError('INVALID_DOCUMENT_STATUS', 'Unsupported status filter.', undefined);
      }
      if (visibilityLevel && !DOCUMENT_VISIBILITY_LEVELS.includes(visibilityLevel)) {
        throw new DocumentAdminError('INVALID_VISIBILITY_LEVEL', 'Unsupported visibility filter.', undefined);
      }
      let parsedYear = null;
      if (year) {
        parsedYear = Number(year);
        if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2200) {
          throw new DocumentAdminError('INVALID_DOCUMENT_YEAR', 'Year filter is out of range.', undefined);
        }
      }

      const rows = await unwrap(client.rpc('get_admin_documents', {
        p_search: search ? String(search).trim() : null,
        p_status: status || null,
        p_document_type: documentType || null,
        p_issuing_authority: issuingAuthority || null,
        p_visibility_level: visibilityLevel || null,
        p_year: parsedYear,
        p_limit: pageSize,
        p_offset: page * pageSize
      }));

      const items = (rows ?? []).map(mapAdminDocumentRow);
      const total = rows?.[0]?.total_count != null ? Number(rows[0].total_count) : items.length;
      return { items, total, page, pageSize, hasMore: page * pageSize + items.length < total };
    },

    async createDraft(form) {
      const errors = validateDocumentForm(form);
      if (Object.keys(errors).length > 0) {
        throw new DocumentAdminError('VALIDATION_FAILED', 'Form validation failed.', errors);
      }
      return unwrap(client.rpc('create_document_draft', {
        p_title: String(form.title).trim(),
        p_document_type: form.documentType || null,
        p_document_number: form.documentNumber || null,
        p_issuing_authority: form.issuingAuthority || null,
        p_issued_date: form.issuedDate || null,
        p_effective_date: form.effectiveDate || null,
        p_expiry_date: form.expiryDate || null,
        p_scope: form.scope || null,
        p_summary: form.summary || null,
        p_keywords: parseKeywords(form.keywords),
        p_visibility_level: form.visibilityLevel || 'INTERNAL_YOUTH',
        p_owner_organization_id: form.ownerOrganizationId || null
      }));
    },

    async updateMetadata(documentId, form) {
      if (!UUID_PATTERN.test(String(documentId))) {
        throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
      }
      const errors = validateDocumentForm(form);
      if (Object.keys(errors).length > 0) {
        throw new DocumentAdminError('VALIDATION_FAILED', 'Form validation failed.', errors);
      }
      return unwrap(client.rpc('update_document_metadata', {
        p_document_id: documentId,
        p_title: String(form.title).trim(),
        p_document_type: form.documentType || null,
        p_document_number: form.documentNumber || null,
        p_issuing_authority: form.issuingAuthority || null,
        p_issued_date: form.issuedDate || null,
        p_effective_date: form.effectiveDate || null,
        p_expiry_date: form.expiryDate || null,
        p_scope: form.scope || null,
        p_summary: form.summary || null,
        p_keywords: parseKeywords(form.keywords),
        p_visibility_level: form.visibilityLevel || null,
        p_effect_status: form.effectStatus || null
      }));
    },

    /**
     * Upload then attach, with compensation.
     *
     * Order matters: the object is written to a brand-new path first, then the RPC records it.
     * If the RPC fails, the just-uploaded object is orphaned, so it is deleted here — that is the
     * only thing this method ever deletes. The previously attached file is never touched, and the
     * DELETE policy itself refuses to remove whatever `documents.storage_path` currently points
     * at, so even a bug here cannot destroy the live source file.
     */
    async uploadSourceFile(documentId, file) {
      if (!UUID_PATTERN.test(String(documentId))) {
        throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
      }
      const validationCode = validateSourceFile(file);
      if (validationCode) {
        throw new DocumentAdminError(validationCode, validationCode, undefined);
      }

      const storagePath = buildSourceStoragePath({
        documentId,
        objectId: createObjectId(),
        fileName: file.name
      });

      await unwrap(
        client.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, { upsert: false })
      );

      try {
        await unwrap(client.rpc('attach_document_source_file', {
          p_document_id: documentId,
          p_storage_path: storagePath,
          p_file_size_bytes: typeof file.size === 'number' ? file.size : null
        }));
      } catch (error) {
        // Compensation: remove the orphan we just created, then surface the original failure.
        // A cleanup failure must not mask why the attach failed.
        try {
          await client.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
        } catch {
          /* best effort; the object is unreferenced and remains cleanable by an admin */
        }
        throw error;
      }

      return storagePath;
    },

    async publish(documentId) {
      if (!UUID_PATTERN.test(String(documentId))) {
        throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
      }
      return unwrap(client.rpc('publish_document', { p_document_id: documentId }));
    },

    async withdraw(documentId, reason) {
      if (!UUID_PATTERN.test(String(documentId))) {
        throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
      }
      return unwrap(client.rpc('withdraw_document', {
        p_document_id: documentId,
        p_reason: reason ? String(reason).slice(0, 500) : null
      }));
    },

    /** Clears the pointer first, then removes the bytes — never the other way round. */
    async detachSourceFile(documentId) {
      if (!UUID_PATTERN.test(String(documentId))) {
        throw new DocumentAdminError('INVALID_ID', 'documentId must be a UUID.', undefined);
      }
      const detachedPath = await unwrap(
        client.rpc('detach_document_source_file', { p_document_id: documentId })
      );
      if (detachedPath) {
        try {
          await client.storage.from(DOCUMENTS_BUCKET).remove([detachedPath]);
        } catch {
          /* the row no longer references it; an orphan is safe and cleanable */
        }
      }
      return detachedPath;
    },

    /** Signed URL for admin preview. Requested only on an explicit action, never prefetched. */
    async getSourcePreviewUrl(storagePath, { expiresIn = 60 } = {}) {
      if (typeof storagePath !== 'string' || !storagePath || storagePath.includes('..')) {
        throw new DocumentAdminError('INVALID_STORAGE_PATH', 'A valid storage path is required.', undefined);
      }
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
        throw new DocumentAdminError('INVALID_EXPIRY', 'Signed URL expiry must be 1-3600 seconds.', undefined);
      }
      const data = await unwrap(
        client.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresIn)
      );
      return data.signedUrl;
    }
  };
}
