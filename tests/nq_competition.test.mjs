import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { competitionCsv, createNqCompetitionService, filterCompetitionUnits, normalizeUnitSearch } from '../src/services/nqCompetitionService.js';
import { createNqQuizService } from '../src/services/nqQuizService.js';

const source = JSON.parse(readFileSync(new URL('../scripts/data/nq-competition-units.json', import.meta.url), 'utf8'));
test('frozen government catalogue contains exactly 148 distinct NFC units, 133 communes and 15 wards', () => {
  assert.equal(new URL(source.source).hostname, 'xaydungchinhsach.chinhphu.vn');
  assert.equal(source.units.length, 148);
  for (const key of ['code', 'id', 'name']) assert.equal(new Set(source.units.map((u) => u[key])).size, 148);
  assert.equal(source.units.filter((u) => u.unit_type === 'xa').length, 133);
  assert.equal(source.units.filter((u) => u.unit_type === 'phuong').length, 15);
  assert.ok(source.units.every((u) => u.name.normalize('NFC') === u.name && /^PT-NQ-\d{3}$/.test(u.code)));
  assert.ok(source.units.some((u) => u.name === 'Xã Thu Cúc'));
  assert.ok(source.units.some((u) => u.name === 'Xã Trung Sơn'));
});
test('search handles Vietnamese accents, decomposed Unicode and đ without changing display names', () => {
  assert.equal(normalizeUnitSearch('  Việt Trì '.normalize('NFD')), 'viet tri');
  assert.equal(normalizeUnitSearch('Đào Xá'), 'dao xa');
  const units = [{ unit_name: 'Phường Việt Trì', unit_type: 'phuong', participants: 2, ranking_status: 'READY' },
    { unit_name: 'Xã Đào Xá', unit_type: 'xa', participants: 0, ranking_status: 'INCOMPLETE_ROSTER' }];
  assert.equal(filterCompetitionUnits(units, 'viet')[0].unit_name, 'Phường Việt Trì');
  assert.equal(filterCompetitionUnits(units, '', 'xa', 'missing').length, 1);
  assert.equal(filterCompetitionUnits(units, '', '', 'ready').length, 1);
  assert.equal(filterCompetitionUnits(units, '', '', 'incomplete').length, 1);
  assert.equal(filterCompetitionUnits(units, 'khong co').length, 0);
});
test('catalogue reads are shared and cached; search does not send RPCs', async () => {
  let queries = 0;
  const builder = { select() { return this; }, eq() { return this; }, order() { queries++; return Promise.resolve({ data: source.units }); } };
  const service = createNqCompetitionService({ from(name) { assert.equal(name, 'nq_competition_units'); return builder; } });
  const [a, b] = await Promise.all([service.listUnits(), service.listUnits()]);
  assert.strictEqual(a, b);
  await service.listUnits();
  assert.equal(queries, 1);
});
test('failed catalogue request can retry and is never retained as a valid cache', async () => {
  let count = 0;
  const builder = { select() { return this; }, eq() { return this; }, order() { return Promise.resolve(++count === 1 ? { error: { message: 'network' } } : { data: source.units }); } };
  const service = createNqCompetitionService({ from: () => builder });
  await assert.rejects(service.listUnits());
  assert.equal((await service.listUnits()).length, 148);
});
test('UUID registration sends no trusted organization text; admin requests are separate RPCs', async () => {
  const calls = [];
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) },
    rpc: async (name, args) => { calls.push([name, args]); return { data: {} }; } };
  await createNqQuizService(client).saveUnitParticipant('attempt', 'Nguyễn Văn A', source.units[0].id);
  assert.deepEqual(calls[0], ['nq_save_unit_participant', { p_attempt_id: 'attempt', p_full_name: 'Nguyễn Văn A', p_unit_id: source.units[0].id }]);
  const service = createNqCompetitionService(client);
  await service.dashboard();
  await service.updateEligibleMembers('PT-NQ-001', null);
  await service.adminParticipants('PT-NQ-001', 50);
  assert.equal(calls[1][0], 'nq_competition_dashboard');
  assert.deepEqual(calls[2], ['nq_update_eligible_members', { p_unit_code: 'PT-NQ-001', p_eligible_members: null }]);
  assert.deepEqual(calls[3], ['nq_admin_unit_participants', { p_unit_code: 'PT-NQ-001', p_offset: 50 }]);
});
test('aggregate CSV preserves Unicode and unknown denominators, excludes private fields and neutralizes formula injection', () => {
  const csv = competitionCsv([{ unit_name: '=HYPERLINK("evil")', participants: 1, eligible_members: null,
    full_name: 'PRIVATE_NAME', user_id: 'PRIVATE_ID', attempts: 3 }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=HYPERLINK(""evil"")"`));
  assert.ok(csv.includes('","","1","","3"'));
  assert.ok(!csv.includes('PRIVATE_'));
});
