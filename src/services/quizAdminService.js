const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const QUIZ_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'];
export const QUIZ_QUESTION_TYPES = ['SINGLE', 'MULTIPLE'];

const BUSINESS_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE', 'TOPIC_NOT_FOUND', 'QUIZ_NOT_FOUND', 'QUESTION_NOT_FOUND', 'OPTION_NOT_FOUND',
  'QUIZ_SCOPE_DENIED', 'QUIZ_NOT_DRAFT', 'QUIZ_HAS_ATTEMPTS_IMMUTABLE', 'QUIZ_CONTENT_NOT_EDITABLE',
  'QUIZ_CONTENT_NOT_DELETABLE', 'INVALID_QUIZ_TITLE', 'INVALID_PASS_SCORE', 'INVALID_TIME_LIMIT',
  'INVALID_MAX_ATTEMPTS', 'INVALID_QUESTION_TYPE', 'INVALID_QUESTION', 'INVALID_POINTS', 'INVALID_OPTION',
  'INVALID_SORT_ORDER', 'INVALID_QUIZ_TRANSITION', 'QUIZ_REQUIRES_QUESTION', 'QUESTION_REQUIRES_OPTIONS',
  'SINGLE_REQUIRES_ONE_CORRECT', 'MULTIPLE_REQUIRES_CORRECT'
]);

export class QuizAdminError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'QuizAdminError';
    this.code = code;
    this.cause = cause;
  }
}

function normalizeError(error) {
  if (error instanceof QuizAdminError) return error;
  const values = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  const code = values.find((value) => BUSINESS_CODES.has(value))
    ?? [...BUSINESS_CODES].find((known) => typeof error?.message === 'string' && error.message.includes(known));
  if (code) return new QuizAdminError(code, code, error);
  if (error?.status === 401 || error?.status === 403) return new QuizAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.', error);
  return new QuizAdminError('REQUEST_FAILED', 'Unable to complete the quiz admin request.', error);
}

export function normalizeQuizAdminError(error) { return normalizeError(error); }

function assertUuid(value, name) {
  if (!UUID_PATTERN.test(String(value))) throw new QuizAdminError('INVALID_ID', `${name} must be a UUID.`);
}

function unwrap(request) {
  return Promise.resolve(request).then(({ data, error }) => {
    if (error) throw error;
    return data;
  }).catch((error) => { throw normalizeError(error); });
}

export function mapAdminQuizRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    description: row.description,
    passScore: Number(row.pass_score),
    timeLimitMinutes: row.time_limit_minutes,
    maxAttempts: row.max_attempts,
    shuffleQuestions: Boolean(row.shuffle_questions),
    shuffleOptions: Boolean(row.shuffle_options),
    status: row.status,
    questionCount: Number(row.question_count ?? 0),
    submittedAttemptCount: Number(row.submitted_attempt_count ?? 0)
  };
}

export function mapAdminQuizAuthoringRows(rows) {
  const first = rows?.[0];
  if (!first) return null;
  const quiz = {
    id: first.quiz_id,
    topicId: first.topic_id,
    title: first.quiz_title,
    description: first.quiz_description,
    passScore: Number(first.pass_score),
    timeLimitMinutes: first.time_limit_minutes,
    maxAttempts: first.max_attempts,
    shuffleQuestions: Boolean(first.shuffle_questions),
    shuffleOptions: Boolean(first.shuffle_options),
    status: first.quiz_status,
    submittedAttemptCount: Number(first.submitted_attempt_count ?? 0),
    questions: []
  };
  const questionMap = new Map();
  for (const row of rows) {
    if (!row.question_id) continue;
    let question = questionMap.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        type: row.question_type,
        text: row.question_text,
        explanation: row.explanation,
        points: Number(row.question_points),
        sortOrder: row.question_sort_order,
        options: []
      };
      questionMap.set(question.id, question);
      quiz.questions.push(question);
    }
    if (row.option_id) {
      question.options.push({
        id: row.option_id,
        text: row.option_text,
        isCorrect: Boolean(row.option_is_correct),
        sortOrder: row.option_sort_order
      });
    }
  }
  return quiz;
}

