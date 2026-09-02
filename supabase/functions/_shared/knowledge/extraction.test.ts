import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { extractDeterministically, ExtractionError, normalizeExtractedText, sha256Hex } from './extraction.ts';

Deno.test('normalization is deterministic and keeps page boundaries available', () => {
  assertEquals(normalizeExtractedText('  A\r\n\r\nB-\nản  '), 'A\n\nBản');
});

Deno.test('plain text fixture extracts every page and preserves source checksum', async () => {
  const bytes = new TextEncoder().encode('Văn bản 01/2026\nHạn 15 ngày\fNội dung giữa\fKết luận cuối tài liệu');
  const result = await extractDeterministically({
    documentVersionId: '11111111-1111-4111-8111-111111111111',
    fileName: 'fixture.txt', mimeType: 'text/plain', bytes,
  });
  assertEquals(result.pages.length, 3);
  assertEquals(result.pages[2].text, 'Kết luận cuối tài liệu');
  assertEquals(result.sourceByteHash, await sha256Hex(bytes));
  assertEquals(result.metadata.extractor, 'deterministic-text');
});

Deno.test('image-only and unsupported sources fail closed', async () => {
  const bytes = new TextEncoder().encode('image bytes');
  await assertRejects(() => extractDeterministically({
    documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'scan.pdf', mimeType: 'application/pdf', bytes,
  }), ExtractionError, 'OCR_REQUIRED');
  await assertRejects(() => extractDeterministically({
    documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'photo.png', mimeType: 'image/png', bytes,
  }), ExtractionError, 'UNSUPPORTED_FILE_TYPE');
});

Deno.test('minimal PDF text layer is extracted without OCR', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.4 1 0 obj BT (15 ngày) Tj ET endobj %%EOF');
  const result = await extractDeterministically({
    documentVersionId: '11111111-1111-4111-8111-111111111111', fileName: 'fixture.pdf', mimeType: 'application/pdf', bytes: pdf,
  });
  assertEquals(result.pages[0].text, '15 ngày');
});
