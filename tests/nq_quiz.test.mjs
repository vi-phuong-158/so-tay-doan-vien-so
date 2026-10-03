import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createNqQuizService, secondsRemaining, formatQuizTime } from '../src/services/nqQuizService.js';

const questions = JSON.parse(readFileSync(new URL('../scripts/data/nq-300.json', import.meta.url)));
test('source bank contains exactly 300 original numbers, four options and valid keys', () => {
  assert.equal(questions.length, 300);
  assert.deepEqual(questions.map((q) => q.question_number), Array.from({ length: 300 }, (_, i) => i + 1));
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const q of questions) {
    assert.equal(typeof q.question_text, 'string');
    assert.ok(q.question_text.trim());
    assert.deepEqual(Object.keys(q.options), ['A', 'B', 'C', 'D']);
    assert.ok(Object.values(q.options).every((value) => value != null && String(value).trim()));
    assert.ok(Object.hasOwn(counts, q.correct_answer));
    counts[q.correct_answer] += 1;
    assert.equal(q.recognition_level, null);
  }
  assert.deepEqual(counts, { A: 98, B: 94, C: 65, D: 43 });
  assert.equal(questions[102].options.D, 1); // preserve the workbook's numeric cell
});

test('countdown derives from backend deadline; reload and local clock changes do not restart it', () => {
  const state = { status: 'IN_PROGRESS', expires_at: '2026-10-02T14:20:00Z', server_now: '2026-10-02T14:05:00Z' };
  assert.equal(secondsRemaining(state, 0), 900);
  assert.equal(secondsRemaining(state, 42000), 858);
  assert.equal(secondsRemaining(state, 901000), 0);
  assert.equal(secondsRemaining({ ...state, status: 'EXPIRED' }, 0), 0);
  assert.equal(formatQuizTime(1200), '20:00');
  assert.equal(formatQuizTime(872), '14:32');
});

test('attempt state and lookup use separate trusted RPCs; submission sends no client grading result', async () => {
  const calls = [];
  const service = createNqQuizService({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member', is_anonymous: false } } }, error: null }) },
    rpc: async (name, args) => { calls.push([name, args]); return { data: {}, error: null }; }
  });
  await service.attempt('resume');
  await service.attempt('answer', 'attempt', 'question', 'option');
  await service.attempt('submit', 'attempt');
  await service.lookup('Câu 125');
  assert.equal(calls[0][0], 'nq_attempt');
  assert.deepEqual(calls[2][1], { p_action: 'submit', p_attempt_id: 'attempt', p_question_id: null, p_option_id: null });
  assert.deepEqual(calls[3], ['lookup_nq_questions', { p_search: 'Câu 125', p_offset: 0 }]);
});

test('guest sessions are created without interactive credentials and provision only the NQ guest profile', async () => {
  const calls = [];
  let user = null;
  const service = createNqQuizService({
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      signInAnonymously: async (options) => {
        calls.push(['signInAnonymously', options]);
        user = { id: 'guest', is_anonymous: true };
        return { data: { user }, error: null };
      }
    },
    rpc: async (name, args) => { calls.push([name, args]); return { data: {}, error: null }; }
  });

  await service.attempt('resume');
  assert.deepEqual(calls.map(([name]) => name), ['signInAnonymously', 'ensure_nq_quiz_guest', 'nq_attempt']);
  assert.deepEqual(calls[0][1], { options: { data: { purpose: 'nq_quiz_guest' } } });
  await service.lookup('Câu 125');
  assert.deepEqual(calls.slice(-2).map(([name]) => name), ['ensure_nq_quiz_guest', 'lookup_nq_questions']);
});
