// P5.5-03 — turns the P5.5-02 resolver's `roles` assertion into a single effective Member
// Management scope for the current request. This is the ONLY place CRUD code should ask "is this
// organization allowed for this caller" — see
// docs/phase-5-5/00-member-management-architecture.md muc 7/12/13 and the P5.5-03 owner decision on
// BRANCH_OFFICER write permission (both YOUTH_ADMIN and BRANCH_OFFICER are enforced identically
// here: uniformly against whatever `org_codes` the resolver already computed for that role's
// `scope_organization_id`, including any descendant-organization traversal the resolver already
// performed. Member API never re-derives an org hierarchy itself).
import { ApiError } from './errors.js';

// `roles` is always already filtered to Member-Management-capable role codes (YOUTH_ADMIN,
// BRANCH_OFFICER) by resolve-member-scope / deriveMemberManagementAuthorization — a lone
// SYSTEM_ADMIN, or SYSTEM_ADMIN alongside YOUTH_ADMIN, never reaches this function with anything
// but the YOUTH_ADMIN row(s) (or zero rows, which authorizeMemberManagement already turned into a
// 403 before this is ever called).
export function resolveEffectiveOrgScope(roles) {
  const isGlobal = roles.some((role) => role.is_global === true);
  if (isGlobal) {
    // Global scope (muc 7: YOUTH_ADMIN scope-toan-cuc) is not representable as a finite org_codes
    // list — the resolver deliberately returns org_codes: [] for a global role rather than
    // enumerating every organization. `orgCodes: null` marks "no org restriction", distinct from
    // "restricted to zero organizations".
    return { isGlobal: true, orgCodes: null };
  }
  const orgCodes = new Set();
  for (const role of roles) {
    for (const code of role.org_codes) orgCodes.add(code);
  }
  // A non-global caller with an empty resolved set is restricted to zero organizations — fail
  // closed, never "empty scope = unrestricted" (muc 22 threat #3/#14).
  return { isGlobal: false, orgCodes: [...orgCodes] };
}

// Throws (403) if `code` is outside the caller's scope. Used on create, where there is no existing
// row to filter a query by — the target organization has to be checked explicitly before insert.
export function assertOrgCodeInScope(scope, code) {
  if (scope.isGlobal) return;
  if (!scope.orgCodes.includes(code)) {
    throw new ApiError(403, 'forbidden', 'Organization code is outside your permitted scope.');
  }
}
