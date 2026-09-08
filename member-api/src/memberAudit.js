// P5.5-07 — application audit writes for Member mutations (muc 16). This module never decides
// WHETHER to audit an already-successful mutation (that's always true) — it only shapes WHAT gets
// written, and is always called from inside the same transaction as the mutation it is auditing
// (memberRepository.js / importRepository.js), never as a separate best-effort side-call. A
// rejected/failed mutation writes no row at all: the caller only reaches this module after the
// mutation's own INSERT/UPDATE has already succeeded within the open transaction.
const AUDITED_FIELDS = [
  'full_name',
  'date_of_birth',
  'gender',
  'work_unit_code',
  'job_title',
  'member_status',
  'political_theory_level',
  'youth_position',
  'youth_board_position',
  // external_ref_note deliberately excluded — muc 16: "khong can audit thay doi cosmetic nhu ghi chu".
];

// Never logged here, ever, regardless of what a caller passes: bearer tokens, shared secrets, DB
// credentials, or any Excel file content are not Member fields and can never reach this function
// through beforeData/afterData in the first place (muc 16's "khong log" list) — there is no
// allowlist entry for them to slip through even by mistake.
function pickAuditedFields(source) {
  const picked = {};
  for (const field of AUDITED_FIELDS) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}

export function buildCreateAuditPayload(payload) {
  return pickAuditedFields(payload);
}

// Only the fields the patch actually touched AND that are on the audited allowlist. `beforeRow`
// must be the row's state read within the SAME transaction, before the UPDATE ran (a `SELECT ...
// FOR UPDATE` in memberRepository.js) — never a stale/cached read from an earlier request.
export function buildUpdateAuditPayload(beforeRow, patch) {
  const changedAuditedFields = Object.keys(patch).filter((field) => AUDITED_FIELDS.includes(field));
  if (changedAuditedFields.length === 0) return null;
  const beforeData = {};
  const afterData = {};
  for (const field of changedAuditedFields) {
    beforeData[field] = beforeRow[field] ?? null;
    afterData[field] = patch[field];
  }
  return { beforeData, afterData };
}

// `client` is always a connected client already inside an open transaction (never the bare pool —
// see memberRepository.js/importRepository.js) so the mutation and its audit row commit or roll
// back together, atomically.
export async function insertAuditLog(client, { actorUserId, action, memberId, importJobId = null, beforeData, afterData }) {
  await client.query(
    `INSERT INTO member_audit_logs (actor_user_id, action, member_id, import_job_id, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [actorUserId, action, memberId, importJobId, JSON.stringify(beforeData ?? null), JSON.stringify(afterData ?? null)]
  );
}

function serializeAuditRow(row) {
  return {
    audit_id: row.audit_id,
    actor_user_id: row.actor_user_id,
    action: row.action,
    member_id: row.member_id,
    import_job_id: row.import_job_id,
    before_data: row.before_data,
    after_data: row.after_data,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const MAX_AUDIT_PAGE_SIZE = 100;
const DEFAULT_AUDIT_PAGE_SIZE = 20;

// Read path for a single member's own audit trail. Scope is the caller's responsibility (the
// route handler already resolved `getMemberById` in scope before calling this — muc 22 threat #3:
// never a second, unscoped way to reach the same data).
export async function listMemberAuditLogs(pool, { memberId, limit, offset }) {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_AUDIT_PAGE_SIZE) : DEFAULT_AUDIT_PAGE_SIZE;
  const boundedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;

  const countResult = await pool.query(`SELECT count(*)::int AS total FROM member_audit_logs WHERE member_id = $1`, [memberId]);
  const { rows } = await pool.query(
    `SELECT * FROM member_audit_logs WHERE member_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [memberId, boundedLimit, boundedOffset]
  );
  return { logs: rows.map(serializeAuditRow), total: countResult.rows[0].total, limit: boundedLimit, offset: boundedOffset };
}
