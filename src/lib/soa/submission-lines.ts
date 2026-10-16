import ExcelJS from 'exceljs';

/**
 * Reading a supplier's returned statement.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * Suppliers do not return the file they were sent. They insert rows above the header, rename a
 * column, paste from their own ledger, send the consolidated format instead of the lean one, or
 * export from a system that writes every number as text. So nothing here assumes a fixed layout:
 * the header row is located by looking for a column that must exist, and columns are matched by
 * name rather than position. A file that cannot be read at all is reported as such; a row that
 * cannot be read is kept with its problems recorded beside it, because a champion reviewing a
 * statement needs to see what the supplier actually wrote, and a silently dropped invoice is the
 * one thing a reconciliation cannot survive.
 */

export interface ParsedLine {
  lineNo: number;
  legalEntity: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  /** The cell as written, kept whenever it would not parse as a date. */
  invoiceDateRaw: string | null;
  poNumber: string | null;
  serviceType: string | null;
  currency: string | null;
  taxAmount: number | null;
  totalAmount: number | null;
  outstandingAmount: number | null;
  outstandingDays: number | null;
  remarks: string | null;
  /** Empty when the row read cleanly. A row is never discarded for being wrong. */
  issues: string[];
}

export interface ParseResult {
  lines: ParsedLine[];
  /** 1-indexed row the headers were found on, for the reviewer's reference. */
  headerRow: number;
  /** Blank rows passed over between the header and the last row carrying data. */
  skipped: number;
  /** Column headings present in the file that nothing here maps. */
  unmapped: string[];
}

export class UnreadableStatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableStatementError';
  }
}

/** Accepted spellings per field. Matched case- and space-insensitively. */
const HEADERS: Record<keyof Omit<ParsedLine, 'lineNo' | 'issues' | 'invoiceDateRaw'>, string[]> = {
  legalEntity: ['legal entity', 'entity', 'nesr entity'],
  invoiceNumber: ['invoice number', 'invoice no', 'invoice no.', 'invoice #', 'invoice'],
  invoiceDate: ['invoice date', 'date'],
  poNumber: ['purchase order number', 'po number', 'po no', 'po no.', 'po #', 'po'],
  serviceType: ['type of service / product delivered', 'type of service', 'service type', 'type'],
  currency: ['currency', 'ccy'],
  taxAmount: ['tax / vat (amount)', 'tax / vat', 'tax', 'vat', 'vat amount', 'tax amount'],
  totalAmount: [
    'total amount (including tax or vat)',
    'total amount',
    'invoice amount',
    'gross amount',
  ],
  outstandingAmount: ['total amount outstanding', 'amount outstanding', 'outstanding', 'balance'],
  outstandingDays: ['invoice outstanding days', 'outstanding days', 'ageing', 'aging', 'days'],
  remarks: ['remarks', 'remark', 'comments', 'notes'],
};

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Flatten whatever ExcelJS hands back for a cell into plain text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText))
      return value.richText.map((t) => t.text).join('');
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return String(value.result ?? '');
    if ('hyperlink' in value) {
      const link = value as { text?: unknown; hyperlink?: unknown };
      return String(link.text ?? link.hyperlink ?? '');
    }
    return '';
  }
  return String(value);
}

/**
 * Read a number a supplier typed.
 *
 * Statements arrive with thousands separators, currency prefixes, trailing minus signs and
 * accounting parentheses for negatives. A value that is genuinely not a number returns null and
 * the caller records an issue rather than storing a zero, which would read as "nothing owed".
 */
export function parseAmount(raw: ExcelJS.CellValue): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let text = cellText(raw).trim();
  if (!text) return null;

  const negative = /^\(.*\)$/.test(text) || /-\s*$/.test(text);
  text = text
    .replace(/^\(|\)$/g, '')
    .replace(/[^\d.,-]/g, '')
    .replace(/-\s*$/, '')
    .trim();

  // A comma is a thousands separator here; a decimal comma would need the locale, which a
  // spreadsheet cell does not carry.
  text = text.replace(/,/g, '');
  if (!text || !/\d/.test(text)) return null;

  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative && n > 0 ? -n : n;
}

