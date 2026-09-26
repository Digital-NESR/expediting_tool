'use server';

/**
 * The chase itself: sending requests and reminders, accepting a statement, flagging a
 * non-responder, and handing a country's cycle to Finance.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one starts with its
 * own guard, and each guard is scoped to the COUNTRY the row belongs to — a champion of Oman
 * invoking these with a Saudi entry id must be refused, and the id is the only thing the caller
 * controls.
 *
 * Every state change writes an evidence row in the same transaction. That is the whole point of
 * the tool: an auditor asking "did you chase this vendor twice, and when" has to get an answer
 * that was not assembled afterwards.
 */

import { revalidatePath } from 'next/cache';
import type { PoolClient, QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import { validateUploadSignature, uploadMimeTypeFor } from '@/lib/documents';
import { ensureSoaSchema, soaPool, sql } from '@/lib/soa/db';
import { requireSoaActor, requireSoaCountry } from '@/lib/soa/access';
import { getEmployeeDirectoryDefaults } from '@/app/actions/employeeDirectory';
import { attachmentFileName, buildVendorWorkbook } from '@/lib/soa/attachment';
import { htmlToText, renderTemplate, type TemplateVars } from '@/lib/soa/email-template';
import { letterContext, loadTemplate } from '@/lib/soa/templates';
import {
  dispatchOutreach,
  OutreachNotConfiguredError,
  type OutreachPayload,
} from '@/lib/soa/outreach';

const log = logger('soa-workflow');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

/** Max statement size. Statements are PDFs and spreadsheets; 10 MB is generous for both. */
const MAX_SOA_BYTES = 10 * 1024 * 1024;

interface EntryContext {
  entryId: number;
  countryCycleId: number;
  countryId: string;
  countryName: string;
  vendorName: string;
  vendorNo: string;
  amount: number;
  currency: string;
  contacts: string[];
  status: string;
  cycleLabel: string;
  submissionDeadline: string;
}

/**
 * Resolve an entry id to its country, and refuse a caller who does not hold that country.
 *
 * This is the security boundary for every action below: the entry id arrives from the browser, so
 * the country has to be read from the database rather than trusted from the request.
 */
async function loadEntry(entryId: number, min: 'champion' | 'viewer' = 'champion') {
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT vce.id, vce.country_cycle_id, vce.open_po_amount, vce.currency, vce.status::text AS status,
            v.name AS vendor_name, v.vendor_no, v.contact_emails,
            cc.country_id, c.name AS country_name, cy.label, cy.submission_deadline
       FROM vendor_cycle_entries vce
       JOIN vendors v        ON v.id = vce.vendor_id
       JOIN country_cycles cc ON cc.id = vce.country_cycle_id
       JOIN countries c      ON c.id = cc.country_id
       JOIN cycles cy        ON cy.id = cc.cycle_id
      WHERE vce.id = ?`,
    [entryId],
  );
  if (!rows.length) throw new AccessError('No such vendor entry.', 404);
  const r = rows[0];
  const countryId = String(r.country_id);
  const actor = await requireSoaCountry(countryId, min);
  const context: EntryContext = {
    entryId: Number(r.id),
    countryCycleId: Number(r.country_cycle_id),
    countryId,
    countryName: String(r.country_name),
    vendorName: String(r.vendor_name),
    vendorNo: String(r.vendor_no),
    amount: Number(r.open_po_amount),
    currency: String(r.currency),
    contacts: ((r.contact_emails ?? []) as string[]).filter(Boolean),
    status: String(r.status),
    cycleLabel: String(r.label),
    submissionDeadline:
      r.submission_deadline instanceof Date
        ? r.submission_deadline.toISOString().slice(0, 10)
        : String(r.submission_deadline).slice(0, 10),
  };
  return { actor, context };
}

async function writeEvidence(
  client: PoolClient,
  countryCycleId: number,
  entryId: number | null,
  type: string,
  action: string,
  actor: string,
  detail: string,
): Promise<void> {
  await client.query(
    `INSERT INTO evidence_log (country_cycle_id, vendor_cycle_entry_id, type, action, actor, detail)
     VALUES ($1, $2, $3::evidence_type, $4, $5, $6)`,
    [countryCycleId, entryId, type, action, actor, detail],
  );
}

async function payloadFor(
  context: EntryContext,
  kind: 'request' | 'reminder',
  sentBy: string,
  letter: RenderedLetter,
): Promise<OutreachPayload> {
  const vars = { ...letter.vars, vendorName: context.vendorName, vendorNo: context.vendorNo };
  const workbook = await buildVendorWorkbook({
    countryId: context.countryId,
    vendorName: context.vendorName,
    vendorNo: context.vendorNo,
    monthYear: letter.monthYear,
  });

  return {
    kind,
    cycleLabel: context.cycleLabel,
    countryId: context.countryId,
    countryName: context.countryName,
    vendorName: context.vendorName,
    vendorNo: context.vendorNo,
    amountUsd: context.amount,
    currency: context.currency,
    recipients: context.contacts,
    cc: letter.cc,
    submissionDeadline: context.submissionDeadline,
    sentBy,
    subject: renderTemplate(letter.subject, vars),
    bodyHtml: renderTemplate(letter.bodyHtml, vars),
    bodyText: htmlToText(renderTemplate(letter.bodyHtml, vars)),
    attachment: {
      fileName: attachmentFileName(context.vendorNo, context.cycleLabel),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: workbook.toString('base64'),
    },
  };
}

/**
 * The country's letter, resolved once and reused for every vendor in a batch.
 *
 * Only the vendor's name and number differ between the 61 messages a country sends, so the
 * template, the cycle dates, the AP mailbox and the sender's details are looked up once. Passing
 * this in also means a single send and a batch send compose the identical letter.
 */
interface RenderedLetter {
  subject: string;
  bodyHtml: string;
  vars: TemplateVars;
  cc: string[];
  /** Stamped into the workbook's Month/Year column. */
  monthYear: string;
}

async function prepareLetter(
  countryId: string,
  actor: { email: string; name: string },
  extraCc: string[],
): Promise<RenderedLetter> {
  const [stored, ctx, directory] = await Promise.all([
    loadTemplate(countryId),
    letterContext(countryId),
    getEmployeeDirectoryDefaults(actor.email).catch(() => null),
  ]);

  // The sender always sees what went out, and AP owns the mailbox the vendor is told to reply to.
  // Anything else is a one-off the champion chose for this send and is not stored.
  const cc = [...new Set([actor.email, ...(ctx.apEmail ? [ctx.apEmail] : []), ...extraCc])]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return {
    subject: stored.subject,
    bodyHtml: stored.bodyHtml,
    cc,
    monthYear: ctx.statementMonthYear,
    vars: {
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      vendorName: '',
      vendorNo: '',
      countryName: ctx.countryName,
      cycleLabel: ctx.cycleLabel,
      statementPeriodEnd: ctx.statementPeriodEnd,
      replyBy: ctx.replyBy,
      apEmail: ctx.apEmail,
      championName: ctx.championName || actor.name,
      senderName: actor.name,
      senderTitle: directory?.position ?? '',
      senderMobile: '',
      senderEmail: actor.email,
    },
  };
}

/**
 * Send one vendor their statement request, or a reminder.
 *
 * The dispatch is attempted BEFORE the status moves, and the status only moves if it succeeded.
 * Recording a send that did not happen would put a false entry in the evidence trail, which is
 * worse than not sending at all — the SOP's two-request test is read off exactly these rows.
 *
 * A failed attempt is still recorded, as a failure. A champion needs to see that n8n rejected
 * something rather than wonder why a vendor never replied.
 */
export async function sendSoaOutreach(input: {
  entryId: number;
  kind: 'request' | 'reminder';
  /** Extra NESR addresses to copy on this send only; never stored. */
  cc?: string[];
  /** Supplied by a batch so the letter is composed once rather than per vendor. */
  letter?: RenderedLetter;
}): Promise<SoaResult> {
  let context: EntryContext | null = null;
  try {
    const loaded = await loadEntry(input.entryId);
    context = loaded.context;
    const actor = loaded.actor;
    const letter =
      input.letter ?? (await prepareLetter(context.countryId, actor, input.cc ?? []));

    await dispatchOutreach(await payloadFor(context, input.kind, actor.email, letter));

    const isRequest = input.kind === 'request';
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `INSERT INTO outreach_dispatches
           (vendor_cycle_entry_id, kind, recipients, sent_by, succeeded)
         VALUES ($1, $2::outreach_kind, $3, $4, TRUE)`,
        [context!.entryId, input.kind, context!.contacts, actor.email],
      );
      await client.query(
        isRequest
          ? `UPDATE vendor_cycle_entries
                SET status = 'requested', requested_at = COALESCE(requested_at, NOW()), updated_at = NOW()
              WHERE id = $1`
          : `UPDATE vendor_cycle_entries
                SET status = 'reminded', reminded_at = NOW(), updated_at = NOW()
              WHERE id = $1`,
        [context!.entryId],
      );
      await client.query(
        `UPDATE country_cycles
            SET status = CASE
                  WHEN $2 = 'request'  AND status IN ('not_started','in_progress') THEN 'requests_sent'
                  WHEN $2 = 'reminder' AND status IN ('not_started','in_progress','requests_sent') THEN 'reminders_sent'
                  ELSE status END,
                updated_at = NOW()
          WHERE id = $1`,
        [context!.countryCycleId, input.kind],
      );
      await writeEvidence(
        client,
        context!.countryCycleId,
        context!.entryId,
        input.kind === 'request' ? 'email' : 'reminder',
        isRequest ? 'Statement request sent' : 'Reminder sent',
        actor.email,
        `${context!.vendorName} (${context!.vendorNo}) — sent to ${context!.contacts.join(', ')}.`,
      );
    });

    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    // Record the failed attempt where we can identify the entry, so silence is never mistaken for
    // a vendor who was asked and did not reply.
    if (context && !(err instanceof AccessError)) {
      await sql(
        `INSERT INTO outreach_dispatches (vendor_cycle_entry_id, kind, recipients, sent_by, succeeded, error)
         VALUES (?, ?::outreach_kind, ?, ?, FALSE, ?)`,
        [
          context.entryId,
          input.kind,
          context.contacts,
          'system',
          err instanceof Error ? err.message : String(err),
        ],
      ).catch(() => {});
    }
    log.error('sendSoaOutreach.failed', err, { entryId: input.entryId, kind: input.kind });
    return {
      success: false,
      error:
        err instanceof OutreachNotConfiguredError || err instanceof AccessError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not send.',
    };
  }
}

/**
 * Send to everyone in the country who is due one.
 *
 * Runs one at a time and reports how many of each outcome, rather than failing the whole batch on
 * the first vendor with no email address. A champion sending 270 requests needs to know which ones
 * did not go, not to have the other 269 rolled back.
 */
export async function sendSoaOutreachBatch(input: {
  countryId: string;
  kind: 'request' | 'reminder';
  /** Extra NESR addresses to copy on this send only; never stored. */
  cc?: string[];
}): Promise<SoaResult<{ sent: number; failed: number; firstError: string | null }>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');
    const letter = await prepareLetter(input.countryId, actor, input.cc ?? []);
    const due = await sql<QueryResultRow[]>(
      `SELECT vce.id
         FROM vendor_cycle_entries vce
         JOIN country_cycles cc ON cc.id = vce.country_cycle_id
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
        WHERE cc.country_id = ? AND vce.status = ?::vendor_cycle_status
        ORDER BY vce.open_po_amount DESC`,
      [input.countryId, input.kind === 'request' ? 'scoped' : 'requested'],
    );

    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const row of due) {
      const result = await sendSoaOutreach({ entryId: Number(row.id), kind: input.kind, letter });
      if (result.success) sent += 1;
      else {
        failed += 1;
        firstError ??= result.error ?? null;
      }
    }

    revalidatePath('/soa-consolidation');
    return { success: true, data: { sent, failed, firstError } };
  } catch (err) {
    log.error('sendSoaOutreachBatch.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not send the batch.',
    };
  }
}

/** Flag a vendor that never answered. The correspondence stays as the evidence it is. */
export async function markSoaNonResponder(entryId: number): Promise<SoaResult> {
  try {
    const { actor, context } = await loadEntry(entryId);
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `UPDATE vendor_cycle_entries SET status = 'non_responder', updated_at = NOW() WHERE id = $1`,
        [entryId],
      );
      await writeEvidence(
        client,
        context.countryCycleId,
        entryId,
        'info',
        'Non-responder flagged',
        actor.email,
        `${context.vendorName} (${context.vendorNo}) did not respond. Correspondence retained.`,
      );
    });
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('markSoaNonResponder.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not flag the vendor.',
    };
  }
}

/**
 * Accept a vendor's statement.
 *
 * The file is stored as bytes in this database and served from an authenticated route, the way
 * every other document in this app is — a statement of account lists a vendor's invoice numbers
 * and balances and is not something to leave on an unguessable URL.
 */
export async function acceptSoaSubmission(entryId: number, formData: FormData): Promise<SoaResult> {
  try {
    const { actor, context } = await loadEntry(entryId);

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: 'No statement file received.' };
    }
    if (file.size > MAX_SOA_BYTES) {
      return { success: false, error: 'That file is larger than 10 MB.' };
    }
    const content = Buffer.from(await file.arrayBuffer());
    if (content.byteLength > MAX_SOA_BYTES) {
      return { success: false, error: 'That file is larger than 10 MB.' };
    }

    // The extension and the browser's MIME claim are both claims; check the real leading bytes.
    const verdict = validateUploadSignature(file.name, content, file.type);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const invoiceCountRaw = String(formData.get('invoiceCount') ?? '').trim();
    const invoiceCount = invoiceCountRaw ? Number(invoiceCountRaw) : 0;
    if (!Number.isFinite(invoiceCount) || invoiceCount < 0) {
      return { success: false, error: 'Invoice count must be a number.' };
    }

    await withTransaction(soaPool, async (client) => {
      await client.query(
        `INSERT INTO soa_submissions
           (vendor_cycle_entry_id, file_name, content, content_type, uploaded_by,
            validated, detected_invoice_count, accepted_at, accepted_by)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), $5)`,
        [
          entryId,
          file.name,
          content,
          uploadMimeTypeFor(file.name, file.type),
          actor.email,
          invoiceCount || null,
        ],
      );
      await client.query(
        `UPDATE vendor_cycle_entries
            SET status = 'received', responded_at = NOW(), invoice_count = $2, updated_at = NOW()
          WHERE id = $1`,
        [entryId, invoiceCount],
      );
      await writeEvidence(
        client,
        context.countryCycleId,
        entryId,
        'upload',
        'SOA received',
        actor.email,
        `${context.vendorName} (${context.vendorNo}) — statement accepted` +
          (invoiceCount ? `, ${invoiceCount} invoices.` : '.'),
      );
    });

    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('acceptSoaSubmission.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not accept the statement.',
    };
  }
}

/**
 * Hand a country's cycle to Finance.
 *
 * Refuses below the cycle's own coverage target. The control exists precisely so that a quarter
 * cannot be signed off short, and a tool that let a champion click past it would be worse than no
 * tool — it would put a tick beside a control that was never met.
 */
export async function handOffSoaCountry(countryId: string): Promise<SoaResult> {
  try {
    const actor = await requireSoaCountry(countryId, 'champion');
    const rows = await sql<QueryResultRow[]>(
      `SELECT cc.id, cy.coverage_target_pct, cy.label,
              COALESCE(SUM(vce.open_po_amount) FILTER (WHERE vce.status = 'received'), 0) AS received,
              (SELECT COALESCE(SUM(e.pos_value), 0)
                 FROM supplier_po_extract e
                 JOIN countries c ON e.po_country = ANY (c.spend_names)
                WHERE e.cycle_id = cy.id AND c.id = cc.country_id) AS total
         FROM country_cycles cc
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
         LEFT JOIN vendor_cycle_entries vce ON vce.country_cycle_id = cc.id
        WHERE cc.country_id = ?
        GROUP BY cc.id, cy.coverage_target_pct, cy.label, cy.id, cc.country_id`,
      [countryId],
    );
    if (!rows.length) return { success: false, error: 'This country has no active cycle.' };

    const total = Number(rows[0].total);
    const received = Number(rows[0].received);
    const pct = total > 0 ? Math.round((received / total) * 100) : 0;
    const target = Number(rows[0].coverage_target_pct);
    if (pct < target) {
      return {
        success: false,
        error: `Coverage is ${pct}%, below the ${target}% threshold for ${rows[0].label}. Collect more statements before handing off.`,
      };
    }

    const countryCycleId = Number(rows[0].id);
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `UPDATE country_cycles SET status = 'handed_off', handed_off_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [countryCycleId],
      );
      await writeEvidence(
        client,
        countryCycleId,
        null,
        'handoff',
        'Handed off to Finance',
        actor.email,
        `Consolidated statement file delivered for ${rows[0].label}. Coverage ${pct}% against a ${target}% threshold.`,
      );
    });

    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('handOffSoaCountry.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not hand off.',
    };
  }
}

