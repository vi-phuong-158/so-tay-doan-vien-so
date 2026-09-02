import { assertEquals } from 'jsr:@std/assert@1';
import {
  DEFAULT_GEMINI_GENERATION_TIMEOUT_MS,
  getGeminiGenerationRuntimeConfig,
  providerAttemptDiagnostic,
} from './geminiRuntime.ts';

Deno.test('Gemini runtime timeout accepts only its bounded configuration range', () => {
  assertEquals(getGeminiGenerationRuntimeConfig({}), { timeoutMs: DEFAULT_GEMINI_GENERATION_TIMEOUT_MS, maxAttempts: 2 });
  assertEquals(getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: '30000' }).timeoutMs, 30_000);
  assertEquals(getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: '45000' }).timeoutMs, 45_000);
  assertEquals(getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: '29999' }).timeoutMs, DEFAULT_GEMINI_GENERATION_TIMEOUT_MS);
  assertEquals(getGeminiGenerationRuntimeConfig({ GEMINI_GENERATION_TIMEOUT_MS: '45001' }).timeoutMs, DEFAULT_GEMINI_GENERATION_TIMEOUT_MS);
});

Deno.test('provider diagnostics contain only safe attempt metadata', () => {
  const diagnostic = JSON.stringify(providerAttemptDiagnostic({
    provider: 'GEMINI', model: 'models/gemini-3.6-flash', attempt: 1, elapsed_ms: 35_000,
    outcome: 'HTTP_ERROR', http_status: 503,
  }));
  assertEquals(diagnostic.includes('api-key'), false);
  assertEquals(diagnostic.includes('Authorization'), false);
  assertEquals(diagnostic.includes('prompt'), false);
  assertEquals(diagnostic.includes('storage_path'), false);
});
