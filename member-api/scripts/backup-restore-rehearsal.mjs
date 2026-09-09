#!/usr/bin/env node
// P5.5-07R — Backup/Restore rehearsal harness (PREPARATION ONLY, not a real backup/restore).
//
// Mắt Bão Vibe Host v2 is not yet provisioned (docs/brain/04-current-tasks.md — no account, no
// instance, no connection string) and this agent has no vendor API access to trigger a real backup
// or restore. "Trigger backup" and "perform restore" below are OPERATOR steps, done by hand in the
// Vibe Host panel once infra exists — this script only handles the DB-side marker/checksum
// bookkeeping around those manual steps, so a real rehearsal (once infra exists) is mechanical
// instead of ad hoc.
//
// SAFETY CONTRACT (do not weaken):
//   - Refuses to run at all unless the caller passes --confirm-non-production explicitly.
//   - Reads its connection string ONLY from MEMBER_DATABASE_URL (never a literal in this file,
//     never a CLI argument — a connection string on the command line would end up in shell
//     history/process listing).
//   - Never wired into `npm start`/`npm test`/CI/any automatic trigger — an operator runs each
//     step by hand, only against a database they have explicitly chosen for this rehearsal.
//   - Uses one dedicated, clearly-named table (`_rehearsal_markers`) — never touches `members`,
//     `member_audit_logs`, or `member_import_jobs`, so a rehearsal can never corrupt real data.
//   - Checksum state is written to a LOCAL FILE, not the database, so it survives whatever restore
//     is being rehearsed (a checksum stored inside the database would itself be reverted by the
//     restore it's supposed to verify).
//
// Usage — run each step by hand, in order, against a NON-PRODUCTION rehearsal database:
//   MEMBER_DATABASE_URL=... node scripts/backup-restore-rehearsal.mjs seed    --confirm-non-production
//     <<< operator: trigger a backup in the Vibe Host panel now, note the backup id/timestamp >>>
//   MEMBER_DATABASE_URL=... node scripts/backup-restore-rehearsal.mjs mutate  --confirm-non-production
//     <<< operator: restore the backup taken above (to this same rehearsal database, or a scratch
//         copy of it) in the Vibe Host panel now >>>
//   MEMBER_DATABASE_URL=... node scripts/backup-restore-rehearsal.mjs verify  --confirm-non-production
//   MEMBER_DATABASE_URL=... node scripts/backup-restore-rehearsal.mjs cleanup --confirm-non-production
//
// `verify` expects the post-restore state to match the "seed" checksum (marker A present, marker B
// from "mutate" absent) — proving the backup taken at "seed" time did not include the later
// mutation, i.e. the backup/restore mechanism actually works and is not a no-op. Record the wall-
// clock time between "trigger backup" and its completion, and between "trigger restore" and
// `verify` passing, as this rehearsal's RPO/RTO measurement.
//
// Actual restore capability remains BLOCKED_PENDING_INFRA until this has been run for real against
// a provisioned Mắt Bão instance — this script prepares the rehearsal, it does not complete it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

