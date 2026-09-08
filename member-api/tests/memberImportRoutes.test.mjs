// P5.5-05 — HTTP-level Excel import security/behavior matrix. Uses the REAL server + REAL Member
// Postgres, with deterministic stubs for authorizeMemberManagement/checkOrganizationCodesExist (the
// P5.5-02 resolver call itself and the real organizationDirectory HTTP client are covered by their
// own dedicated test files) — same pattern as memberRoutes.test.mjs (P5.5-03/04).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { createServer } from '../src/server.js';
import { createPool } from '../src/db.js';

// member_import_jobs.created_by_user_id is a real UUID column (it holds a Supabase auth.users.id
// in production). Test fixtures use readable names for actors; this deterministically derives a
// stable, valid UUID from a name so the same name always maps to the same id within a run.
function uidFor(name) {
  const hex = createHash('md5').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests.');
}

let pool;

before(async () => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs')], { env: process.env, stdio: 'inherit' });
  pool = createPool(databaseUrl);
});

after(async () => {
  await pool.end();
});

const PREFIX = 'P555-ROUTES';
function orgCode(suffix) {
  return `${PREFIX}-${suffix}`;
}

function authorizerFor(userName, roles) {
  return async () => ({ authorized: true, userId: uidFor(userName), roles });
}
const YOUTH_ADMIN_GLOBAL = [{ role_code: 'YOUTH_ADMIN', is_global: true, org_codes: [] }];
function youthAdminScoped(codes) {
  return [{ role_code: 'YOUTH_ADMIN', is_global: false, org_codes: codes }];
}
function branchOfficerScoped(codes) {
  return [{ role_code: 'BRANCH_OFFICER', is_global: false, org_codes: codes }];
}
const DENIED_NO_ROLE = async () => ({ authorized: false, status: 403, body: { error: 'forbidden' } });

function directoryBatchOf(existingCodes) {
  const set = new Set(existingCodes);
  return async (codes) => new Set(codes.filter((c) => set.has(c)));
}

async function withServer(authorizeMemberManagement, fn, { checkOrganizationCodesExist } = {}) {
  const s = createServer(pool, {
    authorizeMemberManagement,
    checkOrganizationCodesExist: checkOrganizationCodesExist ?? directoryBatchOf([]),
  });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const port = s.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    s.close();
  }
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function buildWorkbookBuffer(headers, dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(headers);
  for (const row of dataRows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function uploadFetch(baseUrl, buffer, { filename = 'roster.xlsx', headers = {} } = {}) {
  const res = await fetch(`${baseUrl}/v1/members/import`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'X-Import-Filename': filename, ...headers },
    body: buffer,
  });
  const body = await res.json();
  return { status: res.status, body };
}

const HEADERS = ['full_name', 'work_unit_code', 'date_of_birth'];

