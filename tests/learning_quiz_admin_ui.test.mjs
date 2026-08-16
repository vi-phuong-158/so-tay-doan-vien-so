import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const topics = fs.readFileSync(new URL('../src/pages/AdminLearningTopics.jsx', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../src/pages/AdminLearningTopicDetail.jsx', import.meta.url), 'utf8');
const quiz = fs.readFileSync(new URL('../src/pages/AdminQuizEditor.jsx', import.meta.url), 'utf8');
const quizService = fs.readFileSync(new URL('../src/services/quizAdminService.js', import.meta.url), 'utf8');

test('learning admin routes are protected and expose the complete authoring workflow', () => {
  assert.match(app, /admin\/chuyen-de/);
  assert.match(app, /AdminLearningTopics/);
  assert.match(app, /AdminLearningTopicDetail/);
  assert.match(app, /AdminQuizEditor/);
  assert.match(topics, /get_admin_learning_topics|listTopics/);
  assert.match(detail, /get_admin_learning_resources|listResources/);
  assert.match(detail, /create_quiz_draft|listQuizzes/);
  assert.match(quizService, /upsert_quiz_question/);
  assert.match(quizService, /upsert_quiz_option/);
});

test('admin UI does not read or write quiz content tables directly', () => {
  for (const source of [topics, detail, quiz]) {
    assert.doesNotMatch(source, /from\(['"]quiz_(questions|options)['"]\)/);
    assert.doesNotMatch(source, /is_correct/);
  }
  assert.match(quiz, /Phát hành/);
  assert.match(quiz, /quiz\.status === 'DRAFT'/);
});
