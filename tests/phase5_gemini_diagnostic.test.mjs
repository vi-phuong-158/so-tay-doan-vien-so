import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { diagnosticRequest, isDirectExecution, responseOutcome, syntheticAcceptancePrompt } from '../scripts/phase5-gemini-diagnostic.mjs';

test('Phase 5 Gemini diagnostic matches knowledge generation request shape without source data', () => {
  const prompt = syntheticAcceptancePrompt();
  assert.equal(prompt.includes('ORCHID-5729'), true);
  assert.equal(prompt.includes('storage_path'), false);
  assert.deepEqual(diagnosticRequest(prompt).generationConfig, {
    maxOutputTokens: 2400,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingLevel: 'medium' },
  });
});

test('Phase 5 Gemini diagnostic reports canonical outcomes without response content', () => {
  assert.equal(responseOutcome(new Response('{}', { status: 503 }), {}), 'PROVIDER_UNAVAILABLE');
  assert.equal(responseOutcome(new Response('{}', { status: 429 }), {}), 'MODEL_RATE_LIMITED');
  assert.equal(responseOutcome(new Response('{}', { status: 400 }), {}), 'MODEL_PROVIDER_ERROR');
  assert.equal(responseOutcome(new Response('{}', { status: 200 }), {}), 'MODEL_INVALID_OUTPUT');
  assert.equal(responseOutcome(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"synthetic"}' }] } }] }), { status: 200 }), { candidates: [{ content: { parts: [{ text: '{"title":"synthetic"}' }] } }] }), 'SUCCESS');
});

test('Phase 5 Gemini diagnostic resolves the direct script path before comparing module URLs', () => {
  const scriptUrl = new URL('../scripts/phase5-gemini-diagnostic.mjs', import.meta.url);
  assert.equal(isDirectExecution(fileURLToPath(scriptUrl), scriptUrl.href), true);
});
