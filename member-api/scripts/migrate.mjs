#!/usr/bin/env node
// Deterministic forward-only migration runner for the Member PostgreSQL database.
//
// Two distinct operations (do not conflate them — see docs/phase-5-5/00-member-management-architecture.md
// P5.5-01 acceptance and the P5.5-01 task's own "migration runs once" vs "bootstrap can recreate DB
// deterministically" distinction):
//   - `migrate`        : apply any migration file not yet recorded in schema_migrations, in order.
//                        A migration that has already run is never re-run (not idempotent by re-run —
//                        idempotent by tracking).
//   - `migrate --fresh`: drop and recreate the `public` schema first, then run every migration from
//                        zero. This is the deterministic "fresh database bootstrap" — safe only for
//                        local/test databases, never for a database with real data.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function loadDatabaseUrl() {
  const url = process.env.MEMBER_DATABASE_URL;
  if (!url) {
    throw new Error('MEMBER_DATABASE_URL is required and was not set. Refusing to run migrations against an unknown/default database.');
  }
  return url;
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(client) {
  const { rows } = await client.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((row) => row.version));
}

async function dropAndRecreatePublicSchema(client) {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
}

async function runMigrations({ fresh }) {
  const connectionString = loadDatabaseUrl();
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();

  try {
    if (fresh) {
      console.log('[migrate] --fresh requested: dropping and recreating schema "public"');
      await dropAndRecreatePublicSchema(client);
    }

    await ensureMigrationsTable(client);
    const applied = await appliedVersions(client);
    const files = await listMigrationFiles();
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log('[migrate] No pending migrations.');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] Applying ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAILED applying ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(`[migrate] Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

const fresh = process.argv.includes('--fresh');

runMigrations({ fresh }).catch((err) => {
  console.error('[migrate] Migration run failed:', err.message);
  process.exit(1);
});
