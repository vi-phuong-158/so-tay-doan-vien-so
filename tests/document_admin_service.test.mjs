import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DocumentAdminError,
  MAX_SOURCE_FILE_BYTES,
  buildSourceStoragePath,
  createDocumentAdminService,
  mapAdminDocumentRow,
  normalizeDocumentAdminError,
  normalizeSourceFileName,
  validateDocumentForm,
  validateSourceFile
} from '../src/services/documentAdminService.js';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const OBJECT_ID = '22222222-2222-4222-8222-222222222222';

function adminRow(overrides = {}) {
  return {
    id: DOC_ID,
    document_number: '12-HD',
    title: 'Văn bản kiểm thử',
    document_type: 'Hướng dẫn',
    issuing_authority: 'Ban Thanh niên',
    issued_date: '2026-07-25',
    effective_date: null,
    expiry_date: null,
    effect_status: null,
    scope: null,
    summary: null,
    keywords: ['a'],
    storage_path: null,
    source_url: null,
    status: 'DRAFT',
    visibility_level: 'INTERNAL_YOUTH',
    owner_organization_id: '33333333-3333-4333-8333-333333333333',
    updated_at: '2026-08-16T00:00:00Z',
    total_count: 1,
    ...overrides
  };
}

/** Records rpc/storage calls so tests can assert the trusted boundary was used. */
function createClient({ rpcResponses = {}, uploadResponse, rpcErrors = {} } = {}) {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (rpcErrors[name]) return Promise.resolve({ data: null, error: rpcErrors[name] });
      return Promise.resolve({ data: rpcResponses[name] ?? true, error: null });
    },
    storage: {
      from(bucket) {
        calls.push(['storage.from', bucket]);
        return {
          upload(path, file, options) {
            calls.push(['upload', path, file?.name, options]);
            return Promise.resolve(uploadResponse ?? { data: { path }, error: null });
          },
          remove(paths) {
            calls.push(['remove', paths]);
            return Promise.resolve({ data: paths, error: null });
          },
          createSignedUrl(path, expiresIn) {
            calls.push(['createSignedUrl', path, expiresIn]);
            return Promise.resolve({ data: { signedUrl: 'https://signed.example/admin' }, error: null });
          }
        };
      }
    }
  };
  return { client, calls };
}

const okFile = { name: 'p4-02-storage-rehearsal.pdf', size: 1024 };

test('admin list maps rows and reports the server-side total, not the page length', async () => {
  const { client, calls } = createClient({
    rpcResponses: { get_admin_documents: [adminRow({ total_count: 42 })] }
  });
  const service = createDocumentAdminService(client);

  const result = await service.listDocuments({ page: 1, pageSize: 20 });

  assert.deepEqual(calls[0][0], 'rpc');
  assert.equal(calls[0][1], 'get_admin_documents');
  assert.equal(calls[0][2].p_limit, 20);
  assert.equal(calls[0][2].p_offset, 20);
  assert.equal(result.total, 42);
  assert.equal(result.items[0].title, 'Văn bản kiểm thử');
  assert.equal(result.hasMore, true);
});

test('admin list rejects invalid paging and filters before any request', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  await assert.rejects(() => service.listDocuments({ page: -1 }), (e) => e.code === 'INVALID_PAGE');
  await assert.rejects(() => service.listDocuments({ pageSize: 999 }), (e) => e.code === 'INVALID_PAGE_SIZE');
  await assert.rejects(() => service.listDocuments({ status: 'NOPE' }), (e) => e.code === 'INVALID_DOCUMENT_STATUS');
  await assert.rejects(() => service.listDocuments({ visibilityLevel: 'NOPE' }), (e) => e.code === 'INVALID_VISIBILITY_LEVEL');
  await assert.rejects(() => service.listDocuments({ year: '12' }), (e) => e.code === 'INVALID_DOCUMENT_YEAR');
  assert.equal(calls.length, 0, 'no request is issued for invalid input');
});

test('admin list surfaces a server error rather than pretending the list is empty', async () => {
  const { client } = createClient({ rpcErrors: { get_admin_documents: { message: 'ACCOUNT_NOT_ACTIVE' } } });
  const service = createDocumentAdminService(client);
  await assert.rejects(() => service.listDocuments(), (e) => e.code === 'ACCOUNT_NOT_ACTIVE');
});

