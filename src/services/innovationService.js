export class InnovationServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'InnovationServiceError';
    this.code = code;
    this.cause = cause;
  }
}

const PROBLEM_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED: 'Đăng nhập để gửi bài toán này.',
  REQUIRED_FIELDS_MISSING: 'Hãy nhập tên vấn đề và mô tả.',
  TEXT_TOO_LONG: 'Nội dung vượt quá độ dài cho phép.'
};

const PROBLEM_ERROR_CODES = {
  UNAUTHENTICATED: 'AUTHENTICATION_REQUIRED',
  REQUIRED_FIELDS_MISSING: 'REQUIRED_FIELDS_MISSING',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG'
};

function normalizeProblemError(error, data) {
  const details = `${data?.error || ''} ${error?.code || ''} ${error?.message || ''}`;
  const matchedCode = Object.keys(PROBLEM_ERROR_CODES).find((value) => details.includes(value));
  const code = matchedCode ? PROBLEM_ERROR_CODES[matchedCode] : 'REQUEST_FAILED';
  return new InnovationServiceError(
    code,
    PROBLEM_ERROR_MESSAGES[code] || 'Chưa gửi được bài toán. Vui lòng thử lại.',
    error
  );
}

export function mapInnovationProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.project_category || null,
    summary: row.solution_summary || row.results_summary || row.problem_statement || '',
    team: row.team_name || null,
    progress: Number.isInteger(row.progress_percent) ? row.progress_percent : 0,
    status: row.project_status || 'Đã công bố'
  };
}

export function createInnovationService(client) {
  return {
    async listProjects() {
      const { data, error } = await client
        .from('innovation_projects')
        .select('id, title, project_category, solution_summary, results_summary, problem_statement, team_name, progress_percent, project_status')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw new InnovationServiceError('REQUEST_FAILED', 'Không thể tải công trình công bố.', error);
      return (data || []).map(mapInnovationProject).filter(Boolean);
    },

    async submitProblem({ title, description } = {}) {
      const normalizedTitle = String(title ?? '').trim();
      const normalizedDescription = String(description ?? '').trim();
      if (!normalizedTitle || !normalizedDescription) {
        throw new InnovationServiceError('REQUIRED_FIELDS_MISSING', PROBLEM_ERROR_MESSAGES.REQUIRED_FIELDS_MISSING);
      }
      if (normalizedTitle.length > 200 || normalizedDescription.length > 6000) {
        throw new InnovationServiceError('TEXT_TOO_LONG', PROBLEM_ERROR_MESSAGES.TEXT_TOO_LONG);
      }

      try {
        // The Edge Function resolves organization_id from the authenticated profile.
        const { data, error } = await client.functions.invoke('submit-innovation-problem', {
          body: { title: normalizedTitle, pain_point: normalizedDescription }
        });
        if (error || !data?.success) throw normalizeProblemError(error, data);
        return data.problem;
      } catch (error) {
        if (error instanceof InnovationServiceError) throw error;
        throw normalizeProblemError(error);
      }
    }
  };
}
