import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeActorPassword, responseErrorCode } from '../scripts/phase5-runtime-acceptance-helpers.mjs';

test('Phase 5 runtime actors use an Auth-compatible password length', () => {
  const password = createRuntimeActorPassword('123e4567-e89b-12d3-a456-426614174000');
  assert.equal(password, '123e4567-e89b-12d3-a456-426614174000!A9');
  assert.ok(password.length <= 72);
});

test('Phase 5 runtime actor password generator fails closed above Auth password limit', () => {
  assert.throws(
    () => createRuntimeActorPassword('x'.repeat(70)),
    /RUNTIME_ACTOR_PASSWORD_TOO_LONG/,
  );
});

test('Phase 5 runtime harness classifies controlled string and object error payloads', () => {
  assert.equal(responseErrorCode({ success: false, error: 'GEMINI_NOT_CONFIGURED' }), 'GEMINI_NOT_CONFIGURED');
  assert.equal(responseErrorCode({ error: { code: 'MODEL_CONFIGURATION_MISSING' } }), 'MODEL_CONFIGURATION_MISSING');
  assert.equal(responseErrorCode({ success: false, error: {} }), null);
});