test('create draft goes through the trusted RPC and never writes the table directly', async () => {
  const { client, calls } = createClient({ rpcResponses: { create_document_draft: DOC_ID } });
  const service = createDocumentAdminService(client);

  const id = await service.createDraft({ title: '  Văn bản mới  ', keywords: 'a, b , ,c' });

  assert.equal(id, DOC_ID);
  const call = calls.find(([kind, name]) => kind === 'rpc' && name === 'create_document_draft');
  assert.ok(call, 'create goes through create_document_draft');
  assert.equal(call[2].p_title, 'Văn bản mới');
  assert.deepEqual(call[2].p_keywords, ['a', 'b', 'c']);
  // Status is never client-supplied: the RPC always starts a document in DRAFT.
  assert.equal('p_status' in call[2], false);
});

test('form validation blocks the request and reports per-field errors', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  assert.deepEqual(validateDocumentForm({ title: '' }).title !== undefined, true);
  assert.deepEqual(validateDocumentForm({ title: 'ok', visibilityLevel: 'NOPE' }).visibilityLevel !== undefined, true);
  assert.deepEqual(
    validateDocumentForm({ title: 'ok', effectiveDate: '2026-05-01', expiryDate: '2026-01-01' }).expiryDate !== undefined,
    true
  );
  assert.deepEqual(validateDocumentForm({ title: 'ok', sourceUrl: 'javascript:alert(1)' }).sourceUrl !== undefined, true);
  assert.deepEqual(validateDocumentForm({ title: 'ok', sourceUrl: 'https://example.test/a' }), {});

  await assert.rejects(() => service.createDraft({ title: '' }), (e) => e.code === 'VALIDATION_FAILED');
  assert.equal(calls.length, 0, 'invalid form never reaches the server');
});

test('metadata update targets the trusted RPC and validates the id', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  await assert.rejects(() => service.updateMetadata('not-a-uuid', { title: 'x' }), (e) => e.code === 'INVALID_ID');
  await service.updateMetadata(DOC_ID, { title: 'Đã sửa' });

  const call = calls.find(([kind, name]) => kind === 'rpc' && name === 'update_document_metadata');
  assert.ok(call);
  assert.equal(call[2].p_document_id, DOC_ID);
  assert.equal(call[2].p_title, 'Đã sửa');
});

test('source file pre-flight mirrors the server contract and ignores browser MIME', () => {
  assert.equal(validateSourceFile(null), 'FILE_REQUIRED');
  assert.equal(validateSourceFile({ name: 'payload.exe', size: 10 }), 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(validateSourceFile({ name: 'noext', size: 10 }), 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(validateSourceFile({ name: 'big.pdf', size: MAX_SOURCE_FILE_BYTES + 1 }), 'FILE_TOO_LARGE');
  assert.equal(validateSourceFile({ name: 'empty.pdf', size: 0 }), 'FILE_TOO_LARGE');
  assert.equal(validateSourceFile(okFile), null);
  // A file whose declared type lies is still judged on its extension, which is what the DB checks.
  assert.equal(validateSourceFile({ name: 'a.pdf', size: 10, type: 'application/x-msdownload' }), null);
});

test('storage path is anchored to the document and sanitized against traversal', () => {
  const path = buildSourceStoragePath({ documentId: DOC_ID, objectId: OBJECT_ID, fileName: '../../etc/pa ss wd.pdf' });
  assert.equal(path.startsWith(`${DOC_ID}/source/${OBJECT_ID}-`), true);
  assert.equal(path.includes('..'), false);
  assert.equal(path.includes('/etc/'), false);

  assert.equal(normalizeSourceFileName('  ../weird name!.pdf '), 'weird-name-.pdf');
  assert.equal(normalizeSourceFileName(''), 'tai-lieu');
  assert.throws(() => buildSourceStoragePath({ documentId: 'x', objectId: OBJECT_ID, fileName: 'a.pdf' }),
    (e) => e instanceof DocumentAdminError && e.code === 'INVALID_ID');
});

test('upload writes a fresh object then attaches it through the trusted RPC', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client, { createObjectId: () => OBJECT_ID });

  const path = await service.uploadSourceFile(DOC_ID, okFile);

  const upload = calls.find(([kind]) => kind === 'upload');
  const attach = calls.find(([kind, name]) => kind === 'rpc' && name === 'attach_document_source_file');
  assert.ok(upload, 'object is uploaded');
  assert.equal(upload[3].upsert, false, 'never overwrites an existing object');
  assert.ok(attach, 'attach goes through the trusted RPC');
  assert.equal(attach[2].p_storage_path, path);
  assert.equal(attach[2].p_file_size_bytes, 1024);
  assert.equal(calls.some(([kind]) => kind === 'remove'), false, 'nothing is deleted on the happy path');
});

