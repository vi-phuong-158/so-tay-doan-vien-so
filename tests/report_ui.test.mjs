import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  formatFileSize,
  getEffectiveDueAt,
  REPORT_STATUS_GROUPS,
  sortAssignments
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

test('Work production path uses reportService, real tabs, loading/error/empty states, and accessible assignment links', () => {
  assert.doesNotMatch(workSource, /data\/mock|campaigns/);
  assert.match(workSource, /getMyAssignments/);
  assert.match(workSource, /Skeleton/);
  assert.match(workSource, /EmptyState/);
  assert.match(workSource, /Thử lại/);
  assert.match(workSource, /to=\{`\/cong-viec\/bao-cao\/\$\{assignment\.id\}`\}/);
  assert.doesNotMatch(workSource, /Còn 4 ngày|submitted\/total|Giao diện hiển thị dữ liệu minh họa/);
});

test('detail production path reads assignment/templates and signs template downloads on demand', () => {
  assert.match(detailSource, /getAssignment/);
  assert.match(detailSource, /getCampaignTemplates/);
  assert.match(detailSource, /getSignedFileUrl/);
  assert.match(detailSource, /REPORT_TEMPLATES_BUCKET/);
  assert.doesNotMatch(detailSource, /uploadReportFile|submitReport|getSubmissionHistory/);
});
