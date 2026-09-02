import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { extractDeterministically, ExtractionError } from './extraction.ts';
import { DeterministicFakeKnowledgeGenerator, validateGeneratedDraft } from './generator.ts';
import { resolveEvidenceSuggestions } from './evidence.ts';

async function fixture(name: string): Promise<Uint8Array> {
  return await Deno.readFile(new URL(`./fixtures/${name}`, import.meta.url));
}

Deno.test('golden A/B cover short and multi-page documents', async () => {
  const short = await extractDeterministically({ documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'short.txt', mimeType: 'text/plain', bytes: await fixture('short.txt') });
  const multi = await extractDeterministically({ documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'multi-page.txt', mimeType: 'text/plain', bytes: await fixture('multi-page.txt') });
  const fake = new DeterministicFakeKnowledgeGenerator();
  assertEquals(short.pages.length, 1);
  assertEquals(multi.pages.length, 3);
  assertEquals(multi.pages[2].text.includes('Kết luận cuối'), true);
  const draft = await fake.generateKnowledgeArticle({ document: { title: 'Golden A' }, extraction: short, articleKey: 'overview' });
  const evidence = await resolveEvidenceSuggestions(short, draft.evidence);
  assertEquals(evidence.length, 1);
});

Deno.test('golden C flags a changed deadline instead of silently accepting it', async () => {
  const extraction = await extractDeterministically({ documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'hallucination.txt', mimeType: 'text/plain', bytes: await fixture('hallucination.txt') });
  const draft = validateGeneratedDraft({ title: 'T', summary: 'Thời hạn 30 ngày', key_points: ['30 ngày'], structured_content: {}, evidence: [{ page: 1, excerpt_hint: '15 ngày' }] }, extraction.normalizedText);
  assertEquals(draft.warnings?.some(item => item.includes('30')), true);
});

Deno.test('golden D routes a non-text image extension to an explicit unsupported error', async () => {
  await assertRejects(() => extractDeterministically({ documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'image-only.png', mimeType: 'image/png', bytes: new TextEncoder().encode('bytes') }), ExtractionError, 'UNSUPPORTED_FILE_TYPE');
});
