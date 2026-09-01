import type { StructuredExtraction } from './extraction.ts';
import { withProviderRetry, type ProviderRetryOptions } from './providerRetry.ts';

export const PROMPT_VERSION = 'knowledge_article_v1';
export const GENERATOR_VERSION = 'p5-03-generator-v1';
const MAX_BATCH_CHARS = 45_000;
const MAX_TOTAL_CHARS = 220_000;
const PROVIDER_TIMEOUT_MS = 12_000;

export type KnowledgeArticleDraft = {
  title: string;
  summary: string;
  key_points: string[];
  structured_content: Record<string, unknown>;
  evidence: Array<{ page?: number; excerpt_hint?: string; evidence_kind?: string; reason?: string }>;
  warnings?: string[];
};

export type KnowledgeGeneratorInput = {
  document: { title: string; document_number?: string | null; issued_date?: string | null; document_type?: string | null };
  extraction: StructuredExtraction;
  articleKey: string;
};

export interface KnowledgeGenerator {
  readonly provider: string;
  readonly model: string;
  generateKnowledgeArticle(input: KnowledgeGeneratorInput): Promise<KnowledgeArticleDraft>;
}

export class KnowledgeGenerationError extends Error {
  constructor(readonly code: string, message = code, readonly retryable = false) {
    super(message);
    this.name = 'KnowledgeGenerationError';
  }
}

export function createSourceBatches(extraction: StructuredExtraction, maxChars = MAX_BATCH_CHARS): string[] {
  const batches: string[] = [];
  let current = '';
  for (const page of extraction.pages) {
    const part = `[Trang ${page.page}]\n${page.text}`;
    if (part.length > maxChars) throw new KnowledgeGenerationError('SOURCE_TOO_LARGE');
    if (current && current.length + part.length + 2 > maxChars) {
      batches.push(current);
      current = part;
    } else {
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  if (current) batches.push(current);
  if (batches.join('\n\n').length > MAX_TOTAL_CHARS) throw new KnowledgeGenerationError('SOURCE_TOO_LARGE');
  return batches;
}

function numericLiterals(value: string): string[] {
  return Array.from(new Set(value.match(/\b\d[\d./-]{1,}\b/g) ?? []));
}

export function validateGeneratedDraft(draft: unknown, sourceText: string): KnowledgeArticleDraft {
  if (!draft || typeof draft !== 'object') throw new KnowledgeGenerationError('MODEL_INVALID_OUTPUT');
  const value = draft as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  const keyPoints = Array.isArray(value.key_points) ? value.key_points.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean) : [];
  const structured = value.structured_content && typeof value.structured_content === 'object' && !Array.isArray(value.structured_content)
    ? value.structured_content as Record<string, unknown> : null;
  const evidence = Array.isArray(value.evidence) ? value.evidence : [];
  if (!title || !summary || keyPoints.length === 0 || !structured || evidence.length === 0) {
    throw new KnowledgeGenerationError('MODEL_INVALID_OUTPUT');
  }
  const generatedText = JSON.stringify({ title, summary, keyPoints, structured });
  const warnings = Array.isArray(value.warnings) ? value.warnings.filter(item => typeof item === 'string').map(item => item.slice(0, 200)) : [];
  for (const literal of numericLiterals(generatedText)) {
    if (!numericLiterals(sourceText).includes(literal)) warnings.push(`FACT_NOT_FOUND_IN_SOURCE:${literal}`);
  }
  return {
    title: title.slice(0, 500),
    summary: summary.slice(0, 10_000),
    key_points: keyPoints.slice(0, 20).map(item => item.slice(0, 2_000)),
    structured_content: structured,
    evidence: evidence.slice(0, 12).map(item => {
      if (!item || typeof item !== 'object') return {};
      const row = item as Record<string, unknown>;
      return {
        page: typeof row.page === 'number' ? row.page : undefined,
        excerpt_hint: typeof row.excerpt_hint === 'string' ? row.excerpt_hint.slice(0, 2_000) : undefined,
        evidence_kind: typeof row.evidence_kind === 'string' ? row.evidence_kind : undefined,
        reason: typeof row.reason === 'string' ? row.reason.slice(0, 500) : undefined,
      };
    }),
    warnings: Array.from(new Set(warnings)).slice(0, 30),
  };
}

function promptFor(input: KnowledgeGeneratorInput, source: string): string {
  return `Bạn là bộ sinh bản nháp tri thức cho Sổ tay Đoàn viên số. Prompt version: ${PROMPT_VERSION}.
Chỉ sử dụng nguồn được cung cấp. Không bổ sung sự kiện bên ngoài, không bịa điều khoản, không đổi ngày, số văn bản, tên cơ quan hoặc số liệu. Nếu nguồn không đủ hoặc extraction không chắc chắn, ghi cảnh báo. Evidence chỉ là gợi ý page + excerpt_hint; backend sẽ đối chiếu exact source text.
Trả về JSON đúng schema: {title:string, summary:string, key_points:string[], structured_content:object, evidence:{page:number,excerpt_hint:string,evidence_kind:string,reason:string}[], warnings:string[]}.
Tài liệu: ${JSON.stringify(input.document)}. Article key: ${input.articleKey}.
NGUỒN:
${source}`;
}

export function knowledgeGenerationRequest(prompt: string) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2400,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'medium' },
    },
  };
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function geminiGenerate(model: string, apiKey: string, prompt: string, fetcher: FetchLike): Promise<unknown> {
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    body: JSON.stringify(knowledgeGenerationRequest(prompt)),
  }).catch(() => {
    throw new KnowledgeGenerationError('PROVIDER_UNAVAILABLE', undefined, true);
  });
  const body = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) {
    if (response.status === 429) throw new KnowledgeGenerationError('MODEL_RATE_LIMITED', undefined, true);
    if (response.status === 500 || response.status === 503) throw new KnowledgeGenerationError('PROVIDER_UNAVAILABLE', undefined, true);
    throw new KnowledgeGenerationError('MODEL_PROVIDER_ERROR');
  }
  const text = body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('').trim();
  if (!text) throw new KnowledgeGenerationError('MODEL_INVALID_OUTPUT');
  try { return JSON.parse(text); } catch { throw new KnowledgeGenerationError('MODEL_INVALID_OUTPUT'); }
}

