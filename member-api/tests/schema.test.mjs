import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MEMBER_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('MEMBER_DATABASE_URL must be set to run member-api tests (point it at a local/test PostgreSQL 16 — never production, never real member data).');
}

let pool;

before(() => {
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.mjs'), '--fresh'], {
    env: process.env,
    stdio: 'inherit',
  });
  pool = new pg.Pool({ connectionString: databaseUrl });
});

after(async () => {
  await pool.end();
});

test('bootstrap creates the members table with exactly the architecture-approved columns', async () => {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members'`
  );
  const columns = rows.map((r) => r.column_name).sort();
  assert.deepEqual(columns, [
    'account_user_id', 'created_at', 'date_of_birth', 'external_ref_note', 'full_name', 'gender',
    'job_title', 'member_id', 'member_status', 'political_theory_level', 'updated_at',
    'work_unit_code', 'youth_board_position', 'youth_position',
  ].sort());
});

test('no forbidden sensitive identifier columns exist', async () => {
  const forbidden = [
    'police_number', 'personnel_number', 'service_number', 'cccd', 'passport',
    'so_hieu', 'ma_can_bo', 'member_number', 'badge_number', 'id_number',
  ];
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'members'`
  );
  const columns = rows.map((r) => r.column_name.toLowerCase());
  for (const bad of forbidden) {
    assert.ok(!columns.includes(bad), `forbidden column "${bad}" must not exist on members`);
  }
});

test('inserting with only required fields succeeds, generates a UUID member_id, defaults status to ACTIVE', async () => {
  const { rows } = await pool.query(
    `INSERT INTO members (full_name, work_unit_code) VALUES ($1, $2) RETURNING member_id, member_status`,
    ['Nguyễn Văn Demo', 'DEMO-CHI-DOAN-A']
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].member_id, /^[0-9a-f-]{36}$/i);
  assert.equal(rows[0].member_status, 'ACTIVE');
});

test('full_name NOT NULL is enforced', async () => {
  await assert.rejects(() => pool.query(`INSERT INTO members (work_unit_code) VALUES ($1)`, ['DEMO-CHI-DOAN-A']));
});

test('full_name blank/whitespace-only is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code) VALUES ($1, $2)`, ['   ', 'DEMO-CHI-DOAN-A'])
  );
});

test('work_unit_code NOT NULL is enforced', async () => {
  await assert.rejects(() => pool.query(`INSERT INTO members (full_name) VALUES ($1)`, ['Nguyễn Văn Demo']));
});

test('work_unit_code blank/whitespace-only is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code) VALUES ($1, $2)`, ['Nguyễn Văn Demo', '  '])
  );
});

test('invalid member_status enum value is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code, member_status) VALUES ($1,$2,$3)`, ['A', 'B', 'DELETED'])
  );
});

test('invalid gender enum value is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code, gender) VALUES ($1,$2,$3)`, ['A', 'B', 'OTHER'])
  );
});

test('invalid political_theory_level enum value is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code, political_theory_level) VALUES ($1,$2,$3)`, ['A', 'B', 'SUPER_CAP'])
  );
});

test('invalid youth_position enum value is rejected', async () => {
  await assert.rejects(() =>
    pool.query(`INSERT INTO members (full_name, work_unit_code, youth_position) VALUES ($1,$2,$3)`, ['A', 'B', 'CHU_TICH'])
  );
});

test('date_of_birth in the future is rejected', async () => {
  await assert.rejects(() =>
    pool.query(
      `INSERT INTO members (full_name, work_unit_code, date_of_birth) VALUES ($1,$2, CURRENT_DATE + INTERVAL '1 day')`,
      ['A', 'B']
    )
  );
});

test('all optional fields accept NULL', async () => {
  const { rows } = await pool.query(
    `INSERT INTO members (full_name, work_unit_code) VALUES ($1,$2)
     RETURNING date_of_birth, gender, job_title, political_theory_level, youth_position, youth_board_position, account_user_id, external_ref_note`,
    ['Trần Thị Test', 'DEMO-CHI-DOAN-B']
  );
  const row = rows[0];
  for (const field of [
    'date_of_birth', 'gender', 'job_title', 'political_theory_level',
    'youth_position', 'youth_board_position', 'account_user_id', 'external_ref_note',
  ]) {
    assert.equal(row[field], null, `${field} should default to NULL`);
  }
});

test('updated_at auto-updates on UPDATE', async () => {
  const insert = await pool.query(
    `INSERT INTO members (full_name, work_unit_code) VALUES ($1,$2) RETURNING member_id, updated_at`,
    ['Lê Văn Mẫu', 'DEMO-CHI-DOAN-A']
  );
  const { member_id: memberId, updated_at: before } = insert.rows[0];
  await new Promise((resolve) => setTimeout(resolve, 10));
  const update = await pool.query(
    `UPDATE members SET job_title = $1 WHERE member_id = $2 RETURNING updated_at`,
    ['Bí thư', memberId]
  );
  assert.ok(new Date(update.rows[0].updated_at) > new Date(before));
});

test('youth_board_position has no hard uniqueness/count constraint (muc 8 — soft warning only, not schema-enforced)', async () => {
  await pool.query(
    `INSERT INTO members (full_name, work_unit_code, youth_board_position) VALUES ($1,$2,'TRUONG_BAN_THANH_NIEN')`,
    ['Actor A', 'DEMO-CHI-DOAN-A']
  );
  await assert.doesNotReject(() =>
    pool.query(
      `INSERT INTO members (full_name, work_unit_code, youth_board_position) VALUES ($1,$2,'TRUONG_BAN_THANH_NIEN')`,
      ['Actor B', 'DEMO-CHI-DOAN-B']
    )
  );
});
