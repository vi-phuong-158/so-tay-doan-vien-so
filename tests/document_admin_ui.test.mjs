import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DOCUMENT_STATUS_LABELS,
  VISIBILITY_LABELS,
  adminErrorMessage,
  availableDocumentActions,
  documentStatusTone
} from '../src/lib/documentAdminDisplay.mjs';

const adminSource = fs.readFileSync(new URL('../src/pages/AdminDocuments.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboardSource = fs.readFileSync(new URL('../src/pages/Admin.jsx', import.meta.url), 'utf8');

test('the admin route exists and is protected by the role guard', () => {
  assert.match(appSource, /path="admin\/van-ban"/);
  assert.match(appSource, /import \{ AdminDocuments \} from '\.\/pages\/AdminDocuments'/);

  // The route element must be wrapped in RoleGuard, not merely rendered.
  const routeBlock = appSource.slice(
    appSource.indexOf('path="admin/van-ban"'),
    appSource.indexOf('path="admin/bao-cao"')
  );
  assert.match(routeBlock, /<RoleGuard allowedRoles=\{\['YOUTH_ADMIN'\]\}>/);
  assert.match(routeBlock, /<AdminDocuments \/>/);
});

test('the admin dashboard links to the documents admin area', () => {
  assert.match(dashboardSource, /to="\/admin\/van-ban"/);
});

test('status and visibility labels cover every value the server can return', () => {
  for (const status of ['DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'PUBLISHED', 'REPLACED', 'EXPIRED', 'WITHDRAWN']) {
    assert.ok(DOCUMENT_STATUS_LABELS[status], `missing label for ${status}`);
  }
  for (const level of ['PUBLIC', 'INTERNAL_YOUTH', 'ORGANIZATION_ONLY', 'RESTRICTED']) {
    assert.ok(VISIBILITY_LABELS[level], `missing label for ${level}`);
  }
});

test('status tone is derived from meaning and never the sole signal', () => {
  assert.equal(documentStatusTone('PUBLISHED'), 'success');
  assert.equal(documentStatusTone('WITHDRAWN'), 'danger');
  assert.equal(documentStatusTone('DRAFT'), 'neutral');
  assert.equal(documentStatusTone('UNKNOWN_FUTURE'), 'neutral');

  // The badge always prints its label next to the tone class.
  assert.match(adminSource, /status-\$\{documentStatusTone\(doc\.status\)\}[\s\S]{0,160}DOCUMENT_STATUS_LABELS\[doc\.status\]/);
});

test('offered actions mirror the server transition rules', () => {
  assert.deepEqual(availableDocumentActions('DRAFT'), {
    canPublish: true, canWithdraw: false, canEdit: true, canDetachSource: true
  });
  assert.deepEqual(availableDocumentActions('PUBLISHED'), {
    canPublish: false, canWithdraw: true, canEdit: true, canDetachSource: false
  });
  assert.deepEqual(availableDocumentActions('EXPIRED'), {
    canPublish: false, canWithdraw: false, canEdit: false, canDetachSource: true
  });
});

test('admin error copy never exposes database vocabulary', () => {
  const messages = [
    'DOCUMENT_SCOPE_DENIED', 'DOCUMENT_NOT_FOUND', 'INVALID_DOCUMENT_TRANSITION',
    'FILE_TYPE_NOT_ALLOWED', 'FILE_TOO_LARGE', 'REQUEST_FAILED', 'VALIDATION_FAILED'
  ].map((code) => adminErrorMessage({ code }));

  for (const message of messages) {
    assert.doesNotMatch(message, /rpc|sql|postgre|constraint|relation|policy|null value/i);
    assert.ok(message.length > 10, 'messages are actionable, not codes');
  }
  assert.match(adminErrorMessage({ code: 'DOCUMENT_SCOPE_DENIED' }), /không có quyền/i);
  assert.match(adminErrorMessage({ code: 'FILE_TOO_LARGE' }), /50 MB/);
});

test('the list has loading, error+retry, empty and pagination states', () => {
  assert.match(adminSource, /loading && <Skeleton/);
  assert.match(adminSource, /role="alert"/);
  assert.match(adminSource, /Thử lại/);
  assert.match(adminSource, /<EmptyState/);
  assert.match(adminSource, /hasMore &&/);
  assert.match(adminSource, /Tải thêm/);
});

test('list filters are sent to the server, not applied to a fetched array', () => {
  assert.match(adminSource, /listDocuments\(\{[\s\S]*?search,[\s\S]*?status: statusFilter,[\s\S]*?visibilityLevel: visibilityFilter,[\s\S]*?year: yearFilter/);
  assert.doesNotMatch(adminSource, /documents\.filter\(/);
});

test('create and edit both submit through the admin service, never a direct table write', () => {
  assert.match(adminSource, /adminService\.createDraft\(form\)/);
  assert.match(adminSource, /adminService\.updateMetadata\(editing, form\)/);
  assert.doesNotMatch(adminSource, /\.from\('documents'\)/);
  assert.doesNotMatch(adminSource, /\.insert\(|\.update\(|\.delete\(/);
});

test('the form validates before submitting and shows per-field messages', () => {
  assert.match(adminSource, /const errors = validateDocumentForm\(form\)/);
  assert.match(adminSource, /if \(Object\.keys\(errors\)\.length > 0\) return;/);
  assert.match(adminSource, /formErrors\.title && <p className="form-error">/);
  assert.match(adminSource, /aria-invalid=\{Boolean\(formErrors\.title\)\}/);
});

test('duplicate submission is prevented on the form and on confirmed actions', () => {
  assert.match(adminSource, /if \(saving\) return;/);
  assert.match(adminSource, /disabled=\{saving\}/);
  assert.match(adminSource, /if \(!confirm \|\| actionBusy\) return;/);
  assert.match(adminSource, /busy=\{actionBusy\}/);
  // An in-flight upload blocks a second upload for the same row.
  assert.match(adminSource, /if \(!file \|\| !doc \|\| uploadingId\) return;/);
  assert.match(adminSource, /disabled=\{uploadingId === doc\.id\}/);
});

test('upload goes through the service boundary and reports failure to the operator', () => {
  assert.match(adminSource, /await adminService\.uploadSourceFile\(doc\.id, file\)/);
  assert.match(adminSource, /catch \(requestError\) \{[\s\S]{0,80}setError\(requestError\)/);
  // The picker is restricted to the same extensions the server accepts.
  assert.match(adminSource, /accept=\{ALLOWED_SOURCE_EXTENSIONS\.map/);
});

test('publish and withdraw are gated behind an explicit confirmation dialog', () => {
  assert.match(adminSource, /setConfirm\(\{ kind: 'publish', document: doc \}\)/);
  assert.match(adminSource, /setConfirm\(\{ kind: 'withdraw', document: doc \}\)/);
  assert.match(adminSource, /confirm\?\.kind === 'publish' &&[\s\S]{0,400}<ConfirmDialog/);
  assert.match(adminSource, /confirm\?\.kind === 'withdraw' &&[\s\S]{0,400}<ConfirmDialog/);
  assert.match(adminSource, /role="dialog"/);
  assert.match(adminSource, /aria-modal="true"/);

  // The mutation only happens after the dialog is confirmed.
  assert.match(adminSource, /onConfirm=\{runConfirmedAction\}/);
  assert.match(adminSource, /const runConfirmedAction = async \(\) => \{[\s\S]*?adminService\.publish/);
});

test('a failed publish or withdraw surfaces the error instead of a success toast', () => {
  const actionBlock = adminSource.slice(
    adminSource.indexOf('const runConfirmedAction'),
    adminSource.indexOf('const submitSearch')
  );
  assert.match(actionBlock, /catch \(requestError\) \{[\s\S]*?setError\(requestError\)/);
  const catchIndex = actionBlock.indexOf('catch (requestError)');
  assert.equal(actionBlock.slice(catchIndex).includes('setToast('), false,
    'no success toast is shown on the failure path');
});

test('the admin list never requests a signed URL while rendering', () => {
  assert.doesNotMatch(adminSource, /getSourcePreviewUrl/);
  assert.doesNotMatch(adminSource, /createSignedUrl/);
});

test('status is never client-chosen: the UI offers transitions, not arbitrary statuses', () => {
  // No place in the admin page sets a status value directly on a payload.
  assert.doesNotMatch(adminSource, /status:\s*'(PUBLISHED|WITHDRAWN|DRAFT)'/);
  assert.match(adminSource, /adminService\.publish\(confirm\.document\.id\)/);
  assert.match(adminSource, /adminService\.withdraw\(confirm\.document\.id/);
});
