import { normalizeQuizError } from './quizService.js';

export const NQ_QUIZ_ID = '7c620b81-6dc6-4a57-9908-3a1f68652a00';

export function createNqQuizService(client) {
  async function ensureActor() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw normalizeQuizError(sessionError);

    let user = sessionData?.session?.user ?? null;
    if (!user) {
      const { data, error } = await client.auth.signInAnonymously({
        options: { data: { purpose: 'nq_quiz_guest' } }
      });
      if (error || !data?.user) {
        throw normalizeQuizError(error || new Error('Anonymous quiz session was not created.'));
      }
      user = data.user;
    }

    if (user.is_anonymous) {
      const { error } = await client.rpc('ensure_nq_quiz_guest');
      if (error) throw normalizeQuizError(error);
    }
    return user;
  }

  async function request(name, args) {
    await ensureActor();
    const { data, error } = await client.rpc(name, args);
    if (error) throw normalizeQuizError(error);
    return data;
  }
  return {
    ensureActor,
    attempt(action, attemptId = null, questionId = null, optionId = null) {
      return request('nq_attempt', { p_action: action, p_attempt_id: attemptId,
        p_question_id: questionId, p_option_id: optionId });
    },
    lookup(search, offset = 0) {
      return request('lookup_nq_questions', { p_search: search, p_offset: offset });
    }
  };
}

export function secondsRemaining(state, elapsedMilliseconds) {
  if (!state || state.status !== 'IN_PROGRESS') return 0;
  return Math.max(0, Math.ceil((Date.parse(state.expires_at) - Date.parse(state.server_now) - elapsedMilliseconds) / 1000));
}

export function formatQuizTime(seconds) {
  const bounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(bounded / 60).toString().padStart(2, '0')}:${(bounded % 60).toString().padStart(2, '0')}`;
}
