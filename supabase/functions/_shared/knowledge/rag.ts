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
};

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

  constructor(readonly model: string, private readonly apiKey: string, private readonly fetcher: FetchLike = fetch) {}

  async generate(question: string, sources: RetrievedKnowledgeSource[]): Promise<string> {
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildGroundedAnswerPrompt(question, sources) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1_200 },
        }),
      },
    ).catch(() => { throw new RagError('MODEL_TIMEOUT', true); });
    const body = await response.json().catch(() => null) as Record<string, any> | null;
    if (!response.ok) throw new RagError(response.status === 429 ? 'MODEL_RATE_LIMITED' : 'MODEL_PROVIDER_ERROR', response.status >= 500 || response.status === 429);
    const answer = body?.candidates?.[0]?.content?.parts
      ?.map((part: Record<string, unknown>) => typeof part.text === 'string' ? part.text : '')
      .join('');
    return validateGroundedAnswer(answer);
  }
}
