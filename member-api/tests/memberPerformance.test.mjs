// P5.5-04 mục 9/25 — server-side performance acceptance on a synthetic dataset sized like the
// pilot (~3,000 member rows). This measures `listMembers` (memberRepository.js) directly against a
// real local/CI PostgreSQL 16 — no HTTP layer, no network — so the timing reflects query-side cost
// only, per mục 25 ("Đo server/query-side, không tính Internet/network latency").
//
// Methodology (mục 25 instruction: avoid a single-sample, flaky CI assertion):
//   - seed the ~3,000-row synthetic dataset once
//   - warm up (a few discarded iterations, so the first-query cold-cache cost doesn't skew results)
//   - run N timed iterations per scenario
//   - report min / median / max, and assert on the MEDIAN against the <300ms target (mục 25) — a
//     single slow outlier (e.g. a GC pause during the test run) does not fail the gate on its own.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db.js';
import { listMembers } from '../src/memberRepository.js';
import { PERF_ORG_CODES, seedSyntheticMembers } from './helpers/syntheticMembers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

const DATASET_SIZE = 3000;
const WARMUP_ITERATIONS = 3;
const MEASURED_ITERATIONS = 15;
const TARGET_MS = 300;

let pool;

before(async () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = createPool(databaseUrl);
  await seedSyntheticMembers(pool, DATASET_SIZE);
});

after(async () => {
  await pool.end();
});

function median(sortedValues) {
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0 ? (sortedValues[mid - 1] + sortedValues[mid]) / 2 : sortedValues[mid];
}

async function timeIterations(fn, iterations) {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    await fn();
  }
  const durations = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    min: durations[0],
    median: median(durations),
    max: durations[durations.length - 1],
    samples: durations,
  };
}

function reportStats(label, stats) {
  console.log(
    `[perf] ${label}: min=${stats.min.toFixed(2)}ms median=${stats.median.toFixed(2)}ms max=${stats.max.toFixed(2)}ms (n=${stats.samples.length}, dataset=${DATASET_SIZE} rows)`
  );
}

test(`listMembers: first-page list with filter (work_unit_code + member_status) on ${DATASET_SIZE} synthetic rows meets the <${TARGET_MS}ms server-side target (mục 25)`, async () => {
  const targetOrg = PERF_ORG_CODES[0];
  const stats = await timeIterations(
    () =>
      listMembers(pool, {
        scope: { isGlobal: false, orgCodes: [targetOrg] },
        filters: { workUnitCode: targetOrg, memberStatus: 'ACTIVE' },
        limit: 20,
        offset: 0,
        sort: 'full_name_asc',
      }),
    MEASURED_ITERATIONS
  );
  reportStats('list + filter (work_unit_code + member_status), scoped', stats);
  assert.ok(
    stats.median < TARGET_MS,
    `median list/filter latency ${stats.median.toFixed(2)}ms exceeds the ${TARGET_MS}ms target`
  );
});

test(`listMembers: global-scope status filter across the full ${DATASET_SIZE}-row table meets the <${TARGET_MS}ms server-side target`, async () => {
  const stats = await timeIterations(
    () =>
      listMembers(pool, {
        scope: { isGlobal: true, orgCodes: null },
        filters: { memberStatus: 'ACTIVE' },
        limit: 20,
        offset: 0,
        sort: 'full_name_asc',
      }),
    MEASURED_ITERATIONS
  );
  reportStats('list + filter (member_status only), global scope', stats);
  assert.ok(
    stats.median < TARGET_MS,
    `median global-scope filter latency ${stats.median.toFixed(2)}ms exceeds the ${TARGET_MS}ms target`
  );
});

test(`listMembers: accented Vietnamese name search across ${DATASET_SIZE} synthetic rows meets the <${TARGET_MS}ms server-side target (mục 25)`, async () => {
  const stats = await timeIterations(
    () =>
      listMembers(pool, {
        scope: { isGlobal: true, orgCodes: null },
        filters: { search: 'Nguyễn Văn' },
        limit: 20,
        offset: 0,
        sort: 'full_name_asc',
      }),
    MEASURED_ITERATIONS
  );
  reportStats('search (accented)', stats);
  assert.ok(stats.median < TARGET_MS, `median accented search latency ${stats.median.toFixed(2)}ms exceeds the ${TARGET_MS}ms target`);
});

test(`listMembers: accent-insensitive (no-diacritics) name search across ${DATASET_SIZE} synthetic rows meets the <${TARGET_MS}ms server-side target`, async () => {
  const stats = await timeIterations(
    () =>
      listMembers(pool, {
        scope: { isGlobal: true, orgCodes: null },
        filters: { search: 'nguyen van' },
        limit: 20,
        offset: 0,
        sort: 'full_name_asc',
      }),
    MEASURED_ITERATIONS
  );
  reportStats('search (no diacritics)', stats);
  assert.ok(
    stats.median < TARGET_MS,
    `median accent-insensitive search latency ${stats.median.toFixed(2)}ms exceeds the ${TARGET_MS}ms target`
  );
});