export class GeminiKnowledgeGenerator implements KnowledgeGenerator {
  readonly provider = 'GEMINI';
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly retryOptions: ProviderRetryOptions = {},
  ) {}

  private generateWithRetry(prompt: string): Promise<unknown> {
    return withProviderRetry(
      () => geminiGenerate(this.model, this.apiKey, prompt, this.fetcher),
      error => error instanceof KnowledgeGenerationError && error.retryable,
      this.retryOptions,
    );
  }

  async generateKnowledgeArticle(input: KnowledgeGeneratorInput): Promise<KnowledgeArticleDraft> {
    const batches = createSourceBatches(input.extraction);
    const summaries: string[] = [];
    for (const batch of batches) {
      if (batches.length === 1) {
        return validateGeneratedDraft(await this.generateWithRetry(promptFor(input, batch)), input.extraction.normalizedText);
      }
      const result = await this.generateWithRetry(`${promptFor(input, batch)}\nTóm tắt riêng batch này, giữ nguyên literal và page locator; trả JSON {summary:string,key_points:string[],evidence:object[],warnings:string[]}.`);
      summaries.push(JSON.stringify(result));
    }
    return validateGeneratedDraft(await this.generateWithRetry(promptFor(input, summaries.join('\n\n'))), input.extraction.normalizedText);
  }
}

export class DeterministicFakeKnowledgeGenerator implements KnowledgeGenerator {
  readonly provider = 'FAKE';
  readonly model = 'synthetic-fake-v1';
  constructor(private readonly output?: KnowledgeArticleDraft) {}

  async generateKnowledgeArticle(input: KnowledgeGeneratorInput): Promise<KnowledgeArticleDraft> {
    if (this.output) return validateGeneratedDraft(this.output, input.extraction.normalizedText);
    const first = input.extraction.pages[0];
    const excerpt = first.text.slice(0, Math.min(first.text.length, 240));
    return validateGeneratedDraft({
      title: input.document.title,
      summary: excerpt,
      key_points: [excerpt],
      structured_content: { summary: excerpt, source_pages: input.extraction.pages.length },
      evidence: [{ page: first.page, excerpt_hint: excerpt, evidence_kind: 'ARTICLE_CLAUSE', reason: 'synthetic fixture' }],
      warnings: [],
    }, input.extraction.normalizedText);
  }
}

export { MAX_BATCH_CHARS, MAX_TOTAL_CHARS };
