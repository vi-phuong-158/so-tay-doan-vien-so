import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { hasTrustedWorkerSecret, parseReminderRequest } from './contract.ts';

Deno.test('reminder worker secret comparison is exact', () => {
  assert(hasTrustedWorkerSecret('secret', 'secret'));
  assert(!hasTrustedWorkerSecret('secret', 'secret2'));
  assert(!hasTrustedWorkerSecret(null, 'secret'));
});

Deno.test('reminder request normalizes a deterministic as_of', () => {
  assertEquals(
    parseReminderRequest({ as_of: '2026-08-17T00:00:00+07:00' }).asOf,
    '2026-08-16T17:00:00.000Z'
  );
  assertEquals(parseReminderRequest({}), {});
  assertThrows(() => parseReminderRequest({ as_of: 'not-a-time' }), Error, 'INVALID_AS_OF');
  assertThrows(() => parseReminderRequest([]), Error, 'INVALID_JSON');
});
