import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { extractDeterministically } from './extraction.ts';
import { DeterministicFakeKnowledgeGenerator, KnowledgeGenerationError, createSourceBatches, knowledgeGenerationRequest, validateGeneratedDraft } from './generator.ts';

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
