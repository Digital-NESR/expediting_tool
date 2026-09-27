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

/**
 * Rewrite the Instruction sheet.
 *
 * The template's version is a column of numbered fragments left over from however it was first
 * assembled, and it ends by telling the supplier to reply to an "Email Notification Tab" that is
 * not what the sheet holding the addresses is called. It is replaced wholesale rather than edited:
 * this is the only page a supplier reads before filling the file in, and the addresses it now
 * carries come from the country team, which changes without a deployment.
 */
function writeInstructions(
  sheet: ExcelJS.Worksheet,
  countryName: string,
  apEmails: string[],
  championEmails: string[],
): void {
  /* Cleared cell by cell rather than with spliceRows, which leaves the original content in place
     here -- the template's sheet carries merges, and the new rows then land underneath the old
     ones instead of replacing them. */
  const previous = sheet.rowCount;
  const merges = (sheet as unknown as { model?: { merges?: string[] } }).model?.merges ?? [];
  for (const range of [...merges]) {
    try {
      sheet.unMergeCells(range);
    } catch {
      // Already gone, or never a real range. Nothing to undo.
    }
  }
  for (let r = 1; r <= previous; r++) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }

  sheet.columns = [{ width: 4 }, { width: 104 }];

  let at = 1;
  const put = (marker: string | number | null, text: string | null): ExcelJS.Row => {
    const row = sheet.getRow(at++);
    row.getCell(1).value = marker;
    row.getCell(2).value = text;
    return row;
  };

  const title = (text: string) => {
    const row = put(null, text);
    row.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF1D4F31' } };
    row.height = 22;
  };
  const heading = (text: string) => {
    const row = put(null, text);
    row.getCell(2).font = { bold: true, size: 11 };
    row.height = 18;
  };
  const step = (n: number, text: string) => {
    const row = put(n, text);
    row.getCell(1).font = { bold: true, color: { argb: 'FF2A7E4F' } };
    row.getCell(1).alignment = { horizontal: 'right' };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  };
  const bullet = (text: string) => {
    const row = put('•', text);
    row.getCell(1).alignment = { horizontal: 'right' };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  };
  const blank = () => put(null, null);

  title('NESR — Statement of Account');
  const sub = put(null, `How to complete this workbook — ${countryName}`);
  sub.getCell(2).font = { size: 11, color: { argb: 'FF58595B' } };
  blank();

  heading('Filling it in');
  step(1, 'Open the "SOA" sheet and enter one row for each outstanding invoice.');
  step(2, 'Choose your NESR legal entity from the dropdown in the Legal Entity column.');
  step(3, 'Complete every column. Only "Type of service / Product Delivered" is optional.');
  step(
    4,
    'Do not rename, reorder or remove the columns, and do not add sheets. The file is read automatically when you return it.',
  );
  step(
    5,
    'Upload the completed workbook using the secure link in the email we sent you. The link is unique to your company. Return the Excel file itself, not a printout or a scan.',
  );
  blank();

  heading('Please note');
  bullet(
    'Invoices listed as at the closing date are taken as the final outstanding statement for that month.',
  );
  bullet(
    'If a purchase order has been received and the goods delivered but no invoice has been raised yet, enter the purchase order number and leave the invoice number blank.',
  );
  bullet(
    'For a credit note, write "Credit Note" in the Type of service / Product Delivered column.',
  );
  bullet('Amounts should be entered as numbers, in the currency named on the same row.');
  blank();

  /* Addresses are for questions only. The statement itself comes back through the link, so that
     every returned file is already tied to the vendor and the cycle it belongs to -- a workbook
     arriving by email has to be matched up by hand, which is the step this replaces. */
  heading('Questions about this request');
  const contacts: [string, string[]][] = [
    ['SOA Champion', championEmails],
    ['Accounts Payable', apEmails],
  ];
  let any = false;
  for (const [label, emails] of contacts) {
    for (const email of emails) {
      any = true;
      const row = put(null, `${label} — ${email}`);
      row.getCell(2).font = { bold: true, color: { argb: 'FF2A7E4F' } };
    }
  }
  if (!any) {
    // Sending is blocked for a country with no contacts at all, so this should not ship; saying
    // so beats leaving a blank where an address belongs.
    const row = put(null, 'Reply to the NESR contact who sent you this request.');
    row.getCell(2).font = { italic: true };
  }

  for (let r = at; r <= previous; r++) {
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }
}

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
export async function buildSupplierWorkbook(
  countryId: string,
  countryName: string,
  apEmails: string[],
  championEmails: string[] = [],
): Promise<Buffer> {
  // The contact addresses are printed into the sheet, so they are part of what makes a build
  // distinct. The upload link is not: it is per vendor, and this file is per country.
  const key = `${countryId}|${countryName}|${apEmails.join(',')}|${championEmails.join(',')}`;
  const cached = built.get(key);
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

  const instructions = wb.getWorksheet('Instruction');
  if (instructions) writeInstructions(instructions, countryName, apEmails, championEmails);

  // The AP mailbox list belongs to NESR, not to the supplier, and the one address that concerns
  // them is now printed on the instructions.
  const apSheet = wb.getWorksheet('AP Group Emails');
  if (apSheet) wb.removeWorksheet(apSheet.id);

  const out = Buffer.from(await wb.xlsx.writeBuffer());
  built.set(key, out);
  return out;
}

/** File name the supplier sees. Free of characters that travel badly through mail clients. */
export function attachmentFileName(cycleLabel: string): string {
  const safe = cycleLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NESR-Statement-of-Account-${safe}.xlsx`;
}
