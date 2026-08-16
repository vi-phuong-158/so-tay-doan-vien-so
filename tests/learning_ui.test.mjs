import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AVAILABILITY_LABELS,
  RESOURCE_TYPE_LABELS,
  availabilityTone,
  availabilityWindowLabel,
  formatLearningDate,
  learningErrorMessage,
  resourceActions,
  resourceTypeIcon,
  resourceTypeLabel
} from '../src/lib/learningDisplay.mjs';

const listSource = fs.readFileSync(new URL('../src/pages/LearningTopics.jsx', import.meta.url), 'utf8');
const detailSource = fs.readFileSync(new URL('../src/pages/LearningTopicDetail.jsx', import.meta.url), 'utf8');
const knowledgeSource = fs.readFileSync(new URL('../src/pages/Knowledge.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('learning routes are registered under Tri thức', () => {
  assert.match(appSource, /path="tri-thuc\/chuyen-de"/);
  assert.match(appSource, /path="tri-thuc\/chuyen-de\/:topicId"/);
  assert.match(appSource, /path="tri-thuc\/trac-nghiem\/:quizId"/);
  assert.match(appSource, /import \{ LearningTopics \} from '\.\/pages\/LearningTopics'/);
  assert.match(appSource, /import \{ LearningTopicDetail \} from '\.\/pages\/LearningTopicDetail'/);
});

test('dates render in vi-VN or degrade to a dash', () => {
  assert.equal(formatLearningDate('2026-08-16T00:00:00Z'), '16/08/2026');
  assert.equal(formatLearningDate(null), '—');
  assert.equal(formatLearningDate('rubbish'), '—');
});

test('availability window copes with either bound being absent', () => {
  assert.match(availabilityWindowLabel({ openAt: '2026-08-01T00:00:00Z', closeAt: '2026-09-01T00:00:00Z' }), /–/);
  assert.match(availabilityWindowLabel({ openAt: '2026-08-01T00:00:00Z' }), /^Từ /);
  assert.match(availabilityWindowLabel({ closeAt: '2026-09-01T00:00:00Z' }), /^Đến /);
  assert.equal(availabilityWindowLabel({}), 'Không giới hạn thời gian');
  assert.equal(availabilityWindowLabel(null), 'Không giới hạn thời gian');
});

test('availability tone pairs with a visible label, never colour alone', () => {
  assert.equal(availabilityTone('OPEN'), 'success');
  assert.equal(availabilityTone('UPCOMING'), 'info');
  assert.equal(availabilityTone('CLOSED'), 'neutral');
  assert.equal(availabilityTone('WAT'), 'neutral');

  for (const key of ['OPEN', 'UPCOMING', 'CLOSED']) {
    assert.ok(AVAILABILITY_LABELS[key], `missing label for ${key}`);
  }
  assert.match(listSource, /status-\$\{availabilityTone\(availability\)\}[\s\S]{0,120}AVAILABILITY_LABELS\[availability\]/);
  assert.match(detailSource, /status-\$\{availabilityTone\(availability\)\}[\s\S]{0,120}AVAILABILITY_LABELS\[availability\]/);
});

test('every resource type has a label and an icon', () => {
  for (const type of ['TEXT', 'DOCUMENT', 'VIDEO', 'IMAGE', 'LINK']) {
    assert.ok(RESOURCE_TYPE_LABELS[type], `missing label for ${type}`);
    assert.ok(resourceTypeIcon(type), `missing icon for ${type}`);
  }
  assert.equal(resourceTypeLabel('SOMETHING_NEW'), 'Tài liệu', 'unknown types degrade safely');
  assert.equal(resourceTypeIcon('SOMETHING_NEW'), 'file');
});

test('resource actions are derived from what the row actually carries', () => {
  assert.deepEqual(resourceActions({ externalUrl: 'https://a.test', hasFile: false, content: null }),
    { canOpenLink: true, canDownload: false, hasText: false });
  assert.deepEqual(resourceActions({ externalUrl: null, hasFile: true, storagePath: 'x/resources/a.pdf', content: 'c' }),
    { canOpenLink: false, canDownload: true, hasText: true });
  assert.deepEqual(resourceActions(null), { canOpenLink: false, canDownload: false, hasText: false });
  // hasFile without a path must not offer a download.
  assert.equal(resourceActions({ hasFile: true, storagePath: null }).canDownload, false);
});

