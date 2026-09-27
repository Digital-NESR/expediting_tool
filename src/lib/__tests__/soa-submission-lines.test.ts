import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildSupplierWorkbook } from '@/lib/soa/attachment';
import {
  UnreadableStatementError,
  parseAmount,
  parseDate,
  parseSupplierWorkbook,
} from '@/lib/soa/submission-lines';

/** Build a workbook the way a supplier's export would look, then read it back. */
async function sheetOf(rows: unknown[][], headerAt = 1): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SOA');
  for (let i = 1; i < headerAt; i++) ws.addRow(['Statement of account', '', '']);
  for (const r of rows) ws.addRow(r as ExcelJS.CellValue[]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEAD = [
  'Ser#',
  'Legal Entity',
  'Invoice Number',
  'Invoice Date',
  'Purchase Order Number',
  'Type of service / Product Delivered',
  'Currency',
  'TAX / VAT (Amount)',
  'Total Amount (Including TAX or VAT)',
  'Total Amount Outstanding',
  'Invoice Outstanding Days',
  'Remarks',
];

describe('parseAmount', () => {
  it('reads what suppliers actually type', () => {
    expect(parseAmount(1234.5)).toBe(1234.5);
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('KWD 1,234.50')).toBe(1234.5);
    expect(parseAmount(' 1 234.50 ')).toBe(1234.5);
  });

  it('understands both ways of writing a negative', () => {
    // Accounting parentheses and a trailing minus both appear in real statements.
    expect(parseAmount('(500.00)')).toBe(-500);
    expect(parseAmount('500.00-')).toBe(-500);
  });

  it('returns null rather than zero for something that is not a number', () => {
    // Storing 0 would read as "nothing owed", which is a different and much worse claim.
    for (const v of ['', null, undefined, 'N/A', '-', 'see attached']) expect(parseAmount(v)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads an Excel serial', () => {
    expect(parseDate(45931)?.toISOString().slice(0, 10)).toBe('2025-10-01');
  });

  it('reads day-first, which is how every country in scope writes it', () => {
    expect(parseDate('05/09/2026')?.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(parseDate('5-9-26')?.toISOString().slice(0, 10)).toBe('2026-09-05');
  });

  it('refuses a date that is not one', () => {
    expect(parseDate('32/13/2026')).toBeNull();
    expect(parseDate('shortly')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('parseSupplierWorkbook', () => {
  it('reads a clean statement', async () => {
    const buf = await sheetOf([
      HEAD,
      [1, '2555 - Gulf Energy Services LLC', 'INV-001', '05/09/2026', 'PO-9', 'Rental', 'USD', 50, 1050, 1050, 30, 'ok'],
      [2, '2555 - Gulf Energy Services LLC', 'INV-002', '12/09/2026', 'PO-10', 'Parts', 'USD', 0, 200, 200, 22, ''],
    ]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].invoiceNumber).toBe('INV-001');
    expect(res.lines[0].outstandingAmount).toBe(1050);
    expect(res.lines[0].invoiceDate?.toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(res.lines.every((l) => l.issues.length === 0)).toBe(true);
  });

  it('finds the header when the supplier puts a letterhead above it', async () => {
    const buf = await sheetOf(
      [HEAD, [1, 'E', 'INV-7', '01/09/2026', '', '', 'USD', 0, 10, 10, 1, '']],
      4,
    );
    const res = await parseSupplierWorkbook(buf);
    expect(res.headerRow).toBe(4);
    expect(res.lines).toHaveLength(1);
  });

  it('matches columns by name, so a reordered or renamed sheet still reads', async () => {
    const buf = await sheetOf([
      ['Invoice No.', 'Date', 'Balance', 'Ccy'],
      ['INV-9', '03/09/2026', '2,500.00', 'usd'],
    ]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines[0].invoiceNumber).toBe('INV-9');
    expect(res.lines[0].outstandingAmount).toBe(2500);
    expect(res.lines[0].currency).toBe('USD');
  });

  it('reads the consolidated format too, in case they return the wrong one', async () => {
    const buf = await sheetOf([
      ['Ser#', 'Month/Year', 'Country', 'Legal Entity', 'Vendor Name', 'Vendor No.', 'Invoice Number', 'Invoice Date', 'Purchase Order Number', 'Type of service / Product Delivered', 'Currency', 'TAX / VAT (Amount)', 'Total Amount (Including TAX or VAT)', 'Total Amount Outstanding', 'Invoice Outstanding Days', 'Remarks'],
      [1, 'Sep 2026', 'Kuwait', '2555', 'ARABCO', '0001103633', 'INV-5', '09/09/2026', 'PO-1', 'Svc', 'USD', 0, 100, 100, 5, ''],
    ]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].invoiceNumber).toBe('INV-5');
    // Vendor Name and Vendor No. are ours to stamp; whatever they typed is ignored, not trusted.
    expect(res.unmapped).toEqual(expect.arrayContaining(['vendor name', 'vendor no.']));
  });

  it('keeps a bad row and says what is wrong with it', async () => {
    const buf = await sheetOf([
      HEAD,
      [1, 'E', '', 'shortly', 'PO-1', '', 'USD', 0, 'see attached', '', '', 'chase'],
    ]);
    const res = await parseSupplierWorkbook(buf);
    // A dropped invoice is the one thing a reconciliation cannot survive.
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].issues).toEqual(
      expect.arrayContaining([
        'Invoice date "shortly" could not be read',
        'No amount on this row',
      ]),
    );
    // A PO number is present, so the blank invoice number is the documented unbilled case.
    expect(res.lines[0].issues).not.toContain('No invoice or purchase order number');
    expect(res.lines[0].invoiceDateRaw).toBe('shortly');
  });

  it('accepts a purchase order with no invoice, which the instructions ask for', async () => {
    const buf = await sheetOf([
      HEAD,
      [1, 'E', '', '01/09/2026', 'PO-44', 'Delivered, not yet billed', 'USD', 0, 900, 900, 3, ''],
    ]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines[0].poNumber).toBe('PO-44');
    expect(res.lines[0].issues).toEqual([]);
  });

  it('flags a row with neither an invoice nor a purchase order', async () => {
    const buf = await sheetOf([HEAD, [1, 'E', '', '01/09/2026', '', '', 'USD', 0, 10, 10, 1, '']]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines[0].issues).toContain('No invoice or purchase order number');
  });

  it('skips blank rows without renumbering around them', async () => {
    const buf = await sheetOf([
      HEAD,
      [1, 'E', 'INV-1', '01/09/2026', '', '', 'USD', 0, 10, 10, 1, ''],
      [],
      [],
      [4, 'E', 'INV-2', '02/09/2026', '', '', 'USD', 0, 20, 20, 2, ''],
    ]);
    const res = await parseSupplierWorkbook(buf);
    expect(res.lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(res.lines.map((l) => l.invoiceNumber)).toEqual(['INV-1', 'INV-2']);
    expect(res.skipped).toBe(2);
  });

  it('reads back the very workbook we send out', async () => {
    // The blank we hand suppliers must itself be parseable, or the first real return will fail.
    const res = await parseSupplierWorkbook(
      await buildSupplierWorkbook('KW', 'Kuwait', ['financeteam.kuwait@nesr.com']),
    );
    expect(res.lines).toHaveLength(0);
    expect(res.headerRow).toBe(1);
  });

  it('refuses a file that is not a statement, rather than returning nothing', async () => {
    const buf = await sheetOf([['Name', 'Address'], ['Acme', 'Kuwait City']]);
    await expect(parseSupplierWorkbook(buf)).rejects.toBeInstanceOf(UnreadableStatementError);
  });

  it('refuses something that is not a workbook at all', async () => {
    await expect(parseSupplierWorkbook(Buffer.from('not a workbook'))).rejects.toBeInstanceOf(
      UnreadableStatementError,
    );
  });
});
