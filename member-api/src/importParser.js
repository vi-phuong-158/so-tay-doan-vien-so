// P5.5-05 — turns uploaded xlsx bytes into an array of plain header-mapped row objects. This is
// the ONLY module that touches the workbook library. It never trusts the browser's declared
// Content-Type (muc D: "khong tin MIME tu browser") — acceptance is decided entirely by whether
// ExcelJS can actually parse the bytes as a workbook, not by any header the client sent. It also
// never evaluates formulas: a formula cell's cached `result` is read as data, exactly like any
// other cell value — nothing here executes workbook logic.
import ExcelJS from 'exceljs';
import { ImportParseError, KNOWN_HEADERS, MAX_IMPORT_ROWS, REQUIRED_HEADERS } from './importValidation.js';

function cellToPlainValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw !== 'object') return raw; // string | number | boolean

  if ('error' in raw) return null; // #REF!/#DIV0! etc — treated as empty, never as a value or code
  if ('richText' in raw) {
    return Array.isArray(raw.richText) ? raw.richText.map((part) => part.text ?? '').join('') : null;
  }
  if ('result' in raw) {
    // Formula cell: use the cached computed result only (what Excel itself last computed and
    // stored) — never re-derive or execute the formula string.
    if (raw.result && typeof raw.result === 'object' && 'error' in raw.result) return null;
    return cellToPlainValue(raw.result);
  }
  if ('text' in raw) return raw.text; // hyperlink cell
  return null; // formula object with no cached result at all, or an unrecognized shape
}

function isRowLogicallyEmpty(values) {
  return values.every((value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === ''));
}

// Returns { headerRowMap: Map<field, colNumber>, rows: Array<{ rowNumber, data }> }.
// `rows` excludes the header row and any row that is logically empty across every mapped column
// (muc D: "empty rows" must not become a spurious INVALID row in the preview).
export async function parseImportWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportParseError('malformed_workbook', 'File không phải một workbook Excel (.xlsx) hợp lệ hoặc đã bị hỏng.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    throw new ImportParseError('empty_workbook', 'Workbook không có sheet nào hoặc sheet đầu tiên trống.');
  }

  const headerRow = worksheet.getRow(1);
  const headerRowMap = new Map();
  const seenHeaders = new Set();
  let hasAnyHeaderCell = false;

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = cellToPlainValue(cell.value);
    if (typeof value !== 'string' || value.trim() === '') return;
    hasAnyHeaderCell = true;
    const header = value.trim();
    if (!KNOWN_HEADERS.has(header)) return; // unrecognized extra column — ignored, not fatal
    if (seenHeaders.has(header)) {
      throw new ImportParseError('duplicate_header', `Cột "${header}" xuất hiện nhiều hơn một lần ở dòng tiêu đề.`);
    }
    seenHeaders.add(header);
    headerRowMap.set(header, colNumber);
  });

  if (!hasAnyHeaderCell) {
    throw new ImportParseError('missing_header', 'Không tìm thấy dòng tiêu đề.');
  }

  const missing = REQUIRED_HEADERS.filter((header) => !headerRowMap.has(header));
  if (missing.length > 0) {
    throw new ImportParseError('missing_header', `Thiếu cột bắt buộc: ${missing.join(', ')}.`);
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new ImportParseError('too_many_rows', `File vượt quá giới hạn ${MAX_IMPORT_ROWS} dòng dữ liệu.`);
    }
    const data = {};
    const values = [];
    for (const [field, colNumber] of headerRowMap) {
      const value = cellToPlainValue(row.getCell(colNumber).value);
      data[field] = value;
      values.push(value);
    }
    if (isRowLogicallyEmpty(values)) return; // muc D: empty rows are skipped, not flagged INVALID
    rows.push({ rowNumber, data });
  });

  return { headerRowMap, rows };
}