test('error copy separates not-found/forbidden from a generic failure', () => {
  assert.match(learningErrorMessage({ code: 'TOPIC_NOT_FOUND' }), /không có quyền/i);
  assert.match(learningErrorMessage({ code: 'AUTHENTICATION_REQUIRED' }), /đăng nhập/i);
  assert.match(learningErrorMessage({ code: 'REQUEST_FAILED' }), /thử lại/i);
  for (const code of ['TOPIC_NOT_FOUND', 'REQUEST_FAILED', 'INVALID_STORAGE_PATH']) {
    assert.doesNotMatch(learningErrorMessage({ code }), /sql|rpc|postgre|relation|policy/i);
  }
});

test('the topic list reads real data with loading, error+retry, empty and pagination', () => {
  assert.match(listSource, /createLearningService/);
  assert.doesNotMatch(listSource, /from '\.\.\/data\/mock'/);

  assert.match(listSource, /loading && <Skeleton/);
  assert.match(listSource, /role="alert"/);
  assert.match(listSource, /Thử lại/);
  assert.match(listSource, /<EmptyState/);
  assert.match(listSource, /hasMore &&/);
  assert.match(listSource, /Tải thêm/);

  // Search goes to the service, not to an already-fetched array.
  assert.match(listSource, /listTopics\(\{ page: targetPage, pageSize: LEARNING_PAGE_SIZE, search \}\)/);
  assert.doesNotMatch(listSource, /topics\.filter\(/);
});

test('the topic list never requests a signed URL while rendering', () => {
  assert.doesNotMatch(listSource, /getResourceDownloadUrl/);
  assert.doesNotMatch(listSource, /createSignedUrl/);
});

test('detail renders resources in server order and handles the not-found case', () => {
  assert.match(detailSource, /listResources\(topicId\)/);
  assert.match(detailSource, /resources\.map\(\(resource\) =>/);
  assert.doesNotMatch(detailSource, /resources\.sort\(/, 'ordering comes from the service, not the view');

  assert.match(detailSource, /learningErrorMessage\(error\)/);
  assert.match(detailSource, /Về danh sách/);
  assert.match(detailSource, /Thử lại/);
  // A resources failure must not blank out a topic the user may read.
  assert.match(detailSource, /listResources\(topicId\)\.catch\(\(\) => \[\]\)/);
});

test('detail requests a signed URL only from an explicit click, with a double-click guard', () => {
  assert.match(detailSource, /const handleDownload = async \(resource\) => \{[\s\S]*?getResourceDownloadUrl/);
  const loadBlock = detailSource.slice(
    detailSource.indexOf('const loadTopic'),
    detailSource.indexOf('const handleDownload')
  );
  assert.doesNotMatch(loadBlock, /getResourceDownloadUrl/, 'signed URLs are not prefetched on load');

  assert.match(detailSource, /onClick=\{\(\) => onDownload\(resource\)\}/);
  assert.match(detailSource, /disabled=\{busy\}/);
  assert.match(detailSource, /if \(!resource\?\.storagePath \|\| downloadingId\) return;/);
});

test('external links are rendered safely and only when the service allowed them', () => {
  assert.match(detailSource, /rel="noopener noreferrer"/);
  assert.match(detailSource, /target="_blank"/);
  assert.match(detailSource, /actions\.canOpenLink &&/);
  // The href comes from the already-sanitized mapper field, not from a raw row value.
  assert.match(detailSource, /href=\{resource\.externalUrl\}/);
  assert.doesNotMatch(detailSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(listSource, /dangerouslySetInnerHTML/);
});

test('the Knowledge topics tab now reads real data instead of the mock', () => {
  assert.match(knowledgeSource, /createLearningService/);
  assert.match(knowledgeSource, /TopicCard/);
  assert.doesNotMatch(knowledgeSource, /from '\.\.\/data\/mock'/);
  assert.match(knowledgeSource, /to="\/tri-thuc\/chuyen-de"/);
  // The topics tab has its own loading/error state, independent of the documents tab.
  assert.match(knowledgeSource, /topicsLoading && <Skeleton/);
  assert.match(knowledgeSource, /learningErrorMessage\(topicsError\)/);
});

test('topic detail links published quizzes through the real quiz service', () => {
  assert.match(detailSource, /createQuizService/);
  assert.match(detailSource, /listQuizzes\(topicId\)/);
  assert.match(detailSource, /tri-thuc\/trac-nghiem\//);
  assert.match(detailSource, /quizzes\.map/);
});
