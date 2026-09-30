export const GEMINI_EMBEDDING_DIMENSION = 768;

export class GeminiEmbeddingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GeminiEmbeddingError';
  }
}

export const DEFAULT_GEMINI_EMBEDDING_TIMEOUT_MS = 8_000;

export function embeddingEndpoint(model: string): string {
  if (!/^models\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) {
    throw new GeminiEmbeddingError('GEMINI_EMBEDDING_MODEL_INVALID');
  }
  return `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent`;
}

export function embeddingRequest(text: string) {
  return {
    content: { parts: [{ text }] },
    output_dimensionality: GEMINI_EMBEDDING_DIMENSION,
  };
}

export function parseEmbeddingResponse(body: unknown): number[] {
  const values = (body as { embedding?: { values?: unknown } } | null)?.embedding?.values;
  if (!Array.isArray(values) || values.length !== GEMINI_EMBEDDING_DIMENSION || !values.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new GeminiEmbeddingError('GEMINI_EMBEDDING_DIMENSION_INVALID');
  }
  return values;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function createGeminiEmbedding(
  text: string,
  apiKey: string,
  model: string,
  fetcher: FetchLike = fetch,
  timeoutMs = DEFAULT_GEMINI_EMBEDDING_TIMEOUT_MS,
): Promise<number[]> {
  let response: Response;
  try {
    response = await fetcher(`${embeddingEndpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(embeddingRequest(text)),
    });
  } catch (error) {
    throw new GeminiEmbeddingError(error instanceof DOMException && error.name === 'TimeoutError'
      ? 'GEMINI_EMBEDDING_TIMEOUT'
      : 'GEMINI_EMBEDDING_PROVIDER_UNAVAILABLE');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GeminiEmbeddingError(response.status === 429
      ? 'GEMINI_EMBEDDING_RATE_LIMITED'
      : response.status >= 500
        ? 'GEMINI_EMBEDDING_PROVIDER_UNAVAILABLE'
        : 'GEMINI_EMBEDDING_PROVIDER_ERROR');
  }
  return parseEmbeddingResponse(body);
}
