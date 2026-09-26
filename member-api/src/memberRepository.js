// P5.5-03 — the only module that touches the `members` table directly. Every query is
// parameterized (no string-built values in SQL text — column NAMES that appear inline come only
// from the fixed allowlists in memberValidation.js, never from a raw client-supplied key), and
// every response row is built field-by-field (never `SELECT *` flowing to the client — muc 9 of the
// P5.5-03 task instructions).
import { isUuid } from './memberValidation.js';
import { buildCreateAuditPayload, buildUpdateAuditPayload, insertAuditLog } from './memberAudit.js';

// account_user_id is intentionally excluded from the response shape: it is an authorization
// mapping (muc 11), not part of the member profile surface, and is set only via a separate,
// not-yet-built linking workflow — never exposed or writable through ordinary Member CRUD.
const SELECT_COLUMNS = `
  member_id,
  full_name,
  to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
  gender,
  work_unit_code,
  job_title,
  member_status,
  political_theory_level,
  youth_position,
  youth_board_position,
  external_ref_note,
  created_at,
  updated_at
`;

function serializeRow(row) {
  return {
    member_id: row.member_id,
    full_name: row.full_name,
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    work_unit_code: row.work_unit_code,
    job_title: row.job_title,
    member_status: row.member_status,
    political_theory_level: row.political_theory_level,
    youth_position: row.youth_position,
    youth_board_position: row.youth_board_position,
    external_ref_note: row.external_ref_note,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

// Escapes LIKE/ILIKE metacharacters in a user-supplied search term so they are matched literally
// (paired with `ESCAPE '\'` at the call site). This is a correctness measure (a name that happens
// to contain "%" should not act as a wildcard), not an injection defense — the term is always sent
// as a bound parameter, never concatenated into SQL text, so it cannot alter query semantics either
// way (muc 22 / P5.5-03 SQL-metacharacter-safety requirement).
function escapeLikePattern(term) {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// P5.5-04 mục 14/23 — fixed allowlist mapping a validated `sort` key (memberValidation.js) to a
// literal ORDER BY clause. `sort` is never interpolated as a raw client value; it can only ever
// select one of these two hardcoded strings. Both include `member_id ASC` as a deterministic
// tie-breaker so ordering stays stable across pages even when many rows share the same
// full_name/updated_at (muc 23 negative test #14 — stable ordering for duplicate names).
const ORDER_BY_CLAUSES = {
  full_name_asc: 'full_name ASC, member_id ASC',
  updated_at_desc: 'updated_at DESC, member_id ASC',
};

export async function listMembers(pool, { scope, filters, limit, offset, sort }) {
  const conditions = [];
  const params = [];

  if (!scope.isGlobal) {
    // Fail closed by construction: an empty orgCodes array makes `= ANY($n::text[])` match zero
    // rows, never "no restriction" (muc 22 threat #3/#14).
    params.push(scope.orgCodes);
    conditions.push(`work_unit_code = ANY($${params.length}::text[])`);
  }
  if (filters.workUnitCode) {
    params.push(filters.workUnitCode);
    conditions.push(`work_unit_code = $${params.length}`);
  }
  if (filters.memberStatus) {
    params.push(filters.memberStatus);
    conditions.push(`member_status = $${params.length}`);
  }
  if (filters.youthPosition) {
    params.push(filters.youthPosition);
    conditions.push(`youth_position = $${params.length}`);
  }
  if (filters.youthBoardPosition) {
    params.push(filters.youthBoardPosition);
    conditions.push(`youth_board_position = $${params.length}`);
  }
  if (filters.politicalTheoryLevel) {
    params.push(filters.politicalTheoryLevel);
    conditions.push(`political_theory_level = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${escapeLikePattern(filters.search)}%`);
    conditions.push(`member_immutable_unaccent(full_name) ILIKE member_immutable_unaccent($${params.length}) ESCAPE '\\'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderByClause = ORDER_BY_CLAUSES[sort] ?? ORDER_BY_CLAUSES.full_name_asc;

  const countResult = await pool.query(`SELECT count(*)::int AS total FROM members ${whereClause}`, params);
  const total = countResult.rows[0].total;

  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM members ${whereClause} ORDER BY ${orderByClause} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { members: rows.map(serializeRow), total, limit, offset };
}

// Returns null both when the id does not exist and when it exists but is outside `scope` — the
// caller must respond identically (404) either way, never distinguishing the two (muc 22 threat #2:
// no existence leak via IDOR/enumeration).
export async function getMemberById(pool, { scope, id }) {
  if (!isUuid(id)) return null;
  const params = [id];
  let sql = `SELECT ${SELECT_COLUMNS} FROM members WHERE member_id = $1`;
  if (!scope.isGlobal) {
    params.push(scope.orgCodes);
    sql += ` AND work_unit_code = ANY($2::text[])`;
  }
  const { rows } = await pool.query(sql, params);
  return rows.length > 0 ? serializeRow(rows[0]) : null;
}

// `payload` keys always come from parseCreatePayload's fixed, allowlist-checked output — never
// arbitrary client-supplied keys — so building the column list from Object.keys here cannot become
// a SQL-injection or mass-assignment vector.
//
// P5.5-07: the INSERT and its audit row are one transaction — a mutation is never visible without
// its audit row, and a rolled-back mutation never leaves a dangling "success" audit row behind
// (muc 16: audit must not depend on a fragile distributed transaction; the fix here is simpler —
// there IS no second database, so an ordinary local transaction is sufficient).
export async function createMember(pool, { payload, actorUserId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const columns = Object.keys(payload);
    const values = columns.map((column) => payload[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const { rows } = await client.query(
      `INSERT INTO members (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${SELECT_COLUMNS}`,
      values
    );
    const created = rows[0];
    await insertAuditLog(client, {
      actorUserId,
      action: 'CREATE',
      memberId: created.member_id,
      beforeData: null,
      afterData: buildCreateAuditPayload(payload),
    });
    await client.query('COMMIT');
    return serializeRow(created);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// P5.5-07: locks the target row first (`SELECT ... FOR UPDATE`, same scope predicate as the UPDATE
// itself) so the audit row's `before_data` reflects the exact state this transaction is about to
// change from — not a stale read from before some concurrent request, and not a second unscoped
// path to the row (a lock outside `scope` never happens; the lock query returns nothing, same as
// today's "not found or out of scope" 404 parity). Returns null uniformly for "no such id" and "id
// exists but out of scope", same anti-enumeration contract as getMemberById. `patch` keys always
// come from parsePatchPayload's allowlist-checked output (work_unit_code can never appear here —
// muc 6 immutability contract).
export async function updateMember(pool, { scope, id, patch, actorUserId }) {
  if (!isUuid(id)) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockParams = [id];
    let lockSql = `SELECT ${SELECT_COLUMNS} FROM members WHERE member_id = $1`;
    if (!scope.isGlobal) {
      lockParams.push(scope.orgCodes);
      lockSql += ` AND work_unit_code = ANY($2::text[])`;
    }
    lockSql += ' FOR UPDATE';
    const beforeResult = await client.query(lockSql, lockParams);
    if (beforeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const beforeRow = beforeResult.rows[0];

    const columns = Object.keys(patch);
    const setClauses = columns.map((column, index) => `${column} = $${index + 2}`);
    const params = [id, ...columns.map((column) => patch[column])];
    const { rows } = await client.query(
      `UPDATE members SET ${setClauses.join(', ')} WHERE member_id = $1 RETURNING ${SELECT_COLUMNS}`,
      params
    );
    const updated = rows[0];

    const auditPayload = buildUpdateAuditPayload(beforeRow, patch);
    if (auditPayload) {
      await insertAuditLog(client, {
        actorUserId,
        action: 'UPDATE',
        memberId: id,
        beforeData: auditPayload.beforeData,
        afterData: auditPayload.afterData,
      });
    }

    await client.query('COMMIT');
    return serializeRow(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
