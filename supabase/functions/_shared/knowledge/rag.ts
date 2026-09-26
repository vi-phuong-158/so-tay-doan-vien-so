import { withProviderRetry, type ProviderRetryOptions } from './providerRetry.ts';
import { isProviderTimeout, logProviderAttempt, DEFAULT_GEMINI_GENERATION_TIMEOUT_MS } from './geminiRuntime.ts';

export const NO_EVIDENCE_ANSWER = 'Không tìm thấy đủ căn cứ trong kho tri thức mà đồng chí được phép truy cập.';

export type RetrievedKnowledgeSource = {
  articleId: string;
  evidenceId: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  evidenceText: string;
  locator: Record<string, unknown>;
  rank: number;
  exactMatch?: boolean;
  semanticSimilarity?: number;
};

export type RankedKnowledgeCandidate = RetrievedKnowledgeSource;

const RRF_K = 60;
const LEXICAL_WEIGHT = 1.25;
const MAX_CHUNKS_PER_DOCUMENT = 2;
const MAX_CONTEXT_CHARACTERS = 12_000;

export function fuseKnowledgeCandidates(
  lexical: RankedKnowledgeCandidate[],
  semantic: RankedKnowledgeCandidate[],
  limit = 8,
): RetrievedKnowledgeSource[] {
  const fused = new Map<string, { source: RetrievedKnowledgeSource; score: number; lexicalRank: number; exact: boolean }>();
  const add = (candidates: RankedKnowledgeCandidate[], weight: number, kind: 'lexical' | 'semantic') => {
    candidates.forEach((source, index) => {
      const current = fused.get(source.evidenceId) ?? {
        source,
        score: 0,
        lexicalRank: Number.MAX_SAFE_INTEGER,
        exact: false,
      };
      current.score += weight / (RRF_K + index + 1);
      if (kind === 'lexical') {
        current.lexicalRank = index + 1;
        current.exact = Boolean(source.exactMatch);
      } else if (source.semanticSimilarity !== undefined) {
        current.source.semanticSimilarity = source.semanticSimilarity;
      }
      fused.set(source.evidenceId, current);
    });
  };
  add(lexical, LEXICAL_WEIGHT, 'lexical');
  add(semantic, 1, 'semantic');

  const ranked = [...fused.values()].sort((a, b) => Number(b.exact) - Number(a.exact)
    || b.score - a.score
    || a.lexicalRank - b.lexicalRank
    || a.source.evidenceId.localeCompare(b.source.evidenceId));
  const selected: RetrievedKnowledgeSource[] = [];
  const documentCounts = new Map<string, number>();
  let contextCharacters = 0;
  for (const item of ranked) {
    const count = documentCounts.get(item.source.documentId) ?? 0;
    if (count >= MAX_CHUNKS_PER_DOCUMENT || contextCharacters + item.source.evidenceText.length > MAX_CONTEXT_CHARACTERS) continue;
    documentCounts.set(item.source.documentId, count + 1);
    contextCharacters += item.source.evidenceText.length;
    selected.push({ ...item.source, rank: item.score });
    if (selected.length >= Math.max(1, Math.min(limit, 12))) break;
  }
  return selected;
}

