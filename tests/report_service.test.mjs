import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORT_SUBMISSIONS_BUCKET,
  REPORT_TEMPLATES_BUCKET,
  ReportServiceError,
  buildReportUploadPath,
  createReportService
} from '../src/services/reportService.js';

const ids = {
  campaign: '11111111-1111-4111-8111-111111111111',
  organization: '22222222-2222-4222-8222-222222222222',
  assignment: '33333333-3333-4333-8333-333333333333',
  submission: '44444444-4444-4444-8444-444444444444',
  file: '55555555-5555-4555-8555-555555555555',
  object: '66666666-6666-4666-8666-666666666666'
};

function queryResponse(response, calls) {
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
  return query;
}

function createClient({ responses = [], invokeResponse, uploadResponse, signedUrlResponse } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return queryResponse(responses.shift() || { data: [], error: null }, calls);
    },
    storage: {
      from(bucket) {
        calls.push(['storage.from', bucket]);
        return {
          upload(path, file, options) {
            calls.push(['upload', path, file, options]);
            return Promise.resolve(uploadResponse || { data: { path }, error: null });
          },
          remove(paths) {
            calls.push(['remove', paths]);
            return Promise.resolve({ data: paths, error: null });
          },
          createSignedUrl(path, expiresIn) {
            calls.push(['createSignedUrl', path, expiresIn]);
            return Promise.resolve(signedUrlResponse || { data: { signedUrl: 'https://signed.example/file' }, error: null });
          }
        };
      }
    },
    functions: {
      invoke(name, options) {
        calls.push(['invoke', name, options]);
        return Promise.resolve(invokeResponse || { data: { id: ids.submission }, error: null });
      }
    }
  };
  return { client, calls };
}

const assignmentRow = {
  id: ids.assignment,
  status: 'PENDING',
  organization_id: ids.organization,
  due_at_override: null,
  report_campaigns: {
    id: ids.campaign,
    title: 'Bao cao thang',
    description: 'Noi dung',
    issuer: 'Tinh doan',
    open_at: '2026-08-01T00:00:00Z',
    due_at: '2026-08-31T00:00:00Z',
    close_at: null,
    status: 'OPEN',
    allow_late_submission: false,
    allow_resubmission: true,
    allowed_extensions: ['pdf'],
    max_file_size_mb: 20,
    max_files: 3
  }
};

test('getMyAssignments uses RLS-scoped query and maps campaign data', async () => {
  const { client, calls } = createClient({ responses: [{ data: [assignmentRow], error: null }] });
  const service = createReportService(client);

  const assignments = await service.getMyAssignments();

  assert.equal(calls[0][1], 'report_assignments');
  assert.match(calls.find(([name]) => name === 'select')[1], /allow_resubmission/);
  assert.deepEqual(calls.find(([name]) => name === 'order'), ['order', 'assigned_at', { ascending: false }]);
  assert.equal(calls.some(([name, field]) => name === 'eq' && field === 'organization_id'), false);
  assert.equal(assignments[0].organizationId, ids.organization);
  assert.equal(assignments[0].campaign.maxFiles, 3);
});

test('getMyAssignments normalizes query errors', async () => {
  const { client } = createClient({ responses: [{ data: null, error: { message: 'network failed' } }] });

  await assert.rejects(
    createReportService(client).getMyAssignments(),
    (error) => error instanceof ReportServiceError && error.code === 'REQUEST_FAILED'
  );
});

test('getAssignment maps one RLS-visible assignment and rejects invalid IDs before querying', async () => {
  const { client, calls } = createClient({ responses: [{ data: assignmentRow, error: null }] });
  const service = createReportService(client);

  const assignment = await service.getAssignment(ids.assignment);
  assert.equal(assignment.campaign.title, 'Bao cao thang');
  assert.deepEqual(calls.find(([name]) => name === 'eq'), ['eq', 'id', ids.assignment]);

  await assert.rejects(
    service.getAssignment('not-a-uuid'),
    (error) => error.code === 'INVALID_ID'
  );
  assert.equal(calls.filter(([name]) => name === 'from').length, 1);
});

