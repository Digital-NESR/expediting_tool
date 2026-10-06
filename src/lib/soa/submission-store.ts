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
  /**
   * True when the supplier uploaded it themselves.
   *
   * This has always shaped the evidence-log wording and is now stored on the row as `source` as
   * well. It was the only record of how a statement arrived, and it was being spent on a sentence
   * and then dropped, so the consolidated workbook could not tell AP whether a supplier answered
   * or a champion chased it up and filed it for them.
   */
  selfService: boolean;
  /**
   * `workbook` is the template, read into invoice rows. `email` is filed correspondence: a saved
   * reply carrying whatever the supplier sent, which counts as an answer and parses into nothing.
   */
  kind?: SubmissionKind;
}

export type SubmissionKind = 'workbook' | 'email';

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
 * File a supplier's reply as evidence, without reading it.
 *
 * Supersedes the same way a workbook does, so a champion who files the correspondence and then
 * receives the template properly has one current statement rather than two counted at once.
 *
 * `invoice_count` goes to zero on purpose. The vendor has answered and counts towards coverage,
 * and nobody has read their invoices, so a figure here would be invented. The consolidated
 * workbook carries a line pointing AP at the attachment instead.
 */
async function storeCorrespondence(input: StoreInput): Promise<StoreResult> {
  const submissionId = await withTransaction(soaPool, async (client: PoolClient) => {
    /* Only the previous EMAIL is retired, not the vendor's workbook.
       Superseding everything meant a champion who filed the covering email and then the
       spreadsheet was left holding only the spreadsheet, and the reverse order lost the
       spreadsheet: the two pieces of evidence for one answer could never be held at once. They
       are different kinds of thing and each supersedes only its own kind. */
    await client.query(
      `UPDATE soa_submissions
          SET superseded_at = NOW()
        WHERE vendor_cycle_entry_id = $1 AND kind = 'email' AND superseded_at IS NULL`,
      [input.entryId],
    );
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO soa_submissions
         (vendor_cycle_entry_id, file_name, content, content_type, uploaded_by,
          validated, detected_invoice_count, accepted_at, accepted_by,
          parsed_line_count, parse_error, kind, source)
       VALUES ($1, $2, $3, $4, $5, TRUE, 0, NOW(), $5, 0, NULL, 'email', $6)
       RETURNING id`,
      [
        input.entryId,
        input.fileName,
        input.content,
        input.contentType,
        input.uploadedBy,
        input.selfService ? 'supplier_portal' : 'champion',
      ],
    );

    await client.query(
      `UPDATE vendor_cycle_entries
          SET status = 'received', responded_at = NOW(), invoice_count = 0, updated_at = NOW()
        WHERE id = $1`,
      [input.entryId],
    );

    await client.query(
      `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
       VALUES ($1, $2, 'upload', 'Reply filed as evidence', $3, $4)`,
      [
        input.countryCycleId,
        input.entryId,
        input.actorLabel,
        `${input.vendorName} (${input.vendorNo}) replied by email. ${input.fileName} filed as evidence; no invoice rows were read, so the consolidated workbook refers AP to the attachment.`,
      ],
    );

    return inserted.rows[0].id;
  });

  log.info('statement.correspondenceFiled', {
    entryId: input.entryId,
    file: input.fileName,
  });
  return { submissionId, lines: 0, needingReview: 0 };
}

/**
 * Read the workbook and record it.
 *
 * Throws {@link StatementRejected} with a message meant for whoever is holding the file. Nothing
 * unreadable is filed: recording it would move the vendor to `received` and assert a statement was
 * collected while leaving nothing behind that anyone could reconcile against.
 */
export async function storeStatement(input: StoreInput): Promise<StoreResult> {
  if (input.kind !== 'email' && !/\.(xlsx|xlsm|xls)$/i.test(input.fileName)) {
    throw new StatementRejected(
      'Statements must be the filled-in Excel template that came with the request.',
    );
  }

  /* Correspondence is filed, not read. There is no format to hold it to and nothing to extract:
     the supplier's figures may be in an attachment, in the body, or in a PDF inside the
     attachment, and guessing at any of those would put numbers in the consolidated workbook that
     nobody checked. It is evidence that they replied, and AP reads it themselves. */
  if (input.kind === 'email') return storeCorrespondence(input);

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
    /* Retire the vendor's previous WORKBOOK, in the same transaction that files the new one.
       A supplier correcting a mistake and sending the file again is ordinary, and until this
       every one of their invoices went into the consolidated workbook a second time. The old
       rows stay: they are evidence of what was first claimed, and only leave the arithmetic.

       Scoped to the kind, so filing a workbook no longer retires the covering email filed beside
       it. Each kind supersedes its own. */
    await client.query(
      `UPDATE soa_submissions
          SET superseded_at = NOW()
        WHERE vendor_cycle_entry_id = $1 AND kind = 'workbook' AND superseded_at IS NULL`,
      [input.entryId],
    );

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO soa_submissions
         (vendor_cycle_entry_id, file_name, content, content_type, uploaded_by,
          validated, detected_invoice_count, accepted_at, accepted_by,
          parsed_line_count, parse_error, kind, source)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), $5, $6, NULL, 'workbook', $7)
       RETURNING id`,
      [
        input.entryId,
        input.fileName,
        input.content,
        input.contentType,
        input.uploadedBy,
        lines.length,
        input.selfService ? 'supplier_portal' : 'champion',
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
