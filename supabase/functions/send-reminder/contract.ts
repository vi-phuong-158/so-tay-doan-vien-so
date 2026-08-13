export type ReminderRequest = {
  as_of?: unknown;
};

export type ParsedReminderRequest = {
  asOf?: string;
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

export function parseReminderRequest(value: unknown): ParsedReminderRequest {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');

  const asOf = (value as ReminderRequest).as_of;
  if (asOf == null) return {};
  if (typeof asOf !== 'string' || Number.isNaN(Date.parse(asOf))) {
    throw new Error('INVALID_AS_OF');
  }
  return { asOf: new Date(asOf).toISOString() };
}