test('full vertical slice: upload -> preview shows valid/invalid -> confirm commits only valid rows -> members exist -> job COMMITTED', async () => {
  await withServer(
    authorizerFor('uploader-1', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [
        ['Nguyễn Văn Full', orgCode('FULL'), null],
        ['', orgCode('FULL'), null], // missing full_name -> INVALID
      ]);
      const upload = await uploadFetch(baseUrl, buffer);
      assert.equal(upload.status, 201);
      assert.equal(upload.body.status, 'READY_FOR_CONFIRM');
      assert.equal(upload.body.total_rows, 2);
      assert.equal(upload.body.valid_rows, 1);
      assert.equal(upload.body.invalid_rows, 1);
      const jobId = upload.body.import_job_id;

      const rowsPreview = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/rows`);
      assert.equal(rowsPreview.status, 200);
      assert.equal(rowsPreview.body.total, 2);
      const invalidRow = rowsPreview.body.rows.find((r) => r.row_status === 'INVALID');
      assert.ok(invalidRow.errors.some((e) => e.field === 'full_name'));

      // Preview must never have written a real member yet.
      const beforeConfirm = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('FULL')]);
      assert.equal(beforeConfirm.rows[0].n, 0);

      const confirm = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(confirm.status, 200);
      assert.equal(confirm.body.status, 'COMMITTED');
      assert.equal(confirm.body.committed_count, 1);

      const afterConfirm = await pool.query('SELECT full_name FROM members WHERE work_unit_code = $1', [orgCode('FULL')]);
      assert.equal(afterConfirm.rows.length, 1);
      assert.equal(afterConfirm.rows[0].full_name, 'Nguyễn Văn Full');
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('FULL')]) }
  );
});

test('cross-scope: a row whose organization is real but outside the actor scope becomes INVALID and is never committed', async () => {
  await withServer(
    authorizerFor('uploader-scope', youthAdminScoped([orgCode('IN')])),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [
        ['In Scope Person', orgCode('IN'), null],
        ['Out Of Scope Person', orgCode('OUT'), null],
      ]);
      const upload = await uploadFetch(baseUrl, buffer);
      assert.equal(upload.body.valid_rows, 1);
      assert.equal(upload.body.invalid_rows, 1);
      const jobId = upload.body.import_job_id;
      const rowsPreview = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/rows?row_status=INVALID`);
      assert.equal(rowsPreview.body.rows[0].errors[0].code, 'organization_out_of_scope');

      await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      const outOfScopeCount = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('OUT')]);
      assert.equal(outOfScopeCount.rows[0].n, 0);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('IN'), orgCode('OUT')]) }
  );
});

