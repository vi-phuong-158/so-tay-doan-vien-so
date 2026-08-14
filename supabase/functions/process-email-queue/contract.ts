export type WorkerConfig = {
  batchSize: number;
  leaseSeconds: number;
  timeoutMs: number;
};

export function hasTrustedWorkerSecret(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function getWorkerConfig(env: Record<string, string | undefined>): WorkerConfig {
  return {
    batchSize: boundedInteger(env.EMAIL_WORKER_BATCH_SIZE, 20, 1, 50),
    leaseSeconds: boundedInteger(env.EMAIL_WORKER_LEASE_SECONDS, 300, 30, 900),
    timeoutMs: boundedInteger(env.EMAIL_PROVIDER_TIMEOUT_MS, 10000, 1000, 30000)
  };
}
