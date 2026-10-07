import { normalizeQuizError } from './quizService.js';

export const NQ_QUIZ_ID = '7c620b81-6dc6-4a57-9908-3a1f68652a00';
export const PASS_SCORE_PERCENT = 80;
export const PASS_MIN_CORRECT = 24;
export const TOTAL_QUESTIONS = 30;

export function validateParticipantInfo(fullName, organizationName) {
  const errors = {};
  const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
  const trimmedOrg = typeof organizationName === 'string' ? organizationName.trim() : '';

  if (!trimmedName) {
    errors.fullName = 'Vui lòng nhập họ và tên.';
  } else if (trimmedName.length < 2 || trimmedName.length > 120) {
    errors.fullName = 'Họ và tên phải từ 2 đến 120 ký tự.';
  }

  if (!trimmedOrg) {
    errors.organizationName = 'Vui lòng nhập đơn vị công tác.';
  } else if (trimmedOrg.length < 2 || trimmedOrg.length > 180) {
    errors.organizationName = 'Đơn vị phải từ 2 đến 180 ký tự.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      fullName: trimmedName,
      organizationName: trimmedOrg
    }
  };
}

export function formatCertificateDate(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function sanitizeCertificateFileName(fullName) {
  const clean = typeof fullName === 'string' ? fullName.trim() : '';
  if (!clean) return 'Chung-nhan-NQ13.png';
  // Normalize accents to ASCII
  const ascii = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `Chung-nhan-NQ13-${ascii || 'NGUOI-DU-THI'}.png`;
}

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
      return request('nq_attempt', {
        p_action: action,
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_option_id: optionId
      });
    },
    saveParticipant(attemptId, fullName, organizationName) {
      return request('nq_save_participant', {
        p_attempt_id: attemptId,
        p_full_name: fullName,
        p_organization_name: organizationName
      });
    },
    verifyCertificate(code) {
      return client.rpc('verify_nq_certificate', { p_code: code }).then(({ data, error }) => {
        if (error) throw normalizeQuizError(error);
        return data;
      });
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