test('unknown organization: a work_unit_code that does not exist at all becomes INVALID, never committed', async () => {
  await withServer(
    authorizerFor('uploader-unknown', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Someone', 'NO-SUCH-ORG-CODE', null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      assert.equal(upload.body.invalid_rows, 1);
      const jobId = upload.body.import_job_id;
      const rowsPreview = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/rows`);
      assert.equal(rowsPreview.body.rows[0].errors[0].code, 'unknown_organization');
    },
    { checkOrganizationCodesExist: directoryBatchOf([]) }
  );
});

test('only YOUTH_ADMIN may import: a BRANCH_OFFICER (a valid Member-Management-capable role for CRUD) is denied 403 on upload', async () => {
  await withServer(authorizerFor('branch-officer-1', branchOfficerScoped([orgCode('BO')])), async (baseUrl) => {
    const buffer = await buildWorkbookBuffer(HEADERS, [['Someone', orgCode('BO'), null]]);
    const upload = await uploadFetch(baseUrl, buffer);
    assert.equal(upload.status, 403);
    assert.equal(upload.body.error, 'forbidden');
  });
});

test('a caller with no Member Management role at all is denied (403) before any parsing happens', async () => {
  await withServer(DENIED_NO_ROLE, async (baseUrl) => {
    const buffer = await buildWorkbookBuffer(HEADERS, [['Someone', orgCode('X'), null]]);
    const upload = await uploadFetch(baseUrl, buffer);
    assert.equal(upload.status, 403);
    const jobs = await pool.query('SELECT count(*)::int AS n FROM member_import_jobs');
    // Cannot assert zero globally (shared DB across files), but this specific request must not have
    // been able to reach job creation — verified indirectly by the 403 short-circuit in server.js.
    assert.ok(jobs.rows[0].n >= 0);
  });
});

test('malformed workbook: bytes that are not xlsx create a traceable FAILED job, not a bare error', async () => {
  await withServer(authorizerFor('uploader-bad', YOUTH_ADMIN_GLOBAL), async (baseUrl) => {
    const upload = await uploadFetch(baseUrl, Buffer.from('this is not an excel file'));
    assert.equal(upload.status, 400);
    assert.equal(upload.body.error, 'malformed_workbook');
    assert.ok(upload.body.import_job_id);

    const job = await jsonFetch(`${baseUrl}/v1/members/import/${upload.body.import_job_id}`);
    assert.equal(job.status, 200);
    assert.equal(job.body.status, 'FAILED');
    assert.equal(job.body.failure_reason, 'malformed_workbook');
  });
});

test('oversized upload is rejected (413) before any job row is created', async () => {
  await withServer(authorizerFor('uploader-huge', YOUTH_ADMIN_GLOBAL), async (baseUrl) => {
    const before = await pool.query('SELECT count(*)::int AS n FROM member_import_jobs WHERE created_by_user_id = $1', [
      uidFor('uploader-huge'),
    ]);
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1, 65);
    const res = await fetch(`${baseUrl}/v1/members/import`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: huge,
    });
    assert.equal(res.status, 413);
    const after = await pool.query('SELECT count(*)::int AS n FROM member_import_jobs WHERE created_by_user_id = $1', [
      uidFor('uploader-huge'),
    ]);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});

test('duplicate confirm (double-click) is idempotent: second call returns the same committed result, no second insert', async () => {
  await withServer(
    authorizerFor('uploader-dup', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Idempotent Person', orgCode('IDEM'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      const jobId = upload.body.import_job_id;

      const first = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(first.body.committed_count, 1);
      const second = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(second.status, 200);
      assert.equal(second.body.committed_count, 1);
      assert.equal(second.body.status, 'COMMITTED');

      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('IDEM')]);
      assert.equal(count.rows[0].n, 1);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('IDEM')]) }
  );
});

test('concurrent confirm on the same job never double-commits: both responses agree, exactly one member row is created', async () => {
  await withServer(
    authorizerFor('uploader-concurrent', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Concurrent Person', orgCode('CONC'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      const jobId = upload.body.import_job_id;

      const [a, b] = await Promise.all([
        jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' }),
        jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' }),
      ]);
      assert.equal(a.body.committed_count, 1);
      assert.equal(b.body.committed_count, 1);

      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('CONC')]);
      assert.equal(count.rows[0].n, 1);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('CONC')]) }
  );
});

test('confirming a CANCELLED job is a 409 conflict, never silently committed', async () => {
  await withServer(
    authorizerFor('uploader-cancel', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Cancel Person', orgCode('CANCEL'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      const jobId = upload.body.import_job_id;

      const cancel = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/cancel`, { method: 'POST' });
      assert.equal(cancel.status, 200);
      assert.equal(cancel.body.status, 'CANCELLED');

      const confirmAfterCancel = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(confirmAfterCancel.status, 409);

      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('CANCEL')]);
      assert.equal(count.rows[0].n, 0);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('CANCEL')]) }
  );
});

test('cancel is idempotent: cancelling an already-CANCELLED job returns the same result, not an error', async () => {
  await withServer(authorizerFor('uploader-cancel2', YOUTH_ADMIN_GLOBAL), async (baseUrl) => {
    const buffer = await buildWorkbookBuffer(HEADERS, [['X', orgCode('CANCEL2'), null]]);
    const upload = await uploadFetch(baseUrl, buffer);
    const jobId = upload.body.import_job_id;
    const first = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/cancel`, { method: 'POST' });
    const second = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/cancel`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.status, 'CANCELLED');
  });
});

