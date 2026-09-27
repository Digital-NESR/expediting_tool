import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

/**
 * The workbook a supplier is asked to fill in.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * This is a stripped version of the consolidated format that goes to AP. The supplier is asked for
 * invoices and nothing else: their own name and vendor number are not columns, because we know who
 * returned the file and asking them to repeat it on every row only creates a way for it to
 * disagree with what we have. Those are stamped onto the parsed rows on the way back in — see
 * `./submission-lines`.
 *
 * One file per country rather than per vendor. Nothing about it varies by supplier, but the Legal
 * Entity column is a dropdown and a country's entity list is the one thing that does vary: KSA has
 * seven entities, Kuwait six, Qatar two.
 */

const TEMPLATE = path.join(process.cwd(), 'assets', 'soa', 'soa-format.xlsx');

/**
 * Columns kept on the supplier's sheet, in order, named exactly as the consolidated format names
 * them so the two line up without a translation table.
 *
 * Legal Entity stays. It varies per invoice, only the supplier knows which NESR entity they billed,
 * and nothing in our data can reconstruct it — `historic_spend` does not carry an entity.
 */
export const SUPPLIER_COLUMNS = [
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
] as const;

/** Columns dropped from the consolidated format, and where each one comes from instead. */
export const STAMPED_ON_UPLOAD = ['Month/Year', 'Country', 'Vendor Name', 'Vendor No.'] as const;

/**
 * SOA country id → the name the workbook uses.
 *
 * The Legal Entity dropdown resolves through the workbook's defined names, and its spellings are
 * its own: Saudi Arabia is `KSA`, Abu Dhabi is `UAE`. Written beside the file it describes,
 * because the two change together.
 *
 * Three countries have no column of their own but are covered by another: the workbook files
 * Congo and Chad under `SSA` (it carries `3587 - NPS Bahrain-Congo` and `3485 - NPS Energy Holding
 * WLL, SUCCURSAL`), and EOS DMCC under `EOS` (`2112 - Energy Oilfield Services DMCC`). Those
 * suppliers see their region's short list and pick from it, which beats a free-text box. Chad's
 * entity is an inference from the two SSA rows rather than something the workbook states.
 */
const WORKBOOK_COUNTRY: Record<string, string | null> = {
  SA: 'KSA',
  EOS: 'EOS_JAFZA',
  OM: 'Oman',
  DZ: 'Algeria',
  KW: 'Kuwait',
  AUH: 'UAE',
  EG: 'Egypt',
  IQ: 'Iraq',
  HQ: 'HQ_Dubai',
  LY: 'Libya',
  QA: 'Qatar',
  ID: 'Indonesia',
  JO: 'Jordan',
  IN: 'India',
  YE: 'Yemen',
  DMCC: 'EOS',
  TD: 'SSA',
  CG: 'SSA',
};

export function workbookCountryName(countryId: string): string | null {
  return WORKBOOK_COUNTRY[countryId] ?? null;
}

let templateCache: Buffer | null = null;
const built = new Map<string, Buffer>();

async function templateBytes(): Promise<Buffer> {
  templateCache ??= await readFile(TEMPLATE);
  return templateCache;
}

/**
 * Build the lean workbook for a country.
 *
 * The consolidated template is loaded and reduced: the four columns we stamp ourselves are
 * removed, the 38 rows of leftover sample data the template ships with are cleared, and the Legal
 * Entity dropdown is repointed. It has to be repointed because the original is `INDIRECT($C2)`,
 * which reads the Country cell — and Country is one of the columns being removed. Pointing it
 * straight at the country's named range gives the supplier the same list without the column.
 *
 * The Legal Entities sheet is kept but hidden: the dropdown resolves through it, and a supplier
 * has no reason to be reading a list of every NESR entity in every country.
 *
 * Cached per country. Nothing about it varies per vendor or per cycle.
 */
export async function buildSupplierWorkbook(countryId: string): Promise<Buffer> {
  const cached = built.get(countryId);
  if (cached) return cached;

  const wb = new ExcelJS.Workbook();
  /* exceljs ships its own, older `Buffer` declaration, so a Node Buffer does not satisfy its
     signature by name. Take the parameter type from the method itself rather than asserting a
     type that only happens to match today. */
  const bytes = await templateBytes();
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.getWorksheet('SOA');
  if (!sheet) throw new Error('The SOA Format template has no "SOA" sheet.');

  // Read the consolidated header row, then keep only the columns the supplier fills.
  const header: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, n) => {
    const v = cell.value;
    header[n] =
      v && typeof v === 'object' && 'text' in v ? String(v.text ?? '') : String(v ?? '').trim();
  });

  const keep = SUPPLIER_COLUMNS.map((name) =>
    header.findIndex((h) => (h ?? '').trim().toLowerCase() === name.toLowerCase()),
  );
  const missing = SUPPLIER_COLUMNS.filter((_, i) => keep[i] < 1);
  if (missing.length) {
    throw new Error(`The SOA Format template is missing: ${missing.join(', ')}`);
  }

  // Removing right to left keeps the indices of the columns still to be removed valid.
  const drop = header
    .map((_, n) => n)
    .filter((n) => n >= 1 && !keep.includes(n))
    .sort((a, b) => b - a);
  for (const n of drop) sheet.spliceColumns(n, 1);

  // Clear the sample rows the template ships with. A supplier returning a statement with somebody
  // else's entity still on row 4 is worse than a blank sheet.
  for (let r = sheet.rowCount; r >= 2; r--) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= SUPPLIER_COLUMNS.length; c++) row.getCell(c).value = null;
  }

  const entityCol = SUPPLIER_COLUMNS.indexOf('Legal Entity') + 1;
  const named = workbookCountryName(countryId);
  if (named) {
    // Straight at the country's named range, since the Country cell the original INDIRECT read is
    // no longer on the sheet.
    for (let r = 2; r <= 200; r++) {
      sheet.getRow(r).getCell(entityCol).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=${named}`],
        showErrorMessage: true,
        showInputMessage: true,
      };
    }
  }
  // An unknown country id leaves the column as free text rather than offering somebody else's
  // entities; every id the tool actually has does resolve.


  const entities = wb.getWorksheet('Legal Entities');
  if (entities) entities.state = 'veryHidden';

  const out = Buffer.from(await wb.xlsx.writeBuffer());
  built.set(countryId, out);
  return out;
}

/** File name the supplier sees. Free of characters that travel badly through mail clients. */
export function attachmentFileName(cycleLabel: string): string {
  const safe = cycleLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NESR-Statement-of-Account-${safe}.xlsx`;
}
