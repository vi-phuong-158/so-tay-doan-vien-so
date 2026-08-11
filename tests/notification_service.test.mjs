import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NotificationServiceError,
  createNotificationService,
  isSafeNotificationActionUrl
} from '../src/services/notificationService.js';

const ids = {
  notification: '11111111-1111-4111-8111-111111111111'
};

function createQuery(response, calls) {
  return {
    select(columns, options) { calls.push(['select', columns, options]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(start, end) { calls.push(['range', start, end]); return this; },
    is(column, value) { calls.push(['is', column, value]); return this; },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
}

function createClient({ rows = [], count = 0, rpcData = {} } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return createQuery({ data: rows, count, error: null }, calls);
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: rpcData[name], error: null });
    }
  };
  return { client, calls };
}

test('notification service fetches bounded deterministic pages and normalizes unsafe actions', async () => {
  const { client, calls } = createClient({
    count: 3,
    rows: [{
      id: ids.notification,
      type: 'REPORT_ACCEPTED',
      title: 'Đã duyệt',
      body: null,
      action_url: 'https://evil.example',
      read_at: null,
      created_at: '2026-08-11T08:00:00Z',
      source_entity_type: 'report_assignment',
      source_entity_id: ids.notification,
      event_key: 'EVENT-1'
    }]
  });

  const service = createNotificationService(client);
  const rows = await service.getMyNotifications({ limit: 500, offset: 20, unreadOnly: true });
  const count = await service.getUnreadCount();

  assert.equal(rows[0].actionUrl, null);
  assert.equal(rows[0].body, '');
  assert.equal(count, 3);
  assert.deepEqual(calls.slice(0, 6), [
    ['from', 'notifications'],
    ['select', 'id,type,title,body,action_url,read_at,created_at,source_entity_type,source_entity_id,event_key', undefined],
    ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: false }],
    ['range', 20, 69],
    ['is', 'read_at', null]
  ]);
});

test('notification service uses trusted mark-read RPCs and validates IDs', async () => {
  const { client, calls } = createClient({ rpcData: { mark_notification_read: true, mark_all_notifications_read: 2 } });
  const service = createNotificationService(client);

  assert.equal(await service.markAsRead(ids.notification), true);
  assert.equal(await service.markAllAsRead(), 2);
  assert.deepEqual(calls, [
    ['rpc', 'mark_notification_read', { p_notification_id: ids.notification }],
    ['rpc', 'mark_all_notifications_read', undefined]
  ]);
  await assert.rejects(
    () => service.markAsRead('not-a-uuid'),
    (error) => error instanceof NotificationServiceError && error.code === 'INVALID_ID'
  );
});

test('notification action URL allowlist only accepts app-relative routes', () => {
  assert.equal(isSafeNotificationActionUrl('/cong-viec/bao-cao/abc'), true);
  assert.equal(isSafeNotificationActionUrl('/admin/doi-moi-sang-tao?problem=abc'), true);
  assert.equal(isSafeNotificationActionUrl('/'), true);
  assert.equal(isSafeNotificationActionUrl('//evil.example'), false);
  assert.equal(isSafeNotificationActionUrl('javascript:alert(1)'), false);
  assert.equal(isSafeNotificationActionUrl('/other-area'), false);
});
