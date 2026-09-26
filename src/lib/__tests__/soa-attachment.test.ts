import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  attachmentFileName,
  buildVendorWorkbook,
  workbookCountryName,
} from '@/lib/soa/attachment';

/**
 * These load the real template from `assets/soa/soa-format.xlsx` rather than a fixture: the thing
 * worth testing is that the shipped workbook survives being stamped, and a fixture would stop
 * telling the truth the moment the format changed.
 */

async function open(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

const INPUT = {
  countryId: 'KW',
  vendorName: 'ARABCO INTERNATIONAL GROUP',
  vendorNo: '0001103633',
  monthYear: 'September 2026',
};

function text(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text ?? '');
  return String(cell);
}

describe('workbookCountryName', () => {
  it('uses the workbook’s own spellings, which are not the tool’s', () => {
    // INDIRECT($C2) matches on the defined name, so these have to be exact.
    expect(workbookCountryName('SA')).toBe('KSA');
    expect(workbookCountryName('AUH')).toBe('UAE');
    expect(workbookCountryName('EOS')).toBe('EOS_JAFZA');
    expect(workbookCountryName('HQ')).toBe('HQ_Dubai');
  });

  it('returns null for the three countries the workbook does not define', () => {
    // The same three that have no AP mailbox; sending is already blocked for them.
    for (const id of ['DMCC', 'TD', 'CG']) expect(workbookCountryName(id)).toBeNull();
  });
});

describe('buildVendorWorkbook', () => {
  it('keeps every sheet the vendor needs', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Legal Entities',
      'Instruction',
      'SOA',
      'AP Group Emails',
    ]);
  });

  it('keeps the defined names the Legal Entity dropdown resolves through', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const names = (wb.definedNames.model ?? []).map((d: { name: string }) => d.name);
    // Without these, INDIRECT($C2) resolves to nothing and the vendor gets an empty list.
    for (const n of ['KSA', 'Kuwait', 'UAE', 'Oman', 'Egypt']) expect(names).toContain(n);
  });

  it('keeps the cascading validation on the Legal Entity column', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const v = wb.getWorksheet('SOA')!.getRow(2).getCell(4).dataValidation;
    expect(v?.type).toBe('list');
    expect(v?.formulae).toEqual(['INDIRECT($C2)']);
  });

  it('clears the sample rows the template ships with', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const sheet = wb.getWorksheet('SOA')!;
    const countries = new Set<string>();
    for (let r = 2; r <= sheet.rowCount; r++) countries.add(text(sheet.getRow(r).getCell(3).value));
    // The template arrives with 38 rows of someone else's Indonesia data on it.
    expect(countries.has('Indonesia')).toBe(false);
  });

  it('stamps the identifying columns and leaves the rest for the vendor', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const row = wb.getWorksheet('SOA')!.getRow(2);
    expect(text(row.getCell(1).value)).toBe('1');
    expect(text(row.getCell(2).value)).toBe('September 2026');
    expect(text(row.getCell(3).value)).toBe('Kuwait');
    expect(text(row.getCell(5).value)).toBe('ARABCO INTERNATIONAL GROUP');
    expect(text(row.getCell(6).value)).toBe('0001103633');
    // Invoice number, date, PO, amounts — all theirs to fill.
    for (const c of [7, 8, 9, 11, 12, 13, 14, 15]) expect(text(row.getCell(c).value)).toBe('');
  });

  it('never guesses the legal entity', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const sheet = wb.getWorksheet('SOA')!;
    // Kuwait has six entities. Picking one would put a wrong entity on a financial document, so
    // the column is left to the dropdown that the filled-in Country has already narrowed.
    for (let r = 2; r <= 26; r++) expect(text(sheet.getRow(r).getCell(4).value)).toBe('');
  });

  it('stamps enough rows to be useful', async () => {
    const wb = await open(await buildVendorWorkbook(INPUT));
    const sheet = wb.getWorksheet('SOA')!;
    let stamped = 0;
    for (let r = 2; r <= sheet.rowCount; r++)
      if (text(sheet.getRow(r).getCell(6).value) === '0001103633') stamped++;
    expect(stamped).toBe(25);
  });

  it('leaves Country blank for a country the workbook does not define', async () => {
    const wb = await open(await buildVendorWorkbook({ ...INPUT, countryId: 'TD' }));
    expect(text(wb.getWorksheet('SOA')!.getRow(2).getCell(3).value)).toBe('');
    // The vendor's own details are still stamped — only the dropdown key is missing.
    expect(text(wb.getWorksheet('SOA')!.getRow(2).getCell(6).value)).toBe('0001103633');
  });

  it('stays small enough to travel inside the webhook payload', async () => {
    const buf = await buildVendorWorkbook(INPUT);
    // 61 of these go out in a Kuwait batch; base64 adds a third.
    expect(buf.byteLength).toBeLessThan(120_000);
  });
});

describe('attachmentFileName', () => {
  it('names the file after the vendor and cycle, without awkward characters', () => {
    expect(attachmentFileName('0001103633', 'Q3 2026')).toBe('NESR-SOA-Q3-2026-0001103633.xlsx');
  });
});