/** The consolidated export rows, for the champion to download. */
export async function getSoaExportRows(countryId: string): Promise<
  {
    vendorNo: string;
    vendorName: string;
    amount: number;
    currency: string;
    status: string;
    requestedAt: string | null;
    remindedAt: string | null;
    respondedAt: string | null;
    invoiceCount: number;
  }[]
> {
  try {
    await requireSoaCountry(countryId, 'viewer');
    const rows = await sql<QueryResultRow[]>(
      `SELECT v.vendor_no, v.name, vce.open_po_amount, vce.currency, vce.status::text AS status,
              vce.requested_at, vce.reminded_at, vce.responded_at, vce.invoice_count
         FROM vendor_cycle_entries vce
         JOIN vendors v ON v.id = vce.vendor_id
         JOIN country_cycles cc ON cc.id = vce.country_cycle_id
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
        WHERE cc.country_id = ?
        ORDER BY vce.open_po_amount DESC`,
      [countryId],
    );
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
    return rows.map((r) => ({
      vendorNo: String(r.vendor_no),
      vendorName: String(r.name),
      amount: Number(r.open_po_amount),
      currency: String(r.currency),
      status: String(r.status),
      requestedAt: iso(r.requested_at),
      remindedAt: iso(r.reminded_at),
      respondedAt: iso(r.responded_at),
      invoiceCount: Number(r.invoice_count),
    }));
  } catch (err) {
    log.error('getSoaExportRows.failed', err);
    return [];
  }
}