test('getSubmissionHistory filters by assignment, sorts newest version first, and maps files', async () => {
  const row = {
    id: ids.submission,
    assignment_id: ids.assignment,
    version_number: 2,
    submitted_at: '2026-08-02T00:00:00Z',
    submitted_by: ids.organization,
    summary: 'Tong hop',
    submit_note: 'Da nop',
    is_late: false,
    review_status: 'PENDING',
    reviewed_at: null,
    review_note: null,
    profiles: [{
      id: ids.organization,
      full_name: 'Cán bộ CĐA',
      organization_id: ids.organization
    }],
    report_submission_files: [{
      id: ids.file,
      original_name: 'Bao cao.pdf',
      safe_name: 'Bao-cao.pdf',
      mime_type: 'application/pdf',
      size_bytes: 100,
      storage_path: 'a/b/c/staging/file.pdf'
    }]
  };
  const { client, calls } = createClient({ responses: [{ data: [row], error: null }] });

  const history = await createReportService(client).getSubmissionHistory(ids.assignment);

  assert.deepEqual(calls.find(([name]) => name === 'eq'), ['eq', 'assignment_id', ids.assignment]);
  assert.deepEqual(calls.find(([name]) => name === 'order'), ['order', 'version_number', { ascending: false }]);
  assert.equal(history[0].versionNumber, 2);
  assert.equal(history[0].isLatest, true);
  assert.equal(history[0].submittedByProfile.fullName, 'Cán bộ CĐA');
  assert.equal(history[0].files[0].storagePath, 'a/b/c/staging/file.pdf');
});

test('getCampaignTemplates reads metadata only and does not create public URLs', async () => {
  const template = { id: ids.file, campaign_id: ids.campaign, storage_path: 'template.pdf', file_name: 'Mau.pdf' };
  const { client, calls } = createClient({ responses: [{ data: [template], error: null }] });

  const templates = await createReportService(client).getCampaignTemplates(ids.campaign);

  assert.equal(calls[0][1], 'report_campaign_templates');
  assert.deepEqual(calls.find(([name]) => name === 'eq'), ['eq', 'campaign_id', ids.campaign]);
  assert.deepEqual(templates, [template]);
  assert.equal(calls.some(([name]) => name === 'createSignedUrl'), false);
});

test('uploadReportFile uses a backend-compatible staging path without allocating a database version', async () => {
  const { client, calls } = createClient();
  const service = createReportService(client, { createObjectId: () => ids.object });

  const uploaded = await service.uploadReportFile({
    campaignId: ids.campaign,
    organizationId: ids.organization,
    assignmentId: ids.assignment,
    file: { name: 'Báo cáo tháng.pdf' }
  });

  const expectedPath = `${ids.campaign}/${ids.organization}/${ids.assignment}/staging/${ids.object}-Bao-cao-thang.pdf`;
  assert.equal(uploaded.storagePath, expectedPath);
  assert.equal(calls[0][1], REPORT_SUBMISSIONS_BUCKET);
  assert.deepEqual(calls.find(([name]) => name === 'upload').slice(1, 4), [expectedPath, { name: 'Báo cáo tháng.pdf' }, { upsert: false }]);
  assert.equal(buildReportUploadPath({ campaignId: ids.campaign, organizationId: ids.organization, assignmentId: ids.assignment, objectId: ids.object, fileName: 'x.pdf' }).split('/')[3], 'staging');
});

