// P5.5-04 mục 9/25 — synthetic dataset generator for the performance test
// (../memberPerformance.test.mjs). Deterministic (no Math.random()) so a perf run is reproducible
// and never flaky because of which rows happened to be generated. Entirely synthetic Vietnamese-
// looking names built from common syllables — NEVER real member/roster data (mục 9 instruction:
// "Không dùng dữ liệu đoàn viên thật").
import {
  MEMBER_STATUS_VALUES,
  POLITICAL_THEORY_LEVEL_VALUES,
  YOUTH_BOARD_POSITION_VALUES,
  YOUTH_POSITION_VALUES,
} from '../../src/memberValidation.js';

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const MIDDLES = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Thanh', 'Xuân', 'Ngọc', 'Quốc', 'Công'];
const GIVEN_NAMES = [
  'An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hùng', 'Khánh', 'Lan',
  'Linh', 'Mai', 'Nam', 'Oanh', 'Phương', 'Quân', 'Sơn', 'Tâm', 'Uyên', 'Việt', 'Yến',
];

const PERF_ORG_COUNT = 30;
export const PERF_ORG_PREFIX = 'P554-PERF-ORG';
export const PERF_ORG_CODES = Array.from({ length: PERF_ORG_COUNT }, (_, i) => `${PERF_ORG_PREFIX}-${String(i).padStart(2, '0')}`);

// A small fixed pool of full_name values reused across many rows, so the dataset guarantees
// duplicate-name groups exist (mục 9: "duplicate full_name để kiểm tra stable ordering"), not left
// to chance from combinatorics alone.
const FORCED_DUPLICATE_NAMES = ['Nguyễn Văn An', 'Trần Thị Lan', 'Lê Hữu Hùng'];

function nthCombination(index) {
  const surname = SURNAMES[index % SURNAMES.length];
  const middle = MIDDLES[Math.floor(index / SURNAMES.length) % MIDDLES.length];
  const given = GIVEN_NAMES[Math.floor(index / (SURNAMES.length * MIDDLES.length)) % GIVEN_NAMES.length];
  return `${surname} ${middle} ${given}`;
}

function nthOrNull(values, index, everyN) {
  // Every Nth record gets NULL instead of a cycled value — enum fields in the real data model are
  // frequently unset (mục 5: youth_position/youth_board_position/political_theory_level are all
  // optional), so a realistic dataset must include a substantial NULL fraction, not force a value
  // onto every row.
  if (index % everyN === 0) return null;
  return values[index % values.length];
}

// Builds `count` synthetic member rows as column arrays, ready for a single bulk
// `INSERT ... SELECT * FROM UNNEST(...)` statement (fast — one round trip for the whole dataset).
export function buildSyntheticMemberColumns(count) {
  const fullName = [];
  const workUnitCode = [];
  const memberStatus = [];
  const youthPosition = [];
  const youthBoardPosition = [];
  const politicalTheoryLevel = [];

  for (let i = 0; i < count; i += 1) {
    // Roughly 1 in 12 rows reuses one of the forced-duplicate names, guaranteeing duplicate-name
    // groups spread across different organizations; the rest are combinatorially generated (still
    // producing incidental duplicates on their own at this row count, which is realistic).
    const name = i % 12 === 0 ? FORCED_DUPLICATE_NAMES[(i / 12) % FORCED_DUPLICATE_NAMES.length] : nthCombination(i);
    fullName.push(name);
    workUnitCode.push(PERF_ORG_CODES[i % PERF_ORG_CODES.length]);
    memberStatus.push(MEMBER_STATUS_VALUES[i % MEMBER_STATUS_VALUES.length]);
    youthPosition.push(nthOrNull(YOUTH_POSITION_VALUES, i, 3));
    youthBoardPosition.push(nthOrNull(YOUTH_BOARD_POSITION_VALUES, i, 15));
    politicalTheoryLevel.push(nthOrNull(POLITICAL_THEORY_LEVEL_VALUES, i, 4));
  }

  return { fullName, workUnitCode, memberStatus, youthPosition, youthBoardPosition, politicalTheoryLevel };
}

// Single statement, single round trip for the whole batch — appropriate at this scale (mục 9: no
// need for streaming/batched inserts for a ~3,000-row synthetic seed).
export async function seedSyntheticMembers(pool, count) {
  const columns = buildSyntheticMemberColumns(count);
  await pool.query(
    `INSERT INTO members (full_name, work_unit_code, member_status, youth_position, youth_board_position, political_theory_level)
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::member_status[], $4::member_youth_position[],
       $5::member_youth_board_position[], $6::member_political_theory_level[]
     )`,
    [
      columns.fullName,
      columns.workUnitCode,
      columns.memberStatus,
      columns.youthPosition,
      columns.youthBoardPosition,
      columns.politicalTheoryLevel,
    ]
  );
}
