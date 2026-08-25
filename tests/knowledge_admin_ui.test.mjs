import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/pages/AdminKnowledgeArticle.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('admin review UI exposes source, article, evidence and trusted transitions', () => {
  assert.match(source, /Xem văn bản/);
  assert.match(source, /Evidence đối chiếu/);
  assert.match(source, /review\('APPROVE'\)/);
  assert.match(source, /review\('REJECT'\)/);
  assert.match(source, /generate\(true\)/);
});

test('article review route is protected by the youth admin guard', () => {
  assert.match(app, /admin\/van-ban\/:documentId\/tri-thuc/);
  assert.match(app, /<RoleGuard allowedRoles=\{\['YOUTH_ADMIN'\]\}><AdminKnowledgeArticle/);
});
