import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildCampaignTemplateUploadPath, createReportAdminService } from '../src/services/reportAdminService.js';
import { DEFAULT_CAMPAIGN_FORM, formatCampaignConfirmation, toggleOrganizationSelection, validateCampaignForm } from '../src/lib/reportAdmin.mjs';

const ids = {
  campaign: '11111111-1111-4111-8111-111111111111',
  object: '22222222-2222-4222-8222-222222222222',
  organization: '33333333-3333-4333-8333-333333333333'
};

function query(response, calls) {
  return {
    select(value) { calls.push(['select', value]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
}

function createClient({ rpcData = {}, tableData = [] } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) { calls.push(['from', table]); return query({ data: tableData, error: null }, calls); },
      rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({ data: rpcData[name] || null, error: null }); },
      storage: { from(bucket) { calls.push(['storage.from', bucket]); return {
        upload(path, file, options) { calls.push(['upload', path, file, options]); return Promise.resolve({ data: { path }, error: null }); },
        remove(paths) { calls.push(['remove', paths]); return Promise.resolve({ data: paths, error: null }); }
      }; } },
      functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: { template: { id: 'template-1' } }, error: null }); } }
    }
  };
}

test('campaign form validation blocks invalid input before any server request', () => {
  const errors = validateCampaignForm(DEFAULT_CAMPAIGN_FORM);
  assert.equal(errors.title, 'Nhập tên đợt báo cáo.');
  assert.equal(errors.dates, 'Chọn ngày mở và hạn nộp.');

  const valid = validateCampaignForm({
    ...DEFAULT_CAMPAIGN_FORM,
    title: 'Báo cáo tháng 8', openAt: '2026-08-01T08:00', dueAt: '2026-08-10T17:00'
  });
  assert.deepEqual(valid, {});
});

test('organization selection supports select and deselect without duplicate IDs', () => {
  assert.deepEqual(toggleOrganizationSelection([], ids.organization), [ids.organization]);
  assert.deepEqual(toggleOrganizationSelection([ids.organization], ids.organization), []);
});

test('admin service uses scoped RPCs for campaign reads, draft creation and atomic publish', async () => {
  const { client, calls } = createClient({
    rpcData: {
      get_admin_report_campaigns: [],
      create_report_campaign: { id: ids.campaign, ...DEFAULT_CAMPAIGN_FORM, title: 'Báo cáo tháng 8', open_at: '2026-08-01T01:00:00Z', due_at: '2026-08-10T10:00:00Z', allowed_extensions: ['pdf'], max_file_size_mb: 20, max_files: 5, status: 'DRAFT' },
      publish_report_campaign: [{ campaign_id: ids.campaign, resulting_status: 'PUBLISHED', assignment_count: 3 }]
    }
  });
  const service = createReportAdminService(client);
  const payload = { ...DEFAULT_CAMPAIGN_FORM, title: 'Báo cáo tháng 8', openAt: '2026-08-01T08:00', dueAt: '2026-08-10T17:00' };

  await service.getAdminCampaigns();
  await service.createCampaign(payload);
  const published = await service.publishCampaign(ids.campaign, [ids.organization, ids.organization]);

  assert.equal(calls[0][1], 'get_admin_report_campaigns');
  assert.equal(calls[1][1], 'create_report_campaign');
  assert.equal(calls[1][2].p_title, 'Báo cáo tháng 8');
  assert.equal(calls[2][1], 'publish_report_campaign');
  assert.deepEqual(calls[2][2], { p_campaign_id: ids.campaign, p_organization_ids: [ids.organization, ids.organization] });
  assert.equal(published.assignment_count, 3);
});

test('template upload uses a private staging path then finalizes through an Edge Function', async () => {
  const { client, calls } = createClient();
  const service = createReportAdminService(client, { createObjectId: () => ids.object });
  const result = await service.uploadCampaignTemplate({ campaignId: ids.campaign, file: { name: 'Mẫu báo cáo.docx' } });
  const path = `${ids.campaign}/staging/${ids.object}-Mau-bao-cao.docx`;

  assert.equal(buildCampaignTemplateUploadPath({ campaignId: ids.campaign, objectId: ids.object, fileName: 'Mẫu báo cáo.docx' }), path);
  assert.deepEqual(calls.slice(0, 3), [
    ['storage.from', 'report-templates-private'],
    ['upload', path, { name: 'Mẫu báo cáo.docx' }, { upsert: false }],
    ['invoke', 'finalize-campaign-template', { body: { campaign_id: ids.campaign, storage_path: path, original_name: 'Mẫu báo cáo.docx' } }]
  ]);
  assert.equal(result.id, 'template-1');
});

test('publish confirmation contains the required non-ambiguous summary', () => {
  const summary = formatCampaignConfirmation({ ...DEFAULT_CAMPAIGN_FORM, title: 'Đợt báo cáo', dueAt: '2026-08-10T17:00', allowLateSubmission: true }, 3, 2);
  assert.deepEqual(summary, { title: 'Đợt báo cáo', dueAt: '2026-08-10T17:00', organizationCount: 3, allowLateSubmission: true, allowResubmission: true, templateCount: 2 });
});

test('admin reports UI has loading, recovery, confirmation and double-submit guards', () => {
  const source = fs.readFileSync(new URL('../src/pages/AdminReports.jsx', import.meta.url), 'utf8');
  assert.match(source, /getAdminCampaigns/);
  assert.match(source, /getAssignableOrganizations/);
  assert.match(source, /Không tải được dữ liệu/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /if \(!campaign \|\| publishing\) return/);
  assert.match(source, /Lưu thay đổi bản nháp trước khi phát hành/);
  assert.match(source, /Xác nhận phát hành/);
});
