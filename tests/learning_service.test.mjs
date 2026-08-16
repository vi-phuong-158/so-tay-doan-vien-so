import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEARNING_RESOURCES_BUCKET,
  LearningServiceError,
  createLearningService,
  isSafeExternalUrl,
  mapResourceRow,
  mapTopicRow,
  normalizeLearningError,
  sortResources,
  topicAvailability
} from '../src/services/learningService.js';

const TOPIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function topicRow(overrides = {}) {
  return {
    id: TOPIC_ID,
    title: 'Chuyên đề kiểm thử',
    description: 'mô tả',
    objectives: 'mục tiêu',
    status: 'PUBLISHED',
    open_at: '2026-08-01T00:00:00Z',
    close_at: '2026-09-01T00:00:00Z',
    visibility_level: 'INTERNAL_YOUTH',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides
  };
}

function resourceRow(overrides = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    topic_id: TOPIC_ID,
    resource_type: 'TEXT',
    title: 'Bài đọc',
    content: 'nội dung',
    storage_path: null,
    external_url: null,
    sort_order: 1,
    ...overrides
  };
}

function createClient({ response = { data: [], error: null, count: 0 }, signedUrlResponse } = {}) {
  const calls = [];
  const query = {
    select(value, options) { calls.push(['select', value, options]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(from, to) { calls.push(['range', from, to]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    ilike(column, value) { calls.push(['ilike', column, value]); return this; },
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
              signedUrlResponse || { data: { signedUrl: 'https://signed.example/res' }, error: null }
            );
          }
        };
      }
    }
  };
  return { client, calls };
}

