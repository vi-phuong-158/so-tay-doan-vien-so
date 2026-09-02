export type ProviderRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2_000;

export async function withProviderRetry<T>(
  operation: (attempt: number) => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  options: ProviderRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxAttempts) throw error;
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const jitter = Math.floor(exponentialDelay * 0.25 * Math.max(0, Math.min(1, random())));
      await sleep(exponentialDelay + jitter);
    }
  }

  throw new Error('PROVIDER_RETRY_EXHAUSTED');
}

export { DEFAULT_BASE_DELAY_MS, DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_DELAY_MS };
