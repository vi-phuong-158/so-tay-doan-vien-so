import { assertEquals } from 'jsr:@std/assert@1';
import { fuseKnowledgeCandidates, normalizeKnowledgeQuery, retrieveKnowledgeContext, type RetrievedKnowledgeSource } from './rag.ts';

function candidate(evidenceId: string, documentId = 'document-a', overrides: Partial<RetrievedKnowledgeSource> = {}): RetrievedKnowledgeSource {
  return {
    articleId: `article-${documentId}`,
    evidenceId,
    documentId,
    documentVersionId: `version-${documentId}`,
    title: `Title ${documentId}`,
    evidenceText: `Evidence ${evidenceId}`,
    locator: { page: 1 },
    rank: 1,
    ...overrides,
  };
}

Deno.test('hybrid retrieval deduplicates the same evidence and uses both candidate lists', () => {
  const sources = fuseKnowledgeCandidates(
    [candidate('exact', 'document-a', { exactMatch: true }), candidate('shared')],
    [candidate('shared'), candidate('paraphrase', 'document-b')],
    8,
  );
  assertEquals(sources.map(source => source.evidenceId), ['exact', 'shared', 'paraphrase']);
  assertEquals(sources.filter(source => source.evidenceId === 'shared').length, 1);
});

Deno.test('exact lexical identifier remains ahead of semantically close paraphrases', () => {
  const sources = fuseKnowledgeCandidates(
    [candidate('id-1331', 'document-id', { exactMatch: true })],
    [candidate('semantic-a', 'document-a'), candidate('semantic-b', 'document-b')],
    8,
  );
  assertEquals(sources[0].evidenceId, 'id-1331');
});

Deno.test('semantic retrieval returns the expected evidence ID for a natural-language deadline paraphrase', async () => {
  const query = normalizeKnowledgeQuery('Bao giờ tôi phải nộp hồ sơ?');
  const source = candidate('deadline-evidence', 'deadline-document', {
    evidenceText: 'Hồ sơ phải được gửi trước 17 giờ 30 ngày 31 tháng 12 năm 2026.',
  });
  const result = await retrieveKnowledgeContext(query, [], async input => {
    assertEquals(input, 'Bao giờ tôi phải nộp hồ sơ?');
    return [0.25, 0.75];
  }, async embedding => {
    assertEquals(embedding, [0.25, 0.75]);
    return [source];
  });
  assertEquals(result.mode, 'hybrid');
  assertEquals(result.sources.map(item => item.evidenceId), ['deadline-evidence']);
});

Deno.test('semantic retrieval returns expected evidence for a synonym/paraphrase query', async () => {
  const query = 'Sau khi hoàn thành thì phải phản hồi những gì?';
  const source = candidate('report-evidence', 'report-document', {
    evidenceText: 'Người tham gia có trách nhiệm báo cáo kết quả thực hiện.',
  });
  const result = await retrieveKnowledgeContext(query, [], async input => {
    assertEquals(input, query);
    return 'fixture-semantic-vector';
  }, async embedding => {
    assertEquals(embedding, 'fixture-semantic-vector');
    return [source];
  });
  assertEquals(result.sources.map(item => item.evidenceId), ['report-evidence']);
});

Deno.test('no lexical or semantic evidence stays empty for the no-evidence contract', () => {
  assertEquals(fuseKnowledgeCandidates([], [], 8), []);
});

Deno.test('context selection limits repeated chunks from one document', () => {
  const sources = fuseKnowledgeCandidates(
    [candidate('a1'), candidate('a2'), candidate('a3'), candidate('b1', 'document-b')],
    [],
    8,
  );
  assertEquals(sources.map(source => source.evidenceId), ['a1', 'a2', 'b1']);
});

Deno.test('context selection stays within the character budget', () => {
  assertEquals(fuseKnowledgeCandidates([candidate('too-large', 'document-a', { evidenceText: 'x'.repeat(12_001) })], [], 8), []);
});

Deno.test('query normalization applies stable Unicode and whitespace normalization', () => {
  assertEquals(normalizeKnowledgeQuery('  Thời   hạn\n  là gì?  '), 'Thời hạn là gì?');
});

Deno.test('embedding or vector RPC failure selects lexical fallback without losing lexical candidates', async () => {
  const lexical = [candidate('exact-lexical', 'document-a', { exactMatch: true })];
  const result = await retrieveKnowledgeContext('RAG-ALPHA-726', lexical,
    async () => { throw new Error('provider secret must not escape'); },
    async () => [candidate('should-not-be-used')]);
  assertEquals(result.mode, 'lexical_fallback');
  assertEquals(result.sources.map(source => source.evidenceId), ['exact-lexical']);
  assertEquals(result.semanticCandidates, 0);
});

Deno.test('semantic RPC failure after embedding still preserves the lexical answer candidate', async () => {
  const result = await retrieveKnowledgeContext('1331/QĐ-TTg', [candidate('exact-title', 'document-a', { exactMatch: true })],
    async () => [0.1, 0.9],
    async () => { throw new Error('database detail must not escape'); });
  assertEquals(result.mode, 'lexical_fallback');
  assertEquals(result.sources.map(source => source.evidenceId), ['exact-title']);
});
