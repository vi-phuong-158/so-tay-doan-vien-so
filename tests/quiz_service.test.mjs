import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QuizServiceError,
  createQuizService,
  mapAttemptQuestionRows,
  normalizeQuizError
} from '../src/services/quizService.js';

const QUIZ_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';

function createClient({ rpcResponses = {}, tableResponse = { data: [], error: null } } = {}) {
  const calls = [];
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    then(resolve, reject) { return Promise.resolve(tableResponse).then(resolve, reject); }
  };
  return {
    calls,
    client: {
      rpc(name, args) {
        calls.push(['rpc', name, args]);
        return Promise.resolve(rpcResponses[name] ?? { data: [], error: null });
      },
      from(table) {
        calls.push(['from', table]);
        return query;
      }
    }
  };
}

test('safe attempt payload maps questions/options and never carries is_correct', () => {
  const rows = mapAttemptQuestionRows([
    {
      question_id: QUESTION_ID,
      question_type: 'SINGLE',
      question_text: 'Câu hỏi',
      points: 1,
      question_order: 1,
      option_id: OPTION_ID,
      option_text: 'Lựa chọn',
      option_order: 1,
      is_correct: true
    }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].options[0].text, 'Lựa chọn');
  assert.equal('is_correct' in rows[0], false);
  assert.equal('is_correct' in rows[0].options[0], false);
});

test('getQuiz reads safe intro through the trusted RPC, not raw question/options tables', async () => {
  const { client, calls } = createClient({
    rpcResponses: {
      get_quiz_intro: {
        data: [{
          quiz_id: QUIZ_ID,
          title: 'Quiz thật',
          description: 'Mô tả',
          pass_score: 70,
          time_limit_minutes: 10,
          max_attempts: 2,
          question_count: 4,
          attempts_used: 1,
          attempts_remaining: 1,
          has_active_attempt: false,
          topic_open: true
        }],
        error: null
      }
    }
  });
  const quiz = await createQuizService(client).getQuiz(QUIZ_ID);
  assert.equal(quiz.title, 'Quiz thật');
  assert.equal(quiz.attemptsRemaining, 1);
  assert.deepEqual(calls.filter(([name]) => name === 'from'), []);
  assert.deepEqual(calls[0], ['rpc', 'get_quiz_intro', { p_quiz_id: QUIZ_ID }]);
});

test('start, question load and submit use only trusted RPC boundaries', async () => {
  const { client, calls } = createClient({
    rpcResponses: {
      start_quiz_attempt: {
        data: [{ attempt_id: ATTEMPT_ID, quiz_id: QUIZ_ID, attempt_number: 1, started_at: 'now', resumed: false }],
        error: null
      },
      get_attempt_questions: {
        data: [{
          question_id: QUESTION_ID,
          question_type: 'SINGLE',
          question_text: 'Q',
          points: 1,
          question_order: 1,
          option_id: OPTION_ID,
          option_text: 'O',
          option_order: 1,
          is_correct: true
        }],
        error: null
      },
      submit_quiz_attempt: {
        data: [{ attempt_id: ATTEMPT_ID, score: 100, passed: true, submitted_at: 'later', attempt_number: 1 }],
        error: null
      }
    }
  });
  const service = createQuizService(client);
  const started = await service.startAttempt(QUIZ_ID);
  const questions = await service.getAttemptQuestions(ATTEMPT_ID);
  const result = await service.submitAttempt(ATTEMPT_ID, [{ question_id: QUESTION_ID, selected_option_ids: [OPTION_ID] }]);
  assert.equal(started.attemptId, ATTEMPT_ID);
  assert.equal(questions[0].options[0].id, OPTION_ID);
  assert.equal('is_correct' in questions[0].options[0], false);
  assert.equal(result.passed, true);
  assert.deepEqual(calls.filter(([name]) => name === 'from'), []);
});

test('listQuizzes only requests safe quiz metadata', async () => {
  const { client, calls } = createClient({
    tableResponse: {
      data: [{ id: QUIZ_ID, topic_id: '55555555-5555-4555-8555-555555555555', title: 'Quiz', status: 'PUBLISHED' }],
      error: null
    }
  });
  const quizzes = await createQuizService(client).listQuizzes('55555555-5555-4555-8555-555555555555');
  assert.equal(quizzes[0].title, 'Quiz');
  const select = calls.find(([name]) => name === 'select');
  assert.equal(select[1].includes('is_correct'), false);
});

test('malformed IDs and answer payloads fail before a request', async () => {
  const { client, calls } = createClient();
  const service = createQuizService(client);
  await assert.rejects(() => service.getQuiz('bad'), (error) => error.code === 'INVALID_ID');
  await assert.rejects(() => service.submitAttempt(ATTEMPT_ID, {}), (error) => error.code === 'INVALID_SUBMISSION');
  assert.equal(calls.length, 0);
});

test('business errors survive while database details remain generic', () => {
  assert.equal(normalizeQuizError({ message: 'MAX_ATTEMPTS_REACHED' }).code, 'MAX_ATTEMPTS_REACHED');
  assert.equal(normalizeQuizError({ message: 'permission denied for table quiz_options' }).code, 'REQUEST_FAILED');
  assert.equal(normalizeQuizError(new QuizServiceError('ATTEMPT_EXPIRED', 'ATTEMPT_EXPIRED')).code, 'ATTEMPT_EXPIRED');
});