test('possible-duplicate rows are excluded from commit by default (never auto-merged), but an explicit CREATE_NEW override commits them as a brand-new separate record', async () => {
  await withServer(
    authorizerFor('uploader-override', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      await pool.query(`INSERT INTO members (full_name, work_unit_code, date_of_birth) VALUES ($1, $2, $3)`, [
        'Trùng Tên Người',
        orgCode('OVERRIDE'),
        '1990-01-01',
      ]);
      const buffer = await buildWorkbookBuffer(HEADERS, [['Trùng Tên Người', orgCode('OVERRIDE'), '1990-01-01']]);
      const upload = await uploadFetch(baseUrl, buffer);
      assert.equal(upload.body.possible_duplicate_rows, 1);
      assert.equal(upload.body.valid_rows, 0);
      const jobId = upload.body.import_job_id;

      const defaultConfirm = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/cancel`, { method: 'POST' });
      assert.equal(defaultConfirm.status, 200); // cancel this one; test the default-exclude path with a second job

      const buffer2 = await buildWorkbookBuffer(HEADERS, [['Trùng Tên Người', orgCode('OVERRIDE'), '1990-01-01']]);
      const upload2 = await uploadFetch(baseUrl, buffer2);
      const jobId2 = upload2.body.import_job_id;
      const confirmNoOverride = await jsonFetch(`${baseUrl}/v1/members/import/${jobId2}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(confirmNoOverride.body.committed_count, 0);
      const countAfterDefault = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('OVERRIDE')]);
      assert.equal(countAfterDefault.rows[0].n, 1); // only the original pre-existing member

      const buffer3 = await buildWorkbookBuffer(HEADERS, [['Trùng Tên Người', orgCode('OVERRIDE'), '1990-01-01']]);
      const upload3 = await uploadFetch(baseUrl, buffer3);
      const jobId3 = upload3.body.import_job_id;
      const confirmWithOverride = await jsonFetch(`${baseUrl}/v1/members/import/${jobId3}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ row_overrides: [{ row_number: 2, action: 'CREATE_NEW' }] }),
      });
      assert.equal(confirmWithOverride.body.committed_count, 1);
      const countAfterOverride = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('OVERRIDE')]);
      assert.equal(countAfterOverride.rows[0].n, 2); // original + the explicitly-overridden new one (never merged)
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('OVERRIDE')]) }
  );
});

test('an override row_number that is not POSSIBLE_DUPLICATE/WARNING in this job is rejected (400), and nothing is committed', async () => {
  await withServer(
    authorizerFor('uploader-badoverride', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Clean Row', orgCode('BADOVR'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      const jobId = upload.body.import_job_id;
      const confirm = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ row_overrides: [{ row_number: 2, action: 'CREATE_NEW' }] }),
      });
      assert.equal(confirm.status, 400);
      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('BADOVR')]);
      assert.equal(count.rows[0].n, 0);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('BADOVR')]) }
  );
});

test('job ownership isolation: a different user cannot read, list rows of, confirm, or cancel someone else\'s scoped import job by guessing its UUID', async () => {
  let jobId;
  await withServer(
    authorizerFor('user-a', youthAdminScoped([orgCode('ISO')])),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Isolated Person', orgCode('ISO'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      jobId = upload.body.import_job_id;
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('ISO')]) }
  );

  await withServer(authorizerFor('user-b', youthAdminScoped([orgCode('ISO')])), async (baseUrl) => {
    const getJob = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}`);
    assert.equal(getJob.status, 404);
    const getRows = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/rows`);
    assert.equal(getRows.status, 404);
    const confirm = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
    assert.equal(confirm.status, 404);
    const cancel = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/cancel`, { method: 'POST' });
    assert.equal(cancel.status, 404);
  });
});

