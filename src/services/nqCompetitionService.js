import { normalizeQuizError } from './quizService.js';

export const NQ_COMPETITION_PATH = '/tri-thuc/nq13/thanh-tich';

export function normalizeUnitSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().trim();
}

export function filterCompetitionUnits(units, search, type = '', participation = '') {
  const query = normalizeUnitSearch(search);
  return units.filter((unit) => normalizeUnitSearch(unit.unit_name).includes(query)
    && (!type || unit.unit_type === type)
    && (!participation
      || (participation === 'joined' && unit.participants > 0)
      || (participation === 'missing' && unit.participants === 0)
      || (participation === 'ready' && unit.ranking_status === 'READY')
      || (participation === 'incomplete' && unit.ranking_status !== 'READY')));
}

export function competitionCsv(units) {
  const escape = (value) => {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ['STT', 'Đơn vị', 'Số thuộc diện', 'Người tham gia', 'Tỷ lệ tham gia', 'Lượt thi',
    'Điểm trung bình', 'Số đạt', 'Tỷ lệ đạt', 'Điểm thi đua', 'Xếp hạng'];
  return '\uFEFF' + [header, ...units.map((u, i) => [i + 1, u.unit_name, u.eligible_members,
    u.participants, u.completion_rate, u.attempts, u.average_best_score, u.pass_count,
    u.pass_rate, u.competition_score, u.rank])].map((row) => row.map(escape).join(',')).join('\r\n');
}

export function createNqCompetitionService(client) {
  let cachedUnits;
  let expiresAt = 0;
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw normalizeQuizError(error);
    return data;
  }
  return {
    listUnits() {
      if (!cachedUnits || Date.now() >= expiresAt) {
        expiresAt = Date.now() + 5 * 60 * 1000;
        cachedUnits = Promise.resolve(client.from('nq_competition_units')
          .select('id,code,name,short_name,unit_type,display_order')
          .eq('active', true).order('display_order')).then(({ data, error }) => {
          if (error) { cachedUnits = null; throw normalizeQuizError(error); }
          return data || [];
        });
      }
      return cachedUnits;
    },
    dashboard: () => rpc('nq_competition_dashboard'),
    updateEligibleMembers: (code, count) => rpc('nq_update_eligible_members', {
      p_unit_code: code, p_eligible_members: count
    }),
    adminParticipants: (code, offset = 0) => rpc('nq_admin_unit_participants', {
      p_unit_code: code, p_offset: offset
    })
  };
}
