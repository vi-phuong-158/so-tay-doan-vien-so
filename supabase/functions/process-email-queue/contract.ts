export type WorkerConfig = {
  batchSize: number;
  leaseSeconds: number;
  timeoutMs: number;
};

export type EmailDeliveryMode = 'OFF' | 'ALLOWLIST' | 'LIVE';

export type EmailDeliveryConfig = {
  mode: EmailDeliveryMode;
  allowlist: string[];
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseAllowlist(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const raw of value.split(',')) {
    const email = normalizeEmail(raw);
    if (email && EMAIL_PATTERN.test(email)) seen.add(email);
  }
  return [...seen];
}

// Fail-closed by construction: any value other than the two explicit opt-in modes
// (including missing, empty, wrong-case, or unrecognized strings) resolves to OFF. LIVE is
// never a fallback or default; it is only reachable by the exact literal "LIVE" — case and
// content both matter, only surrounding whitespace (e.g. a trailing newline from some CI env
// UIs) is trimmed. "live", "Live", or " LIVE" with other stray characters are not LIVE.
export function getEmailDeliveryConfig(env: Record<string, string | undefined>): EmailDeliveryConfig {
  const raw = (env.EMAIL_DELIVERY_MODE ?? '').trim();
  const mode: EmailDeliveryMode = raw === 'ALLOWLIST' || raw === 'LIVE' ? raw : 'OFF';
  return { mode, allowlist: parseAllowlist(env.EMAIL_TEST_RECIPIENTS) };
}

export function isRecipientAllowlisted(recipientEmail: string, allowlist: string[]): boolean {
  const email = normalizeEmail(recipientEmail);
  return allowlist.includes(email);
}

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