function parseArgs(argv) {
  const [step, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const stateFileFlagIndex = rest.indexOf('--state-file');
  const stateFile = stateFileFlagIndex >= 0 ? rest[stateFileFlagIndex + 1] : path.join(os.tmpdir(), 'member-api-rehearsal-state.json');
  return { step, flags, stateFile };
}

function fail(message) {
  console.error(`[backup-restore-rehearsal] REFUSED: ${message}`);
  process.exit(1);
}

const VALID_STEPS = new Set(['seed', 'mutate', 'verify', 'cleanup']);

async function main() {
  const { step, flags, stateFile } = parseArgs(process.argv.slice(2));

  if (!VALID_STEPS.has(step)) {
    fail(`unknown or missing step "${step}". Expected one of: ${[...VALID_STEPS].join(', ')}.`);
  }
  if (!flags.has('--confirm-non-production')) {
    fail('--confirm-non-production is required. This script writes to whatever database MEMBER_DATABASE_URL points at — pass this flag only when you have personally confirmed that is a non-production rehearsal database.');
  }
  const databaseUrl = process.env.MEMBER_DATABASE_URL;
  if (!databaseUrl) {
    fail('MEMBER_DATABASE_URL is required (fail closed — there is no default/fallback connection).');
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    if (step === 'seed') await seed(pool, stateFile);
    else if (step === 'mutate') await mutate(pool);
    else if (step === 'verify') await verify(pool, stateFile);
    else if (step === 'cleanup') await cleanup(pool, stateFile);
  } finally {
    await pool.end();
  }
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _rehearsal_markers (
      id SERIAL PRIMARY KEY,
      phase TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function checksumOf(pool) {
  const { rows } = await pool.query('SELECT phase, note FROM _rehearsal_markers ORDER BY id ASC');
  const hash = crypto.createHash('sha256');
  for (const row of rows) hash.update(`${row.phase}:${row.note}\n`);
  return { checksum: hash.digest('hex'), rowCount: rows.length };
}

async function seed(pool, stateFile) {
  await ensureTable(pool);
  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM _rehearsal_markers');
  if (existing[0].n > 0) {
    fail('_rehearsal_markers is not empty. Run "cleanup" first, or point at a fresh rehearsal database — refusing to seed on top of a prior/unknown rehearsal state.');
  }
  await pool.query(`INSERT INTO _rehearsal_markers (phase, note) VALUES ('pre_backup', $1)`, [`synthetic-marker-${crypto.randomUUID()}`]);
  const { checksum, rowCount } = await checksumOf(pool);
  const state = { seededAt: new Date().toISOString(), preBackupChecksum: checksum, preBackupRowCount: rowCount };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`[backup-restore-rehearsal] seeded 1 pre-backup marker. Pre-backup checksum recorded to ${stateFile}.`);
  console.log('[backup-restore-rehearsal] NEXT: trigger a real backup in the Vibe Host panel now, then run "mutate".');
}

async function mutate(pool) {
  await ensureTable(pool);
  await pool.query(`INSERT INTO _rehearsal_markers (phase, note) VALUES ('post_backup', $1)`, [`synthetic-marker-${crypto.randomUUID()}`]);
  console.log('[backup-restore-rehearsal] inserted 1 post-backup marker (simulates a mutation that happened after the backup point).');
  console.log('[backup-restore-rehearsal] NEXT: restore the backup taken before this step in the Vibe Host panel, then run "verify".');
}

async function verify(pool, stateFile) {
  if (!fs.existsSync(stateFile)) {
    fail(`no rehearsal state found at ${stateFile} — run "seed" first (on the pre-restore database, before whatever restore you are verifying).`);
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const { checksum, rowCount } = await checksumOf(pool);
  const restoredToPreBackupState = checksum === state.preBackupChecksum;
  console.log(`[backup-restore-rehearsal] post-restore row count: ${rowCount} (pre-backup was ${state.preBackupRowCount})`);
  console.log(`[backup-restore-rehearsal] post-restore checksum matches pre-backup checksum: ${restoredToPreBackupState}`);
  if (restoredToPreBackupState) {
    console.log('[backup-restore-rehearsal] PASS: the restored database matches the state at backup time — the "post_backup" mutation is correctly absent.');
  } else {
    console.log('[backup-restore-rehearsal] MISMATCH: either the restore did not target the backup taken at "seed" time, or the backup/restore mechanism did not behave as expected. Investigate before treating restore as verified.');
  }
  console.log('[backup-restore-rehearsal] Record the elapsed wall-clock time for "trigger backup"→backup completion (RPO) and "trigger restore"→this PASS (RTO) in the rehearsal log.');
}

async function cleanup(pool, stateFile) {
  await pool.query('DROP TABLE IF EXISTS _rehearsal_markers');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  console.log('[backup-restore-rehearsal] cleaned up rehearsal table and local state file.');
}

main().catch((error) => {
  console.error('[backup-restore-rehearsal] unexpected error:', error.message);
  process.exit(1);
});
