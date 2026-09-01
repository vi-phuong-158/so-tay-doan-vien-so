export const GEMINI_EMBEDDING_DIMENSION = 768;

export class GeminiEmbeddingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GeminiEmbeddingError';
  }
}

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
