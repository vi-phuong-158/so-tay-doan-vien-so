import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getEmailDeliveryConfig, getWorkerConfig, hasTrustedWorkerSecret, isRecipientAllowlisted } from './contract.ts';

Deno.test('worker invocation requires an exact configured secret', () => {
  assertEquals(hasTrustedWorkerSecret('secret', 'secret'), true);
  assertEquals(hasTrustedWorkerSecret('secret', 'wrong'), false);
  assertEquals(hasTrustedWorkerSecret('secret', undefined), false);
  assertEquals(hasTrustedWorkerSecret(null, 'secret'), false);
});

Deno.test('worker config remains bounded by queue safety limits', () => {
  assertEquals(getWorkerConfig({ EMAIL_WORKER_BATCH_SIZE: '999', EMAIL_WORKER_LEASE_SECONDS: '1', EMAIL_PROVIDER_TIMEOUT_MS: '60000' }), {
    batchSize: 50,
    leaseSeconds: 30,
    timeoutMs: 30000
  });
});

Deno.test('email delivery mode defaults to OFF and never falls back to LIVE', () => {
  assertEquals(getEmailDeliveryConfig({}).mode, 'OFF');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: '' }).mode, 'OFF');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: 'WHATEVER' }).mode, 'OFF');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: 'live' }).mode, 'OFF');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: ' Live ' }).mode, 'OFF');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: 'ALLOWLIST' }).mode, 'ALLOWLIST');
  assertEquals(getEmailDeliveryConfig({ EMAIL_DELIVERY_MODE: 'LIVE' }).mode, 'LIVE');
});

Deno.test('email test allowlist is normalized, deduplicated and rejects malformed entries', () => {
  const config = getEmailDeliveryConfig({
    EMAIL_DELIVERY_MODE: 'ALLOWLIST',
    EMAIL_TEST_RECIPIENTS: ' User1@Example.com , user1@example.com ,not-an-email, ,user2@example.com'
  });
  assertEquals(config.allowlist, ['user1@example.com', 'user2@example.com']);
});

Deno.test('allowlist match is exact and case-insensitive with no wildcard/substring behavior', () => {
  const allowlist = ['user1@example.com'];
  assertEquals(isRecipientAllowlisted('user1@example.com', allowlist), true);
  assertEquals(isRecipientAllowlisted('User1@Example.com', allowlist), true);
  assertEquals(isRecipientAllowlisted(' user1@example.com ', allowlist), true);
  assertEquals(isRecipientAllowlisted('user1@example.com.evil.test', allowlist), false);
  assertEquals(isRecipientAllowlisted('other.user1@example.com', allowlist), false);
  assertEquals(isRecipientAllowlisted('user2@example.com', allowlist), false);
  assertEquals(isRecipientAllowlisted('anyone@anywhere.com', []), false);
});
