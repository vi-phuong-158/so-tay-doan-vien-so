#!/usr/bin/env node
// Optional local dev convenience only — NOT used by tests, NOT run in CI.
// Synthetic data only. Never load real member rosters or production data through this script.

import pg from 'pg';
import { loadConfig } from '../src/config.js';

const SYNTHETIC_MEMBERS = [
  { full_name: 'Nguyễn Văn Demo', work_unit_code: 'DEMO-CHI-DOAN-A', member_status: 'ACTIVE' },
  { full_name: 'Trần Thị Test', work_unit_code: 'DEMO-CHI-DOAN-A', member_status: 'ACTIVE' },
  { full_name: 'Lê Văn Mẫu', work_unit_code: 'DEMO-CHI-DOAN-B', member_status: 'INACTIVE' },
];

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });

try {
  for (const member of SYNTHETIC_MEMBERS) {
    await pool.query(
      'INSERT INTO members (full_name, work_unit_code, member_status) VALUES ($1, $2, $3)',
      [member.full_name, member.work_unit_code, member.member_status]
    );
  }
  console.log(`[seed-dev] Inserted ${SYNTHETIC_MEMBERS.length} synthetic member(s). Work unit codes (DEMO-*) are fake, not real organizations.code values.`);
} finally {
  await pool.end();
}
