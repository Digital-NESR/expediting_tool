import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';
import { appBaseUrl } from './links';
import { COVERED_STATUS_SQL } from './status';

/**
 * The consolidated workbook Finance and Accounts Payable receive.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * This is the file the whole parsing pipeline exists to produce. Every supplier returns a stripped
 * version of the same template carrying only the invoice columns; those rows are read on upload,
 * stamped with the vendor and country we already know, and land here as one workbook in the
 * original sixteen-column format, the shape AP already works in.
 *
 * Built from the parsed rows rather than by stitching the attachments together. The attachments
 * are the evidence and stay downloadable one by one; assembling them by hand is exactly the work
 * this replaces, and the coverage figure is computed from these rows, so the file AP posts from
 * and the number the champion reported are the same arithmetic.
 */

const TEMPLATE = path.join(process.cwd(), 'assets', 'soa', 'soa-format.xlsx');

/** The consolidated format, in the order the template defines it. */
const COLUMNS = [
  'Ser#',
  'Month/Year',
  'Country',
  'Legal Entity',
  'Vendor Name',
  'Vendor No.',
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

/**
 * The two columns added after the template's sixteen.
 *
 * How a statement arrived is one fact per VENDOR, and this sheet is one row per invoice line, so
 * it repeats down every line of the same supplier. That repetition is the point: AP queries a
 * single line with the vendor, and having to cross-reference another tab to find out whether the
 * supplier sent it themselves is the lookup this saves. The per-vendor summary is on the
 * Submissions sheet for reading, and this is here for tracing.
 */
const PROVENANCE_COLUMNS = ['Received Via', 'Evidence'] as const;
const FIRST_PROVENANCE_COL = COLUMNS.length + 1;
const TOTAL_COLUMNS = COLUMNS.length + PROVENANCE_COLUMNS.length;

export interface ConsolidatedSummary {
  countryName: string;
  cycleLabel: string;
  vendors: number;
  lines: number;
  needingReview: number;
  totalsByCurrency: { currency: string; outstanding: number }[];
}

export class NothingToConsolidate extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NothingToConsolidate';
  }
}

let templateCache: Buffer | null = null;

/**
 * Every parsed line for a country's active cycle.
 *
 * Ordered by what the vendor owes rather than by when their statement arrived: AP reads down from
 * the largest balance, and a file ordered by upload time makes that a search instead.
 *
 * Current statements only. A supplier who re-sends a corrected file has both on record, and
 * counting the retired one too would list every invoice twice and double their balance in the one
 * file AP works from.
 */
