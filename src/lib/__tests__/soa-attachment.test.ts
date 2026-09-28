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

const AP = ['financeteam.kuwait@nesr.com', 'financeteam.kuwait@cpvenkuwait.com'];
const CHAMPS = ['anair1@nesr.com'];

function sheetText(sheet: ExcelJS.Worksheet): string {
  const out: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (c) => out.push(text(c.value)));
  });
  return out.join(' ');
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
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const sheet = wb.getWorksheet('SOA')!;
    const header: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (header[n] = text(c.value).trim()));
    expect(header.slice(1, SUPPLIER_COLUMNS.length + 1)).toEqual([...SUPPLIER_COLUMNS]);
  });

  it('drops the four columns we stamp ourselves', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const sheet = wb.getWorksheet('SOA')!;
    const header: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (c, n) => (header[n] = text(c.value).trim()));
    // The supplier is never asked to retype their own name or number.
    for (const gone of ['Month/Year', 'Country', 'Vendor Name', 'Vendor No.'])
      expect(header).not.toContain(gone);
  });

  it('ships empty, nothing is pre-filled', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const sheet = wb.getWorksheet('SOA')!;
    for (let r = 2; r <= sheet.rowCount; r++)
      for (let c = 1; c <= SUPPLIER_COLUMNS.length; c++)
        expect(text(sheet.getRow(r).getCell(c).value), `r${r}c${c}`).toBe('');
  });

  it('points Legal Entity at that country’s entity list', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const col = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
    const v = wb.getWorksheet('SOA')!.getRow(2).getCell(col).dataValidation;
    expect(v?.type).toBe('list');
    // The original INDIRECT($C2) read the Country cell, which is no longer on the sheet.
    expect(v?.formulae).toEqual(['=Kuwait']);
  });

  it('makes Excel enforce a real date rather than leaving the parser to guess', async () => {
    const sheet = (await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS))).getWorksheet('SOA')!;
    const v = sheet.getRow(2).getCell(SUPPLIER_COLUMNS.indexOf('Invoice Date') + 1).dataValidation;
    // A date Excel accepts arrives as a real date, so nothing downstream has to decide whether
    // 05/09 means May or September.
    expect(v?.type).toBe('date');
    expect(v?.showInputMessage).toBe(true);
    expect(v?.prompt).toContain('real date');
  });

  it('tells the supplier what each awkward column wants, before they type', async () => {
    const sheet = (await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS))).getWorksheet('SOA')!;
    const promptFor = (name: (typeof SUPPLIER_COLUMNS)[number]) =>
      sheet.getRow(2).getCell(SUPPLIER_COLUMNS.indexOf(name) + 1).dataValidation?.prompt ?? '';
    // Every one of these is a column the parser previously had to interpret after the fact.
    expect(promptFor('Total Amount Outstanding')).toContain('Numbers only');
    expect(promptFor('Currency')).toContain('three-letter code');
    expect(promptFor('Invoice Outstanding Days')).toContain('whole number');
    expect(promptFor('Legal Entity')).toContain('Choose the NESR entity');
  });

  it('warns rather than blocks, so a supplier is never stuck', async () => {
    const sheet = (await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS))).getWorksheet('SOA')!;
    for (const name of ['Invoice Date', 'Total Amount Outstanding', 'Currency'] as const) {
      const v = sheet.getRow(2).getCell(SUPPLIER_COLUMNS.indexOf(name) + 1).dataValidation;
      // A hard stop on a statement somebody is trying to return is worse than a flagged row we
      // can query: allowBlank, and a warning they can override.
      expect(v?.allowBlank, name).toBe(true);
      expect(v?.errorStyle, name).toBe('warning');
    }
  });

  it('leaves a dropdown on Legal Entity and nowhere else', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const sheet = wb.getWorksheet('SOA')!;
    const entity = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
    for (let c = 1; c <= SUPPLIER_COLUMNS.length; c++) {
      const v = sheet.getRow(2).getCell(c).dataValidation;
      // A dropdown belongs on the entity column only. The template's one sat on column D of the
      // sixteen-column layout, and stripping four columns made D the Invoice Date.
      if (c === entity) expect(v?.type, SUPPLIER_COLUMNS[c - 1]).toBe('list');
      else expect(v?.type, SUPPLIER_COLUMNS[c - 1]).not.toBe('list');
    }
  });

  it('gives Saudi Arabia the workbook’s spelling, not the tool’s', async () => {
    const wb = await open(await buildSupplierWorkbook('SA', 'Saudi Arabia', AP));
    const col = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
    expect(wb.getWorksheet('SOA')!.getRow(2).getCell(col).dataValidation?.formulae).toEqual(['=KSA']);
  });

  it('keeps the defined names the dropdown resolves through, but hides the lookup sheet', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const names = (wb.definedNames.model ?? []).map((d: { name: string }) => d.name);
    expect(names).toContain('Kuwait');
    // The dropdown needs the sheet; the supplier has no reason to read every NESR entity.
    expect(wb.getWorksheet('Legal Entities')!.state).toBe('veryHidden');
  });

  it('keeps the instructions the supplier needs', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    expect(wb.worksheets.map((w) => w.name)).toContain('Instruction');
  });

  it('removes the AP mailbox sheet', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    // That list belongs to NESR, not to the supplier; the one address that concerns them is on
    // the instructions.
    expect(wb.worksheets.map((w) => w.name)).not.toContain('AP Group Emails');
  });

  it('tells the supplier to upload rather than reply by email', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const body = sheetText(wb.getWorksheet('Instruction')!);
    // The link is per vendor and this workbook is per country, so it points back at the email.
    expect(body).toContain('secure link in the email');
    expect(body).not.toContain('Send the completed workbook to');
  });

  it('prints both the champion and AP addresses, for questions', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS));
    const body = sheetText(wb.getWorksheet('Instruction')!);
    for (const email of [...AP, ...CHAMPS]) expect(body).toContain(email);
    expect(body).toContain('SOA Champion');
    expect(body).toContain('Accounts Payable');
    expect(body).toContain('Kuwait');
    // The template's own closing line pointed at a sheet by a name it never had.
    expect(body).not.toContain('Email Notification Tab');
  });

  it('says something useful when a country has no AP address', async () => {
    const wb = await open(await buildSupplierWorkbook('KW', 'Kuwait', [], []));
    // Sending is blocked in that state, so this should never ship, but a blank where an address
    // belongs would be worse than saying so.
    expect(sheetText(wb.getWorksheet('Instruction')!)).toContain(
      'NESR contact who sent you this request',
    );
  });

  it('does not serve one country the instructions built for another', async () => {
    // The AP addresses are printed into the sheet, so they are part of the cache key.
    const kw = await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS);
    const sa = await buildSupplierWorkbook('SA', 'Saudi Arabia', ['invoices.ksa@nesr.com'], CHAMPS);
    expect(kw.equals(sa)).toBe(false);
  });

  it('stays small enough to travel inside the webhook payload', async () => {
    const buf = await buildSupplierWorkbook('KW', 'Kuwait', AP, CHAMPS);
    expect(buf.byteLength).toBeLessThan(120_000);
  });
});

describe('attachmentFileName', () => {
  it('is named for the cycle, not the vendor. The file is the same for everyone', () => {
    expect(attachmentFileName('Q3 2026')).toBe('NESR-Statement-of-Account-Q3-2026.xlsx');
  });
});
