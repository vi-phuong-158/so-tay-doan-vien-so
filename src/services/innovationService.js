export class InnovationServiceError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'InnovationServiceError';
    this.code = code;
    this.cause = cause;
  }
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
    }
  };
}