test('only https external URLs are ever treated as safe', () => {
  assert.equal(isSafeExternalUrl('https://example.test/a'), true);
  assert.equal(isSafeExternalUrl('http://example.test/a'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('JavaScript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
  assert.equal(isSafeExternalUrl('//example.test/a'), false);
  assert.equal(isSafeExternalUrl(''), false);
  assert.equal(isSafeExternalUrl(null), false);
  assert.equal(isSafeExternalUrl(`https://example.test/${'a'.repeat(2100)}`), false);
});

test('an unsafe stored URL is dropped by the mapper, not passed to the view', () => {
  const mapped = mapResourceRow(resourceRow({ resource_type: 'LINK', external_url: 'javascript:alert(1)' }));
  assert.equal(mapped.externalUrl, null, 'a hostile URL never reaches the component as an href');

  const safe = mapResourceRow(resourceRow({ resource_type: 'LINK', external_url: 'https://example.test/v' }));
  assert.equal(safe.externalUrl, 'https://example.test/v');
});

test('resource mapping tolerates malformed optional metadata without crashing', () => {
  const mapped = mapResourceRow(resourceRow({ sort_order: null, content: undefined, storage_path: null }));
  assert.equal(mapped.sortOrder, 0, 'a null sort_order degrades to 0 rather than NaN');
  assert.equal(mapped.content, null);
  assert.equal(mapped.hasFile, false);
  assert.equal(mapResourceRow(null), null);
  assert.equal(mapTopicRow(null), null);
});

test('resources sort deterministically by sort_order then id', () => {
  const sorted = sortResources([
    { id: 'b', sortOrder: 2 },
    { id: 'a', sortOrder: 2 },
    { id: 'c', sortOrder: 1 }
  ]);
  assert.deepEqual(sorted.map((r) => r.id), ['c', 'a', 'b']);
});

test('availability is derived from the topic window', () => {
  const topic = mapTopicRow(topicRow());
  assert.equal(topicAvailability(topic, new Date('2026-08-15T00:00:00Z')), 'OPEN');
  assert.equal(topicAvailability(topic, new Date('2026-07-01T00:00:00Z')), 'UPCOMING');
  assert.equal(topicAvailability(topic, new Date('2026-10-01T00:00:00Z')), 'CLOSED');
  assert.equal(topicAvailability(mapTopicRow(topicRow({ open_at: null, close_at: null }))), 'OPEN');
  // A malformed date must not throw or silently read as CLOSED.
  assert.equal(topicAvailability(mapTopicRow(topicRow({ open_at: 'not-a-date', close_at: null }))), 'OPEN');
});

test('topic list requests a bounded, deterministically ordered page', async () => {
  const { client, calls } = createClient({ response: { data: [topicRow()], error: null, count: 1 } });
  const service = createLearningService(client);

  const result = await service.listTopics({ page: 2, pageSize: 12 });

  assert.deepEqual(calls[0], ['from', 'learning_topics']);
  assert.deepEqual(calls.find(([n]) => n === 'range'), ['range', 24, 35]);
  const orders = calls.filter(([n]) => n === 'order').map(([, c]) => c);
  assert.deepEqual(orders, ['open_at', 'id'], 'ordering has a unique tiebreaker');
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
});

test('topic list rejects invalid paging before issuing a request', async () => {
  const { client, calls } = createClient();
  const service = createLearningService(client);

  await assert.rejects(() => service.listTopics({ page: -1 }), (e) => e.code === 'INVALID_PAGE');
  await assert.rejects(() => service.listTopics({ pageSize: 0 }), (e) => e.code === 'INVALID_PAGE_SIZE');
  await assert.rejects(() => service.listTopics({ pageSize: 500 }), (e) => e.code === 'INVALID_PAGE_SIZE');
  assert.equal(calls.length, 0);
});

test('search is pushed to the server with PostgREST delimiters neutralized', async () => {
  const { client, calls } = createClient();
  const service = createLearningService(client);

  await service.listTopics({ search: 'an toàn (2026),*' });

  const ilike = calls.find(([n]) => n === 'ilike');
  assert.ok(ilike, 'search is a server-side filter');
  assert.equal(/[(),*]/.test(ilike[2].replace(/^%|%$/g, '')), false);
});

test('getTopic validates the id and makes forbidden indistinguishable from missing', async () => {
  const service = createLearningService(createClient().client);
  await assert.rejects(() => service.getTopic('nope'), (e) => e.code === 'INVALID_ID');

  const empty = createLearningService(createClient({ response: { data: [], error: null } }).client);
  await assert.rejects(() => empty.getTopic(TOPIC_ID), (e) => e.code === 'TOPIC_NOT_FOUND');
});

test('resources are fetched per topic and returned in deterministic order', async () => {
  const { client, calls } = createClient({
    response: {
      data: [
        resourceRow({ id: 'r2', sort_order: 5 }),
        resourceRow({ id: 'r1', sort_order: 1 })
      ],
      error: null
    }
  });
  const service = createLearningService(client);

  const rows = await service.listResources(TOPIC_ID);

  assert.deepEqual(calls.find(([n, c]) => n === 'eq' && c === 'topic_id'), ['eq', 'topic_id', TOPIC_ID]);
  assert.deepEqual(rows.map((r) => r.id), ['r1', 'r2']);
  await assert.rejects(() => service.listResources('nope'), (e) => e.code === 'INVALID_ID');
});

test('resource download URLs are bucket-scoped, path-checked and time-bounded', async () => {
  const { client, calls } = createClient();
  const service = createLearningService(client);

  const url = await service.getResourceDownloadUrl(`${TOPIC_ID}/resources/a.pdf`);
  assert.equal(url, 'https://signed.example/res');
  assert.deepEqual(calls.find(([n]) => n === 'storage.from'), ['storage.from', LEARNING_RESOURCES_BUCKET]);
  assert.deepEqual(calls.find(([n]) => n === 'createSignedUrl'),
    ['createSignedUrl', `${TOPIC_ID}/resources/a.pdf`, 60]);

  for (const bad of [
    '',
    `${TOPIC_ID}/resources/../../secret.pdf`,
    `${TOPIC_ID}/source/a.pdf`,
    `not-a-uuid/resources/a.pdf`
  ]) {
    await assert.rejects(() => service.getResourceDownloadUrl(bad), (e) => {
      assert.ok(e instanceof LearningServiceError);
      assert.equal(e.code, 'INVALID_STORAGE_PATH');
      return true;
    });
  }
  await assert.rejects(
    () => service.getResourceDownloadUrl(`${TOPIC_ID}/resources/a.pdf`, { expiresIn: 99999 }),
    (e) => e.code === 'INVALID_EXPIRY'
  );
});

test('mappers never carry a signed URL', () => {
  const mapped = mapResourceRow(resourceRow({ storage_path: `${TOPIC_ID}/resources/a.pdf` }));
  assert.equal(mapped.hasFile, true);
  assert.equal('signedUrl' in mapped, false);
  assert.equal('downloadUrl' in mapped, false);
  assert.equal(mapped.storagePath, `${TOPIC_ID}/resources/a.pdf`);
  assert.notEqual(mapped.topicId, OTHER_ID);
});

test('business codes survive normalization and raw database detail stays hidden', () => {
  assert.equal(normalizeLearningError({ message: 'LEARNING_SCOPE_DENIED' }).code, 'LEARNING_SCOPE_DENIED');
  assert.equal(normalizeLearningError({ message: 'INVALID_EXTERNAL_URL' }).code, 'INVALID_EXTERNAL_URL');
  assert.equal(normalizeLearningError({ status: 401 }).code, 'AUTHENTICATION_REQUIRED');
  assert.equal(
    normalizeLearningError({ message: 'permission denied for relation learning_topics' }).code,
    'REQUEST_FAILED'
  );
});
