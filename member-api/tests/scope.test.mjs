import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/errors.js';
import { assertOrgCodeInScope, resolveEffectiveOrgScope } from '../src/scope.js';

test('resolveEffectiveOrgScope: a single non-global role resolves to its own org_codes', () => {
  const scope = resolveEffectiveOrgScope([{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CDA'] }]);
  assert.deepEqual(scope, { isGlobal: false, orgCodes: ['CDA'] });
});

test('resolveEffectiveOrgScope: a YOUTH_ADMIN scoped to a parent organization keeps whatever descendant codes the resolver already computed', () => {
  // The resolver (P5.5-02, is_organization_in_scope) already performs descendant traversal server
  // side — Member API just trusts the returned list as-is, it never recomputes a hierarchy itself.
  const scope = resolveEffectiveOrgScope([
    { role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['PARENT', 'CHILD-1', 'CHILD-2'] },
  ]);
  assert.deepEqual(scope, { isGlobal: false, orgCodes: ['PARENT', 'CHILD-1', 'CHILD-2'] });
});

test('resolveEffectiveOrgScope: any role with is_global true makes the whole scope global, org_codes null', () => {
  const scope = resolveEffectiveOrgScope([{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }]);
  assert.deepEqual(scope, { isGlobal: true, orgCodes: null });
});

test('resolveEffectiveOrgScope: SYSTEM_ADMIN + YOUTH_ADMIN dual role — by the time roles reach here, only the YOUTH_ADMIN row survived resolver filtering, so the scope is exactly the YOUTH_ADMIN scope, never global by default', () => {
  // Reproduces what resolve-member-scope's selectMemberManagementRoleRows/buildMemberScopeRoles
  // (P5.5-02, already merged) actually hands the Member API for a SYSTEM_ADMIN + YOUTH_ADMIN
  // dual-role user: SYSTEM_ADMIN is not a Member Management role code at all, so it is dropped
  // upstream and never appears in this array.
  const scope = resolveEffectiveOrgScope([{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CDA'] }]);
  assert.deepEqual(scope, { isGlobal: false, orgCodes: ['CDA'] });
});

test('resolveEffectiveOrgScope: multiple non-global roles union their org_codes without duplicates', () => {
  const scope = resolveEffectiveOrgScope([
    { role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CDA'] },
    { role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CDA', 'CDB'] },
  ]);
  assert.equal(scope.isGlobal, false);
  assert.deepEqual([...scope.orgCodes].sort(), ['CDA', 'CDB']);
});

test('resolveEffectiveOrgScope: zero roles resolves to a non-global, zero-organization scope (fail closed, never "unrestricted")', () => {
  const scope = resolveEffectiveOrgScope([]);
  assert.deepEqual(scope, { isGlobal: false, orgCodes: [] });
});

test('assertOrgCodeInScope: allows any code when global', () => {
  assert.doesNotThrow(() => assertOrgCodeInScope({ isGlobal: true, orgCodes: null }, 'ANYTHING'));
});

test('assertOrgCodeInScope: allows a code inside the resolved scope', () => {
  assert.doesNotThrow(() => assertOrgCodeInScope({ isGlobal: false, orgCodes: ['CDA', 'CDB'] }, 'CDA'));
});

test('assertOrgCodeInScope: rejects (403) a code outside the resolved scope — organization spoofing', () => {
  assert.throws(
    () => assertOrgCodeInScope({ isGlobal: false, orgCodes: ['CDA'] }, 'CDB'),
    (err) => err instanceof ApiError && err.status === 403
  );
});

test('assertOrgCodeInScope: rejects any code when the resolved scope is empty', () => {
  assert.throws(
    () => assertOrgCodeInScope({ isGlobal: false, orgCodes: [] }, 'CDA'),
    (err) => err instanceof ApiError && err.status === 403
  );
});
