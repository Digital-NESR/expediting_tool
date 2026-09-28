import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  consolidatedFileName,
  writeConsolidated,
  type ConsolidatedRow,
} from '@/lib/soa/consolidated';

/**
 * The file AP posts from. What matters is that every returned line survives into it in the
 * sixteen-column shape they already use, and that a line the parser could not fully read arrives
 * saying so rather than looking clean.
 */
const row = (over: Partial<ConsolidatedRow> = {}): ConsolidatedRow => ({
  vendor_no: '0001103633',
  vendor_name: 'ARABCO INTERNATIONAL GROUP',
  month_year: 'September 2026',
  legal_entity: '2555 - Gulf Energy Services LLC',
  invoice_number: 'INV-1',
  invoice_date: new Date(Date.UTC(2026, 8, 5)),
  invoice_date_raw: null,
  po_number: 'PO-1',
  service_type: 'Rental',
  currency: 'USD',
  tax_amount: 50,
  total_amount: 1050,
  outstanding_amount: 1050,
  outstanding_days: 30,
  remarks: '',
  issues: [],
  country_name: 'Kuwait',
  cycle_label: 'Q3 2026',
  ...over,
});

async function open(file: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb.getWorksheet('SOA')!;
}

const text = (v: ExcelJS.CellValue): string =>
  v === null || v === undefined
    ? ''
    : v instanceof Date
      ? v.toISOString().slice(0, 10)
      : typeof v === 'object' && 'text' in v
        ? String(v.text ?? '')
        : String(v);

describe('writeConsolidated', () => {
  it('writes the full sixteen-column format AP already works in', async () => {
    const { file } = await writeConsolidated([row()]);
    const sheet = await open(file);
    const head: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (head[n] = text(c.value).trim()));
    expect(head.slice(1, 17)).toEqual([
      'Ser#', 'Month/Year', 'Country', 'Legal Entity', 'Vendor Name', 'Vendor No.',
      'Invoice Number', 'Invoice Date', 'Purchase Order Number',
      'Type of service / Product Delivered', 'Currency', 'TAX / VAT (Amount)',
      'Total Amount (Including TAX or VAT)', 'Total Amount Outstanding',
      'Invoice Outstanding Days', 'Remarks',
    ]);
  });

  it('carries the columns the supplier never saw, because we stamped them', async () => {
    const sheet = await open((await writeConsolidated([row()])).file);
    const r = sheet.getRow(2);
    expect(text(r.getCell(2).value)).toBe('September 2026');
    expect(text(r.getCell(3).value)).toBe('Kuwait');
    expect(text(r.getCell(5).value)).toBe('ARABCO INTERNATIONAL GROUP');
    expect(text(r.getCell(6).value)).toBe('0001103633');
  });

  it('numbers the rows from one, whatever order they arrived in', async () => {
    const sheet = await open(
      (await writeConsolidated([row({ invoice_number: 'A' }), row({ invoice_number: 'B' })])).file,
    );
    expect(text(sheet.getRow(2).getCell(1).value)).toBe('1');
    expect(text(sheet.getRow(3).getCell(1).value)).toBe('2');
  });

  it('clears the sample data the template ships with', async () => {
    const sheet = await open((await writeConsolidated([row()])).file);
    const seen: string[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) seen.push(text(sheet.getRow(r).getCell(3).value));
    // The template arrives with 38 rows of somebody else's Indonesia data.
    expect(seen).not.toContain('Indonesia');
  });

  it('says on the row when the parser could not read something', async () => {
    const { file, summary } = await writeConsolidated([
      row({ remarks: 'partial shipment', outstanding_amount: null, issues: ['No amount on this row'] }),
    ]);
    const sheet = await open(file);
    const remark = text(sheet.getRow(2).getCell(16).value);
    // The supplier's own remark is kept; ours is appended. A row that looks clean but is missing
    // an amount is worse than one that says so, and AP is the last person who can ask the vendor.
    expect(remark).toContain('partial shipment');
    expect(remark).toContain('No amount on this row');
    expect(summary.needingReview).toBe(1);
  });

  it('keeps an unreadable date as the supplier wrote it', async () => {
    const sheet = await open(
      (await writeConsolidated([row({ invoice_date: null, invoice_date_raw: 'shortly' })])).file,
    );
    // Blank would read as "they left it empty", which is a different problem.
    expect(text(sheet.getRow(2).getCell(8).value)).toBe('shortly');
  });

  it('totals each currency separately', async () => {
    const { summary } = await writeConsolidated([
      row({ currency: 'USD', outstanding_amount: 100 }),
      row({ currency: 'KWD', outstanding_amount: 50 }),
      row({ currency: 'USD', outstanding_amount: 25 }),
    ]);
    expect(summary.totalsByCurrency).toEqual([
      { currency: 'USD', outstanding: 125 },
      { currency: 'KWD', outstanding: 50 },
    ]);
  });

  it('counts vendors rather than lines', async () => {
    const { summary } = await writeConsolidated([
      row({ vendor_no: 'A' }),
      row({ vendor_no: 'A', invoice_number: 'INV-2' }),
      row({ vendor_no: 'B' }),
    ]);
    expect(summary.vendors).toBe(2);
    expect(summary.lines).toBe(3);
  });
});

describe('consolidatedFileName', () => {
  it('names the file for the country and cycle', () => {
    expect(consolidatedFileName('KW', 'Q3 2026')).toBe('NESR-SOA-Consolidated-KW-Q3-2026.xlsx');
  });
});
