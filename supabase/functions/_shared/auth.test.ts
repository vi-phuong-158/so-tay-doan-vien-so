import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { classifyPublicFirstAuthorization } from './auth.ts';

const publishableKey = 'sb_publishable_test_key';

Deno.test('public-first auth accepts a configured application key without a user bearer', () => {
  assertEquals(classifyPublicFirstAuthorization(null, publishableKey, [publishableKey]), 'GUEST');
  assertEquals(
    classifyPublicFirstAuthorization(`Bearer ${publishableKey}`, publishableKey, [publishableKey]),
    'GUEST',
  );
});

Deno.test('public-first auth marks any non-application bearer for real user verification', () => {
  assertEquals(
    classifyPublicFirstAuthorization('Bearer forged-or-expired-user-token', publishableKey, [publishableKey]),
    'USER_TOKEN',
  );
});

Deno.test('public-first auth rejects missing, unknown, and malformed application credentials', () => {
  assertThrows(() => classifyPublicFirstAuthorization(null, null, [publishableKey]), Error, 'INVALID_API_KEY');
  assertThrows(() => classifyPublicFirstAuthorization(null, 'unknown', [publishableKey]), Error, 'INVALID_API_KEY');
  assertThrows(() => classifyPublicFirstAuthorization('Basic credentials', publishableKey, [publishableKey]), Error, 'UNAUTHENTICATED');
});
