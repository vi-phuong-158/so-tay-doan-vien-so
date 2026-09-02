import assert from 'node:assert/strict';
import test from 'node:test';
import { createKnowledgeAdminService, KnowledgeAdminError, mapArticle } from '../src/services/knowledgeAdminService.js';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const ARTICLE_ID = '22222222-2222-4222-8222-222222222222';

function query(result) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    single() { return Promise.resolve(result); },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return chain;
}

function client({ rows = [], rpcError = null, invokeError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) { calls.push(['from', table]); return query({ data: rows, error: null }); },
    rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({ data: true, error: rpcError }); },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: { success: true, article_id: ARTICLE_ID }, error: invokeError }); } }
  };
}

test('article mapper preserves provenance, review state and warnings', () => {
  const article = mapArticle({ id: ARTICLE_ID, document_id: DOC_ID, document_version_id: '33333333-3333-4333-8333-333333333333', article_key: 'overview', revision_number: 1, title: 'T', review_status: 'PENDING_REVIEW', content: { key_points: [] }, warnings: ['FACT_NOT_FOUND_IN_SOURCE'] });
  assert.equal(article.documentId, DOC_ID);
  assert.equal(article.reviewStatus, 'PENDING_REVIEW');
  assert.deepEqual(article.warnings, ['FACT_NOT_FOUND_IN_SOURCE']);
});

test('generation invokes the trusted Edge Function and never writes article tables directly', async () => {
  const mock = client();
  const service = createKnowledgeAdminService(mock);
  const result = await service.generate(DOC_ID);
  assert.equal(result.article_id, ARTICLE_ID);
  assert.deepEqual(mock.calls[0][0], 'invoke');
  assert.equal(mock.calls[0][1], 'generate-knowledge-article');
  assert.equal(mock.calls.some(([kind]) => kind === 'from'), false);
});

test('approval/rejection uses only the trusted review RPC', async () => {
  const mock = client();
  const service = createKnowledgeAdminService(mock);
  await service.review(ARTICLE_ID, 'APPROVE', 'Đã đối chiếu source.');
  const call = mock.calls.find(([kind]) => kind === 'rpc');
  assert.equal(call[1], 'review_knowledge_article');
  assert.equal(call[2].p_action, 'APPROVE');
  assert.equal(call[2].p_review_note, 'Đã đối chiếu source.');
});

test('external AI eligibility is changed only through a scoped policy RPC', async () => {
  const mock = client();
  const service = createKnowledgeAdminService(mock);
  await service.setAiProcessingAllowed(DOC_ID, true);
  const call = mock.calls.find(([kind, name]) => kind === 'rpc' && name === 'set_document_ai_processing_allowed');
  assert.equal(call[2].p_document_id, DOC_ID);
  assert.equal(call[2].p_allowed, true);
});

test('invalid review action and ids fail before any request', async () => {
  const mock = client();
  const service = createKnowledgeAdminService(mock);
  await assert.rejects(() => service.review('nope', 'APPROVE'), error => error instanceof KnowledgeAdminError && error.code === 'INVALID_ID');
  await assert.rejects(() => service.review(ARTICLE_ID, 'PUBLISH'), error => error.code === 'INVALID_REVIEW_ACTION');
  assert.equal(mock.calls.length, 0);
});
