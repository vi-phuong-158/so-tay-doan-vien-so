import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLearningStoragePath,
  createLearningAdminService,
  mapAdminTopicRow,
  normalizeLearningFileName
} from '../src/services/learningAdminService.js';
import { createQuizAdminService, mapAdminQuizAuthoringRows } from '../src/services/quizAdminService.js';

const TOPIC_ID = '11111111-1111-4111-8111-111111111111';
const QUIZ_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';
const OBJECT_ID = '55555555-5555-4555-8555-555555555555';

function client({ responses = {}, errors = {} } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({ data: responses[name] ?? true, error: errors[name] ?? null }); },
      storage: { from(bucket) { calls.push(['storage.from', bucket]); return { upload(path, file, options) { calls.push(['upload', path, file.name, options]); return Promise.resolve({ data: { path }, error: null }); }, remove(paths) { calls.push(['remove', paths]); return Promise.resolve({ data: paths, error: null }); } }; } }
    }
  };
}

test('learning admin list/create and resource upload stay on trusted RPCs', async () => {
  const fixture = client({ responses: { get_admin_learning_topics: [{ id: TOPIC_ID, title: 'Chuyên đề', total_count: 1 }], create_learning_topic_draft: TOPIC_ID, upsert_learning_resource: 'resource-id' } });
  const service = createLearningAdminService(fixture.client, { createObjectId: () => OBJECT_ID });
  const listed = await service.listTopics();
  assert.equal(listed.items[0].title, 'Chuyên đề');
  await service.createTopic({ title: '  Mới  ', visibilityLevel: 'INTERNAL_YOUTH' });
  await service.uploadResourceFile(TOPIC_ID, { name: '../../tail-lieu.pdf', size: 20 }, { title: 'Tài liệu' });
  assert.equal(fixture.calls.some(([kind]) => kind === 'from'), false);
  assert.ok(fixture.calls.some(([, name]) => name === 'create_learning_topic_draft'));
  assert.ok(fixture.calls.some(([, name]) => name === 'upsert_learning_resource'));
  assert.equal(fixture.calls.find(([kind]) => kind === 'upload')[1].includes('..'), false);
});

test('learning admin path and mapper are bounded', () => {
  assert.equal(normalizeFileNameForTest(), 'hoc-lieu');
  assert.equal(buildLearningStoragePath({ topicId: TOPIC_ID, objectId: OBJECT_ID, fileName: '../../x y.pdf' }), `${TOPIC_ID}/resources/${OBJECT_ID}-x-y.pdf`);
  assert.equal(mapAdminTopicRow({ id: TOPIC_ID, title: 'x', total_count: '4' }).totalCount, 4);
});

function normalizeFileNameForTest() { return normalizeLearningFileName(''); }

test('quiz admin authoring maps the answer key only on the admin service boundary', async () => {
  const fixture = client({ responses: { get_admin_quiz_authoring: [{ quiz_id: QUIZ_ID, topic_id: TOPIC_ID, quiz_title: 'Quiz', pass_score: 50, quiz_status: 'DRAFT', submitted_attempt_count: 0, question_id: QUESTION_ID, question_type: 'SINGLE', question_text: 'Q', question_points: 1, question_sort_order: 0, option_id: OPTION_ID, option_text: 'Đúng', option_is_correct: true, option_sort_order: 0 }] } });
  const service = createQuizAdminService(fixture.client);
  const quiz = await service.getAuthoring(QUIZ_ID);
  assert.equal(quiz.questions[0].options[0].isCorrect, true);
  await service.upsertOption(QUESTION_ID, { id: OPTION_ID, text: 'Sửa', isCorrect: false, sortOrder: 0 });
  assert.equal(fixture.calls.find(([, name]) => name === 'upsert_quiz_option')[2].p_is_correct, false);
  assert.equal(fixture.calls.some(([kind]) => kind === 'from'), false);
  assert.equal(mapAdminQuizAuthoringRows([]), null);
});
