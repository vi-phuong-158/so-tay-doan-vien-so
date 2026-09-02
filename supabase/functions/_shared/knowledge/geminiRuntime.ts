export const DEFAULT_GEMINI_GENERATION_TIMEOUT_MS = 35_000;
export const MIN_GEMINI_GENERATION_TIMEOUT_MS = 30_000;
export const MAX_GEMINI_GENERATION_TIMEOUT_MS = 45_000;
export const GEMINI_GENERATION_MAX_ATTEMPTS = 2;

export type GeminiGenerationRuntimeConfig = {
  timeoutMs: number;
  maxAttempts: number;
};

export function getGeminiGenerationRuntimeConfig(env: Record<string, string | undefined>): GeminiGenerationRuntimeConfig {
  const configured = Number(env.GEMINI_GENERATION_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configured)
    && configured >= MIN_GEMINI_GENERATION_TIMEOUT_MS
    && configured <= MAX_GEMINI_GENERATION_TIMEOUT_MS
    ? configured
    : DEFAULT_GEMINI_GENERATION_TIMEOUT_MS;
  return { timeoutMs, maxAttempts: GEMINI_GENERATION_MAX_ATTEMPTS };
}

export function isProviderTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

export function logProviderAttempt(details: {
  provider: 'GEMINI';
  model: string;
  attempt: number;
  elapsed_ms: number;
  outcome: string;
  http_status?: number;
}) {
  console.log(JSON.stringify(providerAttemptDiagnostic(details)));
}

export function providerAttemptDiagnostic(details: {
  provider: 'GEMINI';
  model: string;
  attempt: number;
  elapsed_ms: number;
  outcome: string;
  http_status?: number;
}) {
  return { event: 'provider_attempt', ...details };
}
