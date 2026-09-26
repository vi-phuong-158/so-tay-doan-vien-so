import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { AUDIT_FIELD_LABELS, describeAuditEntry } from '../src/lib/memberDisplay.mjs';

const detailSource = fs.readFileSync(new URL('../src/pages/MemberDetail.jsx', import.meta.url), 'utf8');

// P5.5-07R — closes the frontend audit-history gap: MemberDetail was shipped in P5.5-06, before the
// P5.5-07 `GET /v1/members/:id/audit` endpoint existed.

test('describeAuditEntry: CREATE has no "before" value, only "after"', () => {
  const described = describeAuditEntry({
    action: 'CREATE',
    beforeData: null,
    afterData: { full_name: 'Nguyễn Văn A', member_status: 'ACTIVE' },
  });
  assert.equal(described.actionLabel, 'Tạo mới');
  const fullName = described.changes.find((c) => c.field === 'full_name');
  assert.equal(fullName.before, null);
  assert.equal(fullName.after, 'Nguyễn Văn A');
  const status = described.changes.find((c) => c.field === 'member_status');
  assert.equal(status.after, 'Đang sinh hoạt'); // enum -> label, not raw code
});

test('describeAuditEntry: UPDATE renders both before and after for each changed field', () => {
  const described = describeAuditEntry({
    action: 'UPDATE',
    beforeData: { job_title: 'Cán bộ' },
    afterData: { job_title: 'Đội trưởng' },
  });
  assert.equal(described.actionLabel, 'Cập nhật');
  assert.deepEqual(described.changes, [{ field: 'job_title', label: 'Chức vụ', before: 'Cán bộ', after: 'Đội trưởng' }]);
});

test('describeAuditEntry: null/missing values render as an em dash, never blank/undefined', () => {
  const described = describeAuditEntry({ action: 'UPDATE', beforeData: { job_title: null }, afterData: { job_title: 'Đội trưởng' } });
  assert.equal(described.changes[0].before, '—');
});

test('describeAuditEntry: a field outside AUDIT_FIELD_LABELS is silently dropped, never rendered', () => {
  const described = describeAuditEntry({
    action: 'UPDATE',
    beforeData: { full_name: 'A', not_an_audited_field: 'x', account_user_id: 'leak' },
    afterData: { full_name: 'B', not_an_audited_field: 'y' },
  });
  assert.equal(described.changes.length, 1);
  assert.equal(described.changes[0].field, 'full_name');
});

test('AUDIT_FIELD_LABELS never includes external_ref_note (cosmetic field, excluded from audit per muc 16)', () => {
  assert.ok(!('external_ref_note' in AUDIT_FIELD_LABELS));
});

test('MemberDetail renders an audit history section with loading, empty, error+retry, and load-more states', () => {
  assert.match(detailSource, /Lịch sử thay đổi/);
  assert.match(detailSource, /auditLoading/);
  assert.match(detailSource, /Chưa có thay đổi nào được ghi nhận/); // empty state
  assert.match(detailSource, /auditError[\s\S]{0,200}Thử lại/); // error + retry
  assert.match(detailSource, /Tải thêm/); // pagination / load more
});

test('MemberDetail never renders raw audit JSON — no JSON.stringify of an audit log in the audit section', () => {
  const auditSectionStart = detailSource.indexOf('Lịch sử thay đổi');
  const auditSectionEnd = detailSource.indexOf('editing && (', auditSectionStart);
  const auditSection = detailSource.slice(auditSectionStart, auditSectionEnd);
  assert.ok(!auditSection.includes('JSON.stringify'));
});

test('MemberDetail: the audit section shares the same top-level guard as the main member info card, so an audit error cannot hide member info', () => {
  const infoCardIndex = detailSource.indexOf('Đơn vị công tác');
  const auditIndex = detailSource.indexOf('Lịch sử thay đổi');
  assert.ok(infoCardIndex > -1 && auditIndex > infoCardIndex, 'audit section must be rendered after and alongside the main info card');
  // Between the two, there must be no closing of the `member && !editing` branch (`</>` followed
  // by a new top-level `{!loading && !error && member && editing && (` block) — i.e. they are
  // siblings inside the same conditional, not gated separately.
  const between = detailSource.slice(infoCardIndex, auditIndex);
  assert.ok(!between.includes('member && editing'));
  // The audit panel itself must carry its OWN loading/error state, never reuse the top-level
  // `loading`/`error` (member fetch) flags to gate its rendering.
  const auditPanelSlice = detailSource.slice(auditIndex, auditIndex + 1800);
  assert.match(auditPanelSlice, /auditLoading/);
  assert.match(auditPanelSlice, /auditError/);
});
