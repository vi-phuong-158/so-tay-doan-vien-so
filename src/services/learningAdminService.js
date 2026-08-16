import { LEARNING_RESOURCES_BUCKET } from './learningService.js';

export const LEARNING_ADMIN_PAGE_SIZE = 20;
export const LEARNING_TOPIC_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];
export const LEARNING_VISIBILITY_LEVELS = ['PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED'];
export const LEARNING_RESOURCE_TYPES = ['TEXT', 'DOCUMENT', 'VIDEO', 'IMAGE', 'LINK'];
export const MAX_LEARNING_FILE_BYTES = 52428800;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE', 'TOPIC_NOT_FOUND', 'TOPIC_NOT_EDITABLE', 'LEARNING_SCOPE_DENIED',
  'INVALID_PAGE', 'INVALID_TOPIC_TITLE', 'INVALID_TOPIC_WINDOW', 'INVALID_TOPIC_TRANSITION',
  'INVALID_TOPIC_STATUS', 'INVALID_VISIBILITY_LEVEL', 'INVALID_RESOURCE_TYPE', 'INVALID_RESOURCE_TITLE',
  'INVALID_EXTERNAL_URL', 'INVALID_STORAGE_PATH', 'INVALID_SORT_ORDER', 'RESOURCE_PAYLOAD_REQUIRED',
  'RESOURCE_NOT_FOUND', 'ORGANIZATION_REQUIRED'
]);

export class LearningAdminError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'LearningAdminError';
    this.code = code;
    this.cause = cause;
  }
}

function businessCode(error) {
  const values = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return values.find((value) => BUSINESS_CODES.has(value))
    ?? [...BUSINESS_CODES].find((code) => typeof error?.message === 'string' && error.message.includes(code));
}

export function normalizeLearningAdminError(error) {
  if (error instanceof LearningAdminError) return error;
  const code = businessCode(error);
  if (code) return new LearningAdminError(code, code, error);
  if (error?.status === 401 || error?.status === 403) {
    return new LearningAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.', error);
  }
  return new LearningAdminError('REQUEST_FAILED', 'Unable to complete the learning admin request.', error);
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new LearningAdminError('INVALID_ID', `${fieldName} must be a UUID.`);
  }
}

function unwrap(request) {
  return Promise.resolve(request).then(({ data, error }) => {
    if (error) throw error;
    return data;
  }).catch((error) => {
    throw normalizeLearningAdminError(error);
  });
}

export function mapAdminTopicRow(row) {
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
    ownerOrganizationId: row.owner_organization_id,
    ownerOrganizationName: row.owner_organization_name,
    resourceCount: Number(row.resource_count ?? 0),
    quizCount: Number(row.quiz_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapAdminResourceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    resourceType: row.resource_type,
    title: row.title,
    content: row.content ?? null,
    storagePath: row.storage_path ?? null,
    externalUrl: row.external_url ?? null,
    sortOrder: Number(row.sort_order ?? 0)
  };
}

export function normalizeLearningFileName(fileName) {
  const base = String(fileName ?? '').trim().split(/[\\/]/).pop() ?? '';
  const safe = [...base].filter((char) => {
    const code = char.charCodeAt(0);
    return code > 31 && code !== 127;
  }).join('').replace(/\.{2,}/g, '.').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '').slice(0, 120);
  return safe || 'hoc-lieu';
}

export function buildLearningStoragePath({ topicId, objectId, fileName }) {
  assertUuid(topicId, 'topicId');
  assertUuid(objectId, 'objectId');
  return `${topicId}/resources/${objectId}-${normalizeLearningFileName(fileName)}`;
}

export function validateLearningFile(file) {
  if (!file) return 'FILE_REQUIRED';
  if (typeof file.size === 'number' && (file.size <= 0 || file.size > MAX_LEARNING_FILE_BYTES)) return 'FILE_TOO_LARGE';
  return null;
}

function validateTopicForm(form) {
  const errors = {};
  if (!String(form?.title ?? '').trim()) errors.title = 'Tên chuyên đề là bắt buộc.';
  if (form?.visibilityLevel && !LEARNING_VISIBILITY_LEVELS.includes(form.visibilityLevel)) {
    errors.visibilityLevel = 'Mức hiển thị không hợp lệ.';
  }
  if (form?.openAt && form?.closeAt && form.closeAt <= form.openAt) {
    errors.closeAt = 'Thời gian đóng phải sau thời gian mở.';
  }
  return errors;
}

