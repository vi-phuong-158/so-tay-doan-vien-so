import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENTS_BUCKET,
  DocumentServiceError,
  createDocumentService,
  deriveEffectStatus,
  mapDocumentRow,
  mapRelationRow,
  normalizeDocumentError
} from '../src/services/documentService.js';

const ids = {
  document: '11111111-1111-4111-8111-111111111111',
  related: '22222222-2222-4222-8222-222222222222'
};

function documentRow(overrides = {}) {
  return {
    id: ids.document,
    document_number: '12-HD/ĐTN',
    title: 'Hướng dẫn sinh hoạt Chi đoàn',
    document_type: 'Hướng dẫn',
    issuing_authority: 'Ban Thanh niên',
    issued_date: '2026-07-25',
    effective_date: '2026-08-01',
    expiry_date: null,
    effect_status: null,
    scope: 'Toàn tỉnh',
    summary: 'Tóm tắt',
    keywords: ['đoàn', 'sinh hoạt'],
    storage_path: `${ids.document}/source/guide.pdf`,
    source_url: null,
    status: 'PUBLISHED',
    visibility_level: 'INTERNAL_YOUTH',
    ...overrides
  };
}

/** Records every PostgREST builder call so tests can assert the query actually sent. */
function createClient({ response = { data: [], error: null, count: 0 }, signedUrlResponse } = {}) {
  const calls = [];
  const query = {
    select(value, options) { calls.push(['select', value, options]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(from, to) { calls.push(['range', from, to]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    or(value) { calls.push(['or', value]); return this; },
    gte(column, value) { calls.push(['gte', column, value]); return this; },
    lte(column, value) { calls.push(['lte', column, value]); return this; },
    lt(column, value) { calls.push(['lt', column, value]); return this; },
    limit(value) { calls.push(['limit', value]); return this; },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
  const client = {
    from(table) { calls.push(['from', table]); return query; },
    storage: {
      from(bucket) {
        calls.push(['storage.from', bucket]);
        return {
          createSignedUrl(path, expiresIn) {
            calls.push(['createSignedUrl', path, expiresIn]);
            return Promise.resolve(
              signedUrlResponse || { data: { signedUrl: 'https://signed.example/doc' }, error: null }
            );
          }
        };
      }
    }
  };
  return { client, calls };
}

test('mapDocumentRow exposes a display shape and never precomputes a download URL', () => {
  const mapped = mapDocumentRow(documentRow());

  assert.equal(mapped.id, ids.document);
  assert.equal(mapped.documentNumber, '12-HD/ĐTN');
  assert.equal(mapped.issuingAuthority, 'Ban Thanh niên');
  assert.deepEqual(mapped.keywords, ['đoàn', 'sinh hoạt']);
  assert.equal(mapped.hasSourceFile, true);
  // The mapper must not invent a URL: signing is an explicit, authorized, on-demand action.
  assert.equal('downloadUrl' in mapped, false);
  assert.equal('signedUrl' in mapped, false);
});

test('effect status prefers the server value and otherwise derives from the expiry date', () => {
  assert.equal(deriveEffectStatus({ effect_status: 'Đang áp dụng' }), 'Đang áp dụng');
  assert.equal(deriveEffectStatus({ expiry_date: '2020-01-01' }), 'Hết hiệu lực');
  assert.equal(deriveEffectStatus({ expiry_date: null }), 'Còn hiệu lực');
});

test('keywords always normalize to an array so the UI cannot crash on a null column', () => {
  assert.deepEqual(mapDocumentRow(documentRow({ keywords: null })).keywords, []);
  assert.equal(mapDocumentRow(documentRow({ storage_path: null })).hasSourceFile, false);
});

test('listDocuments requests a bounded, deterministically ordered page', async () => {
  const { client, calls } = createClient({
    response: { data: [documentRow()], error: null, count: 1 }
  });
  const service = createDocumentService(client);

  const result = await service.listDocuments({ page: 2, pageSize: 20 });

  assert.deepEqual(calls[0], ['from', 'documents']);
  assert.deepEqual(calls.find(([name]) => name === 'range'), ['range', 40, 59]);
  // Ordering must include a unique tiebreaker; issued_date alone is not unique.
  const orders = calls.filter(([name]) => name === 'order').map(([, column]) => column);
  assert.deepEqual(orders, ['issued_date', 'id']);
  assert.equal(result.items.length, 1);
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
});

test('listDocuments rejects out-of-range paging and unknown filters before querying', async () => {
  const { client, calls } = createClient();
  const service = createDocumentService(client);

  await assert.rejects(() => service.listDocuments({ page: -1 }), (error) => {
    assert.ok(error instanceof DocumentServiceError);
    assert.equal(error.code, 'INVALID_PAGE');
    return true;
  });
  await assert.rejects(() => service.listDocuments({ pageSize: 5000 }), (error) => {
    assert.equal(error.code, 'INVALID_PAGE_SIZE');
    return true;
  });
  await assert.rejects(() => service.listDocuments({ effect: 'ANYTHING' }), (error) => {
    assert.equal(error.code, 'INVALID_FILTER');
    return true;
  });
  await assert.rejects(() => service.listDocuments({ year: '12' }), (error) => {
    assert.equal(error.code, 'INVALID_FILTER');
    return true;
  });
  assert.equal(calls.length, 0, 'no request is issued for invalid input');
});

test('list filters map onto server-side predicates and neutralize PostgREST delimiters', async () => {
  const { client, calls } = createClient({ response: { data: [], error: null, count: 0 } });
  const service = createDocumentService(client);

  await service.listDocuments({
    search: 'kế hoạch(2026),*',
    documentType: 'Hướng dẫn',
    issuingAuthority: 'Ban Thanh niên',
    year: '2026'
  });

  const or = calls.find(([name]) => name === 'or');
  assert.ok(or, 'search is pushed to the server, not applied in the browser');
  assert.equal(/[(),*]/.test(or[1].replace(/^title\.ilike\.%|%,document_number\.ilike\.%|%$/g, '')), false);
  assert.deepEqual(calls.find(([name, column]) => name === 'eq' && column === 'document_type'),
    ['eq', 'document_type', 'Hướng dẫn']);
  assert.deepEqual(calls.find(([name, column]) => name === 'gte' && column === 'issued_date'),
    ['gte', 'issued_date', '2026-01-01']);
});

test('getDocument validates the id and treats forbidden and missing identically', async () => {
  const service = createDocumentService(createClient().client);
  await assert.rejects(() => service.getDocument('not-a-uuid'), (error) => {
    assert.equal(error.code, 'INVALID_ID');
    return true;
  });

  // RLS hides a document the caller may not read, so the row set comes back empty. The service
  // must not distinguish that from a genuinely missing id.
  const empty = createDocumentService(createClient({ response: { data: [], error: null } }).client);
  await assert.rejects(() => empty.getDocument(ids.document), (error) => {
    assert.equal(error.code, 'DOCUMENT_NOT_FOUND');
    return true;
  });
});

test('relations map through the joined target and drop rows RLS hid', () => {
  assert.equal(mapRelationRow({ relation_type: 'REPLACES', documents: null }), null);
  const mapped = mapRelationRow({ relation_type: 'REPLACES', documents: documentRow({ id: ids.related }) });
  assert.equal(mapped.relationType, 'REPLACES');
  assert.equal(mapped.document.id, ids.related);
});

test('download URLs are short-lived, bucket-scoped, and reject unsafe paths', async () => {
  const { client, calls } = createClient();
  const service = createDocumentService(client);

  const url = await service.getDocumentDownloadUrl(`${ids.document}/source/guide.pdf`);
  assert.equal(url, 'https://signed.example/doc');
  assert.deepEqual(calls.find(([name]) => name === 'storage.from'), ['storage.from', DOCUMENTS_BUCKET]);
  assert.deepEqual(calls.find(([name]) => name === 'createSignedUrl'),
    ['createSignedUrl', `${ids.document}/source/guide.pdf`, 60]);

  for (const badPath of [
    '',
    `${ids.document}/source/../../secret.pdf`,
    'other-bucket/source/guide.pdf',
    `${ids.document}/staging/guide.pdf`
  ]) {
    await assert.rejects(() => service.getDocumentDownloadUrl(badPath), (error) => {
      assert.equal(error.code, 'INVALID_STORAGE_PATH');
      return true;
    });
  }

  await assert.rejects(
    () => service.getDocumentDownloadUrl(`${ids.document}/source/guide.pdf`, { expiresIn: 99999 }),
    (error) => {
      assert.equal(error.code, 'INVALID_EXPIRY');
      return true;
    }
  );
});

test('server business codes survive normalization and unknown errors stay generic', () => {
  assert.equal(normalizeDocumentError({ message: 'DOCUMENT_SCOPE_DENIED' }).code, 'DOCUMENT_SCOPE_DENIED');
  assert.equal(normalizeDocumentError({ message: 'FILE_TYPE_NOT_ALLOWED' }).code, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(normalizeDocumentError({ status: 401 }).code, 'AUTHENTICATION_REQUIRED');

  // Raw database detail must never be promoted into a business code the UI would trust.
  const unknown = normalizeDocumentError({ message: 'permission denied for relation documents' });
  assert.equal(unknown.code, 'REQUEST_FAILED');
});
