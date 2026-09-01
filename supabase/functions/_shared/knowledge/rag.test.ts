import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { buildGroundedAnswerPrompt, GeminiGroundedAnswerGenerator, NO_EVIDENCE_ANSWER, RagError, validateGroundedAnswer } from './rag.ts';

const source = {
  articleId: 'article', evidenceId: 'evidence', documentId: 'document', documentVersionId: 'version',
  title: 'Quy chế kiểm tra', evidenceText: 'Thời hạn là 15 ngày.', locator: { page: 2 }, rank: 0.9,
};

Deno.test('RAG prompt contains only approved evidence and abstention instruction', () => {
  const prompt = buildGroundedAnswerPrompt('Thời hạn bao lâu?', [source]);
  assertEquals(prompt.includes('Thời hạn là 15 ngày.'), true);
  assertEquals(prompt.includes(NO_EVIDENCE_ANSWER), true);
});

Deno.test('RAG gateway returns a bounded Gemini answer with low thinking and no deprecated sampling', async () => {
  let requestBody = '';
  const generator = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async (_input, init) => {
    requestBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Thời hạn là 15 ngày.' }] } }] }), { status: 200 });
  });
  assertEquals(await generator.generate('Thời hạn bao lâu?', [source]), 'Thời hạn là 15 ngày.');
  assertEquals(JSON.parse(requestBody).generationConfig, { maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: 'low' } });
});

Deno.test('RAG gateway maps provider failures to a bounded retryable error', async () => {
  let calls = 0;
  const generator = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response('{}', { status: 429 });
  }, { sleep: async (_delayMs: number) => {}, random: () => 0, baseDelayMs: 0 });
  await assertRejects(() => generator.generate('Thời hạn bao lâu?', [source]), RagError, 'MODEL_RATE_LIMITED');
  assertEquals(calls, 4);
});

Deno.test('RAG gateway retries 503 and does not retry permanent 400', async () => {
  let calls = 0;
  const generator = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return calls === 1
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Thời hạn là 15 ngày.' }] } }] }), { status: 200 });
  }, { sleep: async (_delayMs: number) => {}, random: () => 0, baseDelayMs: 0 });
  assertEquals(await generator.generate('Thời hạn bao lâu?', [source]), 'Thời hạn là 15 ngày.');
  assertEquals(calls, 2);

  calls = 0;
  const permanent = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async () => {
    calls += 1;
    return new Response('{}', { status: 400 });
  }, { sleep: async (_delayMs: number) => {}, random: () => 0, baseDelayMs: 0 });
  await assertRejects(() => permanent.generate('Thời hạn bao lâu?', [source]), RagError, 'MODEL_PROVIDER_ERROR');
  assertEquals(calls, 1);
});

Deno.test('RAG answer validation rejects empty output', () => {
  assertEquals(validateGroundedAnswer(' Có căn cứ. '), 'Có căn cứ.');
  try { validateGroundedAnswer(''); } catch (error) { assertEquals((error as RagError).code, 'MODEL_INVALID_OUTPUT'); }
});
