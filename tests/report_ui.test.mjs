import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  formatFileSize,
  canSubmitAssignment,
  getReviewActions,
  getEffectiveDueAt,
  REPORT_STATUS_GROUPS,
  sortAssignments,
  validateReportFileSelection
} from '../src/lib/reportDisplay.mjs';

const workSource = fs.readFileSync(new URL('../src/pages/Work.jsx', import.meta.url), 'utf8');
const detailSource = fs.readFileSync(new URL('../src/pages/ReportAssignmentDetail.jsx', import.meta.url), 'utf8');

const assignments = [
  { id: 'a', status: 'PENDING', dueAtOverride: '2026-08-20T00:00:00Z', campaign: { dueAt: '2026-08-30T00:00:00Z' } },
  { id: 'b', status: 'NEEDS_SUPPLEMENT', dueAtOverride: null, campaign: { dueAt: '2026-08-29T00:00:00Z' } },
  { id: 'c', status: 'ACCEPTED', dueAtOverride: null, campaign: { dueAt: '2026-08-01T00:00:00Z' } }
];

test('report status groups keep terminal statuses separate from actionable statuses', () => {
  assert.deepEqual(REPORT_STATUS_GROUPS.active.includes('PENDING'), true);
  assert.deepEqual(REPORT_STATUS_GROUPS.active.includes('ACCEPTED'), false);
  assert.deepEqual(REPORT_STATUS_GROUPS.completed, ['ACCEPTED', 'EXEMPTED', 'CLOSED']);
});

test('effective deadline prefers assignment override and active sorting prioritizes attention', () => {
  assert.equal(getEffectiveDueAt(assignments[0]), '2026-08-20T00:00:00Z');
  assert.deepEqual(sortAssignments(assignments.filter(({ status }) => REPORT_STATUS_GROUPS.active.includes(status)), 'active').map(({ id }) => id), ['b', 'a']);
});

test('display helpers format file sizes without creating business state', () => {
  assert.equal(formatFileSize(20 * 1024 * 1024), '20.0 MB');
  assert.equal(formatFileSize(null), '');
});

test('client file validation follows campaign constraints without replacing server checks', () => {
  const campaign = { allowedExtensions: ['pdf'], maxFileSizeMb: 1, maxFiles: 1 };
  const valid = { name: 'bao-cao.pdf', size: 100, lastModified: 1 };
  const invalidType = { name: 'bao-cao.exe', size: 100, lastModified: 2 };
  assert.equal(validateReportFileSelection([valid], campaign).errorCode, null);
  assert.equal(validateReportFileSelection([invalidType], campaign).errorCode, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(validateReportFileSelection([valid, valid], campaign).errorCode, 'TOO_MANY_FILES');
});

test('submit form presentation follows server status without mutating it locally', () => {
  assert.equal(canSubmitAssignment({ status: 'PENDING', campaign: {} }), true);
  assert.equal(canSubmitAssignment({ status: 'NEEDS_SUPPLEMENT', campaign: {} }), true);
  assert.equal(canSubmitAssignment({ status: 'SUBMITTED', campaign: { allowResubmission: false } }), false);
  assert.equal(canSubmitAssignment({ status: 'LATE_SUBMITTED', campaign: { allowResubmission: true } }), true);
  assert.equal(canSubmitAssignment({ status: 'ACCEPTED', campaign: { allowResubmission: true } }), false);
});

test('review actions are derived from the server status and terminal states are fail-closed', () => {
  assert.deepEqual(getReviewActions({ status: 'SUBMITTED' }), ['ACCEPTED', 'NEEDS_SUPPLEMENT']);
  assert.deepEqual(getReviewActions({ status: 'RESUBMITTED' }), ['ACCEPTED', 'NEEDS_SUPPLEMENT']);
  assert.deepEqual(getReviewActions({ status: 'PENDING' }), ['EXEMPTED']);
  assert.deepEqual(getReviewActions({ status: 'ACCEPTED' }), []);
  assert.deepEqual(getReviewActions({ status: 'CLOSED' }), []);
});

test('Work production path uses reportService, real tabs, loading/error/empty states, and accessible assignment links', () => {
  assert.doesNotMatch(workSource, /data\/mock|campaigns/);
  assert.match(workSource, /getMyAssignments/);
  assert.match(workSource, /Skeleton/);
  assert.match(workSource, /EmptyState/);
  assert.match(workSource, /Thử lại/);
  assert.match(workSource, /to=\{`\/cong-viec\/bao-cao\/\$\{assignment\.id\}`\}/);
  assert.doesNotMatch(workSource, /Còn 4 ngày|submitted\/total|Giao diện hiển thị dữ liệu minh họa/);
});

test('detail production path reads assignment/history, signs downloads, and wires P2-09/P2-10/P2-11 actions', () => {
  assert.match(detailSource, /getAssignment/);
  assert.match(detailSource, /getCampaignTemplates/);
  assert.match(detailSource, /getSubmissionHistory/);
  assert.match(detailSource, /Lịch sử nộp báo cáo/);
  assert.match(detailSource, /Phiên bản hiện tại/);
  assert.match(detailSource, /aria-expanded/);
  assert.match(detailSource, /Nộp muộn/);
  assert.match(detailSource, /getSignedFileUrl/);
  assert.match(detailSource, /REPORT_TEMPLATES_BUCKET/);
  assert.match(detailSource, /uploadReportFile/);
  assert.match(detailSource, /removeStagedReportFile/);
  assert.match(detailSource, /submitReport/);
  assert.match(detailSource, /reviewReport/);
  assert.match(detailSource, /Xác nhận hoàn thành/);
  assert.match(detailSource, /Yêu cầu bổ sung/);
  assert.match(detailSource, /Miễn nộp/);
  assert.match(detailSource, /role="dialog"/);
  assert.match(detailSource, /reviewReason\.trim\(\)/);
  assert.match(detailSource, /Xác nhận gửi/);
  assert.match(detailSource, /selectedFiles\.every\(\(\{ status \}\) => status === 'uploaded'\)/);
  assert.match(detailSource, /removeStagedReportFile/);
  assert.match(detailSource, /refreshAssignment/);
  assert.match(detailSource, /Nội dung cần bổ sung/);
  assert.match(detailSource, /UPLOADS_EXIST/);
  assert.doesNotMatch(detailSource, /assignment\.status\s*=(?!=)/);
  assert.doesNotMatch(detailSource, /\b\d+%/);
});
