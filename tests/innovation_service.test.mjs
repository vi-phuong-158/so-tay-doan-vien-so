import test from 'node:test';
import assert from 'node:assert/strict';
import { createInnovationService, InnovationServiceError } from '../src/services/innovationService.js';

test('submitProblem calls the existing Edge Function with only the supported fields', async () => {
  let invocation;
  const service = createInnovationService({
    functions: {
      invoke: async (name, options) => {
        invocation = { name, options };
        return { data: { success: true, problem: { id: 'problem-1', status: 'NEW' } }, error: null };
      }
    }
  });

  const result = await service.submitProblem({ title: '  Rút ngắn thời gian tổng hợp  ', description: '  Mô tả khó khăn  ' });

  assert.deepEqual(result, { id: 'problem-1', status: 'NEW' });
  assert.deepEqual(invocation, {
    name: 'submit-innovation-problem',
    options: { body: { title: 'Rút ngắn thời gian tổng hợp', pain_point: 'Mô tả khó khăn' } }
  });
});

test('submitProblem rejects missing required content before invoking the function', async () => {
  let invoked = false;
  const service = createInnovationService({
    functions: { invoke: async () => { invoked = true; return { data: {}, error: null }; } }
  });

  await assert.rejects(
    service.submitProblem({ title: 'Tên vấn đề', description: ' ' }),
    (error) => error instanceof InnovationServiceError && error.code === 'REQUIRED_FIELDS_MISSING'
  );
  assert.equal(invoked, false);
});

test('submitProblem returns a safe message for Edge Function failures', async () => {
  const service = createInnovationService({
    functions: {
      invoke: async () => ({ data: { error: 'Error: UNAUTHENTICATED' }, error: new Error('internal detail') })
    }
  });

  await assert.rejects(
    service.submitProblem({ title: 'Tên vấn đề', description: 'Mô tả đủ dùng' }),
    (error) => error.code === 'AUTHENTICATION_REQUIRED' && error.message === 'Đăng nhập để gửi bài toán này.'
  );
});
