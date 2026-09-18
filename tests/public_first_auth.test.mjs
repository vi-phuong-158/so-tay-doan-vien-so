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

test('public-first audit keeps private content behind the protected route group', () => {
  const protectedGroup = app.slice(app.indexOf('<Route element={<AuthGuard />}>'), app.indexOf('<Route path="*"'));
  for (const route of ['cong-viec', 'tri-thuc', 'tri-thuc/hoi-ai', 'tri-thuc/van-ban', 'tri-thuc/chuyen-de', 'doi-moi-sang-tao', 'ca-nhan', 'quan-ly-doan-vien', 'admin']) {
    assert.match(protectedGroup, new RegExp(`path="${route.replaceAll('/', '\\/')}`));
  }
});
