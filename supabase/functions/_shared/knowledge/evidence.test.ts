import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { extractDeterministically } from './extraction.ts';
import { resolveEvidenceSuggestions } from './evidence.ts';

const extraction = await extractDeterministically({
  documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'fixture.txt', mimeType: 'text/plain',
  bytes: new TextEncoder().encode('Điều 1. Thời hạn 15 ngày.'),
});

Deno.test('evidence is copied from exact source text and carries a page locator', async () => {
  const evidence = await resolveEvidenceSuggestions(extraction, [{ page: 1, excerpt_hint: 'Thời hạn 15 ngày.', evidence_kind: 'DEADLINE' }]);
  assertEquals(evidence[0].content, 'Thời hạn 15 ngày.');
  assertEquals(evidence[0].locator.page, 1);
  assertEquals(evidence[0].selected_by, 'AI_SUGGESTED');
});

Deno.test('fabricated citation hints are rejected', async () => {
  await assertRejects(() => resolveEvidenceSuggestions(extraction, [{ page: 1, excerpt_hint: 'Thời hạn 30 ngày.' }]), Error, 'EVIDENCE_NOT_FOUND');
});