test('a failed attach removes only the just-uploaded orphan and rethrows the real error', async () => {
  const { client, calls } = createClient({
    rpcErrors: { attach_document_source_file: { message: 'DOCUMENT_SCOPE_DENIED' } }
  });
  const service = createDocumentAdminService(client, { createObjectId: () => OBJECT_ID });

  await assert.rejects(() => service.uploadSourceFile(DOC_ID, okFile), (error) => {
    assert.equal(error.code, 'DOCUMENT_SCOPE_DENIED', 'the attach failure is surfaced, not the cleanup');
    return true;
  });

  const removed = calls.find(([kind]) => kind === 'remove');
  assert.ok(removed, 'the orphaned object is cleaned up');
  assert.deepEqual(removed[1], [`${DOC_ID}/source/${OBJECT_ID}-p4-02-storage-rehearsal.pdf`]);
  assert.equal(removed[1].length, 1, 'compensation touches exactly the object it just created');
});

test('upload rejects a bad file before touching storage', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  await assert.rejects(() => service.uploadSourceFile(DOC_ID, { name: 'x.exe', size: 5 }),
    (e) => e.code === 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(calls.length, 0, 'no upload is attempted for a forbidden extension');
});

test('publish and withdraw use trusted transitions and validate the id', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  await assert.rejects(() => service.publish('nope'), (e) => e.code === 'INVALID_ID');
  await service.publish(DOC_ID);
  await service.withdraw(DOC_ID, 'lý do');

  assert.ok(calls.find(([k, n]) => k === 'rpc' && n === 'publish_document'));
  const withdraw = calls.find(([k, n]) => k === 'rpc' && n === 'withdraw_document');
  assert.equal(withdraw[2].p_reason, 'lý do');
  // The client never sends a target status; the RPC decides and validates the transition.
  const publish = calls.find(([k, n]) => k === 'rpc' && n === 'publish_document');
  assert.deepEqual(Object.keys(publish[2]), ['p_document_id']);
});

test('publish surfaces a rejected transition instead of reporting success', async () => {
  const { client } = createClient({
    rpcErrors: { publish_document: { message: 'INVALID_DOCUMENT_TRANSITION' } }
  });
  const service = createDocumentAdminService(client);
  await assert.rejects(() => service.publish(DOC_ID), (e) => e.code === 'INVALID_DOCUMENT_TRANSITION');
});

test('detach clears the row pointer first, then removes the returned object', async () => {
  const livePath = `${DOC_ID}/source/live.pdf`;
  const { client, calls } = createClient({ rpcResponses: { detach_document_source_file: livePath } });
  const service = createDocumentAdminService(client);

  await service.detachSourceFile(DOC_ID);

  const rpcIndex = calls.findIndex(([k, n]) => k === 'rpc' && n === 'detach_document_source_file');
  const removeIndex = calls.findIndex(([k]) => k === 'remove');
  assert.ok(rpcIndex > -1 && removeIndex > -1);
  assert.ok(rpcIndex < removeIndex, 'the database pointer is cleared before the bytes are deleted');
  assert.deepEqual(calls[removeIndex][1], [livePath]);
});

test('admin signed preview URLs are bounded and never prefetched by mappers', async () => {
  const { client, calls } = createClient();
  const service = createDocumentAdminService(client);

  await service.getSourcePreviewUrl(`${DOC_ID}/source/a.pdf`);
  assert.deepEqual(calls.find(([k]) => k === 'createSignedUrl'), ['createSignedUrl', `${DOC_ID}/source/a.pdf`, 60]);

  await assert.rejects(() => service.getSourcePreviewUrl('../secret.pdf'), (e) => e.code === 'INVALID_STORAGE_PATH');
  await assert.rejects(() => service.getSourcePreviewUrl(`${DOC_ID}/source/a.pdf`, { expiresIn: 99999 }),
    (e) => e.code === 'INVALID_EXPIRY');

  const mapped = mapAdminDocumentRow(adminRow({ storage_path: `${DOC_ID}/source/a.pdf` }));
  assert.equal(mapped.hasSourceFile, true);
  assert.equal('signedUrl' in mapped, false, 'the mapper never carries a signed URL');
});

test('business codes survive normalization and raw database detail never leaks', () => {
  assert.equal(normalizeDocumentAdminError({ message: 'DOCUMENT_SCOPE_DENIED' }).code, 'DOCUMENT_SCOPE_DENIED');
  assert.equal(
    normalizeDocumentAdminError({ message: 'permission denied for function publish_document' }).code,
    'REQUEST_FAILED'
  );
  assert.equal(normalizeDocumentAdminError({ status: 403 }).code, 'AUTHENTICATION_REQUIRED');
});
