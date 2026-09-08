// P5.5-05 — Excel import job persistence: staging writes, preview reads, and the atomic/idempotent
// confirm-commit transaction. This is the only module that writes to member_import_jobs/
// member_import_job_rows or, on commit, to `members` itself for an import. Every transactional
// operation here takes an explicit `client` (from pool.connect()) rather than the bare `pool`, so a
// multi-statement operation (finalize-parse, confirm/commit) is guaranteed to run on one connection
// inside one BEGIN/COMMIT — reusing memberRepository's pool-based single-statement helpers here
// would silently break that guarantee.
import { ApiError } from './errors.js';

const JOB_ROW_CHUNK_SIZE = 500;

function serializeJob(row) {
  return {
    import_job_id: row.import_job_id,
    status: row.status,
    created_by_user_id: row.created_by_user_id,
    source_filename: row.source_filename,
    total_rows: row.total_rows,
    valid_rows: row.valid_rows,
    invalid_rows: row.invalid_rows,
    possible_duplicate_rows: row.possible_duplicate_rows,
    warning_rows: row.warning_rows,
    committed_count: row.committed_count,
    failure_reason: row.failure_reason,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function serializeJobRow(row) {
  return {
    row_number: row.row_number,
    row_status: row.row_status,
    normalized_data: row.normalized_data,
    errors: row.errors,
    duplicate_candidate_member_id: row.duplicate_candidate_member_id,
    duplicate_reason: row.duplicate_reason,
    committed_member_id: row.committed_member_id,
  };
}

// created_by_user_id always comes from the P5.5-02 resolver result for THIS request (server.js /
// memberScope.js) — never a client-supplied field, same trust boundary as every other Member
// mutation in this codebase.
export async function createImportJob(pool, { createdByUserId, sourceFilename }) {
  const { rows } = await pool.query(
    `INSERT INTO member_import_jobs (created_by_user_id, source_filename, status)
     VALUES ($1, $2, 'UPLOADED')
     RETURNING *`,
    [createdByUserId, sourceFilename]
  );
  return serializeJob(rows[0]);
}

// Only transitions a job that is still UPLOADED — a job already past that point failing here would
// indicate a logic bug, not a real workbook-parse failure, so this deliberately does not touch it.
export async function markJobFailed(pool, { importJobId, reasonCode }) {
  await pool.query(
    `UPDATE member_import_jobs SET status = 'FAILED', failure_reason = $2
     WHERE import_job_id = $1 AND status = 'UPLOADED'`,
    [importJobId, reasonCode]
  );
}

async function insertStagingRowsChunk(client, importJobId, rows) {
  const columns = 7;
  const placeholders = [];
  const values = [];
  rows.forEach((row, index) => {
    const base = index * columns;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::jsonb, $${base + 6}, $${base + 7})`
    );
    values.push(
      importJobId,
      row.rowNumber,
      row.status,
      JSON.stringify(row.normalized ?? {}),
      JSON.stringify(row.errors ?? []),
      row.duplicateCandidateMemberId ?? null,
      row.duplicateReason ?? null
    );
  });
  await client.query(
    `INSERT INTO member_import_job_rows
       (import_job_id, row_number, row_status, normalized_data, errors, duplicate_candidate_member_id, duplicate_reason)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

// Persists the full validated+deduped row set and moves the job from UPLOADED to READY_FOR_CONFIRM
// in one transaction — a reader can never observe a job whose summary counts don't match its own
// staged rows (muc 10: staging must hold validation status/errors/candidate duplicate per row
// before any preview is served).
export async function finalizeParsedJob(pool, { importJobId, rows, summary }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += JOB_ROW_CHUNK_SIZE) {
      await insertStagingRowsChunk(client, importJobId, rows.slice(i, i + JOB_ROW_CHUNK_SIZE));
    }
    await client.query(
      `UPDATE member_import_jobs
       SET status = 'READY_FOR_CONFIRM', total_rows = $2, valid_rows = $3, invalid_rows = $4,
           possible_duplicate_rows = $5, warning_rows = $6
       WHERE import_job_id = $1`,
      [importJobId, summary.total, summary.valid, summary.invalid, summary.possibleDuplicate, summary.warning]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getImportJob(pool, { importJobId }) {
  const { rows } = await pool.query(`SELECT * FROM member_import_jobs WHERE import_job_id = $1`, [importJobId]);
  return rows.length > 0 ? serializeJob(rows[0]) : null;
}

// muc 9: "Chủ job hoặc role quản lý". The job's own creator can always see it; a global-scope
// YOUTH_ADMIN (muc 7's "quản lý toàn cục") can see any job. A scoped YOUTH_ADMIN who did not create
// the job cannot — matching the negative test requirement that user B cannot read user A's import
// job (muc 22/23) just by knowing/guessing its UUID.
export function canAccessImportJob(job, { actorUserId, scope }) {
  if (job.created_by_user_id === actorUserId) return true;
  return scope.isGlobal;
}

const MAX_ROWS_PAGE_SIZE = 200;
const DEFAULT_ROWS_PAGE_SIZE = 50;

export async function listImportJobRows(pool, { importJobId, limit, offset, rowStatus }) {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), MAX_ROWS_PAGE_SIZE) : DEFAULT_ROWS_PAGE_SIZE;
  const boundedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;

  const params = [importJobId];
  let whereClause = 'WHERE import_job_id = $1';
  if (rowStatus) {
    params.push(rowStatus);
    whereClause += ` AND row_status = $${params.length}`;
  }

  const countResult = await pool.query(`SELECT count(*)::int AS total FROM member_import_job_rows ${whereClause}`, params);
  const listParams = [...params, boundedLimit, boundedOffset];
  const { rows } = await pool.query(
    `SELECT * FROM member_import_job_rows ${whereClause}
     ORDER BY row_number ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { rows: rows.map(serializeJobRow), total: countResult.rows[0].total, limit: boundedLimit, offset: boundedOffset };
}

const MEMBERS_INSERT_COLUMNS = [
  'full_name',
  'date_of_birth',
  'gender',
  'work_unit_code',
  'job_title',
  'member_status',
  'political_theory_level',
  'youth_position',
  'youth_board_position',
  'external_ref_note',
];

async function insertCommittedMember(client, normalizedData) {
  const columns = MEMBERS_INSERT_COLUMNS.filter((column) => column in normalizedData);
  const values = columns.map((column) => normalizedData[column]);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const { rows } = await client.query(
    `INSERT INTO members (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING member_id`,
    values
  );
  return rows[0].member_id;
}

// The single atomic, idempotent confirm/commit transaction (muc 10 Atomicity + Confirm/commit
// idempotency). Row locking (`FOR UPDATE`) on the job itself is what makes double-confirm,
// concurrent-confirm and retry-after-timeout all safe: a second call either sees COMMITTED already
// (idempotent replay of the existing result, no new rows) or blocks until the first call's
// transaction has fully finished. Deliberately sequential per-row INSERTs inside the one
// transaction — matches the architecture document's own stated preference (muc 10: "uu tien
// correctness hon throughput... khong can streaming/batch-commit phuc tap" for a ~3,000-row pilot
// commit) over a harder-to-verify set-based bulk insert that would still need a reliable
// row_number<->member_id correlation for `committed_member_id`/audit traceability.
export async function confirmImportJob(pool, { importJobId, scope, rowOverrides }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: jobRows } = await client.query(`SELECT * FROM member_import_jobs WHERE import_job_id = $1 FOR UPDATE`, [
      importJobId,
    ]);
    if (jobRows.length === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }
    const job = jobRows[0];

    if (job.status === 'COMMITTED') {
      // Idempotent replay: a duplicate confirm (double-click, client retry after a dropped
      // response) must never insert again and must never create a second audit-visible commit.
      await client.query('COMMIT');
      return { outcome: 'already_committed', job: serializeJob(job) };
    }
    if (job.status !== 'READY_FOR_CONFIRM') {
      await client.query('ROLLBACK');
      return { outcome: 'conflict', status: job.status };
    }

    const overrideCreateRowNumbers = rowOverrides
      .filter((override) => override.action === 'CREATE_NEW')
      .map((override) => override.row_number);

    const { rows: candidateRows } = await client.query(
      `SELECT row_number, row_status, normalized_data FROM member_import_job_rows
       WHERE import_job_id = $1
         AND (row_status = 'VALID' OR (row_status IN ('POSSIBLE_DUPLICATE', 'WARNING') AND row_number = ANY($2::int[])))`,
      [importJobId, overrideCreateRowNumbers]
    );

    // rowOverrides referencing a row that does not exist in this job, or a row that is not
    // POSSIBLE_DUPLICATE/WARNING (e.g. an attempt to "override" an INVALID row into being
    // committed), is rejected outright rather than silently ignored — an ambiguous confirm request
    // must never partially apply (muc G: "khong tin preview do client gui lai").
    const foundOverrideRowNumbers = new Set(
      candidateRows.filter((row) => row.row_status !== 'VALID').map((row) => row.row_number)
    );
    const invalidOverrides = overrideCreateRowNumbers.filter((rowNumber) => !foundOverrideRowNumbers.has(rowNumber));
    if (invalidOverrides.length > 0) {
      await client.query('ROLLBACK');
      throw new ApiError(
        400,
        'invalid_row_override',
        `Row(s) ${invalidOverrides.join(', ')} are not eligible for a CREATE_NEW override on this job.`
      );
    }

    // Re-authorize against the CURRENT scope resolved for THIS confirm request (server.js already
    // called the resolver fresh for this call) — never the scope that was in effect when the file
    // was uploaded. Guards the "stale preview" scenario named in the task instructions: if the
    // actor's role/scope narrowed between upload and confirm, this aborts the whole commit rather
    // than silently importing into organizations no longer authorized (all-or-nothing, muc 10).
    if (!scope.isGlobal) {
      const outOfScope = candidateRows.filter((row) => !scope.orgCodes.includes(row.normalized_data.work_unit_code));
      if (outOfScope.length > 0) {
        await client.query('ROLLBACK');
        throw new ApiError(
          409,
          'scope_changed',
          'Your authorized scope has changed since this job was staged; re-upload to get a fresh preview.'
        );
      }
    }

    const committed = [];
    for (const row of candidateRows) {
      const memberId = await insertCommittedMember(client, row.normalized_data);
      committed.push({ rowNumber: row.row_number, memberId });
    }

    if (committed.length > 0) {
      await client.query(
        `UPDATE member_import_job_rows AS r
         SET committed_member_id = c.member_id
         FROM unnest($2::int[], $3::uuid[]) AS c(row_number, member_id)
         WHERE r.import_job_id = $1 AND r.row_number = c.row_number`,
        [importJobId, committed.map((c) => c.rowNumber), committed.map((c) => c.memberId)]
      );
    }

    const { rows: updatedJobRows } = await client.query(
      `UPDATE member_import_jobs SET status = 'COMMITTED', committed_count = $2
       WHERE import_job_id = $1 RETURNING *`,
      [importJobId, committed.length]
    );

    await client.query('COMMIT');
    return { outcome: 'committed', job: serializeJob(updatedJobRows[0]), committedCount: committed.length };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection already broken/rolled back — nothing more to do here.
    }
    if (error instanceof ApiError) throw error;
    // Best-effort terminal marking on a genuine commit failure (e.g. a constraint violation on one
    // row). Uses a separate statement/connection since the transaction above was just rolled back;
    // guarded by `status = 'READY_FOR_CONFIRM'` so it can never clobber a COMMITTED/CANCELLED state
    // that changed via a different request in the meantime.
    try {
      await pool.query(
        `UPDATE member_import_jobs SET status = 'FAILED', failure_reason = 'commit_failed'
         WHERE import_job_id = $1 AND status = 'READY_FOR_CONFIRM'`,
        [importJobId]
      );
    } catch {
      // Marking FAILED is best-effort; the original error is what the caller needs to see.
    }
    throw new ApiError(500, 'import_commit_failed', 'The import could not be committed. No records were created.');
  } finally {
    client.release();
  }
}

export async function cancelImportJob(pool, { importJobId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: jobRows } = await client.query(`SELECT * FROM member_import_jobs WHERE import_job_id = $1 FOR UPDATE`, [
      importJobId,
    ]);
    if (jobRows.length === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }
    const job = jobRows[0];
    if (job.status === 'CANCELLED') {
      await client.query('COMMIT');
      return { outcome: 'already_cancelled', job: serializeJob(job) };
    }
    if (job.status !== 'READY_FOR_CONFIRM') {
      await client.query('ROLLBACK');
      return { outcome: 'conflict', status: job.status };
    }
    const { rows: updatedJobRows } = await client.query(
      `UPDATE member_import_jobs SET status = 'CANCELLED' WHERE import_job_id = $1 RETURNING *`,
      [importJobId]
    );
    await client.query('COMMIT');
    return { outcome: 'cancelled', job: serializeJob(updatedJobRows[0]) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
