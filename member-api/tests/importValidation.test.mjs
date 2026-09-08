// P5.5-05 — pure unit tests for field validation (importValidation.js) and workbook parsing
// (importParser.js). No database, no HTTP — the DB-dependent parts (org existence/scope, dedup,
// staging persistence) are covered by importDedup.test.mjs and memberImportRoutes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { validateImportRow, MAX_IMPORT_ROWS } from '../src/importValidation.js';
import { parseImportWorkbook } from '../src/importParser.js';
import { ImportParseError } from '../src/importValidation.js';

test('validateImportRow: a minimal valid row (only required fields) is VALID with member_status defaulted to ACTIVE', () => {
  const result = validateImportRow({ full_name: 'Nguyễn Văn A', work_unit_code: 'ORG-1' });
  assert.equal(result.status, 'VALID');
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.member_status, 'ACTIVE');
  assert.equal(result.normalized.full_name, 'Nguyễn Văn A');
});

test('validateImportRow: missing full_name and work_unit_code both produce required errors', () => {
  const result = validateImportRow({});
  assert.equal(result.status, 'INVALID');
  const fields = result.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['full_name', 'work_unit_code']);
});

test('validateImportRow: a Date object for date_of_birth (native Excel date cell) is normalized to YYYY-MM-DD', () => {
  const result = validateImportRow({
    full_name: 'A',
    work_unit_code: 'ORG-1',
    date_of_birth: new Date(Date.UTC(1998, 4, 20)),
  });
  assert.equal(result.status, 'VALID');
  assert.equal(result.normalized.date_of_birth, '1998-05-20');
});

test('validateImportRow: a future date_of_birth is rejected', () => {
  const future = new Date();
  future.setUTCFullYear(future.getUTCFullYear() + 1);
  const result = validateImportRow({ full_name: 'A', work_unit_code: 'ORG-1', date_of_birth: future });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.some((e) => e.field === 'date_of_birth'));
});

test('validateImportRow: an unparseable date string is rejected, not silently dropped', () => {
  const result = validateImportRow({ full_name: 'A', work_unit_code: 'ORG-1', date_of_birth: '20/05/1998' });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.some((e) => e.field === 'date_of_birth'));
});

test('validateImportRow: an invalid enum value is rejected with a field-specific error', () => {
  const result = validateImportRow({ full_name: 'A', work_unit_code: 'ORG-1', gender: 'ROBOT' });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.some((e) => e.field === 'gender' && e.code === 'invalid_enum'));
});

test('validateImportRow: SQL/metacharacter-shaped text in free-text fields is treated as ordinary text, not rejected or executed', () => {
  const payload = "'; DROP TABLE members; --";
  const result = validateImportRow({ full_name: payload, work_unit_code: 'ORG-1', job_title: payload });
  assert.equal(result.status, 'VALID');
  assert.equal(result.normalized.full_name, payload);
  assert.equal(result.normalized.job_title, payload);
});

test('validateImportRow: an overlong full_name is rejected', () => {
  const result = validateImportRow({ full_name: 'A'.repeat(201), work_unit_code: 'ORG-1' });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.errors.some((e) => e.field === 'full_name' && e.code === 'too_long'));
});

// ---- parseImportWorkbook ----

async function buildWorkbookBuffer(headers, dataRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(headers);
  for (const row of dataRows) sheet.addRow(row);
  return workbook.xlsx.writeBuffer();
}

test('parseImportWorkbook: a well-formed workbook parses into header-mapped rows, in row order', async () => {
  const buffer = await buildWorkbookBuffer(
    ['full_name', 'work_unit_code', 'job_title'],
    [
      ['Nguyễn Văn A', 'ORG-1', 'Đội trưởng'],
      ['Trần Thị B', 'ORG-2', null],
    ]
  );
  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn A');
  assert.equal(rows[0].data.job_title, 'Đội trưởng');
  assert.equal(rows[1].rowNumber, 3);
  assert.equal(rows[1].data.job_title, null);
});

test('parseImportWorkbook: bytes that are not a real xlsx workbook fail closed as malformed_workbook', async () => {
  await assert.rejects(() => parseImportWorkbook(Buffer.from('not an xlsx file at all')), (error) => {
    assert.ok(error instanceof ImportParseError);
    assert.equal(error.code, 'malformed_workbook');
    return true;
  });
});

test('parseImportWorkbook: a missing required header column fails closed as missing_header', async () => {
  const buffer = await buildWorkbookBuffer(['full_name', 'job_title'], [['Nguyễn Văn A', 'Đội trưởng']]);
  await assert.rejects(() => parseImportWorkbook(buffer), (error) => {
    assert.ok(error instanceof ImportParseError);
    assert.equal(error.code, 'missing_header');
    return true;
  });
});

test('parseImportWorkbook: a duplicate header column fails closed as duplicate_header', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code', 'full_name']);
  sheet.addRow(['Nguyễn Văn A', 'ORG-1', 'Duplicate Column']);
  const buffer = await workbook.xlsx.writeBuffer();
  await assert.rejects(() => parseImportWorkbook(buffer), (error) => {
    assert.ok(error instanceof ImportParseError);
    assert.equal(error.code, 'duplicate_header');
    return true;
  });
});

