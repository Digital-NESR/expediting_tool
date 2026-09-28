import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';

/**
 * The consolidated workbook Finance and Accounts Payable receive.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * This is the file the whole parsing pipeline exists to produce. Every supplier returns a stripped
 * version of the same template carrying only the invoice columns; those rows are read on upload,
 * stamped with the vendor and country we already know, and land here as one workbook in the
 * original sixteen-column format — the shape AP already works in.
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
      WHERE cc.country_id = ?
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
}

/** Build the workbook for a country's active cycle. */
export async function buildConsolidatedWorkbook(
  countryId: string,
): Promise<{ file: Buffer; summary: ConsolidatedSummary }> {
  const rows = (await linesFor(countryId)) as unknown as ConsolidatedRow[];
  if (!rows.length) {
    throw new NothingToConsolidate(
      'No statements have been read for this country yet, so there is nothing to consolidate.',
    );
  }
  return writeConsolidated(rows);
}

/**
 * Write the rows into the template.
 *
 * Separated from the query so the format can be exercised against fixture rows — the ordering,
 * the flagged lines and the way an unreadable cell is carried through are the parts worth pinning,
 * and none of them needs a database.
 */
export async function writeConsolidated(
  rows: ConsolidatedRow[],
): Promise<{ file: Buffer; summary: ConsolidatedSummary }> {
  templateCache ??= await readFile(TEMPLATE);
  const wb = new ExcelJS.Workbook();
  /* exceljs ships its own, older `Buffer` declaration — take the parameter type from the method
     rather than asserting a type that only happens to match today. */
  await wb.xlsx.load(templateCache as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheet = wb.getWorksheet('SOA');
  if (!sheet) throw new Error('The SOA Format template has no "SOA" sheet.');

  // The template ships with 38 rows of leftover sample data; they are not this country's.
  const previous = sheet.rowCount;
  for (let r = previous; r >= 2; r--) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= COLUMNS.length; c++) row.getCell(c).value = null;
  }

  rows.forEach((r, i) => {
    const row = sheet.getRow(2 + i);
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
    const remark = [r.remarks ?? '', issues.length ? `[${issues.join('; ')}]` : '']
      .filter(Boolean)
      .join(' ');
    put(16, remark);

    if (issues.length) {
      for (let c = 1; c <= COLUMNS.length; c++) {
        row.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF4E5' },
        };
      }
    }
    row.commit();
  });

  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.outstanding_amount === null) continue;
    const ccy = String(r.currency ?? 'UNKNOWN').toUpperCase();
    totals.set(ccy, (totals.get(ccy) ?? 0) + Number(r.outstanding_amount));
  }

  const out = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    file: out,
    summary: {
      countryName: rows[0].country_name,
      cycleLabel: rows[0].cycle_label,
      vendors: new Set(rows.map((r) => r.vendor_no)).size,
      lines: rows.length,
      needingReview: rows.filter((r) => (r.issues ?? []).length > 0).length,
      totalsByCurrency: [...totals.entries()]
        .map(([currency, outstanding]) => ({ currency, outstanding }))
        .sort((a, b) => b.outstanding - a.outstanding),
    },
  };
}

/** What the file is called when it lands in AP's inbox. */
export function consolidatedFileName(countryId: string, cycleLabel: string): string {
  const safe = cycleLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `NESR-SOA-Consolidated-${countryId}-${safe}.xlsx`;
}