/** Read a date, accepting what Excel gives and the common typed forms. */
export function parseDate(raw: ExcelJS.CellValue): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  // A date-formatted cell read as a number is an Excel serial: days since 1899-12-30.
  if (typeof raw === 'number') {
    if (raw < 1 || raw > 60000) return null;
    return new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
  }

  const text = cellText(raw).trim();
  if (!text) return null;

  // Day-first, which is how every country in scope writes a date, and unambiguous for >12.
  const dmy = text.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return date.getUTCMonth() === Number(m) - 1 ? date : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const named = wb.getWorksheet('SOA');
  if (named) return named;
  const visible = wb.worksheets.filter((w) => w.state !== 'hidden' && w.state !== 'veryHidden');
  const sheet = visible[0] ?? wb.worksheets[0];
  if (!sheet)
    throw new UnreadableStatementError(
      'That workbook has no sheets in it at all, so there is nothing to read. Nothing has been filed.',
    );
  return sheet;
}

/**
 * The row that looks most like a header, for the error message when none is a header.
 *
 * The widest row in the first 40 is the table's own heading in every layout we have seen, letter-
 * head and covering note included, because those are a cell or two wide and a table is not.
 */
function widestRow(sheet: ExcelJS.Worksheet): string[] {
  let best: string[] = [];
  const limit = Math.min(sheet.rowCount, 40);
  for (let r = 1; r <= limit; r++) {
    const texts: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell.value).replace(/\s+/g, ' ').trim();
      if (text) texts.push(text);
    });
    if (texts.length > best.length) best = texts;
  }
  return best;
}

/**
 * Locate the header row.
 *
 * Anchored on the invoice-number column because it is the one field a statement cannot omit, and
 * looked for over the first 40 rows so a supplier's letterhead, logo or covering note above the
 * table does not defeat it.
 *
 * When it is not there the message has to do real work. This is the error a champion actually
 * hits - HQ Dubai lost a day to it - and it used to read "Could not find an Invoice Number column
 * in the first 40 rows. Is this the statement template?", which asks the reader a question it is
 * in a far better position to answer itself. It knows which sheet it opened, which sheets it
 * passed over, and what the columns in front of it actually say. Saying all three turns "it did
 * not work" into "you sent the PO report, not the statement".
 *
 * It stops at the diagnosis and says nothing about where to get the right file, because this
 * parser serves two readers who fetch it from different places: a champion has the vendor's
 * template a click away in the upload dialog, and a supplier has it attached to the email we
 * sent them. `storeStatement` knows which of the two is uploading and adds that sentence.
 */
function findHeaderRow(sheet: ExcelJS.Worksheet, sheetNames: string[]): number {
  const limit = Math.min(sheet.rowCount, 40);
  for (let r = 1; r <= limit; r++) {
    let hit = false;
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (HEADERS.invoiceNumber.includes(norm(cellText(cell.value)))) hit = true;
    });
    if (hit) return r;
  }

  const found = widestRow(sheet);
  const shown = found.slice(0, 6).map((t) => `"${t}"`).join(', ');
  const more = found.length > 6 ? `, and ${found.length - 6} more` : '';

  /* Named only when there is a choice to be wrong about. On a one-sheet workbook saying which
     sheet was read is noise; on a multi-sheet one it is half the answer, because the statement
     is often sitting on the tab next to the one that opened, and naming that tab is the whole
     fix. The others are listed, not all of them, so the sentence says something new. */
  const others = sheetNames.filter((n) => n !== sheet.name);
  const whichSheet = others.length
    ? ` It read the "${sheet.name}" sheet; the workbook also has ${others.map((n) => `"${n}"`).join(', ')}.`
    : '';

  const columns = !found.length
    ? ' The sheet it read is empty.'
    : found.length === 1
      ? ` The only column in it is ${shown}.`
      : ` The columns in it are ${shown}${more}.`;

  throw new UnreadableStatementError(
    'This is not the statement template, so no invoice rows could be read from it. ' +
      'The template has a column headed "Invoice Number" and this file has none.' +
      whichSheet +
      columns,
  );
}