/** Record that the consolidated file was produced. Evidence, not a download. */
export async function recordSoaExport(countryId: string): Promise<SoaResult> {
  try {
    const actor = await requireSoaCountry(countryId, 'champion');
    const rows = await sql<QueryResultRow[]>(
      `SELECT cc.id, cy.label FROM country_cycles cc
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
        WHERE cc.country_id = ?`,
      [countryId],
    );
    if (!rows.length) return { success: false, error: 'This country has no active cycle.' };
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `UPDATE country_cycles
            SET status = CASE WHEN status = 'handed_off' THEN status ELSE 'consolidating' END,
                updated_at = NOW()
          WHERE id = $1`,
        [Number(rows[0].id)],
      );
      await writeEvidence(
        client,
        Number(rows[0].id),
        null,
        'info',
        'Consolidated export generated',
        actor.email,
        `Export produced for ${rows[0].label}.`,
      );
    });
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('recordSoaExport.failed', err);
    return { success: false, error: 'Could not record the export.' };
  }
}

/** Correct a vendor's contact addresses. The AVL has one for barely a third of them. */
export async function setSoaVendorContacts(input: {
  entryId: number;
  emails: string[];
}): Promise<SoaResult> {
  try {
    const { actor, context } = await loadEntry(input.entryId);
    const cleaned = [
      ...new Set(
        input.emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes('@') && e.length > 3),
      ),
    ];
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `UPDATE vendors v
            SET contact_emails = $2, contact_source = 'manual',
                contact_updated_at = NOW(), contact_updated_by = $3
           FROM vendor_cycle_entries vce
          WHERE vce.id = $1 AND v.id = vce.vendor_id`,
        [input.entryId, cleaned, actor.email],
      );
      await writeEvidence(
        client,
        context.countryCycleId,
        input.entryId,
        'info',
        'Vendor contacts updated',
        actor.email,
        `${context.vendorName} (${context.vendorNo}) — ${cleaned.length ? cleaned.join(', ') : 'all addresses removed'}.`,
      );
    });
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('setSoaVendorContacts.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not save the contacts.',
    };
  }
}

/** Anyone who can see the country can see who is unreachable — it explains a stalled coverage figure. */
export async function getSoaOutreachFailures(
  countryId: string,
): Promise<{ vendorNo: string; vendorName: string; error: string; sentAt: string }[]> {
  try {
    await requireSoaActor('viewer');
    await requireSoaCountry(countryId, 'viewer');
    const rows = await sql<QueryResultRow[]>(
      `SELECT v.vendor_no, v.name, d.error, d.sent_at
         FROM outreach_dispatches d
         JOIN vendor_cycle_entries vce ON vce.id = d.vendor_cycle_entry_id
         JOIN vendors v ON v.id = vce.vendor_id
         JOIN country_cycles cc ON cc.id = vce.country_cycle_id
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
        WHERE cc.country_id = ? AND d.succeeded = FALSE
        ORDER BY d.sent_at DESC
        LIMIT 100`,
      [countryId],
    );
    return rows.map((r) => ({
      vendorNo: String(r.vendor_no),
      vendorName: String(r.name),
      error: String(r.error ?? 'Unknown error'),
      sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at),
    }));
  } catch (err) {
    log.error('getSoaOutreachFailures.failed', err);
    return [];
  }
}
