import { randomUUID } from 'node:crypto';

const AUTH_PASSWORD_MAX_LENGTH = 72;

export function createRuntimeActorPassword(uuid = randomUUID()) {
  const password = `${uuid}!A9`;
  if (password.length > AUTH_PASSWORD_MAX_LENGTH) {
    throw new Error('RUNTIME_ACTOR_PASSWORD_TOO_LONG');
  }
  return password;
}

export function responseErrorCode(payload) {
  const candidate = payload?.code ?? payload?.error?.code ?? payload?.error ?? null;
  return typeof candidate === 'string' ? candidate : null;
}
