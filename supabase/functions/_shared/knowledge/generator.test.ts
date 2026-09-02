import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { extractDeterministically } from './extraction.ts';
import { DeterministicFakeKnowledgeGenerator, GeminiKnowledgeGenerator, KnowledgeGenerationError, createSourceBatches, knowledgeGenerationRequest, validateGeneratedDraft } from './generator.ts';

const extraction = await extractDeterministically({
  documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'fixture.txt', mimeType: 'text/plain',
  bytes: new TextEncoder().encode('Số 01/2026. Thời hạn 15 ngày.\fNội dung cuối tài liệu.'),
});

Deno.test('large sources are partitioned instead of truncating the tail', () => {
  const batches = createSourceBatches(extraction, 60);
  assertEquals(batches.length, 2);
  assertEquals(batches.some(batch => batch.includes('Nội dung cuối tài liệu.')), true);
});

Deno.test('fake generator returns a schema-valid draft', async () => {
  const generator = new DeterministicFakeKnowledgeGenerator();
  const draft = await generator.generateKnowledgeArticle({ document: { title: 'Fixture' }, extraction, articleKey: 'overview' });
  assertEquals(draft.title, 'Fixture');
  assertEquals(draft.evidence.length, 1);
});

Deno.test('numeric fact drift is flagged and malformed output is rejected', async () => {
  const draft = validateGeneratedDraft({
    title: 'Fixture', summary: 'Hạn 30 ngày', key_points: ['Hạn 30 ngày'], structured_content: {},
    evidence: [{ page: 1, excerpt_hint: 'Số 01/2026' }],
  }, extraction.normalizedText);
  assertEquals(draft.warnings?.some(item => item.includes('30')), true);
  await assertRejects(async () => validateGeneratedDraft({ title: 'missing' }, extraction.normalizedText), KnowledgeGenerationError, 'MODEL_INVALID_OUTPUT');
});

Deno.test('Gemini 3 generation uses supported thinking and omits deprecated sampling parameters', () => {
  const config = knowledgeGenerationRequest('fixture').generationConfig as Record<string, unknown>;
  assertEquals(config.thinkingConfig, { thinkingLevel: 'medium' });
  assertEquals('temperature' in config, false);
  assertEquals('topP' in config, false);
  assertEquals('topK' in config, false);
});

const validGeminiResponse = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify({
    title: 'Fixture', summary: 'Hạn 15 ngày', key_points: ['Hạn 15 ngày'], structured_content: {},
    evidence: [{ page: 1, excerpt_hint: 'Hạn 15 ngày', evidence_kind: 'DEADLINE', reason: 'fixture' }], warnings: [],
  }) }] } }],
}), { status: 200 });

const generatorInput = { document: { title: 'Fixture' }, extraction, articleKey: 'overview' };
const noSleep = { sleep: async (_delayMs: number) => {}, random: () => 0, baseDelayMs: 0 };

Deno.test('Gemini generation retries 503 and succeeds without changing the model', async () => {
  let calls = 0;
  const generator = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return calls === 1 ? new Response('{}', { status: 503 }) : validGeminiResponse();
  }, noSleep);
  assertEquals((await generator.generateKnowledgeArticle(generatorInput)).title, 'Fixture');
  assertEquals(calls, 2);
});

Deno.test('Gemini generation retries 429 and succeeds', async () => {
  let calls = 0;
  const generator = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return calls === 1 ? new Response('{}', { status: 429 }) : validGeminiResponse();
  }, noSleep);
  assertEquals((await generator.generateKnowledgeArticle(generatorInput)).title, 'Fixture');
  assertEquals(calls, 2);
});

Deno.test('Gemini generation maps local timeout separately from an upstream 500', async () => {
  let calls = 0;
  const timeout = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    throw new DOMException('timed out', 'TimeoutError');
  }, noSleep);
  await assertRejects(() => timeout.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'MODEL_TIMEOUT');
  assertEquals(calls, 4);

  calls = 0;
  const upstream = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response('{}', { status: 500 });
  }, noSleep);
  await assertRejects(() => upstream.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'PROVIDER_UNAVAILABLE');
  assertEquals(calls, 4);
});

Deno.test('Gemini generation preserves a non-timeout network failure category', async () => {
  let calls = 0;
  const generator = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    throw new TypeError('network unavailable');
  }, noSleep);
  await assertRejects(() => generator.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'PROVIDER_UNAVAILABLE');
  assertEquals(calls, 4);
});

Deno.test('Gemini generation does not retry permanent 400 or malformed output', async () => {
  let calls = 0;
  const badRequest = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response('{}', { status: 400 });
  }, noSleep);
  await assertRejects(() => badRequest.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'MODEL_PROVIDER_ERROR');
  assertEquals(calls, 1);

  calls = 0;
  const malformed = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{bad json' }] } }] }), { status: 200 });
  }, noSleep);
  await assertRejects(() => malformed.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'MODEL_INVALID_OUTPUT');
  assertEquals(calls, 1);
});

Deno.test('Gemini generation returns PROVIDER_UNAVAILABLE after bounded retry exhaustion', async () => {
  let calls = 0;
  const generator = new GeminiKnowledgeGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response('{}', { status: 503 });
  }, noSleep);
  await assertRejects(() => generator.generateKnowledgeArticle(generatorInput), KnowledgeGenerationError, 'PROVIDER_UNAVAILABLE');
  assertEquals(calls, 4);
});
