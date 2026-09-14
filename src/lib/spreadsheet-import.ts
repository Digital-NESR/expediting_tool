import type * as ExcelJS from 'exceljs';

/**
 * Client-side spreadsheet reader for user-uploaded workbooks.
 *
 * Replaces the abandoned `xlsx` (SheetJS npm build, last published 2022 — carries the
 * unpatched CVE-2023-30533 prototype-pollution and CVE-2024-22363 ReDoS advisories) with
 * `exceljs`, which is already a dependency. `exceljs` is loaded with a dynamic `import()`
 * so it stays out of the shared client chunk and is only fetched when a user actually
 * picks a file.
 *
 * Every cell is normalised to the string form the previous
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })`
 * call produced, so the downstream row parsers are unchanged:
 *   - blank cells        → ''          (falsy, like the `undefined` xlsx returned)
 *   - dates              → 'YYYY-MM-DD' (exceljs hands back real `Date` objects)
 *   - rich text          → its concatenated plain text
 *   - formula cells      → their cached result (what xlsx returned with `raw: false`)
 *   - merged-cell slaves → '' (xlsx only ever populated the top-left cell)
 */

/** Hard cap on an uploaded spreadsheet, enforced before any parsing happens. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_FILE_LABEL = '10 MB';

export interface SheetGrid {
  name: string;
  /** Dense row-major grid: `rows[0]` is sheet row 1, `rows[r][0]` is column A. */
  rows: string[][];
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `Date` → 'YYYY-MM-DD'. exceljs builds dates at UTC midnight, so read UTC parts. */
function toYMD(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return toYMD(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    if ('formula' in v || 'sharedFormula' in v) {
      return cellText((v.result ?? null) as ExcelJS.CellValue);
    }
    if ('hyperlink' in v) return v.text != null ? String(v.text) : '';
    if ('error' in v) return String(v.error);
  }
  return String(value);
}

/** Drop trailing blanks so a row's length tracks its last populated column, as xlsx did. */
function trimTrailing(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === '') end--;
  return end === cells.length ? cells : cells.slice(0, end);
}

function sheetToGrid(ws: ExcelJS.Worksheet): string[][] {
  const byRow = new Map<number, string[]>();
  let lastRow = 0;
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push('');
      const merged = cell.isMerged && cell.master.address !== cell.address;
      cells[colNumber - 1] = merged ? '' : cellText(cell.value);
    });
    byRow.set(rowNumber, trimTrailing(cells));
    if (rowNumber > lastRow) lastRow = rowNumber;
  });
  const grid: string[][] = [];
  for (let r = 1; r <= lastRow; r++) grid.push(byRow.get(r) ?? []);
  return grid;
}

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, CRLF or LF). */
function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(trimTrailing(row)); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(trimTrailing(row)); }
  return rows;
}

/**
 * Read an uploaded .xlsx / .csv file into one grid per sheet (workbook order preserved).
 * Throws a user-facing `Error` when the file is oversized or in an unreadable format.
 */
export async function readSpreadsheet(file: File): Promise<SheetGrid[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `This file is ${sizeLabel(file.size)}. The maximum accepted upload size is ${MAX_IMPORT_FILE_LABEL} — split the workbook and import it in parts.`,
    );
  }
  if (/\.csv$/i.test(file.name)) {
    return [{ name: file.name, rows: parseCsv(await file.text()) }];
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error(
      'Legacy .xls workbooks are not supported. Open the file in Excel and save it as .xlsx, then upload it again.',
    );
  }
  const ExcelJSLib = await import('exceljs');
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: sheetToGrid(ws) }));
}
