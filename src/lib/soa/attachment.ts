import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

/**
 * The SOA Format workbook, stamped for one vendor.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * The template is fixed and versioned in the repository at `assets/soa/soa-format.xlsx`, so
 * changing the format a vendor is asked to fill in is an ordinary reviewed change rather than an
 * upload nobody can diff. Each vendor receives their own copy with the identifying columns already
 * filled: a returned statement filed under the wrong entity or carrying a mistyped vendor number
 * is the single hardest kind to match back, and every one of those fields is something we know and
 * the vendor would otherwise be retyping.
 */

/** Where the template lives, relative to the project root. */
const TEMPLATE = path.join(process.cwd(), 'assets', 'soa', 'soa-format.xlsx');

/** Columns on the `SOA` sheet, 1-indexed, in the order the workbook defines them. */
const COL = {
  serial: 1,
  monthYear: 2,
  country: 3,
  legalEntity: 4,
  vendorName: 5,
  vendorNo: 6,
} as const;

/**
 * Rows stamped for the vendor.
 *
 * Enough for an ordinary quarter's unpaid invoices without turning the sheet into a wall of
 * repeated text; a vendor with more copies the last row down, and the columns that matter are
 * already correct in what they copy.
 */
const PREFILLED_ROWS = 25;

/**
 * SOA country id → the name the workbook uses.
 *
 * The Legal Entity column is a cascading dropdown defined as `INDIRECT($C2)`, so the value written
 * into Country has to match one of the workbook's defined names exactly or the vendor is left with
 * an empty entity list. The workbook's spellings are its own — Saudi Arabia is `KSA`, Abu Dhabi is
 * `UAE` — so this map is deliberately beside the file it describes: the two change together.
 *
 * EOS DMCC, Chad and Congo have no defined name in the workbook, exactly as they have no AP
 * mailbox. They resolve to null, Country is left blank, and the send is already blocked for them.
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
  DMCC: null,
  TD: null,
  CG: null,
};

export function workbookCountryName(countryId: string): string | null {
  return WORKBOOK_COUNTRY[countryId] ?? null;
}

export interface StampInput {
  countryId: string;
  vendorName: string;
  vendorNo: string;
  /** The statement period, as the letter states it — e.g. "September 2026". */
  monthYear: string;
}

let cached: Buffer | null = null;

/** Read the template once per process; it is 28 KB and never changes at runtime. */
async function templateBytes(): Promise<Buffer> {
  cached ??= await readFile(TEMPLATE);
  return cached;
}

/**
 * Build the vendor's copy of the workbook.
 *
 * Three things happen to the `SOA` sheet. The template ships with 38 rows of leftover sample data
 * — real-looking country and entity values from whoever built it — which are cleared, because a
 * vendor returning a statement with someone else's entity still on row 4 is worse than a blank
 * sheet. The identifying columns are then written for `PREFILLED_ROWS` rows. Legal Entity is
 * deliberately NOT written: only Jordan has a single entity, and every other country has between
 * two and seven, so guessing one would put a wrong entity on a financial document. Filling Country
 * narrows that dropdown to the right country's list, which is the useful half of the job.
 *
 * The other three sheets, the defined names behind the dropdown and the column validation all
 * survive the round trip unchanged.
 */
export async function buildVendorWorkbook(input: StampInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  /* exceljs ships its own, older `Buffer` declaration, so a Node Buffer does not satisfy its
     signature by name. Take the parameter type from the method itself rather than asserting a
     type that only happens to match today. */
  const bytes = await templateBytes();
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.getWorksheet('SOA');
  if (!sheet) throw new Error('The SOA Format template has no "SOA" sheet.');

  const country = workbookCountryName(input.countryId);

  // Clear the sample rows the template ships with, keeping row 1 (the headers).
  for (let r = sheet.rowCount; r >= 2; r--) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= 16; c++) row.getCell(c).value = null;
  }

  for (let i = 0; i < PREFILLED_ROWS; i++) {
    const row = sheet.getRow(2 + i);
    row.getCell(COL.serial).value = i + 1;
    row.getCell(COL.monthYear).value = input.monthYear;
    if (country) row.getCell(COL.country).value = country;
    row.getCell(COL.vendorName).value = input.vendorName;
    row.getCell(COL.vendorNo).value = input.vendorNo;
    row.commit();
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/** File name the vendor sees. Kept free of characters that travel badly through mail clients. */
export function attachmentFileName(vendorNo: string, cycleLabel: string): string {
  const safeCycle = cycleLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NESR-SOA-${safeCycle}-${vendorNo}.xlsx`;
}
