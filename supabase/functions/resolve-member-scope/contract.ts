// Pure logic for resolve-member-scope — kept free of any Supabase client/network call so it can be
// unit-tested without a database. See docs/phase-5-5/00-member-management-architecture.md muc 7/13.

export type UserRoleRow = { role_code: string; scope_organization_id: string | null };

export type MemberScopeRole = {
  role_code: 'YOUTH_ADMIN' | 'BRANCH_OFFICER';
  is_global: boolean;
  org_codes: string[];
};

// Only these two role codes ever carry Member Management permission. SYSTEM_ADMIN is deliberately
// absent: per muc 7/12 of the architecture, a lone SYSTEM_ADMIN has ZERO Member Management
// permission, and SYSTEM_ADMIN held alongside YOUTH_ADMIN grants exactly the YOUTH_ADMIN scope, not
// a global bypass. Excluding SYSTEM_ADMIN from this list entirely (rather than special-casing it)
// makes that invariant true by construction instead of by a conditional someone could get wrong.
const MEMBER_MANAGEMENT_ROLE_CODES = new Set(['YOUTH_ADMIN', 'BRANCH_OFFICER']);

export function hasTrustedWorkerSecret(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

// Filters a raw user_roles result down to rows that can ever carry Member Management permission.
// Exact match only (case-sensitive, no trim) — a malformed/unexpected role_code value fails closed
// by being excluded, never by throwing.
export function selectMemberManagementRoleRows(rows: UserRoleRow[]): UserRoleRow[] {
  return rows.filter((row) => typeof row.role_code === 'string' && MEMBER_MANAGEMENT_ROLE_CODES.has(row.role_code));
}

// Shapes the final resolver response from the filtered role rows. `orgCodesForScope` is injected
// (rather than querying inside this function) so this stays a pure function for unit testing; the
// caller (index.ts) resolves org codes via the member_scope_org_codes() RPC.
export function buildMemberScopeRoles(
  rows: UserRoleRow[],
  orgCodesForScope: (scopeOrganizationId: string) => string[]
): MemberScopeRole[] {
  return selectMemberManagementRoleRows(rows).map((row) => {
    const role_code = row.role_code as MemberScopeRole['role_code'];
    if (row.scope_organization_id === null) {
      return { role_code, is_global: true, org_codes: [] };
    }
    return { role_code, is_global: false, org_codes: orgCodesForScope(row.scope_organization_id) };
  });
}
