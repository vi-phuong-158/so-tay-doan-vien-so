import { assertEquals, assertRejects } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { classifyProviderFailure, createResendProvider, ProviderError } from './provider.ts';

const options = {
  apiKey: 're_test_key',
  fromAddress: 'noreply@example.com',
  fromName: 'Sổ tay Đoàn viên số',
  baseUrl: 'https://api.resend.com',
  timeoutMs: 1000
};

const email = {
  to: 'recipient@example.com',
  from: 'ignored-by-adapter@example.com',
  subject: 'Test',
  text: 'Plain text',
  html: '<p>HTML</p>',
  idempotencyKey: 'email:p303-test'
};

Deno.test('Resend adapter sends safe JSON with stable idempotency and returns provider ID', async () => {
  let idempotencyHeader = '';
  let userAgentHeader = '';
  let requestBody: any = null;
  const provider = createResendProvider({
    ...options,
    fetchImpl: async (input, init) => {
      const captured = new Request(input, init);
      idempotencyHeader = captured.headers.get('Idempotency-Key') ?? '';
      userAgentHeader = captured.headers.get('User-Agent') ?? '';
      requestBody = await captured.clone().json();
      return new Response(JSON.stringify({ id: 'resend-message-1' }), { status: 200 });
    }
  });
  const result = await provider.send(email);
  assertEquals(result, { provider: 'RESEND', providerMessageId: 'resend-message-1', providerCode: 'HTTP_200' });
  assertEquals(idempotencyHeader, 'email:p303-test');
  assertEquals(userAgentHeader, 'so-tay-doan-vien-so/phase-3');
  assertEquals(requestBody.to, ['recipient@example.com']);
  assertEquals(requestBody.from, 'Sổ tay Đoàn viên số <noreply@example.com>');
});

Deno.test('Resend adapter classifies 429, 5xx, permanent 4xx and malformed response', async () => {
  assertEquals(classifyProviderFailure(429, 'rate_limit_exceeded'), { code: 'RATE_LIMITED', retryable: true });
  assertEquals(classifyProviderFailure(503, 'internal_server_error'), { code: 'PROVIDER_5XX', retryable: true });
  assertEquals(classifyProviderFailure(422, 'invalid_from_address'), { code: 'INVALID_FROM_ADDRESS', retryable: false });
  const provider = createResendProvider({
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  });
  await assertRejects(() => provider.send(email), ProviderError, 'MALFORMED_PROVIDER_RESPONSE');
});

Deno.test('provider errors do not expose API keys', async () => {
  const provider = createResendProvider({
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'application_error', message: 'Authorization: Bearer re_secret_value' } }), { status: 500 })
  });
  const error = await assertRejects(() => provider.send(email), ProviderError);
  assertEquals(error.message, 'REDACTED_ERROR');
  assertEquals(error.code, 'PROVIDER_5XX');
});

Deno.test('provider timeout is bounded and retryable', async () => {
  const provider = createResendProvider({
    ...options,
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })
  });
  await assertRejects(() => provider.send(email), ProviderError, 'PROVIDER_TIMEOUT');
});