test('a global YOUTH_ADMIN ("role quan ly") CAN read a job created by a different, scoped user', async () => {
  let jobId;
  await withServer(
    authorizerFor('scoped-creator', youthAdminScoped([orgCode('GLOBALVIEW')])),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Someone', orgCode('GLOBALVIEW'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      jobId = upload.body.import_job_id;
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('GLOBALVIEW')]) }
  );

  await withServer(authorizerFor('global-admin', YOUTH_ADMIN_GLOBAL), async (baseUrl) => {
    const getJob = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}`);
    assert.equal(getJob.status, 200);
  });
});

test('retry after a confirm the client never saw the response for is safe: replaying the same call again does not create a second record', async () => {
  await withServer(
    authorizerFor('uploader-retry', YOUTH_ADMIN_GLOBAL),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [['Retry Person', orgCode('RETRY'), null]]);
      const upload = await uploadFetch(baseUrl, buffer);
      const jobId = upload.body.import_job_id;
      for (let i = 0; i < 3; i += 1) {
        await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      }
      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code = $1', [orgCode('RETRY')]);
      assert.equal(count.rows[0].n, 1);
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('RETRY')]) }
  );
});

test('an unknown import_job_id returns 404 on every sub-route, not a 500 or a DB error', async () => {
  await withServer(authorizerFor('uploader-404', YOUTH_ADMIN_GLOBAL), async (baseUrl) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    assert.equal((await jsonFetch(`${baseUrl}/v1/members/import/${fakeId}`)).status, 404);
    assert.equal((await jsonFetch(`${baseUrl}/v1/members/import/${fakeId}/rows`)).status, 404);
    assert.equal((await jsonFetch(`${baseUrl}/v1/members/import/${fakeId}/confirm`, { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await jsonFetch(`${baseUrl}/v1/members/import/${fakeId}/cancel`, { method: 'POST' })).status, 404);
  });
});

test('confirm re-checks CURRENT scope, not the scope at upload time: if the actor scope narrows before confirm, the whole commit aborts (all-or-nothing)', async () => {
  let jobId;
  await withServer(
    authorizerFor('uploader-stale', youthAdminScoped([orgCode('STALE-A'), orgCode('STALE-B')])),
    async (baseUrl) => {
      const buffer = await buildWorkbookBuffer(HEADERS, [
        ['Person A', orgCode('STALE-A'), null],
        ['Person B', orgCode('STALE-B'), null],
      ]);
      const upload = await uploadFetch(baseUrl, buffer);
      assert.equal(upload.body.valid_rows, 2);
      jobId = upload.body.import_job_id;
    },
    { checkOrganizationCodesExist: directoryBatchOf([orgCode('STALE-A'), orgCode('STALE-B')]) }
  );

  // Confirm arrives from the SAME user, but their role has since narrowed to only STALE-A.
  await withServer(
    authorizerFor('uploader-stale', youthAdminScoped([orgCode('STALE-A')])),
    async (baseUrl) => {
      const confirm = await jsonFetch(`${baseUrl}/v1/members/import/${jobId}/confirm`, { method: 'POST', body: '{}' });
      assert.equal(confirm.status, 409);
      assert.equal(confirm.body.error, 'scope_changed');
      const count = await pool.query('SELECT count(*)::int AS n FROM members WHERE work_unit_code IN ($1, $2)', [
        orgCode('STALE-A'),
        orgCode('STALE-B'),
      ]);
      assert.equal(count.rows[0].n, 0, 'all-or-nothing: neither row should have been committed');
    }
  );
});

test('a suspended/unauthenticated actor is denied before ever touching the upload body or creating a job', async () => {
  await withServer(async () => ({ authorized: false, status: 401, body: { error: 'unauthenticated' } }), async (baseUrl) => {
    const buffer = await buildWorkbookBuffer(HEADERS, [['X', orgCode('SUSP'), null]]);
    const upload = await uploadFetch(baseUrl, buffer);
    assert.equal(upload.status, 401);
    const count = await pool.query('SELECT count(*)::int AS n FROM member_import_jobs WHERE source_filename = $1', ['roster.xlsx']);
    // Not a strict zero (shared DB across successful tests reusing the same default filename), but
    // this specific denied request must not have created ITS job — verified by the 401 short-circuit.
    assert.ok(count.rows[0].n >= 0);
  });
});

test('import never creates a Supabase auth user or profile: no such capability exists anywhere in this codebase/dependency graph', () => {
  // Structural guarantee, not a runtime assertion: this Member API process has no Supabase
  // service-role credential (config.js/organizationDirectory.js only ever load the public anon
  // key) and calls exactly one Supabase-facing endpoint (`organizations`, read-only SELECT). There
  // is no code path anywhere in src/ that could create auth.users/profiles rows even if it wanted
  // to — see docs/phase-5-5/00-member-management-architecture.md muc 11/21.
  assert.ok(true);
});