async function linesFor(countryId: string) {
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT l.vendor_no, l.vendor_name, l.month_year, l.legal_entity, l.invoice_number,
            l.invoice_date, l.invoice_date_raw, l.po_number, l.service_type, l.currency,
            l.tax_amount, l.total_amount, l.outstanding_amount, l.outstanding_days, l.remarks,
            l.issues, co.name AS country_name, cy.label AS cycle_label,
            SUM(COALESCE(l.outstanding_amount, 0)) OVER (PARTITION BY l.vendor_no) AS vendor_total
       FROM soa_submission_lines l
       JOIN soa_submissions s      ON s.id = l.submission_id
       JOIN vendor_cycle_entries e ON e.id = s.vendor_cycle_entry_id
       JOIN country_cycles cc      ON cc.id = e.country_cycle_id
       JOIN countries co           ON co.id = cc.country_id
       JOIN cycles cy              ON cy.id = cc.cycle_id AND cy.is_active
      WHERE cc.country_id = ? AND s.superseded_at IS NULL
      ORDER BY vendor_total DESC, l.vendor_no, l.line_no`,
    [countryId],
  );
  return rows;
}

/** One parsed line, as the workbook needs it. Named rather than positional so the mapping below
 *  is readable, and so the writer can be exercised without a database. */
export interface ConsolidatedRow {
  vendor_no: string;
  vendor_name: string;
  month_year: string | null;
  legal_entity: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  invoice_date_raw: string | null;
  po_number: string | null;
  service_type: string | null;
  currency: string | null;
  tax_amount: number | null;
  total_amount: number | null;
  outstanding_amount: number | null;
  outstanding_days: number | null;
  remarks: string | null;
  issues: string[];
  country_name: string;
  cycle_label: string;
  /**
   * Set when this is not an invoice line but a placeholder for a vendor that counts towards
   * coverage and has no rows to show: a reply filed as correspondence, or a balance established
   * as nil. The text is what AP reads in the Remarks column.
   *
   * Left in the file rather than omitted. A vendor missing from the workbook looks like a vendor
   * nobody chased, and AP has no way to tell that apart from one whose answer is in an email.
   */
  marker: string | null;
}

/**
 * Vendors that count towards coverage and have no invoice rows behind them.
 *
 * Two ways that happens: the champion filed the supplier's reply as correspondence, which is
 * evidence of an answer that parses into nothing, or the champion established there are no
 * pending invoices. Both belong in the file AP works from, saying which they are, so that a
 * vendor's absence never has to be interpreted.
 */
async function markersFor(countryId: string) {
  await ensureSoaSchema();
  return sql<QueryResultRow[]>(
    `SELECT v.vendor_no, v.name AS vendor_name, vce.status::text AS status,
            vce.resolution_note, co.name AS country_name, cy.label AS cycle_label,
            EXISTS (
              SELECT 1 FROM soa_submissions s
               WHERE s.vendor_cycle_entry_id = vce.id
                 AND s.superseded_at IS NULL AND s.kind = 'email'
            ) AS has_email
       FROM vendor_cycle_entries vce
       JOIN vendors v          ON v.id = vce.vendor_id
       JOIN country_cycles cc  ON cc.id = vce.country_cycle_id
       JOIN countries co       ON co.id = cc.country_id
       JOIN cycles cy          ON cy.id = cc.cycle_id AND cy.is_active
      WHERE cc.country_id = ?
        AND vce.status::text IN (${COVERED_STATUS_SQL})
        AND NOT EXISTS (
          SELECT 1
            FROM soa_submission_lines l
            JOIN soa_submissions s ON s.id = l.submission_id
           WHERE s.vendor_cycle_entry_id = vce.id AND s.superseded_at IS NULL
        )
      ORDER BY vce.open_po_amount DESC`,
    [countryId],
  );
}

/**
 * How each vendor's current answer reached us.
 *
 * Three routes, and `source` plus `kind` describe all of them: the supplier filling the template
 * in the portal themselves, a champion filing the spreadsheet for them, and a champion filing the
 * correspondence instead. A vendor can hold one of each kind at once, so a champion who files both
 * is the fourth shape rather than a fifth route.
 *
 * `source` is read from the row rather than inferred from who uploaded it. The distinction existed
 * in the code before it existed in the database, and inferring it afterwards meant asking whether
 * an address looked like a supplier's.
 */
export interface VendorProvenance {
  vendorNo: string;
  vendorName: string;
  workbook: { id: number; fileName: string; source: string } | null;
  email: { id: number; fileName: string; source: string } | null;
  filedBy: string | null;
  filedAt: Date | null;
  invoiceLines: number;
}

async function provenanceFor(countryId: string): Promise<VendorProvenance[]> {
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT v.vendor_no, v.name AS vendor_name,
            MAX(s.id)        FILTER (WHERE s.kind = 'workbook') AS workbook_id,
            MAX(s.file_name) FILTER (WHERE s.kind = 'workbook') AS workbook_name,
            MAX(s.source)    FILTER (WHERE s.kind = 'workbook') AS workbook_source,
            MAX(s.id)        FILTER (WHERE s.kind = 'email')    AS email_id,
            MAX(s.file_name) FILTER (WHERE s.kind = 'email')    AS email_name,
            MAX(s.source)    FILTER (WHERE s.kind = 'email')    AS email_source,
            MAX(s.uploaded_by)                                  AS filed_by,
            MAX(s.accepted_at)                                  AS filed_at,
            COALESCE(SUM(s.parsed_line_count), 0)               AS invoice_lines
       FROM vendor_cycle_entries vce
       JOIN vendors v         ON v.id = vce.vendor_id
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
       JOIN cycles cy         ON cy.id = cc.cycle_id AND cy.is_active
       LEFT JOIN soa_submissions s
              ON s.vendor_cycle_entry_id = vce.id AND s.superseded_at IS NULL
      WHERE cc.country_id = ?
        AND s.id IS NOT NULL
      GROUP BY v.vendor_no, v.name`,
    [countryId],
  );

  return rows.map((r) => ({
    vendorNo: String(r.vendor_no),
    vendorName: String(r.vendor_name),
    workbook: r.workbook_id
      ? {
          id: Number(r.workbook_id),
          fileName: String(r.workbook_name ?? ''),
          source: String(r.workbook_source ?? 'champion'),
        }
      : null,
    email: r.email_id
      ? {
          id: Number(r.email_id),
          fileName: String(r.email_name ?? ''),
          source: String(r.email_source ?? 'champion'),
        }
      : null,
    filedBy: r.filed_by ? String(r.filed_by) : null,
    filedAt: r.filed_at ? new Date(String(r.filed_at)) : null,
    invoiceLines: Number(r.invoice_lines ?? 0),
  }));
}

