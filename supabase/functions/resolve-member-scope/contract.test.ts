import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { buildMemberScopeRoles, hasTrustedWorkerSecret, selectMemberManagementRoleRows } from './contract.ts';

Deno.test('hasTrustedWorkerSecret: matching secrets pass', () => {
  assertEquals(hasTrustedWorkerSecret('shared-secret', 'shared-secret'), true);
});

Deno.test('hasTrustedWorkerSecret: mismatched secrets fail', () => {
  assertEquals(hasTrustedWorkerSecret('shared-secret', 'other-secret'), false);
});

Deno.test('hasTrustedWorkerSecret: missing actual or expected fails closed', () => {
  assertEquals(hasTrustedWorkerSecret(null, 'shared-secret'), false);
  assertEquals(hasTrustedWorkerSecret('shared-secret', undefined), false);
  assertEquals(hasTrustedWorkerSecret(null, undefined), false);
});

Deno.test('selectMemberManagementRoleRows: keeps only YOUTH_ADMIN and BRANCH_OFFICER', () => {
  const rows = [
    { role_code: 'SYSTEM_ADMIN', scope_organization_id: null },
    { role_code: 'YOUTH_ADMIN', scope_organization_id: 'org-1' },
    { role_code: 'BRANCH_OFFICER', scope_organization_id: 'org-2' },
    { role_code: 'MEMBER', scope_organization_id: 'org-3' },
    { role_code: 'INNOVATION_MEMBER', scope_organization_id: null },
  ];
  const result = selectMemberManagementRoleRows(rows);
  assertEquals(result.map((r) => r.role_code).sort(), ['BRANCH_OFFICER', 'YOUTH_ADMIN']);
});

Deno.test('selectMemberManagementRoleRows: a lone SYSTEM_ADMIN row yields nothing (zero Member Management permission)', () => {
  const rows = [{ role_code: 'SYSTEM_ADMIN', scope_organization_id: null }];
  assertEquals(selectMemberManagementRoleRows(rows), []);
});

Deno.test('selectMemberManagementRoleRows: malformed/unexpected role_code values are excluded, not thrown on', () => {
  const rows = [
    { role_code: 'youth_admin', scope_organization_id: null }, // wrong case
    { role_code: 'YOUTH_ADMIN ', scope_organization_id: null }, // trailing space
    { role_code: '', scope_organization_id: null },
    // deno-lint-ignore no-explicit-any
    { role_code: null as any, scope_organization_id: null },
    // deno-lint-ignore no-explicit-any
    { role_code: 42 as any, scope_organization_id: null },
  ];
  assertEquals(selectMemberManagementRoleRows(rows), []);
});

Deno.test('buildMemberScopeRoles: global scope (scope_organization_id null) is marked is_global with no org_codes lookup', () => {
  const rows = [{ role_code: 'YOUTH_ADMIN', scope_organization_id: null }];
  const roles = buildMemberScopeRoles(rows, () => {
    throw new Error('must not be called for a global-scope role');
  });
  assertEquals(roles, [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }]);
});

Deno.test('buildMemberScopeRoles: org-scoped role resolves org_codes via the injected lookup', () => {
  const rows = [{ role_code: 'BRANCH_OFFICER', scope_organization_id: 'org-cda' }];
  const roles = buildMemberScopeRoles(rows, (scopeOrgId) => (scopeOrgId === 'org-cda' ? ['CDA'] : []));
  assertEquals(roles, [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: ['CDA'] }]);
});

Deno.test('buildMemberScopeRoles: SYSTEM_ADMIN + YOUTH_ADMIN dual-role yields only the YOUTH_ADMIN scope, never global', () => {
  const rows = [
    { role_code: 'SYSTEM_ADMIN', scope_organization_id: null },
    { role_code: 'YOUTH_ADMIN', scope_organization_id: 'org-cdc' },
  ];
  const roles = buildMemberScopeRoles(rows, (scopeOrgId) => (scopeOrgId === 'org-cdc' ? ['CDC'] : []));
  assertEquals(roles, [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: ['CDC'] }]);
});

Deno.test('buildMemberScopeRoles: no relevant roles yields an empty list (Member API must deny)', () => {
  const rows = [{ role_code: 'MEMBER', scope_organization_id: 'org-1' }];
  assertEquals(buildMemberScopeRoles(rows, () => ['SHOULD_NOT_BE_USED']), []);
});
