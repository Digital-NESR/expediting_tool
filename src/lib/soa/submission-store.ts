import type { PoolClient } from 'pg';
import { withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import { soaPool } from './db';
import { UnreadableStatementError, parseSupplierWorkbook, type ParsedLine } from './submission-lines';

/**
 * Recording a returned statement.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * Two paths reach this: a champion uploading on a supplier's behalf, and the supplier uploading
 * through their own link. They must record the same thing, so the reading, the row, the stamped
 * vendor details and the evidence entry all live here. Two copies of this would drift, and the
 * drift would show up as two statements that look different for no reason anybody could explain.
 */

const log = logger('soa-submission-store');

export const MAX_SOA_BYTES = 10 * 1024 * 1024;

export interface StoreInput {
  entryId: number;
  countryCycleId: number;
  /** Stamped onto every parsed row, from our record rather than from what the supplier typed. */
  vendorNo: string;
  vendorName: string;
  countryId: string;
  cycleLabel: string;
  fileName: string;
  contentType: string;
  content: Buffer;
  /** The address or account that sent it: a champion's login, or the verified supplier address. */
  uploadedBy: string;
  /** How the evidence entry names the uploader. */
  actorLabel: string;
  /** True when the supplier uploaded it themselves, which the evidence trail should say. */
  selfService: boolean;
}

export interface StoreResult {
  submissionId: number;
  lines: number;
  needingReview: number;
}

export class StatementRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementRejected';
  }
}

/**
 * Read the workbook and record it.
 *
 * Throws {@link StatementRejected} with a message meant for whoever is holding the file. Nothing
 * unreadable is filed: recording it would move the vendor to `received` and assert a statement was
 * collected while leaving nothing behind that anyone could reconcile against.
 */
export async function storeStatement(input: StoreInput): Promise<StoreResult> {
  if (!/\.(xlsx|xlsm|xls)$/i.test(input.fileName)) {
    throw new StatementRejected(
      'Statements must be the filled-in Excel template that came with the request.',
    );
  }

  let lines: ParsedLine[];
  try {
    lines = (await parseSupplierWorkbook(input.content)).lines;
  } catch (err) {
    const reason =
      err instanceof UnreadableStatementError ? err.message : 'That workbook could not be read.';
    log.warn('statement.unparsed', { entryId: input.entryId, file: input.fileName, reason });
    throw new StatementRejected(reason);
  }
  if (!lines.length) {
    throw new StatementRejected(
      'That workbook has no invoice rows in it. Fill in the SOA sheet before sending it.',
    );
  }

  const needingReview = lines.filter((l) => l.issues.length > 0).length;

  const submissionId = await withTransaction(soaPool, async (client: PoolClient) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO soa_submissions
         (vendor_cycle_entry_id, file_name, content, content_type, uploaded_by,
          validated, detected_invoice_count, accepted_at, accepted_by,
          parsed_line_count, parse_error)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), $5, $6, NULL)
       RETURNING id`,
      [
        input.entryId,
        input.fileName,
        input.content,
        input.contentType,
        input.uploadedBy,
        lines.length,
      ],
    );
    const id = inserted.rows[0].id;

    /* The supplier is never asked to retype their own name and number, so they are stamped here
       from the record that says who returned the file. One statement at a time, so a batched
       insert would save a few milliseconds on a couple of dozen rows. */
    for (const line of lines) {
      await client.query(
        `INSERT INTO soa_submission_lines
           (submission_id, line_no, vendor_no, vendor_name, country_id, month_year,
            legal_entity, invoice_number, invoice_date, invoice_date_raw, po_number,
            service_type, currency, tax_amount, total_amount, outstanding_amount,
            outstanding_days, remarks, issues)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          id,
          line.lineNo,
          input.vendorNo,
          input.vendorName,
          input.countryId,
          input.cycleLabel,
          line.legalEntity,
          line.invoiceNumber,
          line.invoiceDate,
          line.invoiceDateRaw,
          line.poNumber,
          line.serviceType,
          line.currency,
          line.taxAmount,
          line.totalAmount,
          line.outstandingAmount,
          line.outstandingDays,
          line.remarks,
          line.issues,
        ],
      );
    }

    await client.query(
      `UPDATE vendor_cycle_entries
          SET status = 'received', responded_at = NOW(), invoice_count = $2, updated_at = NOW()
        WHERE id = $1`,
      [input.entryId, lines.length],
    );

    await client.query(
      `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
       VALUES ($1, $2, 'upload', $3, $4, $5)`,
      [
        input.countryCycleId,
        input.entryId,
        input.selfService ? 'SOA uploaded by supplier' : 'SOA received',
        input.actorLabel,
        `${input.vendorName} (${input.vendorNo}), ${lines.length} invoice ${
          lines.length === 1 ? 'line' : 'lines'
        } read` +
          (needingReview ? `, ${needingReview} needing review.` : '.') +
          (input.selfService
            ? ` Uploaded through the vendor's own link after verifying ${input.uploadedBy}.`
            : ''),
      ],
    );

    return id;
  });

  return { submissionId, lines: lines.length, needingReview };
}