test('submitReport invokes only submit-report and sends no client-trusted file metadata', async () => {
  const { client, calls } = createClient();
  const result = await createReportService(client).submitReport({
    assignmentId: ids.assignment,
    summary: 'Tong hop',
    submitNote: 'Da kiem tra',
    files: [{
      storagePath: `${ids.campaign}/${ids.organization}/${ids.assignment}/staging/file.pdf`,
      originalName: 'Bao cao.pdf',
      checksum: 'abc',
      sizeBytes: 123,
      mimeType: 'application/pdf',
      safeName: 'file.pdf'
    }]
  });

  assert.deepEqual(result, { id: ids.submission });
  assert.deepEqual(calls, [[
    'invoke',
    'submit-report',
    {
      body: {
        assignment_id: ids.assignment,
        summary: 'Tong hop',
        submit_note: 'Da kiem tra',
        files: [{ storage_path: `${ids.campaign}/${ids.organization}/${ids.assignment}/staging/file.pdf`, original_name: 'Bao cao.pdf', checksum: 'abc' }]
      }
    }
  ]]);
});

test('submitReport preserves backend business errors and normalizes unauthenticated errors', async () => {
  const file = { storagePath: `${ids.campaign}/${ids.organization}/${ids.assignment}/staging/file.pdf`, originalName: 'Bao cao.pdf' };
  const closed = createClient({ invokeResponse: { data: null, error: { message: 'REPORT_CLOSED' } } });
  await assert.rejects(
    createReportService(closed.client).submitReport({ assignmentId: ids.assignment, files: [file] }),
    (error) => error.code === 'REPORT_CLOSED'
  );

  const unauthenticated = createClient({ invokeResponse: { data: null, error: { status: 401, message: 'missing session' } } });
  await assert.rejects(
    createReportService(unauthenticated.client).submitReport({ assignmentId: ids.assignment, files: [file] }),
    (error) => error.code === 'AUTHENTICATION_REQUIRED'
  );
});

test('reviewReport uses the review-report Edge Function and requires reasons where needed', async () => {
  const { client, calls } = createClient({ invokeResponse: { data: { success: true, status: 'NEEDS_SUPPLEMENT' }, error: null } });
  const result = await createReportService(client).reviewReport({
    assignmentId: ids.assignment,
    action: 'NEEDS_SUPPLEMENT',
    reason: 'Bổ sung số liệu'
  });

  assert.deepEqual(result, { success: true, status: 'NEEDS_SUPPLEMENT' });
  assert.deepEqual(calls.at(-1), [
    'invoke',
    'review-report',
    { body: { assignment_id: ids.assignment, action: 'NEEDS_SUPPLEMENT', reason: 'Bổ sung số liệu' } }
  ]);

  await assert.rejects(
    createReportService(client).reviewReport({ assignmentId: ids.assignment, action: 'EXEMPTED', reason: '  ' }),
    (error) => error.code === 'REASON_REQUIRED'
  );
});

test('removeStagedReportFile requests exact-path Storage deletion and rejects non-staging paths locally', async () => {
  const { client, calls } = createClient();
  const path = `${ids.campaign}/${ids.organization}/${ids.assignment}/staging/${ids.object}-Bao-cao.pdf`;
  const removed = await createReportService(client).removeStagedReportFile(path);

  assert.deepEqual(removed, { storagePath: path, removed: true });
  assert.deepEqual(calls, [
    ['storage.from', REPORT_SUBMISSIONS_BUCKET],
    ['remove', [path]]
  ]);
  await assert.rejects(
    createReportService(client).removeStagedReportFile(`${ids.campaign}/${ids.organization}/${ids.assignment}/v1/${ids.object}-Bao-cao.pdf`),
    (error) => error.code === 'INVALID_STORAGE_PATH'
  );
});

test('getSignedFileUrl uses the RLS-compatible Storage client for private buckets only', async () => {
  const { client, calls } = createClient();
  const signedUrl = await createReportService(client).getSignedFileUrl('templates/mau.pdf', {
    bucket: REPORT_TEMPLATES_BUCKET,
    expiresIn: 120
  });

  assert.equal(signedUrl, 'https://signed.example/file');
  assert.deepEqual(calls, [
    ['storage.from', REPORT_TEMPLATES_BUCKET],
    ['createSignedUrl', 'templates/mau.pdf', 120]
  ]);
});
