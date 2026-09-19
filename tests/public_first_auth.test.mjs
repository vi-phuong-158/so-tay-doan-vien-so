import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const guards = fs.readFileSync(new URL('../src/components/Guards.jsx', import.meta.url), 'utf8');

test('the root route is public-first and protected routes use a separate auth layout', () => {
  assert.match(app, /<Route path="\/" element={<AppShell \/>}>/);
  assert.match(app, /<Route index element={<Home \/>} \/>/);
  assert.match(app, /<Route element={<AuthGuard \/>}>/);
  assert.doesNotMatch(app, /<Route path="\/" element={<AuthGuard><AppShell \/><\/AuthGuard>}>/);
});

test('guest protected-route behavior is an on-demand login CTA, not an application redirect', () => {
  assert.match(guards, /return 'AUTHENTICATION_REQUIRED'/);
  assert.match(guards, /Đăng nhập để tiếp tục/);
  assert.match(guards, /navigate\('\/login', \{ state: \{ from: location \} \}\)/);
  assert.doesNotMatch(guards, /<Navigate to="\/login"/);
});

test('public routes are outside the protected group and private routes stay inside it', () => {
  const protectedGroup = app.slice(app.indexOf('<Route element={<AuthGuard />}>'), app.indexOf('<Route path="*"'));
  const publicGroup = app.slice(app.indexOf('<Route path="/" element={<AppShell />}>'), app.indexOf('<Route element={<AuthGuard />}>'));
  for (const route of ['tri-thuc', 'tri-thuc/hoi-ai', 'tri-thuc/van-ban', 'tri-thuc/van-ban/:documentId', 'tri-thuc/chuyen-de', 'tri-thuc/chuyen-de/:topicId', 'doi-moi-sang-tao']) {
    const routePattern = new RegExp(`path="${route.replaceAll('/', '\\/')}"`);
    assert.match(publicGroup, routePattern);
    assert.doesNotMatch(protectedGroup, routePattern);
  }
  for (const route of ['cong-viec', 'cong-viec/bao-cao/:assignmentId', 'tri-thuc/trac-nghiem/:quizId', 'ca-nhan', 'quan-ly-doan-vien', 'admin']) {
    assert.match(protectedGroup, new RegExp(`path="${route.replaceAll('/', '\\/')}`));
  }
});

test('public shell avoids personal notification and work badges for guests', () => {
  const layout = fs.readFileSync(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8');
  const home = fs.readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
  assert.match(layout, /user && <NotificationBell/);
  assert.match(layout, /\['\/login', 'user', 'Đăng nhập'\]/);
  assert.match(home, /isGuest \? 'Khám phá kho tri thức công khai/);
  assert.doesNotMatch(home, /Dữ liệu minh họa/);
});

test('service worker upgrades the login-first shell without a manual browser-data reset', () => {
  const serviceWorker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(serviceWorker, /so-tay-doan-vien-v2/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
});
