import assert from 'node:assert/strict';
import test from 'node:test';
import { AskAiError, createAskAiService, mapAskAiCitation } from '../src/services/aiService.js';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const knowledge = fs.readFileSync(new URL('../src/pages/Knowledge.jsx', import.meta.url), 'utf8');

function client(result) {
  const calls = [];
  return {
    calls,
    functions: {
      invoke(name, options) {
        calls.push([name, options]);
        return Promise.resolve(result);
      }
    }
  };
}

test('ask AI invokes only the authenticated Edge Function and maps verified citations', async () => {
  const mock = client({ data: {
    success: true, conversation_id: '11111111-1111-4111-8111-111111111111', message_id: '22222222-2222-4222-8222-222222222222', answer: 'Có căn cứ.',
    citations: [{ rank: 1, title: 'Văn bản A', document_id: '33333333-3333-4333-8333-333333333333', evidence_id: '44444444-4444-4444-8444-444444444444', citation_path: '/tri-thuc/van-ban/33333333-3333-4333-8333-333333333333' }]
  }, error: null });
  const result = await createAskAiService(mock).ask({ question: 'Thời hạn là bao lâu?' });
  assert.equal(mock.calls[0][0], 'ask-ai');
  assert.equal(mock.calls[0][1].body.question, 'Thời hạn là bao lâu?');
  assert.equal(result.citations[0].citationPath, '/tri-thuc/van-ban/33333333-3333-4333-8333-333333333333');
});

test('ask AI rejects invalid input before invoking the function', async () => {
  const mock = client({ data: null, error: null });
  await assert.rejects(() => createAskAiService(mock).ask({ question: 'x' }), error => error instanceof AskAiError && error.code === 'QUESTION_REQUIRED');
  assert.equal(mock.calls.length, 0);
});

test('citation mapper discards incomplete server rows', () => {
  assert.equal(mapAskAiCitation({ document_id: 'doc' }), null);
});

test('knowledge exposes the authenticated Ask AI route instead of a dead floating button', () => {
  assert.match(app, /tri-thuc\/hoi-ai/);
  assert.match(knowledge, /to="\/tri-thuc\/hoi-ai"/);
});
