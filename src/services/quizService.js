export const QUIZ_PAGE_SIZE = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUSINESS_ERROR_CODES = new Set([
  'ACCOUNT_NOT_ACTIVE',
  'QUIZ_NOT_ACCESSIBLE',
  'QUIZ_NOT_PUBLISHED',
  'TOPIC_CLOSED',
  'QUIZ_HAS_NO_QUESTIONS',
  'MAX_ATTEMPTS_REACHED',
  'ATTEMPT_NOT_FOUND',
  'ATTEMPT_SCOPE_DENIED',
  'ATTEMPT_ALREADY_SUBMITTED',
  'ATTEMPT_EXPIRED',
  'INVALID_SUBMISSION',
  'INVALID_QUESTION_FOR_QUIZ',
  'INVALID_OPTION_FOR_QUESTION',
  'DUPLICATE_QUESTION_IN_SUBMISSION',
  'INVALID_SINGLE_SELECTION',
  'ATTEMPT_NOT_SUBMITTED'
]);

const QUIZ_SELECT = `
  id,
  topic_id,
  title,
  description,
  pass_score,
  time_limit_minutes,
  max_attempts,
  shuffle_questions,
  shuffle_options,
  status
`;

export class QuizServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'QuizServiceError';
    this.code = code;
    this.cause = cause;
  }
}

function assertUuid(value, fieldName) {
  if (!UUID_PATTERN.test(String(value))) {
    throw new QuizServiceError('INVALID_ID', `${fieldName} must be a UUID.`);
  }
}

function businessCode(error) {
  const candidates = [error?.code, error?.message, error?.context?.code, error?.context?.error];
  return candidates.find((candidate) => BUSINESS_ERROR_CODES.has(candidate));
}

export function normalizeQuizError(error) {
  if (error instanceof QuizServiceError) return error;
  const code = businessCode(error);
  if (code) return new QuizServiceError(code, code, error);
  if (error?.status === 401 || error?.status === 403) {
    return new QuizServiceError('AUTHENTICATION_REQUIRED', 'Authentication is required to access quizzes.', error);
  }
  return new QuizServiceError('REQUEST_FAILED', 'Unable to complete the quiz request.', error);
}

function mapQuizRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    description: row.description ?? null,
    passScore: Number(row.pass_score ?? 0),
    timeLimitMinutes: row.time_limit_minutes ?? null,
    maxAttempts: row.max_attempts ?? null,
    shuffleQuestions: Boolean(row.shuffle_questions),
    shuffleOptions: Boolean(row.shuffle_options),
    status: row.status
  };
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function mapIntroRow(row) {
  if (!row) return null;
  return {
    ...mapQuizRow(row),
    questionCount: Number(row.question_count ?? 0),
    attemptsUsed: Number(row.attempts_used ?? 0),
    attemptsRemaining: row.attempts_remaining == null ? null : Number(row.attempts_remaining),
    hasActiveAttempt: Boolean(row.has_active_attempt),
    topicOpen: Boolean(row.topic_open)
  };
}

export function mapAttemptQuestionRows(rows) {
  const grouped = new Map();
  for (const row of rows ?? []) {
    if (!row?.question_id || !row?.option_id) continue;
    let question = grouped.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        type: row.question_type,
        text: row.question_text,
        points: Number(row.points ?? 0),
        order: Number(row.question_order ?? 0),
        options: []
      };
      grouped.set(row.question_id, question);
    }
    question.options.push({
      id: row.option_id,
      text: row.option_text,
      order: Number(row.option_order ?? 0)
    });
  }
  return [...grouped.values()]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((question) => ({
      ...question,
      options: question.options.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    }));
}

export function mapAttemptResultRows(rows) {
  return (rows ?? []).map((row) => ({
    questionId: row.question_id,
    questionText: row.question_text,
    explanation: row.explanation ?? null,
    points: Number(row.points ?? 0),
    selectedOptionIds: Array.isArray(row.selected_option_ids) ? row.selected_option_ids : [],
    correctOptionIds: Array.isArray(row.correct_option_ids) ? row.correct_option_ids : [],
    isCorrect: Boolean(row.is_correct),
    awardedPoints: Number(row.awarded_points ?? 0)
  }));
}

async function rpc(client, name, args) {
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  } catch (error) {
    throw normalizeQuizError(error);
  }
}

export function createQuizService(client) {
  return {
    async listQuizzes(topicId) {
      assertUuid(topicId, 'topicId');
      try {
        const { data, error } = await client
          .from('quizzes')
          .select(QUIZ_SELECT)
          .eq('topic_id', topicId)
          .order('title', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(mapQuizRow);
      } catch (error) {
        throw normalizeQuizError(error);
      }
    },

    async getQuiz(quizId) {
      assertUuid(quizId, 'quizId');
      const data = await rpc(client, 'get_quiz_intro', { p_quiz_id: quizId });
      const mapped = mapIntroRow(firstRow(data));
      if (!mapped) throw new QuizServiceError('QUIZ_NOT_ACCESSIBLE', 'QUIZ_NOT_ACCESSIBLE');
      return mapped;
    },

    async startAttempt(quizId) {
      assertUuid(quizId, 'quizId');
      const data = await rpc(client, 'start_quiz_attempt', { p_quiz_id: quizId });
      const row = firstRow(data);
      if (!row) throw new QuizServiceError('REQUEST_FAILED', 'The quiz attempt could not be started.');
      return {
        attemptId: row.attempt_id,
        quizId: row.quiz_id,
        attemptNumber: Number(row.attempt_number),
        startedAt: row.started_at,
        expiresAt: row.expires_at ?? null,
        resumed: Boolean(row.resumed)
      };
    },

    async getAttemptQuestions(attemptId) {
      assertUuid(attemptId, 'attemptId');
      const data = await rpc(client, 'get_attempt_questions', { p_attempt_id: attemptId });
      return mapAttemptQuestionRows(data);
    },

    async submitAttempt(attemptId, answers) {
      assertUuid(attemptId, 'attemptId');
      if (!Array.isArray(answers)) throw new QuizServiceError('INVALID_SUBMISSION', 'Answers must be an array.');
      const data = await rpc(client, 'submit_quiz_attempt', {
        p_attempt_id: attemptId,
        p_answers: answers
      });
      const row = firstRow(data);
      if (!row) throw new QuizServiceError('REQUEST_FAILED', 'The quiz submission returned no result.');
      return {
        attemptId: row.attempt_id,
        score: Number(row.score ?? 0),
        passed: Boolean(row.passed),
        submittedAt: row.submitted_at,
        attemptNumber: Number(row.attempt_number)
      };
    },

    async getMyAttemptResult(attemptId) {
      assertUuid(attemptId, 'attemptId');
      const data = await rpc(client, 'get_attempt_result', { p_attempt_id: attemptId });
      return mapAttemptResultRows(data);
    }
  };
}
