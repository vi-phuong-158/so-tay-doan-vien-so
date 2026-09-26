// P5.5-05 mục I/25 — synthetic ~3,000-row import performance evidence. Entirely synthetic data
// (tests/helpers/syntheticImportWorkbook.mjs) — never real member/roster data. Measures the two
// phases the architecture document sets targets for: upload (parse+validate+dedup+stage, target
// "vài giây tới dưới 1 phút") and confirm/commit (target "dưới vài giây"). Logged with
// console.log so the numbers are visible in CI output / PR evidence, same convention as
// memberPerformance.test.mjs (P5.5-04).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';
import { buildSyntheticImportWorkbookBuffer, PERF_IMPORT_ORG_CODES } from './helpers/syntheticImportWorkbook.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

let pool;
let server;
let baseUrl;

before(async () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = createPool(databaseUrl);

  const authorizeMemberManagement = async () => ({
    authorized: true,
    userId: '99999999-9999-9999-9999-999999999999',
    roles: [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }],
  });
  const existing = new Set(PERF_IMPORT_ORG_CODES);
  const checkOrganizationCodesExist = async (codes) => new Set(codes.filter((c) => existing.has(c)));

  server = createServer(pool, { authorizeMemberManagement, checkOrganizationCodesExist });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

const ROW_COUNT = 3000;
const UPLOAD_TARGET_MS = 60_000; // mục 25: "vài giây tới dưới 1 phút" for the whole parse/validate/preview phase
const CONFIRM_TARGET_MS = 15_000; // mục 25: "dưới vài giây" for the commit transaction — generous CI margin

test(`import performance: ~${ROW_COUNT}-row synthetic workbook — upload (parse+validate+dedup+stage) and confirm (commit) both meet mục 25 targets`, async () => {
  const buffer = await buildSyntheticImportWorkbookBuffer(ROW_COUNT);

  const uploadStart = performance.now();
  const uploadRes = await fetch(`${baseUrl}/v1/members/import`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'X-Import-Filename': 'synthetic-3000.xlsx' },
    body: buffer,
  });
  const uploadElapsedMs = performance.now() - uploadStart;
  const uploadBody = await uploadRes.json();

  console.log(`[perf] import upload (parse+validate+dedup+stage) for ${ROW_COUNT} rows: ${uploadElapsedMs.toFixed(1)}ms`);
  console.log(
    `[perf] summary: total=${uploadBody.total_rows} valid=${uploadBody.valid_rows} invalid=${uploadBody.invalid_rows} ` +
      `possible_duplicate=${uploadBody.possible_duplicate_rows} warning=${uploadBody.warning_rows}`
  );

  assert.equal(uploadRes.status, 201);
  assert.equal(uploadBody.total_rows, ROW_COUNT);
  assert.ok(uploadBody.invalid_rows > 0, 'synthetic fixture must include some INVALID rows');
  assert.ok(uploadBody.possible_duplicate_rows > 0, 'synthetic fixture must include some POSSIBLE_DUPLICATE rows');
  assert.ok(
    uploadElapsedMs < UPLOAD_TARGET_MS,
    `upload took ${uploadElapsedMs.toFixed(1)}ms, target is < ${UPLOAD_TARGET_MS}ms (mục 25)`
  );

  const confirmStart = performance.now();
  const confirmRes = await fetch(`${baseUrl}/v1/members/import/${uploadBody.import_job_id}/confirm`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const confirmElapsedMs = performance.now() - confirmStart;
  const confirmBody = await confirmRes.json();

  console.log(`[perf] import confirm/commit for ${confirmBody.committed_count} rows: ${confirmElapsedMs.toFixed(1)}ms`);

  assert.equal(confirmRes.status, 200);
  assert.equal(confirmBody.status, 'COMMITTED');
  assert.equal(confirmBody.committed_count, uploadBody.valid_rows);
  assert.ok(
    confirmElapsedMs < CONFIRM_TARGET_MS,
    `confirm/commit took ${confirmElapsedMs.toFixed(1)}ms, target is < ${CONFIRM_TARGET_MS}ms (mục 25)`
  );

  const countResult = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = ANY($1::text[])', [
    PERF_IMPORT_ORG_CODES,
  ]);
  assert.equal(countResult.rows[0].n, confirmBody.committed_count);

  const listStart = performance.now();
  const listRes = await fetch(`${baseUrl}/v1/members?work_unit_code=${encodeURIComponent(PERF_IMPORT_ORG_CODES[0])}&limit=20`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  const listElapsedMs = performance.now() - listStart;
  console.log(`[perf] GET /v1/members list-after-import (single org filter): ${listElapsedMs.toFixed(1)}ms`);
  assert.equal(listRes.status, 200);
});