/** Who provided it, in the words a reader uses. */
export function routeLabel(p: VendorProvenance | undefined): string {
  if (!p) return 'Not received';
  const sources = new Set([p.workbook?.source, p.email?.source].filter(Boolean) as string[]);
  if (!sources.size) return 'Not received';
  if (sources.size > 1) return 'Supplier portal + Champion';
  return sources.has('supplier_portal') ? 'Supplier portal' : 'Champion';
}

/** Which files are behind it. */
export function providedLabel(p: VendorProvenance | undefined): string {
  if (!p) return '';
  if (p.workbook && p.email) return 'Excel + Email';
  if (p.workbook) return 'Excel';
  if (p.email) return 'Email';
  return '';
}

function markerRow(r: QueryResultRow): ConsolidatedRow {
  const note = String(r.resolution_note ?? '').trim();
  const marker = r.has_email
    ? 'Supplier replied by email. Refer to the email attachment filed against this vendor; no invoice lines were read.'
    : `No pending invoices confirmed by NESR.${note ? ` ${note}` : ''}`;
  return {
    vendor_no: String(r.vendor_no),
    vendor_name: String(r.vendor_name),
    month_year: null,
    legal_entity: null,
    invoice_number: null,
    invoice_date: null,
    invoice_date_raw: null,
    po_number: null,
    service_type: null,
    currency: null,
    tax_amount: null,
    total_amount: null,
    outstanding_amount: null,
    outstanding_days: null,
    remarks: null,
    issues: [],
    country_name: String(r.country_name),
    cycle_label: String(r.cycle_label),
    marker,
  };
}

/**
 * The same workbook for one supplier.
 *
 * AP queries a statement with the vendor who sent it, not with the country, and a 900-row file is
 * not what you attach to that email. The format is identical to the country's, so a row pasted
 * from one into the other still lines up.
 */
export async function buildVendorConsolidatedWorkbook(
  countryId: string,
  vendorNo: string,
): Promise<{ file: Buffer; summary: ConsolidatedSummary; vendorName: string }> {
  const [lines, markers, provenance] = await Promise.all([
    linesFor(countryId),
    markersFor(countryId),
    provenanceFor(countryId),
  ]);
  const all = [
    ...(lines as unknown as ConsolidatedRow[]).map((r) => ({ ...r, marker: null })),
    ...markers.map(markerRow),
  ];
  const rows = all.filter((r) => String(r.vendor_no) === vendorNo);
  if (!rows.length) {
    throw new NothingToConsolidate(
      'Nothing has been read for this supplier yet, so there is nothing to consolidate.',
    );
  }
  const built = await writeConsolidated(
    rows,
    provenance.filter((p) => p.vendorNo === vendorNo),
  );
  return { ...built, vendorName: rows[0].vendor_name };
}

