import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';

/**
 * Reading back what a supplier sent.
 *
 * A plain module, not `'use server'` — see the note in `./db`. Kept apart from
 * `./submission-lines`, which parses and stays free of database imports so it can be tested
 * against real workbooks without a connection.
 *
 * The parsed rows are an interpretation of a document, and the document is the evidence. Both are
 * shown: the champion reviews the rows because that is what the coverage figure is computed from,
 * and downloads the file when a row looks wrong, because the first audit question is "show me the
 * statement".
 */

export interface SubmissionLineView {
  lineNo: number;
  legalEntity: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** The cell as the supplier wrote it, where it would not parse as a date. */
  invoiceDateRaw: string | null;
  poNumber: string | null;
  serviceType: string | null;
  currency: string | null;
  taxAmount: number | null;
  totalAmount: number | null;
  outstandingAmount: number | null;
  outstandingDays: number | null;
  remarks: string | null;
  issues: string[];
}

export interface SubmissionView {
  submissionId: number;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  parseError: string | null;
  lines: SubmissionLineView[];
  /** Summed per currency: adding dollars to dinars would produce a number meaning nothing. */
  totalsByCurrency: { currency: string; outstanding: number; lines: number }[];
  linesNeedingReview: number;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Every statement on file for one vendor entry, newest first, with its parsed rows.
 *
 * Returns the country alongside so the caller can check the reader is entitled to it — the entry
 * id arrives from the browser and is not a capability.
 */
export async function loadSubmissionsFor(
  entryId: number,
): Promise<{ countryId: string; submissions: SubmissionView[] } | null> {
  await ensureSoaSchema();

  const owner = await sql<QueryResultRow[]>(
    `SELECT cc.country_id
       FROM vendor_cycle_entries vce
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
      WHERE vce.id = ?`,
    [entryId],
  );
  if (!owner.length) return null;

  const heads = await sql<QueryResultRow[]>(
    `SELECT id, file_name, uploaded_at, uploaded_by, parse_error
       FROM soa_submissions
      WHERE vendor_cycle_entry_id = ?
      ORDER BY uploaded_at DESC`,
    [entryId],
  );
  if (!heads.length) {
    return { countryId: String(owner[0].country_id), submissions: [] };
  }

  const lines = await sql<QueryResultRow[]>(
    `SELECT submission_id, line_no, legal_entity, invoice_number, invoice_date, invoice_date_raw,
            po_number, service_type, currency, tax_amount, total_amount, outstanding_amount,
            outstanding_days, remarks, issues
       FROM soa_submission_lines
      WHERE submission_id = ANY(?)
      ORDER BY submission_id, line_no`,
    [heads.map((h) => Number(h.id))],
  );

  const bySubmission = new Map<number, SubmissionLineView[]>();
  for (const r of lines) {
    const id = Number(r.submission_id);
    const list = bySubmission.get(id) ?? [];
    list.push({
      lineNo: Number(r.line_no),
      legalEntity: (r.legal_entity as string | null) ?? null,
      invoiceNumber: (r.invoice_number as string | null) ?? null,
      invoiceDate:
        r.invoice_date instanceof Date
          ? r.invoice_date.toISOString().slice(0, 10)
          : ((r.invoice_date as string | null) ?? null),
      invoiceDateRaw: (r.invoice_date_raw as string | null) ?? null,
      poNumber: (r.po_number as string | null) ?? null,
      serviceType: (r.service_type as string | null) ?? null,
      currency: (r.currency as string | null) ?? null,
      taxAmount: num(r.tax_amount),
      totalAmount: num(r.total_amount),
      outstandingAmount: num(r.outstanding_amount),
      outstandingDays: r.outstanding_days === null ? null : Number(r.outstanding_days),
      remarks: (r.remarks as string | null) ?? null,
      issues: ((r.issues ?? []) as string[]).filter(Boolean),
    });
    bySubmission.set(id, list);
  }

  const submissions: SubmissionView[] = heads.map((h) => {
    const own = bySubmission.get(Number(h.id)) ?? [];
    return {
      submissionId: Number(h.id),
      fileName: String(h.file_name),
      uploadedAt:
        h.uploaded_at instanceof Date ? h.uploaded_at.toISOString() : String(h.uploaded_at ?? ''),
      uploadedBy: (h.uploaded_by as string | null) ?? null,
      parseError: (h.parse_error as string | null) ?? null,
      lines: own,
      totalsByCurrency: totalsByCurrencyOf(own),
      linesNeedingReview: own.filter((l) => l.issues.length > 0).length,
    };
  });

  return { countryId: String(owner[0].country_id), submissions };
}

/**
 * Outstanding totals, one per currency.
 *
 * Never a single figure. A statement can list dinars and dollars on consecutive rows, and adding
 * them would produce a number that means nothing while looking exactly like a number that does.
 * Rows whose amount could not be read are counted but contribute nothing, which is why the line
 * count is shown beside each total.
 */
export function totalsByCurrencyOf(lines: SubmissionLineView[]): SubmissionView['totalsByCurrency'] {
  const acc = new Map<string, { outstanding: number; lines: number }>();
  for (const l of lines) {
    const ccy = (l.currency ?? 'unknown').toUpperCase();
    const entry = acc.get(ccy) ?? { outstanding: 0, lines: 0 };
    entry.lines += 1;
    if (l.outstandingAmount !== null) entry.outstanding += l.outstandingAmount;
    acc.set(ccy, entry);
  }
  return [...acc.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.outstanding - a.outstanding);
}
