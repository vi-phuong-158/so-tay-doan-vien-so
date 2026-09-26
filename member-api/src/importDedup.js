// P5.5-05 — soft-match duplicate detection (muc 10/E). This is advisory only: it flags
// POSSIBLE_DUPLICATE/WARNING for a human to review at confirm time and NEVER auto-merges or
// auto-updates an existing member. Matching reuses the exact same `member_immutable_unaccent()`
// SQL function the `members` table's own search index already uses (member-api/migrations/
// 0001_init_members_schema.sql), instead of re-implementing Vietnamese accent-folding in
// JavaScript, so "duplicate at import time" and "found by search later" never disagree about what
// counts as the same name.
//
// Two independent signal sources, both bounded to the current batch (never a database-wide scan
// outside the batch's own organizations):
//   1. Existing `members` rows (real duplicate candidates — a human can decide to skip the new row).
//   2. Other rows in the SAME import batch (protects against an operator's own copy/paste mistakes
//      inside one file — these never carry a real member_id since nothing has been committed yet).
//
// DOB rule per muc 10: name+work_unit_code match with EQUAL, non-null DOB on both sides ->
// POSSIBLE_DUPLICATE; match with DOB missing on either side -> WARNING; a match where both sides
// have DOB but the values differ is treated as no match at all (excluded at the SQL join).

export async function detectDuplicates(pool, validRows) {
  const result = new Map();
  if (validRows.length === 0) return result;

  const rowNumbers = validRows.map((row) => row.rowNumber);
  const fullNames = validRows.map((row) => row.normalized.full_name);
  const workUnitCodes = validRows.map((row) => row.normalized.work_unit_code);
  const dobs = validRows.map((row) => row.normalized.date_of_birth ?? null);

  const existingMatches = await pool.query(
    `
    WITH batch AS (
      SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::date[])
        AS t(row_number, full_name, work_unit_code, date_of_birth)
    )
    SELECT DISTINCT ON (b.row_number)
      b.row_number, m.member_id,
      (m.date_of_birth IS NOT NULL AND b.date_of_birth IS NOT NULL) AS dob_both_present
    FROM batch b
    JOIN members m
      ON member_immutable_unaccent(m.full_name) = member_immutable_unaccent(b.full_name)
     AND m.work_unit_code = b.work_unit_code
     AND (m.date_of_birth IS NULL OR b.date_of_birth IS NULL OR m.date_of_birth = b.date_of_birth)
    ORDER BY b.row_number, m.member_id
    `,
    [rowNumbers, fullNames, workUnitCodes, dobs]
  );

  for (const row of existingMatches.rows) {
    result.set(row.row_number, {
      status: row.dob_both_present ? 'POSSIBLE_DUPLICATE' : 'WARNING',
      reason: 'Trùng tên và đơn vị công tác với một đoàn viên đã có trong hệ thống.',
      candidateMemberId: row.member_id,
    });
  }

  const remainingRowNumbers = rowNumbers.filter((rowNumber) => !result.has(rowNumber));
  if (remainingRowNumbers.length > 0) {
    const inBatchMatches = await pool.query(
      `
      WITH batch AS (
        SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::date[])
          AS t(row_number, full_name, work_unit_code, date_of_birth)
      )
      SELECT a.row_number, b.row_number AS other_row_number,
        (a.date_of_birth IS NOT NULL AND b.date_of_birth IS NOT NULL) AS dob_both_present
      FROM batch a
      JOIN batch b
        ON a.row_number <> b.row_number
       AND member_immutable_unaccent(a.full_name) = member_immutable_unaccent(b.full_name)
       AND a.work_unit_code = b.work_unit_code
       AND (a.date_of_birth IS NULL OR b.date_of_birth IS NULL OR a.date_of_birth = b.date_of_birth)
      `,
      [rowNumbers, fullNames, workUnitCodes, dobs]
    );

    for (const row of inBatchMatches.rows) {
      if (result.has(row.row_number)) continue; // existing-member signal already takes priority
      result.set(row.row_number, {
        status: row.dob_both_present ? 'POSSIBLE_DUPLICATE' : 'WARNING',
        reason: `Trùng tên và đơn vị công tác với dòng #${row.other_row_number} trong cùng file.`,
        candidateMemberId: null,
      });
    }
  }

  return result;
}