export function normalizeKnowledgeQuery(question: string): string {
  return question.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export async function retrieveKnowledgeContext<TEmbedding>(
  query: string,
  lexical: RetrievedKnowledgeSource[],
  createQueryEmbedding: (query: string) => Promise<TEmbedding>,
  searchSemantic: (embedding: TEmbedding) => Promise<RetrievedKnowledgeSource[]>,
  limit = 8,
): Promise<{
  sources: RetrievedKnowledgeSource[];
  mode: 'hybrid' | 'lexical_fallback';
  lexicalCandidates: number;
  semanticCandidates: number;
  error?: unknown;
}> {
  try {
    const embedding = await createQueryEmbedding(query);
    const semantic = await searchSemantic(embedding);
    return {
      sources: fuseKnowledgeCandidates(lexical, semantic, limit),
      mode: 'hybrid',
      lexicalCandidates: lexical.length,
      semanticCandidates: semantic.length,
    };
  } catch (error) {
    return {
      sources: fuseKnowledgeCandidates(lexical, [], limit),
      mode: 'lexical_fallback',
      lexicalCandidates: lexical.length,
      semanticCandidates: 0,
      error,
    };
  }
}

export class RagError extends Error {
  constructor(readonly code: string, readonly retryable = false) {
    super(code);
  }
}

export function buildGroundedAnswerPrompt(question: string, sources: RetrievedKnowledgeSource[]): string {
  const context = sources.map((source, index) => {
    const page = typeof source.locator?.page === 'number' ? `, trang ${source.locator.page}` : '';
    return `[${index + 1}] ${source.title}${page}\n${source.evidenceText}`;
  }).join('\n\n');
  return `Bạn là trợ lý tra cứu của Sổ tay Đoàn viên số. Chỉ trả lời dựa trên evidence được cung cấp. Không tự suy diễn thành quy định, không thêm ngày, số liệu, điều khoản hoặc nguồn bên ngoài. Nếu evidence không đủ để trả lời chính xác, trả lời đúng câu: "${NO_EVIDENCE_ANSWER}". Không tự thêm danh sách nguồn; hệ thống sẽ gắn citation đã xác thực.\n\nCÂU HỎI:\n${question}\n\nEVIDENCE ĐÃ DUYỆT:\n${context}`;
}

export function validateGroundedAnswer(value: unknown): string {
  const answer = typeof value === 'string' ? value.trim() : '';
  if (!answer || answer.length > 8_000) throw new RagError('MODEL_INVALID_OUTPUT');
  return answer;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class GeminiGroundedAnswerGenerator {
  readonly provider = 'GEMINI';

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly retryOptions: ProviderRetryOptions = {},
    private readonly timeoutMs = DEFAULT_GEMINI_GENERATION_TIMEOUT_MS,
  ) {}

  async generate(question: string, sources: RetrievedKnowledgeSource[]): Promise<string> {
    const answer = await withProviderRetry(
      async attempt => {
        const startedAt = Date.now();
        let response: Response;
        try {
          response = await this.fetcher(
          `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(this.timeoutMs),
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: buildGroundedAnswerPrompt(question, sources) }] }],
              generationConfig: { maxOutputTokens: 1_200, thinkingConfig: { thinkingLevel: 'low' } },
            }),
          },
          );
        } catch (error) {
          const code = isProviderTimeout(error) ? 'MODEL_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
          logProviderAttempt({ provider: 'GEMINI', model: this.model, attempt, elapsed_ms: Date.now() - startedAt, outcome: code });
          throw new RagError(code, true);
        }
        const body = await response.json().catch(() => null) as Record<string, any> | null;
        if (!response.ok) {
          logProviderAttempt({ provider: 'GEMINI', model: this.model, attempt, elapsed_ms: Date.now() - startedAt, outcome: 'HTTP_ERROR', http_status: response.status });
          if (response.status === 429) throw new RagError('MODEL_RATE_LIMITED', true);
          if (response.status === 500 || response.status === 503) throw new RagError('PROVIDER_UNAVAILABLE', true);
          throw new RagError('MODEL_PROVIDER_ERROR');
        }
        const text = body?.candidates?.[0]?.content?.parts
          ?.map((part: Record<string, unknown>) => typeof part.text === 'string' ? part.text : '')
          .join('');
        try {
          const answer = validateGroundedAnswer(text);
          logProviderAttempt({ provider: 'GEMINI', model: this.model, attempt, elapsed_ms: Date.now() - startedAt, outcome: 'SUCCESS', http_status: response.status });
          return answer;
        } catch (error) {
          logProviderAttempt({ provider: 'GEMINI', model: this.model, attempt, elapsed_ms: Date.now() - startedAt, outcome: 'MODEL_INVALID_OUTPUT', http_status: response.status });
          throw error;
        }
      },
      error => error instanceof RagError && error.retryable,
      this.retryOptions,
    );
    return answer;
  }
}