test('parseImportWorkbook: an unrecognized extra header column is ignored, not fatal', async () => {
  const buffer = await buildWorkbookBuffer(
    ['full_name', 'work_unit_code', 'some_unknown_column'],
    [['Nguyễn Văn A', 'ORG-1', 'ignored value']]
  );
  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn A');
  assert.ok(!('some_unknown_column' in rows[0].data));
});

test('parseImportWorkbook: a fully empty row is skipped, not turned into an INVALID row', async () => {
  const buffer = await buildWorkbookBuffer(
    ['full_name', 'work_unit_code'],
    [
      ['Nguyễn Văn A', 'ORG-1'],
      [null, null],
      ['', ''],
      ['Trần Thị B', 'ORG-2'],
    ]
  );
  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn A');
  assert.equal(rows[1].data.full_name, 'Trần Thị B');
});

test('parseImportWorkbook: a formula cell is read as its cached computed result, never evaluated', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code']);
  const row = sheet.addRow([]);
  row.getCell(1).value = { formula: 'CONCATENATE("Nguyễn"," Văn C")', result: 'Nguyễn Văn C' };
  row.getCell(2).value = 'ORG-1';
  const buffer = await workbook.xlsx.writeBuffer();
  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn C');
});

test('parseImportWorkbook: a formula cell with an error result is treated as empty, not thrown', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code']);
  const row = sheet.addRow([]);
  row.getCell(1).value = 'Nguyễn Văn D';
  row.getCell(2).value = { formula: '1/0', result: { error: '#DIV/0!' } };
  const buffer = await workbook.xlsx.writeBuffer();
  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.work_unit_code, null);
});

// P5.5-07R — import edge-case regression, closing gaps the P5.5-05 suite didn't cover yet.

test('parseImportWorkbook: with multiple sheets, only the first sheet is parsed — a second sheet with valid data is silently ignored, never merged in', async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Members');
  first.addRow(['full_name', 'work_unit_code']);
  first.addRow(['Nguyễn Văn A', 'ORG-1']);
  const second = workbook.addWorksheet('AlsoMembers');
  second.addRow(['full_name', 'work_unit_code']);
  second.addRow(['Trần Thị B', 'ORG-2']);
  const buffer = await workbook.xlsx.writeBuffer();

  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn A');
});

test('parseImportWorkbook: a hidden data row is still parsed, never silently dropped just because it is hidden', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code']);
  sheet.addRow(['Nguyễn Văn A', 'ORG-1']);
  const hiddenRow = sheet.addRow(['Trần Thị Hidden', 'ORG-2']);
  hiddenRow.hidden = true;
  const buffer = await workbook.xlsx.writeBuffer();

  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.data.full_name === 'Trần Thị Hidden'), 'a hidden row must still be included, not skipped');
});

test('parseImportWorkbook: a hidden FIRST sheet is still parsed (sheet selection is by position, not visibility — no silent bypass)', async () => {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Members', { state: 'hidden' });
  first.addRow(['full_name', 'work_unit_code']);
  first.addRow(['Nguyễn Văn Hidden Sheet', 'ORG-1']);
  const buffer = await workbook.xlsx.writeBuffer();

  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.full_name, 'Nguyễn Văn Hidden Sheet');
});

test('parseImportWorkbook: an oversized single cell (tens of thousands of characters) is parsed without crashing — length enforcement happens at validateImportRow, not the parser', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code', 'job_title']);
  const hugeValue = 'A'.repeat(50_000);
  sheet.addRow(['Nguyễn Văn A', 'ORG-1', hugeValue]);
  const buffer = await workbook.xlsx.writeBuffer();

  const { rows } = await parseImportWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.job_title.length, 50_000);

  // The parser itself does not enforce length — validateImportRow does, and correctly rejects it.
  const validated = validateImportRow(rows[0].data);
  assert.equal(validated.status, 'INVALID');
  assert.ok(validated.errors.some((e) => e.field === 'job_title' && e.code === 'too_long'));
});

test('validateImportRow: NFC and NFD Unicode forms of the same Vietnamese name both validate cleanly and are preserved byte-for-byte (no silent re-normalization that could shift matching)', () => {
  const nfc = 'Nguyễn Văn A'.normalize('NFC');
  const nfd = 'Nguyễn Văn A'.normalize('NFD');
  assert.notEqual(nfc, nfd, 'test fixture sanity: NFC and NFD must actually differ byte-for-byte');

  const resultNfc = validateImportRow({ full_name: nfc, work_unit_code: 'ORG-1' });
  const resultNfd = validateImportRow({ full_name: nfd, work_unit_code: 'ORG-1' });
  assert.equal(resultNfc.status, 'VALID');
  assert.equal(resultNfd.status, 'VALID');
  assert.equal(resultNfc.normalized.full_name, nfc);
  assert.equal(resultNfd.normalized.full_name, nfd);
});

test('parseImportWorkbook: an oversized workbook (more than MAX_IMPORT_ROWS data rows) fails closed as too_many_rows', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Members');
  sheet.addRow(['full_name', 'work_unit_code']);
  const rows = [];
  for (let i = 0; i < MAX_IMPORT_ROWS + 1; i += 1) rows.push([`Person ${i}`, 'ORG-1']);
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  await assert.rejects(() => parseImportWorkbook(buffer), (error) => {
    assert.ok(error instanceof ImportParseError);
    assert.equal(error.code, 'too_many_rows');
    return true;
  });
});
