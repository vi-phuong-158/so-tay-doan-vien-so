import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('notification route and bell use the real notification foundation', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const layout = fs.readFileSync(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8');
  const bell = fs.readFileSync(new URL('../src/components/NotificationBell.jsx', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../src/pages/Notifications.jsx', import.meta.url), 'utf8');

  assert.match(app, /<Route path="ca-nhan\/thong-bao" element={<Notifications \/>}/);
  assert.match(layout, /<NotificationBell \/>/);
  assert.match(bell, /getUnreadCount/);
  assert.match(bell, /user\?\.id/);
  assert.match(page, /getMyNotifications/);
  assert.match(page, /markAsRead/);
  assert.match(page, /markAllAsRead/);
  assert.match(page, /loading/);
  assert.match(page, /Chưa có thông báo/);
  assert.match(page, /role="alert"/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test('notification UI awaits read state before navigating to trusted action route', () => {
  const page = fs.readFileSync(new URL('../src/pages/Notifications.jsx', import.meta.url), 'utf8');
  assert.match(page, /await notificationService\.markAsRead\(notification\.id\)/);
  assert.match(page, /if \(notification\.actionUrl\) navigate\(notification\.actionUrl\)/);
});