/** Build the workbook for a country's active cycle. */
export async function buildConsolidatedWorkbook(
  countryId: string,
): Promise<{ file: Buffer; summary: ConsolidatedSummary }> {
  const [lines, markers, provenance] = await Promise.all([
    linesFor(countryId),
    markersFor(countryId),
    provenanceFor(countryId),
  ]);
  const rows = [
    ...(lines as unknown as ConsolidatedRow[]).map((r) => ({ ...r, marker: null })),
    ...markers.map(markerRow),
  ];
  if (!rows.length) {
    throw new NothingToConsolidate(
      'No statements have been read for this country yet, so there is nothing to consolidate.',
    );
  }
  return writeConsolidated(rows, provenance);
}

/**
 * Write the rows into the template.
 *
 * Separated from the query so the format can be exercised against fixture rows, the ordering,
 * the flagged lines and the way an unreadable cell is carried through are the parts worth pinning,
 * and none of them needs a database.
 */
export async function writeConsolidated(
  rows: ConsolidatedRow[],
  provenance: VendorProvenance[] = [],
): Promise<{ file: Buffer; summary: ConsolidatedSummary }> {
  const byVendor = new Map(provenance.map((p) => [p.vendorNo, p]));
  templateCache ??= await readFile(TEMPLATE);
  const wb = new ExcelJS.Workbook();
  /* exceljs ships its own, older `Buffer` declaration. Take the parameter type from the method
     rather than asserting a type that only happens to match today. */
  await wb.xlsx.load(templateCache as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.getWorksheet('SOA');
  if (!sheet) throw new Error('The SOA Format template has no "SOA" sheet.');

  /* The template's own styling, lifted off its first data row before that row is emptied.
     Rows 2 to 39 carry it; row 40 onwards does not exist in the template at all, so a country
     with more than 38 lines used to produce a file that was bordered and filled down to row 39
     and bare text from 40 on. That is not a cosmetic complaint: the banding is what makes the
     grid readable, and the file stopped looking like a table exactly where the data got long. */
  const templateStyle: Partial<ExcelJS.Style>[] = [];
  for (let c = 1; c <= COLUMNS.length; c++) {
    templateStyle[c] = { ...sheet.getRow(2).getCell(c).style };
  }

  // The template ships with 38 rows of leftover sample data; they are not this country's.
  const previous = sheet.rowCount;
  for (let r = previous; r >= 2; r--) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= COLUMNS.length; c++) row.getCell(c).value = null;
  }

  /* The two added columns, headed to match. The header style comes from the last template column
     so they sit in the same green band rather than announcing themselves as an afterthought. */
  const headerStyle = { ...sheet.getRow(1).getCell(COLUMNS.length).style };
  PROVENANCE_COLUMNS.forEach((label, i) => {
    const cell = sheet.getRow(1).getCell(FIRST_PROVENANCE_COL + i);
    cell.value = label;
    cell.style = { ...headerStyle };
  });
  sheet.getColumn(FIRST_PROVENANCE_COL).width = 26;
  sheet.getColumn(FIRST_PROVENANCE_COL + 1).width = 24;

  rows.forEach((r, i) => {
    const row = sheet.getRow(2 + i);
    /* Stamped on every row, not only the ones the template happened to pre-style. */
    for (let c = 1; c <= COLUMNS.length; c++) row.getCell(c).style = { ...templateStyle[c] };
    for (let c = FIRST_PROVENANCE_COL; c <= TOTAL_COLUMNS; c++) {
      row.getCell(c).style = { ...templateStyle[COLUMNS.length] };
    }
    const put = (n: number, v: ExcelJS.CellValue) => (row.getCell(n).value = v);
    put(1, i + 1);
    put(2, r.month_year ?? '');
    put(3, r.country_name ?? '');
    put(4, r.legal_entity ?? '');
    put(5, r.vendor_name ?? '');
    put(6, r.vendor_no ?? '');
    put(7, r.invoice_number ?? '');
    /* The date as the supplier wrote it where it would not parse. A blank there reads as "they
       left it empty", which is a different problem from "we could not read what they put". */
    put(8, r.invoice_date instanceof Date ? r.invoice_date : (r.invoice_date_raw ?? ''));
    put(9, r.po_number ?? '');
    put(10, r.service_type ?? '');
    put(11, r.currency ?? '');
    put(12, r.tax_amount === null ? '' : Number(r.tax_amount));
    put(13, r.total_amount === null ? '' : Number(r.total_amount));
    put(14, r.outstanding_amount === null ? '' : Number(r.outstanding_amount));
    put(15, r.outstanding_days === null ? '' : Number(r.outstanding_days));

    /* Anything the parser could not make sense of is appended to the supplier's own remark rather
       than dropped. AP is the last person who can query it with the vendor, and a row that looks
       clean but is missing an amount is worse than one that says so. */
    const issues = (r.issues ?? []).filter(Boolean);
    const remark = r.marker
      ? r.marker
      : [r.remarks ?? '', issues.length ? `[${issues.join('; ')}]` : ''].filter(Boolean).join(' ');
    put(16, remark);

    /* Who provided this vendor's answer and what is behind it, repeated on each of their lines so
       a single line can be traced without changing tab. The evidence cell is a real hyperlink: a
       submission id is useless to AP, and the alternative was asking them to find the attachment
       in the portal while holding the workbook open. */
    const p = byVendor.get(String(r.vendor_no));
    const provided = providedLabel(p);
    put(17, provided ? `${routeLabel(p)} · ${provided}` : routeLabel(p));

    /* The email first when there is one: it is the thing a champion filed because the figures
       were not in a spreadsheet, so it is the document AP has to open to see them. */
    const evidence = p?.email ?? p?.workbook ?? null;
    const base = appBaseUrl();
    if (evidence && base) {
      const cell = row.getCell(18);
      cell.value = {
        text: p?.email ? 'Open email' : 'Open spreadsheet',
        hyperlink: `${base}/api/soa/submissions/${evidence.id}`,
        tooltip: evidence.fileName,
      };
      cell.font = { ...cell.font, color: { argb: 'FF0563C1' }, underline: true };
    } else if (evidence) {
      // No base URL configured, so a link would go nowhere; name the file instead.
      put(18, evidence.fileName);
    }

    /* A placeholder is tinted, and greyed rather than amber: it is not a line that needs querying
       with the vendor, it is a vendor whose answer is not in this file. Reading down the amount
       columns, the blanks then have a visible reason beside them. */
    const tint = r.marker ? 'FFEFEFEF' : issues.length ? 'FFFFF4E5' : null;
    if (tint) {
      for (let c = 1; c <= COLUMNS.length; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
      }
      if (r.marker) row.getCell(16).font = { italic: true };
    }
    row.commit();
  });

  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.marker || r.outstanding_amount === null) continue;
    const ccy = String(r.currency ?? 'UNKNOWN').toUpperCase();
    totals.set(ccy, (totals.get(ccy) ?? 0) + Number(r.outstanding_amount));
  }

  writeSubmissionsSheet(wb, rows, provenance);

  const out = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    file: out,
    summary: {
      countryName: rows[0].country_name,
      cycleLabel: rows[0].cycle_label,
      vendors: new Set(rows.map((r) => r.vendor_no)).size,
      /* Placeholders are rows in the file and not invoices. Counting them would overstate what
         was actually read, in the one figure a champion quotes when handing the cycle over. */
      lines: rows.filter((r) => !r.marker).length,
      needingReview: rows.filter((r) => !r.marker && (r.issues ?? []).length > 0).length,
      totalsByCurrency: [...totals.entries()]
        .map(([currency, outstanding]) => ({ currency, outstanding }))
        .sort((a, b) => b.outstanding - a.outstanding),
    },
  };
}