export function createLearningAdminService(client, { createObjectId = () => globalThis.crypto.randomUUID() } = {}) {
  return {
    async listTopics({ page = 0, pageSize = LEARNING_ADMIN_PAGE_SIZE, search = '', status = '', visibilityLevel = '' } = {}) {
      if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new LearningAdminError('INVALID_PAGE', 'Invalid page.');
      }
      if (status && !LEARNING_TOPIC_STATUSES.includes(status)) throw new LearningAdminError('INVALID_TOPIC_STATUS', 'Invalid status.');
      if (visibilityLevel && !LEARNING_VISIBILITY_LEVELS.includes(visibilityLevel)) {
        throw new LearningAdminError('INVALID_VISIBILITY_LEVEL', 'Invalid visibility.');
      }
      const rows = await unwrap(client.rpc('get_admin_learning_topics', {
        p_search: String(search ?? '').trim() || null,
        p_status: status || null,
        p_visibility_level: visibilityLevel || null,
        p_owner_organization_id: null,
        p_limit: pageSize,
        p_offset: page * pageSize
      }));
      const items = (rows ?? []).map(mapAdminTopicRow).filter(Boolean);
      const total = Number(rows?.[0]?.total_count ?? items.length);
      return { items, total, page, pageSize, hasMore: page * pageSize + items.length < total };
    },

    async getTopic(topicId) {
      assertUuid(topicId, 'topicId');
      const rows = await unwrap(client.rpc('get_admin_learning_topic', { p_topic_id: topicId }));
      return mapAdminTopicRow(Array.isArray(rows) ? rows[0] : rows);
    },

    async listResources(topicId) {
      assertUuid(topicId, 'topicId');
      const rows = await unwrap(client.rpc('get_admin_learning_resources', { p_topic_id: topicId }));
      return (rows ?? []).map(mapAdminResourceRow).filter(Boolean);
    },

    async createTopic(form) {
      const errors = validateTopicForm(form);
      if (Object.keys(errors).length) throw new LearningAdminError('VALIDATION_FAILED', 'Form validation failed.', errors);
      return unwrap(client.rpc('create_learning_topic_draft', {
        p_title: String(form.title).trim(),
        p_description: form.description || null,
        p_objectives: form.objectives || null,
        p_open_at: form.openAt || null,
        p_close_at: form.closeAt || null,
        p_visibility_level: form.visibilityLevel || 'INTERNAL_YOUTH',
        p_owner_organization_id: form.ownerOrganizationId || null
      }));
    },

    async updateTopic(topicId, form) {
      assertUuid(topicId, 'topicId');
      const errors = validateTopicForm(form);
      if (Object.keys(errors).length) throw new LearningAdminError('VALIDATION_FAILED', 'Form validation failed.', errors);
      return unwrap(client.rpc('update_learning_topic', {
        p_topic_id: topicId,
        p_title: String(form.title).trim(),
        p_description: form.description || null,
        p_objectives: form.objectives || null,
        p_open_at: form.openAt || null,
        p_close_at: form.closeAt || null,
        p_visibility_level: form.visibilityLevel || null
      }));
    },

    async setTopicStatus(topicId, status) {
      assertUuid(topicId, 'topicId');
      if (!['PUBLISHED', 'CLOSED', 'ARCHIVED'].includes(status)) throw new LearningAdminError('INVALID_TOPIC_TRANSITION', 'Invalid transition.');
      return unwrap(client.rpc('set_learning_topic_status', { p_topic_id: topicId, p_status: status }));
    },

    async upsertResource(topicId, resource) {
      assertUuid(topicId, 'topicId');
      if (!LEARNING_RESOURCE_TYPES.includes(resource?.resourceType)) throw new LearningAdminError('INVALID_RESOURCE_TYPE', 'Invalid resource type.');
      return unwrap(client.rpc('upsert_learning_resource', {
        p_topic_id: topicId,
        p_resource_type: resource.resourceType,
        p_title: String(resource.title ?? '').trim(),
        p_content: resource.content || null,
        p_storage_path: resource.storagePath || null,
        p_external_url: resource.externalUrl || null,
        p_sort_order: Number(resource.sortOrder ?? 0),
        p_resource_id: resource.id || null
      }));
    },

    async uploadResourceFile(topicId, file, { resourceId = null, title = '', sortOrder = 0 } = {}) {
      assertUuid(topicId, 'topicId');
      const validationCode = validateLearningFile(file);
      if (validationCode) throw new LearningAdminError(validationCode, validationCode);
      const storagePath = buildLearningStoragePath({ topicId, objectId: createObjectId(), fileName: file.name });
      await unwrap(client.storage.from(LEARNING_RESOURCES_BUCKET).upload(storagePath, file, { upsert: false }));
      try {
        await this.upsertResource(topicId, {
          id: resourceId,
          resourceType: 'DOCUMENT',
          title: title || normalizeLearningFileName(file.name),
          storagePath,
          sortOrder
        });
      } catch (error) {
        try { await client.storage.from(LEARNING_RESOURCES_BUCKET).remove([storagePath]); } catch { /* best effort */ }
        throw error;
      }
      return storagePath;
    },

    async deleteResource(resourceId) {
      assertUuid(resourceId, 'resourceId');
      return unwrap(client.rpc('delete_learning_resource', { p_resource_id: resourceId }));
    },

    async reorderResources(topicId, resourceIds) {
      assertUuid(topicId, 'topicId');
      if (!Array.isArray(resourceIds)) throw new LearningAdminError('INVALID_SORT_ORDER', 'Invalid resource order.');
      return unwrap(client.rpc('reorder_learning_resources', { p_topic_id: topicId, p_resource_ids: resourceIds }));
    }
  };
}

