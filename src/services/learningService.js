export const LEARNING_RESOURCES_BUCKET = 'learning-resources-private';

export const LEARNING_PAGE_SIZE = 12;

export const LEARNING_RESOURCE_TYPES = ['TEXT', 'DOCUMENT', 'VIDEO', 'IMAGE', 'LINK'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUSINESS_ERROR_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE',
  'TOPIC_NOT_FOUND',
  'TOPIC_NOT_EDITABLE',
  'RESOURCE_NOT_FOUND',
  'LEARNING_SCOPE_DENIED',
  'INVALID_TOPIC_TITLE',
  'INVALID_TOPIC_WINDOW',
  'INVALID_TOPIC_TRANSITION',
  'INVALID_VISIBILITY_LEVEL',
  'INVALID_RESOURCE_TYPE',
  'INVALID_RESOURCE_TITLE',
  'INVALID_EXTERNAL_URL',
  'INVALID_STORAGE_PATH',
  'INVALID_SORT_ORDER',
  'RESOURCE_PAYLOAD_REQUIRED',
  'ORGANIZATION_REQUIRED'
]);

const TOPIC_SELECT = `
  id,
  title,
  description,
  objectives,
  status,
  open_at,
  close_at,
  visibility_level,
  created_at,
  updated_at
`;

const RESOURCE_SELECT = `
  id,
  topic_id,
  resource_type,
  title,
  content,
  storage_path,
  external_url,
  sort_order
`;

export class LearningServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'LearningServiceError';
    this.code = code;
    this.cause = cause;
  }
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new LearningServiceError('INVALID_ID', `${fieldName} must be a UUID.`, undefined);
  }
}

function getBusinessCode(error) {
  const candidates = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return candidates.find((candidate) => BUSINESS_ERROR_CODES.has(candidate));
}

export function normalizeLearningError(error) {
  if (error instanceof LearningServiceError) return error;

  const businessCode = getBusinessCode(error);
  if (businessCode) return new LearningServiceError(businessCode, businessCode, error);

  if (error?.status === 401 || error?.status === 403) {
    return new LearningServiceError(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required to access learning content.',
      error
    );
  }
  return new LearningServiceError('REQUEST_FAILED', 'Unable to complete the learning request.', error);
}

/**
 * Only https links are ever surfaced as clickable.
 *
 * The database already rejects anything else with a CHECK constraint, so this is the second of two
 * independent gates rather than the only one — a row that somehow predates the constraint still
 * cannot produce a `javascript:` href here.
 */
export function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.length > 2000) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Availability derived from the server's own window, never from a client clock alone. */
export function topicAvailability(topic, now = new Date()) {
  const openAt = topic?.openAt ? new Date(topic.openAt) : null;
  const closeAt = topic?.closeAt ? new Date(topic.closeAt) : null;
  if (openAt && !Number.isNaN(openAt.getTime()) && now < openAt) return 'UPCOMING';
  if (closeAt && !Number.isNaN(closeAt.getTime()) && now > closeAt) return 'CLOSED';
  return 'OPEN';
}

export function mapTopicRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    objectives: row.objectives,
    status: row.status,
    openAt: row.open_at,
    closeAt: row.close_at,
    visibilityLevel: row.visibility_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapResourceRow(row) {
  if (!row) return null;
  const externalUrl = isSafeExternalUrl(row.external_url) ? row.external_url : null;
  return {
    id: row.id,
    topicId: row.topic_id,
    resourceType: row.resource_type,
    title: row.title,
    content: row.content ?? null,
    storagePath: row.storage_path ?? null,
    // A rejected URL is dropped rather than passed through for the view to decide.
    externalUrl,
    sortOrder: Number.isInteger(row.sort_order) ? row.sort_order : 0,
    hasFile: Boolean(row.storage_path)
  };
}

/** Deterministic order: sort_order, then id as a stable tiebreaker. */
export function sortResources(resources) {
  return [...(resources ?? [])].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeLearningError(error);
  }
}

/**
 * Learning data boundary.
 *
 * Authorization is entirely RLS (`can_access_learning_topic`); this layer validates input and
 * shapes results, and deliberately performs no client-side filtering that could be mistaken for a
 * security control.
 */
export function createLearningService(client) {
  return {
    async listTopics({ page = 0, pageSize = LEARNING_PAGE_SIZE, search = '' } = {}) {
      if (!Number.isInteger(page) || page < 0) {
        throw new LearningServiceError('INVALID_PAGE', 'Page must be a non-negative integer.', undefined);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new LearningServiceError('INVALID_PAGE_SIZE', 'Page size must be between 1 and 100.', undefined);
      }

      const from = page * pageSize;
      let query = client
        .from('learning_topics')
        .select(TOPIC_SELECT, { count: 'exact' })
        .order('open_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      const term = String(search ?? '').trim();
      if (term) {
        const safe = term.replace(/[(),*]/g, ' ').trim();
        if (safe) query = query.ilike('title', `%${safe}%`);
      }

      try {
        const { data, error, count } = await query;
        if (error) throw error;
        const items = (data ?? []).map(mapTopicRow);
        return {
          items,
          total: count ?? items.length,
          page,
          pageSize,
          hasMore: count == null ? items.length === pageSize : from + items.length < count
        };
      } catch (error) {
        throw normalizeLearningError(error);
      }
    },

    /** A topic the caller may not read and a topic that does not exist are indistinguishable. */
    async getTopic(topicId) {
      assertUuid(topicId, 'topicId');
      const rows = await unwrap(
        client.from('learning_topics').select(TOPIC_SELECT).eq('id', topicId).limit(1)
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new LearningServiceError('TOPIC_NOT_FOUND', 'TOPIC_NOT_FOUND', undefined);
      return mapTopicRow(row);
    },

    /**
     * Resources for a topic. RLS gates these by the parent topic, so a hidden topic yields an
     * empty list rather than leaking row existence.
     */
    async listResources(topicId) {
      assertUuid(topicId, 'topicId');
      const rows = await unwrap(
        client
          .from('learning_resources')
          .select(RESOURCE_SELECT)
          .eq('topic_id', topicId)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
      );
      return sortResources((rows ?? []).map(mapResourceRow).filter(Boolean));
    },

    /**
     * Short-lived signed URL for a private resource file.
     * Called only from an explicit user action — never during list or detail rendering — and the
     * result is never persisted or logged.
     */
    async getResourceDownloadUrl(storagePath, { expiresIn = 60 } = {}) {
      if (typeof storagePath !== 'string' || !storagePath || storagePath.includes('..')) {
        throw new LearningServiceError('INVALID_STORAGE_PATH', 'A valid storage path is required.', undefined);
      }
      const segments = storagePath.split('/');
      if (segments.length < 3 || !UUID_PATTERN.test(segments[0]) || segments[1] !== 'resources') {
        throw new LearningServiceError('INVALID_STORAGE_PATH', 'A valid resource storage path is required.', undefined);
      }
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
        throw new LearningServiceError('INVALID_EXPIRY', 'Signed URL expiry must be 1-3600 seconds.', undefined);
      }

      const data = await unwrap(
        client.storage.from(LEARNING_RESOURCES_BUCKET).createSignedUrl(storagePath, expiresIn)
      );
      return data.signedUrl;
    }
  };
}
