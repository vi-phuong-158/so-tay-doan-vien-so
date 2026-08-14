const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ACTION_URL_PATTERN = /^\/(?:$|(?:cong-viec|ca-nhan|tri-thuc|doi-moi-sang-tao|admin)(?:\/|\?|$))/;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export class NotificationServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'NotificationServiceError';
    this.code = code;
    this.cause = cause;
  }
}

export function isSafeNotificationActionUrl(value) {
  return typeof value === 'string'
    && value.length <= 500
    && !value.includes('\\')
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32)
    && SAFE_ACTION_URL_PATTERN.test(value);
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new NotificationServiceError('INVALID_ID', 'notificationId must be a UUID.', fieldName);
  }
}

function normalizePageSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? Math.min(size, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}

function normalizeOffset(value) {
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || '',
    actionUrl: isSafeNotificationActionUrl(row.action_url) ? row.action_url : null,
    readAt: row.read_at,
    createdAt: row.created_at,
    sourceEntityType: row.source_entity_type || null,
    sourceEntityId: row.source_entity_id || null,
    eventKey: row.event_key || null
  };
}

function unwrap(response, operation) {
  if (response?.error) {
    throw new NotificationServiceError('REQUEST_FAILED', 'Không thể ' + operation + '.', response.error);
  }
  return response?.data;
}

export function createNotificationService(client) {
  if (!client) {
    throw new NotificationServiceError('CLIENT_REQUIRED', 'Supabase client is required.');
  }

  return {
    async getMyNotifications({ limit = DEFAULT_PAGE_SIZE, offset = 0, unreadOnly = false } = {}) {
      const pageSize = normalizePageSize(limit);
      const pageOffset = normalizeOffset(offset);
      let query = client
        .from('notifications')
        .select('id,type,title,body,action_url,read_at,created_at,source_entity_type,source_entity_id,event_key')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);
      if (unreadOnly) query = query.is('read_at', null);
      const response = await query;
      return (unwrap(response, 'tải thông báo') || []).map(normalizeNotification);
    },

    async getUnreadCount() {
      const response = await client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (response?.error) {
        throw new NotificationServiceError('REQUEST_FAILED', 'Không thể tải số thông báo chưa đọc.', response.error);
      }
      return response?.count || 0;
    },

    async markAsRead(notificationId) {
      assertUuid(notificationId, 'notificationId');
      const response = await client.rpc('mark_notification_read', {
        p_notification_id: notificationId
      });
      return Boolean(unwrap(response, 'cập nhật trạng thái thông báo'));
    },

    async markAllAsRead() {
      const response = await client.rpc('mark_all_notifications_read');
      return unwrap(response, 'cập nhật trạng thái thông báo') || 0;
    }
  };
}