/**
 * One row per vendor: how their answer arrived, and the files behind it.
 *
 * The SOA sheet is one row per invoice line and repeats this down every line of a supplier, which
 * is right for tracing a single line and wrong for reading. Here it is said once per vendor, which
 * is the grain the fact actually has, and the question AP opens the file with — which of these
 * suppliers answered us themselves, and which did a champion chase down — is one sort away.
 *
 * Vendors with no current submission are listed too, with the reason. A supplier missing from this
 * tab would look like one nobody asked.
 */
function writeSubmissionsSheet(
  wb: ExcelJS.Workbook,
  rows: ConsolidatedRow[],
  provenance: VendorProvenance[],
): void {
  const HEADERS = [
    'Vendor Name',
    'Vendor No.',
    'Received Via',
    'Provided',
    'Spreadsheet',
    'Email',
    'Filed By',
    'Filed At',
    'Invoice Lines',
  ];
  const WIDTHS = [42, 18, 24, 16, 26, 26, 30, 20, 14];

  /* Replaced rather than appended to, so rebuilding the workbook for a second country does not
     leave the first one's suppliers on the tab. */
  if (wb.getWorksheet('Submissions')) wb.removeWorksheet(wb.getWorksheet('Submissions')!.id);
  const ws = wb.addWorksheet('Submissions');

  const header = ws.getRow(1);
  HEADERS.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4EA72E' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  header.commit();
  WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const base = appBaseUrl();
  const link = (
    cell: ExcelJS.Cell,
    file: { id: number; fileName: string } | null,
    absent: string,
  ) => {
    if (!file) {
      cell.value = absent;
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF9A9A9A' }, italic: true };
      return;
    }
    if (!base) {
      cell.value = file.fileName;
      return;
    }
    cell.value = {
      text: file.fileName,
      hyperlink: `${base}/api/soa/submissions/${file.id}`,
      tooltip: 'Opens the stored file. You will be asked to sign in if you are not already.',
    };
    cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0563C1' }, underline: true };
  };

  /* Every vendor in the workbook, whether or not anything was filed for them, ordered the way the
     SOA sheet is so the two tabs read in the same order. */
  const seen = new Set<string>();
  const order: { vendorNo: string; vendorName: string }[] = [];
  for (const r of rows) {
    const no = String(r.vendor_no);
    if (seen.has(no)) continue;
    seen.add(no);
    order.push({ vendorNo: no, vendorName: r.vendor_name });
  }

  const byVendor = new Map(provenance.map((p) => [p.vendorNo, p]));
  order.forEach(({ vendorNo, vendorName }, i) => {
    const p = byVendor.get(vendorNo);
    const row = ws.getRow(2 + i);
    row.getCell(1).value = vendorName;
    row.getCell(2).value = vendorNo;
    row.getCell(3).value = routeLabel(p);
    row.getCell(4).value = providedLabel(p);
    link(row.getCell(5), p?.workbook ?? null, 'None');
    link(row.getCell(6), p?.email ?? null, 'None');
    row.getCell(7).value = p?.filedBy ?? '';
    row.getCell(8).value = p?.filedAt ?? '';
    if (p?.filedAt) row.getCell(8).numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell(9).value = p?.invoiceLines ?? 0;

    /* The happy path tinted green and the rest left plain: the question this tab answers is which
       suppliers answered for themselves, and that reads faster as a colour than as a column. */
    if (routeLabel(p) === 'Supplier portal') {
      for (let c = 1; c <= HEADERS.length; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4EA' } };
      }
    }
    row.commit();
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1 + order.length, column: HEADERS.length },
  };
}

/** What the file is called when it lands in AP's inbox. */
export function consolidatedFileName(countryId: string, cycleLabel: string): string {
  const safe = cycleLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NESR-SOA-Consolidated-${countryId}-${safe}.xlsx`;
}

/**
 * The one-supplier file's name.
 *
 * The supplier's own name leads, because this file is downloaded one vendor at a time and a
 * folder of NESR-SOA-Consolidated-EG-Q3-2026 (1)…(9) cannot be told apart without opening each.
 */
export function vendorConsolidatedFileName(
  vendorName: string,
  vendorNo: string,
  cycleLabel: string,
): string {
  const safe = (v: string, max = 40) =>
    v
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max)
      .replace(/-$/, '');
  return `NESR-SOA-${safe(vendorName)}-${safe(vendorNo, 20)}-${safe(cycleLabel)}.xlsx`;
}
