// P5.5-05 mục I/25 — synthetic ~3,000-row xlsx generator for the import performance test
// (../memberImportPerformance.test.mjs). Deterministic (no Math.random()), entirely synthetic
// Vietnamese-looking names — NEVER real member/roster data (same rule as P5.5-04's
// tests/helpers/syntheticMembers.mjs, which this mirrors for the import path).
import ExcelJS from 'exceljs';

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const MIDDLES = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Thanh', 'Xuân', 'Ngọc', 'Quốc', 'Công'];
const GIVEN_NAMES = [
  'An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hùng', 'Khánh', 'Lan',
  'Linh', 'Mai', 'Nam', 'Oanh', 'Phương', 'Quân', 'Sơn', 'Tâm', 'Uyên', 'Việt', 'Yến',
];

const PERF_IMPORT_ORG_COUNT = 30;
export const PERF_IMPORT_ORG_PREFIX = 'P555-PERF-IMPORT-ORG';
export const PERF_IMPORT_ORG_CODES = Array.from(
  { length: PERF_IMPORT_ORG_COUNT },
  (_, i) => `${PERF_IMPORT_ORG_PREFIX}-${String(i).padStart(2, '0')}`
);

function nthCombination(index) {
  const surname = SURNAMES[index % SURNAMES.length];
  const middle = MIDDLES[Math.floor(index / SURNAMES.length) % MIDDLES.length];
  const given = GIVEN_NAMES[Math.floor(index / (SURNAMES.length * MIDDLES.length)) % GIVEN_NAMES.length];
  return `${surname} ${middle} ${given} #${index}`; // suffixed so the batch stays mostly non-duplicate
}

// Builds an in-memory xlsx buffer with `count` data rows: ~90% clean VALID rows spread across
// PERF_IMPORT_ORG_CODES, a controlled ~5% duplicate-of-each-other slice (to exercise the dedup
// query at realistic scale, not just on an all-unique batch) and a controlled ~5% deliberately
// INVALID slice (missing full_name) — matching mục I's instruction to measure parse/validate/
// preview/commit, not just a best-case all-valid file.
export async function buildSyntheticImportWorkbookBuffer(count) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code', 'date_of_birth']);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const org = PERF_IMPORT_ORG_CODES[i % PERF_IMPORT_ORG_CODES.length];
    if (i % 20 === 0) {
      // Deliberately INVALID: missing full_name.
      rows.push([null, org, null]);
    } else if (i % 21 === 0 || i % 21 === 3) {
      // Same org (keyed off the 21-row block, not `i`, so both rows in the pair land on the same
      // organization) and same name+DOB -> a real in-batch POSSIBLE_DUPLICATE pair, not just two
      // rows that happen to share a name in different organizations.
      const pairOrg = PERF_IMPORT_ORG_CODES[Math.floor(i / 21) % PERF_IMPORT_ORG_CODES.length];
      rows.push(['Trùng Lặp Kiểm Tra', pairOrg, '1990-01-01']);
    } else {
      rows.push([nthCombination(i), org, null]);
    }
  }
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
