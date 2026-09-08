import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same extraction technique as AuthGuard.test.mjs — Guards.jsx contains JSX, which plain Node
// cannot parse, but getMemberManagementGuardAction is deliberately plain JS (mirroring
// getAuthGuardAction) so it can be evaluated directly out of the file's source text.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const guardsJsx = fs.readFileSync(path.join(__dirname, '../src/components/Guards.jsx'), 'utf-8');
const logicMatch = guardsJsx.match(
  /export const getMemberManagementGuardAction = \(\{ loading, roles, requireImportRole = false \}\) => \{([\s\S]*?)\n\};/
);
if (!logicMatch) throw new Error('Could not find getMemberManagementGuardAction');

const getMemberManagementGuardAction = new Function('{ loading, roles, requireImportRole = false }', logicMatch[1]);

test('loading session', () => {
  assert.equal(getMemberManagementGuardAction({ loading: true, roles: [] }), 'LOADING_SESSION');
});

test('YOUTH_ADMIN renders children (list/detail routes)', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['YOUTH_ADMIN'] }), 'RENDER_CHILDREN');
});

test('BRANCH_OFFICER renders children (list/detail routes)', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['BRANCH_OFFICER'] }), 'RENDER_CHILDREN');
});

test('a lone SYSTEM_ADMIN is FORBIDDEN — no bypass, unlike RoleGuard (mục 7/12/24 fix F1)', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['SYSTEM_ADMIN'] }), 'FORBIDDEN');
});

test('an unrelated role (e.g. MEMBER, INNOVATION_MEMBER) is FORBIDDEN', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['MEMBER'] }), 'FORBIDDEN');
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: [] }), 'FORBIDDEN');
});

test('requireImportRole=true: YOUTH_ADMIN renders children, BRANCH_OFFICER is FORBIDDEN (mục 7/12 — import is YOUTH_ADMIN-only)', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['YOUTH_ADMIN'], requireImportRole: true }), 'RENDER_CHILDREN');
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['BRANCH_OFFICER'], requireImportRole: true }), 'FORBIDDEN');
});

test('requireImportRole=true: SYSTEM_ADMIN alone is still FORBIDDEN, no bypass', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['SYSTEM_ADMIN'], requireImportRole: true }), 'FORBIDDEN');
});

test('SYSTEM_ADMIN held alongside YOUTH_ADMIN renders children — the YOUTH_ADMIN grant, not a SYSTEM_ADMIN bypass', () => {
  assert.equal(getMemberManagementGuardAction({ loading: false, roles: ['SYSTEM_ADMIN', 'YOUTH_ADMIN'] }), 'RENDER_CHILDREN');
});