export function createQuizAdminService(client) {
  return {
    async listQuizzes(topicId) {
      assertUuid(topicId, 'topicId');
      const rows = await unwrap(client.rpc('get_admin_quizzes', { p_topic_id: topicId }));
      return (rows ?? []).map(mapAdminQuizRow).filter(Boolean);
    },

    async getAuthoring(quizId) {
      assertUuid(quizId, 'quizId');
      const rows = await unwrap(client.rpc('get_admin_quiz_authoring', { p_quiz_id: quizId }));
      return mapAdminQuizAuthoringRows(rows ?? []);
    },

    async createDraft(topicId, form) {
      assertUuid(topicId, 'topicId');
      return unwrap(client.rpc('create_quiz_draft', {
        p_topic_id: topicId,
        p_title: String(form?.title ?? '').trim(),
        p_description: form?.description || null,
        p_pass_score: Number(form?.passScore ?? 50),
        p_time_limit_minutes: form?.timeLimitMinutes ? Number(form.timeLimitMinutes) : null,
        p_max_attempts: form?.maxAttempts ? Number(form.maxAttempts) : null,
        p_shuffle_questions: Boolean(form?.shuffleQuestions),
        p_shuffle_options: Boolean(form?.shuffleOptions)
      }));
    },

    async updateMetadata(quizId, form) {
      assertUuid(quizId, 'quizId');
      return unwrap(client.rpc('update_quiz_metadata', {
        p_quiz_id: quizId,
        p_title: String(form?.title ?? '').trim(),
        p_description: form?.description || null,
        p_pass_score: Number(form?.passScore ?? 50),
        p_time_limit_minutes: form?.timeLimitMinutes ? Number(form.timeLimitMinutes) : null,
        p_max_attempts: form?.maxAttempts ? Number(form.maxAttempts) : null,
        p_shuffle_questions: Boolean(form?.shuffleQuestions),
        p_shuffle_options: Boolean(form?.shuffleOptions)
      }));
    },

    async setStatus(quizId, status) {
      assertUuid(quizId, 'quizId');
      if (!['PUBLISHED', 'CLOSED'].includes(status)) throw new QuizAdminError('INVALID_QUIZ_TRANSITION', 'Invalid transition.');
      return unwrap(client.rpc('set_quiz_status', { p_quiz_id: quizId, p_status: status }));
    },

    async upsertQuestion(quizId, question) {
      assertUuid(quizId, 'quizId');
      if (!QUIZ_QUESTION_TYPES.includes(question?.type)) throw new QuizAdminError('INVALID_QUESTION_TYPE', 'Invalid question type.');
      return unwrap(client.rpc('upsert_quiz_question', {
        p_quiz_id: quizId,
        p_question_type: question.type,
        p_question_text: String(question.text ?? '').trim(),
        p_explanation: question.explanation || null,
        p_points: Number(question.points ?? 1),
        p_sort_order: Number(question.sortOrder ?? 0),
        p_question_id: question.id || null
      }));
    },

    async deleteQuestion(quizId, questionId) {
      assertUuid(quizId, 'quizId');
      assertUuid(questionId, 'questionId');
      return unwrap(client.rpc('delete_quiz_question', { p_quiz_id: quizId, p_question_id: questionId }));
    },

    async upsertOption(questionId, option) {
      assertUuid(questionId, 'questionId');
      return unwrap(client.rpc('upsert_quiz_option', {
        p_question_id: questionId,
        p_option_text: String(option?.text ?? '').trim(),
        p_is_correct: Boolean(option?.isCorrect),
        p_sort_order: Number(option?.sortOrder ?? 0),
        p_option_id: option?.id || null
      }));
    },

    async deleteOption(questionId, optionId) {
      assertUuid(questionId, 'questionId');
      assertUuid(optionId, 'optionId');
      return unwrap(client.rpc('delete_quiz_option', { p_question_id: questionId, p_option_id: optionId }));
    },

    async reorderQuestions(quizId, questionIds) {
      assertUuid(quizId, 'quizId');
      return unwrap(client.rpc('reorder_quiz_questions', { p_quiz_id: quizId, p_question_ids: questionIds }));
    },

    async reorderOptions(questionId, optionIds) {
      assertUuid(questionId, 'questionId');
      return unwrap(client.rpc('reorder_quiz_options', { p_question_id: questionId, p_option_ids: optionIds }));
    }
  };
}
