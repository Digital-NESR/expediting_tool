import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  SUPPLIER_COLUMNS,
  attachmentFileName,
  buildSupplierWorkbook,
  workbookCountryName,
} from '@/lib/soa/attachment';

/**
 * These load the real template from `assets/soa/soa-format.xlsx` rather than a fixture: the thing
 * worth testing is that the shipped workbook survives being stripped, and a fixture would stop
 * telling the truth the moment the format changed.
 */
async function open(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

function text(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text ?? '');
  return String(cell);
}

describe('workbookCountryName', () => {
  it('uses the workbook’s own spellings, which are not the tool’s', () => {
    expect(workbookCountryName('SA')).toBe('KSA');
    expect(workbookCountryName('AUH')).toBe('UAE');
    expect(workbookCountryName('EOS')).toBe('EOS_JAFZA');
    expect(workbookCountryName('HQ')).toBe('HQ_Dubai');
  });

  it('files the three countries with no column of their own under the one that carries them', () => {
    // SSA holds 3587 NPS Bahrain-Congo and 3485 NPS Energy Holding SUCCURSAL; EOS holds 2112 DMCC.
    expect(workbookCountryName('CG')).toBe('SSA');
    expect(workbookCountryName('TD')).toBe('SSA');
    expect(workbookCountryName('DMCC')).toBe('EOS');
  });

  it('resolves every country the tool has', () => {
    const all = ['SA','EOS','OM','DZ','KW','AUH','EG','IQ','HQ','LY','QA','ID','DMCC','JO','TD','IN','CG','YE'];
    for (const id of all) expect(workbookCountryName(id), id).not.toBeNull();
  });
});

describe('buildSupplierWorkbook', () => {
  it('keeps only the columns the supplier fills', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    const sheet = wb.getWorksheet('SOA')!;
    const header: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (header[n] = text(c.value).trim()));
    expect(header.slice(1, SUPPLIER_COLUMNS.length + 1)).toEqual([...SUPPLIER_COLUMNS]);
  });

  it('drops the four columns we stamp ourselves', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    const sheet = wb.getWorksheet('SOA')!;
    const header: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (header[n] = text(c.value).trim()));
    // The supplier is never asked to retype their own name or number.
    for (const gone of ['Month/Year', 'Country', 'Vendor Name', 'Vendor No.'])
      expect(header).not.toContain(gone);
  });

  it('ships empty — nothing is pre-filled', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    const sheet = wb.getWorksheet('SOA')!;
    for (let r = 2; r <= sheet.rowCount; r++)
      for (let c = 1; c <= SUPPLIER_COLUMNS.length; c++)
        expect(text(sheet.getRow(r).getCell(c).value), `r${r}c${c}`).toBe('');
  });

  it('points Legal Entity at that country’s entity list', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    const col = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
    const v = wb.getWorksheet('SOA')!.getRow(2).getCell(col).dataValidation;
    expect(v?.type).toBe('list');
    // The original INDIRECT($C2) read the Country cell, which is no longer on the sheet.
    expect(v?.formulae).toEqual(['=Kuwait']);
  });

  it('gives Saudi Arabia the workbook’s spelling, not the tool’s', async () => {
    const wb = await open(await buildSupplierWorkbook('SA'));
    const col = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
    expect(wb.getWorksheet('SOA')!.getRow(2).getCell(col).dataValidation?.formulae).toEqual(['=KSA']);
  });

  it('keeps the defined names the dropdown resolves through, but hides the lookup sheet', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    const names = (wb.definedNames.model ?? []).map((d: { name: string }) => d.name);
    expect(names).toContain('Kuwait');
    // The dropdown needs the sheet; the supplier has no reason to read every NESR entity.
    expect(wb.getWorksheet('Legal Entities')!.state).toBe('veryHidden');
  });

  it('keeps the instructions the supplier needs', async () => {
    const wb = await open(await buildSupplierWorkbook('KW'));
    expect(wb.worksheets.map((w) => w.name)).toContain('Instruction');
  });

  it('stays small enough to travel inside the webhook payload', async () => {
    const buf = await buildSupplierWorkbook('KW');
    expect(buf.byteLength).toBeLessThan(120_000);
  });
});

describe('attachmentFileName', () => {
  it('is named for the cycle, not the vendor — the file is the same for everyone', () => {
    expect(attachmentFileName('Q3 2026')).toBe('NESR-Statement-of-Account-Q3-2026.xlsx');
  });
});
