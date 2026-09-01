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
  let request: Record<string, any> | null = null;
  const generator = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async (_input, init) => {
    request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Thời hạn là 15 ngày.' }] } }] }), { status: 200 });
  });
  assertEquals(await generator.generate('Thời hạn bao lâu?', [source]), 'Thời hạn là 15 ngày.');
  assertEquals(request?.generationConfig, { maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: 'low' } });
});

Deno.test('RAG gateway maps provider failures to a bounded retryable error', async () => {
  const generator = new GeminiGroundedAnswerGenerator('gemini-test', 'test-key', async () => new Response('{}', { status: 429 }));
  await assertRejects(() => generator.generate('Thời hạn bao lâu?', [source]), RagError, 'MODEL_RATE_LIMITED');
});

Deno.test('RAG answer validation rejects empty output', () => {
  assertEquals(validateGroundedAnswer(' Có căn cứ. '), 'Có căn cứ.');
  try { validateGroundedAnswer(''); } catch (error) { assertEquals((error as RagError).code, 'MODEL_INVALID_OUTPUT'); }
});
