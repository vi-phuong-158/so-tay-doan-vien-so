import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  canDownloadSource,
  documentErrorMessage,
  effectStatusTone,
  formatDocumentDate,
  relationLabel
} from '../src/lib/documentDisplay.mjs';

const listSource = fs.readFileSync(new URL('../src/pages/Documents.jsx', import.meta.url), 'utf8');
const detailSource = fs.readFileSync(new URL('../src/pages/DocumentDetail.jsx', import.meta.url), 'utf8');
const knowledgeSource = fs.readFileSync(new URL('../src/pages/Knowledge.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('document dates render in vi-VN or fall back rather than printing Invalid Date', () => {
  assert.equal(formatDocumentDate('2026-07-25'), '25/07/2026');
  assert.equal(formatDocumentDate(null), '—');
  assert.equal(formatDocumentDate('not-a-date'), '—');
});

test('effect status tone is derived from meaning and always paired with its text label', () => {
  assert.equal(effectStatusTone('Còn hiệu lực'), 'success');
  assert.equal(effectStatusTone('Đang áp dụng'), 'success');
  assert.equal(effectStatusTone('Hết hiệu lực'), 'neutral');
  assert.equal(effectStatusTone(null), 'neutral');

  // Colour must never be the only signal: both views print the status text next to the badge.
  assert.match(listSource, /status-\$\{effectStatusTone\(item\.effectStatus\)\}[\s\S]{0,120}\{item\.effectStatus\}/);
  assert.match(detailSource, /status-\$\{effectStatusTone\(document\.effectStatus\)\}[\s\S]{0,140}\{document\.effectStatus\}/);
});

test('relation labels are human readable and unknown types degrade safely', () => {
  assert.equal(relationLabel('REPLACES'), 'Thay thế');
  assert.equal(relationLabel('AMENDS'), 'Sửa đổi, bổ sung');
  assert.equal(relationLabel('GUIDES'), 'Hướng dẫn thi hành');
  assert.equal(relationLabel('SOMETHING_NEW'), 'Liên quan');
});

test('download affordance requires an actual stored file', () => {
  assert.equal(canDownloadSource({ hasSourceFile: true, storagePath: 'a/source/b.pdf' }), true);
  assert.equal(canDownloadSource({ hasSourceFile: false, storagePath: null }), false);
  assert.equal(canDownloadSource(null), false);
});

test('error copy distinguishes not-found/forbidden from a generic failure', () => {
  assert.match(documentErrorMessage({ code: 'DOCUMENT_NOT_FOUND' }), /không có quyền/i);
  assert.match(documentErrorMessage({ code: 'AUTHENTICATION_REQUIRED' }), /đăng nhập/i);
  assert.match(documentErrorMessage({ code: 'REQUEST_FAILED' }), /thử lại/i);
});

test('routes for the real documents area are registered under Tri thức', () => {
  assert.match(appSource, /path="tri-thuc\/van-ban"/);
  assert.match(appSource, /path="tri-thuc\/van-ban\/:documentId"/);
  assert.match(appSource, /import \{ Documents \} from '\.\/pages\/Documents'/);
  assert.match(appSource, /import \{ DocumentDetail \} from '\.\/pages\/DocumentDetail'/);
});

test('the list page reads real data with loading, error+retry, empty and pagination states', () => {
  assert.match(listSource, /createDocumentService/);
  assert.doesNotMatch(listSource, /from '\.\.\/data\/mock'/);

  assert.match(listSource, /loading && <Skeleton/);
  assert.match(listSource, /role="alert"/);
  assert.match(listSource, /Thử lại/);
  assert.match(listSource, /<EmptyState/);
  assert.match(listSource, /hasMore &&/);
  assert.match(listSource, /Tải thêm/);

  // Search and filters must be sent to the service, not applied to an already-fetched array.
  assert.match(listSource, /listDocuments\(\{[\s\S]*?search,[\s\S]*?documentType,[\s\S]*?issuingAuthority,[\s\S]*?year,[\s\S]*?effect/);
  assert.doesNotMatch(listSource, /documents\.filter\(/);
});

test('the list page never requests a signed URL while rendering', () => {
  assert.doesNotMatch(listSource, /getDocumentDownloadUrl/);
});

test('detail requests a signed URL only from an explicit user action', () => {
  // The call must live in the click handler, not in the load effect.
  assert.match(detailSource, /const handleDownload = async \(\) => \{[\s\S]*?getDocumentDownloadUrl/);
  const loadBlock = detailSource.slice(
    detailSource.indexOf('const loadDocument'),
    detailSource.indexOf('const handleDownload')
  );
  assert.doesNotMatch(loadBlock, /getDocumentDownloadUrl/, 'signed URLs are not prefetched on load');

  assert.match(detailSource, /onClick=\{handleDownload\}/);
  assert.match(detailSource, /disabled=\{downloading\}/, 'double-click is guarded');
  assert.match(detailSource, /noopener,noreferrer/);
});

test('detail handles missing/unauthorized documents and keeps relations non-fatal', () => {
  assert.match(detailSource, /documentErrorMessage\(error\)/);
  assert.match(detailSource, /Về danh sách/);
  assert.match(detailSource, /Thử lại/);

  // A relations failure must not blank out a document the user is allowed to read.
  assert.match(detailSource, /getDocumentRelations[\s\S]*?\.catch\(\(\) => \{[\s\S]*?setRelations\(\[\]\)/);
});

test('the Knowledge documents tab no longer renders mock documents', () => {
  assert.match(knowledgeSource, /createDocumentService/);
  assert.doesNotMatch(knowledgeSource, /documents\s*\}\s*from '\.\.\/data\/mock'/);
  assert.match(knowledgeSource, /to="\/tri-thuc\/van-ban"/);

  // P4-01 asserted here that Learning topics were still on demo data, because wiring them was
  // out of that task's scope. P4-03 wires them for real, so that assertion is replaced with a
  // strictly stronger one: the Knowledge page must import NO mock data at all. This is an
  // intentional behaviour change, not a relaxed check.
  assert.doesNotMatch(knowledgeSource, /from '\.\.\/data\/mock'/);
});
