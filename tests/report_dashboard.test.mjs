import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createReportAdminService } from '../src/services/reportAdminService.js';
import { DASHBOARD_FILTERS, formatCompletion, mapDashboardError } from '../src/lib/reportDashboard.mjs';

const campaignId = '55555555-5555-4555-8555-555555555555';

test('dashboard service uses only scoped dashboard RPCs and maps server aggregates', async () => {
  const calls = [];
  const client = {
    rpc(name, payload) {
      calls.push({ name, payload });
      if (name === 'get_report_dashboard') return Promise.resolve({ data: [{ campaign_id: campaignId, title: 'Đợt thử', status: 'PUBLISHED', total_assignments: 5, completed_count: 2, completion_rate: 40 }], error: null });
      return Promise.resolve({ data: [{ assignment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organization_id: '22222222-2222-2222-2222-222222222222', organization_code: 'CĐA', organization_name: 'Chi đoàn A', status: 'PENDING', attention_rank: 4 }], error: null });
    }
  };
  const service = createReportAdminService(client);
  const dashboard = await service.getReportDashboard(campaignId);
  const assignments = await service.getDashboardAssignments(campaignId, { status: 'ALL', search: 'Chi đoàn' });
  assert.equal(dashboard.completedCount, 2);
  assert.equal(dashboard.completionRate, 40);
  assert.equal(assignments[0].organization.code, 'CĐA');
  assert.deepEqual(calls, [
    { name: 'get_report_dashboard', payload: { p_campaign_id: campaignId } },
    { name: 'get_report_dashboard_assignments', payload: { p_campaign_id: campaignId, p_status: null, p_search: 'Chi đoàn' } }
  ]);
});

test('completion presentation is derived from server values without inventing counts', () => {
  assert.deepEqual(formatCompletion({ completedCount: 2, totalAssignments: 7, completionRate: 28.57 }), { completed: 2, total: 7, rate: '28.57' });
  assert.deepEqual(formatCompletion(null), { completed: 0, total: 0, rate: '0' });
});

test('dashboard filters cover workflow states and errors do not retain stale data', () => {
  assert.deepEqual(DASHBOARD_FILTERS.map(([value]) => value), ['ALL', 'PENDING', 'SUBMITTED', 'NEEDS_SUPPLEMENT', 'RESUBMITTED', 'COMPLETED', 'OVERDUE', 'LATE_SUBMITTED', 'EXEMPTED']);
  assert.match(mapDashboardError({ code: 'REPORT_DASHBOARD_NOT_FOUND_OR_FORBIDDEN' }), /Không tìm thấy/);
});

test('export and bundle actions preserve the dashboard scope and active filters', async () => {
  const calls = [];
  const client = {
    functions: {
      invoke(name, options) {
        calls.push({ name, options });
        return Promise.resolve({ data: new Blob(['ok']), error: null });
      }
    }
  };
  const service = createReportAdminService(client);
  await service.exportReportStatus(campaignId, { status: 'OVERDUE', search: 'A' });
  await service.downloadReportBundle(campaignId, { status: 'OVERDUE', search: 'A' });
  assert.deepEqual(calls.map(call => ({ name: call.name, body: call.options.body })), [
    { name: 'export-report-status', body: { campaign_id: campaignId, status: 'OVERDUE', search: 'A' } },
    { name: 'download-report-bundle', body: { campaign_id: campaignId, status: 'OVERDUE', search: 'A' } }
  ]);
});

test('dashboard UI has loading, retry, filters, deterministic server list and existing assignment route', async () => {
  const source = await readFile(new URL('../src/pages/AdminReportDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /getReportDashboard\(campaignId\)/);
  assert.match(source, /getDashboardAssignments\(campaignId, \{ status, search \}\)/);
  assert.match(source, /setAssignments\(\[\]\)/);
  assert.match(source, /action="Thử lại"/);
  assert.match(source, /DASHBOARD_FILTERS\.map/);
  assert.match(source, /\/cong-viec\/bao-cao\/\$\{item\.id\}/);
  assert.match(source, /Xuất CSV/);
  assert.match(source, /Tải gói báo cáo/);
  assert.match(source, /disabled=\{Boolean\(downloadState\)\}/);
});

test('campaign management exposes the dashboard without replacing the existing edit route', async () => {
  const [app, admin] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminReports.jsx', import.meta.url), 'utf8')
  ]);
  assert.match(app, /admin\/bao-cao\/:campaignId\/dashboard/);
  assert.match(admin, /\/dashboard/);
  assert.match(admin, /Cấu hình/);
});