/** Parse a returned statement. Throws only when the file itself cannot be read. */
export async function parseSupplierWorkbook(bytes: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    /* exceljs ships its own, older `Buffer` declaration. Take the parameter type from the method
       rather than asserting a type that only happens to match today. */
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    throw new UnreadableStatementError(
      'That file could not be opened as a workbook at all. A file renamed to .xlsx is still ' +
        'whatever it was before, and an older .xls or a .csv has to be re-saved as .xlsx from ' +
        'Excel before it can be read. Nothing has been filed.',
    );
  }

  const sheet = pickSheet(wb);
  const headerRow = findHeaderRow(
    sheet,
    wb.worksheets.filter((w) => w.state !== 'hidden' && w.state !== 'veryHidden').map((w) => w.name),
  );

  const columns = new Map<keyof typeof HEADERS, number>();
  const seen: { text: string; col: number }[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const text = norm(cellText(cell.value));
    if (!text) return;
    seen.push({ text, col });
    for (const [field, spellings] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
      if (!columns.has(field) && spellings.includes(text)) columns.set(field, col);
    }
  });

  const mappedCols = new Set(columns.values());
  const unmapped = seen.filter((s) => !mappedCols.has(s.col)).map((s) => s.text);

  const get = (row: ExcelJS.Row, field: keyof typeof HEADERS): ExcelJS.CellValue => {
    const col = columns.get(field);
    return col ? row.getCell(col).value : null;
  };
  const str = (v: ExcelJS.CellValue): string | null => {
    const t = cellText(v).trim();
    return t === '' ? null : t;
  };

  const lines: ParsedLine[] = [];
  let skipped = 0;
  let lineNo = 0;

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);

    const fields = (Object.keys(HEADERS) as (keyof typeof HEADERS)[]).map((f) => get(row, f));
    if (fields.every((v) => cellText(v).trim() === '')) {
      skipped += 1;
      continue;
    }

    const issues: string[] = [];
    const invoiceNumber = str(get(row, 'invoiceNumber'));
    const poNumber = str(get(row, 'poNumber'));
    /* A missing invoice number is only a problem when there is no purchase order either. The
       instructions explicitly ask for a PO with a blank invoice number where goods were received
       but not yet billed, so flagging that would put an issue on every correctly-filled row of an
       unbilled delivery. */
    if (!invoiceNumber && !poNumber) issues.push('No invoice or purchase order number');

    const dateCell = get(row, 'invoiceDate');
    const invoiceDate = parseDate(dateCell);
    const dateText = cellText(dateCell).trim();
    if (dateText && !invoiceDate) issues.push(`Invoice date "${dateText}" could not be read`);
    if (!dateText) issues.push('No invoice date');

    const totalCell = get(row, 'totalAmount');
    const totalAmount = parseAmount(totalCell);
    if (cellText(totalCell).trim() && totalAmount === null)
      issues.push(`Total amount "${cellText(totalCell).trim()}" could not be read`);

    const outstandingCell = get(row, 'outstandingAmount');
    const outstandingAmount = parseAmount(outstandingCell);
    if (cellText(outstandingCell).trim() && outstandingAmount === null)
      issues.push(`Outstanding amount "${cellText(outstandingCell).trim()}" could not be read`);
    if (outstandingAmount === null && totalAmount === null)
      issues.push('No amount on this row');

    lineNo += 1;
    lines.push({
      lineNo,
      legalEntity: str(get(row, 'legalEntity')),
      invoiceNumber,
      invoiceDate,
      invoiceDateRaw: invoiceDate ? null : (dateText ?? null) || null,
      poNumber,
      serviceType: str(get(row, 'serviceType')),
      currency: str(get(row, 'currency'))?.toUpperCase() ?? null,
      taxAmount: parseAmount(get(row, 'taxAmount')),
      totalAmount,
      outstandingAmount,
      outstandingDays: (() => {
        const n = parseAmount(get(row, 'outstandingDays'));
        return n === null ? null : Math.round(n);
      })(),
      remarks: str(get(row, 'remarks')),
      issues,
    });
  }

  return { lines, headerRow, skipped, unmapped: [...new Set(unmapped)] };
}
