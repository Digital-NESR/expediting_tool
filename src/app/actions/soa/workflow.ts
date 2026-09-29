'use server';

/**
 * The chase itself: sending requests and reminders, accepting a statement, flagging a
 * non-responder, and handing a country's cycle to Finance.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one starts with its
 * own guard, and each guard is scoped to the COUNTRY the row belongs to, a champion of Oman
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
import { loadDeliveryFailures, type DeliveryFailure } from '@/lib/soa/delivery';
import { getEmployeeDirectoryDefaults } from '@/app/actions/employeeDirectory';
import { attachmentFileName, buildSupplierWorkbook } from '@/lib/soa/attachment';
import {
  htmlToText,
  renderTemplate,
  renderTemplateText,
  type TemplateVars,
} from '@/lib/soa/email-template';
import { AppUrlNotConfiguredError, soaPortalUrl, uploadLinkFor } from '@/lib/soa/links';
import { notifySoaHandoff } from '@/lib/soa/notify';
import { resolvedContactsFor, setVendorContactList } from '@/lib/soa/recipients';
import { COVERED_STATUS_SQL } from '@/lib/soa/status';
import { letterContext, loadTemplate } from '@/lib/soa/templates';
import { MailNotConfiguredError, sendMail, type MailMessage } from '@/lib/soa/mail';
import { MAX_SOA_BYTES, StatementRejected, storeStatement } from '@/lib/soa/submission-store';

const log = logger('soa-workflow');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

/** Max statement size. Statements are PDFs and spreadsheets; 10 MB is generous for both. */

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
  /** Needed to write contact edits, which are stored against the vendor rather than the entry. */
  vendorId: number;
  /** This vendor's own upload address for this cycle. */
  uploadToken: string;
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
            v.id AS vendor_id, v.name AS vendor_name, v.vendor_no,
            vce.upload_token,
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
    /* Resolved the same way the Recipients screen resolves it, rather than read from
       vendors.contact_emails, which no edit ever touches. */
    contacts: await resolvedContactsFor(Number(r.vendor_id), String(r.vendor_no)),
    vendorId: Number(r.vendor_id),
    uploadToken: String(r.upload_token),
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

async function mailFor(
  context: EntryContext,
  kind: 'request' | 'reminder',
  sentBy: string,
  letter: RenderedLetter,
): Promise<MailMessage> {
  const vars = {
    ...letter.vars,
    vendorName: context.vendorName,
    vendorNo: context.vendorNo,
    uploadLink: uploadLinkFor(context.uploadToken),
  };
  /* Still a blank: no invoice rows are pre-filled, and the vendor's identity is stamped onto the
     rows when the file comes back rather than typed into the blank they are sent. What the vendor
     does get is their own name on the instructions and in the file name, so a supplier opening
     the attachment can see it is theirs and the champion downloading sixty of them can tell them
     apart. The AP addresses go on the instructions too, which is why they are passed in. */
  const identity = { vendorNo: context.vendorNo, vendorName: context.vendorName };
  const workbook = await buildSupplierWorkbook(
    context.countryId,
    context.countryName,
    letter.apEmails,
    letter.championEmails,
    identity,
  );

  const html = renderTemplate(letter.bodyHtml, vars);
  return {
    kind: kind === 'request' ? 'soa.request' : 'soa.reminder',
    to: context.contacts,
    cc: letter.cc,
    subject: renderTemplateText(letter.subject, vars),
    bodyHtml: html,
    bodyText: htmlToText(html),
    attachments: [
      {
        fileName: attachmentFileName(context.cycleLabel, identity),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: workbook.toString('base64'),
      },
    ],
    // Context for the audit trail, not something the automation should branch on.
    meta: {
      cycleLabel: context.cycleLabel,
      countryId: context.countryId,
      countryName: context.countryName,
      vendorName: context.vendorName,
      vendorNo: context.vendorNo,
      amountUsd: context.amount,
      currency: context.currency,
      submissionDeadline: context.submissionDeadline,
      sentBy,
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
  /** Printed on the workbook's instructions as the contacts for questions. */
  apEmails: string[];
  championEmails: string[];
}

async function prepareLetter(
  countryId: string,
  actor: { email: string; name: string },
  extraCc: string[],
  ccRemoved: string[] = [],
): Promise<RenderedLetter> {
  const [stored, ctx, directory] = await Promise.all([
    loadTemplate(countryId),
    letterContext(countryId),
    getEmployeeDirectoryDefaults(actor.email).catch(() => null),
  ]);

  /* AP owns the mailbox the vendor is told to reply to, and the country's champions are copied
     because the letter names them as the contact for questions. Both are defaults rather than
     rules: a champion sending a one-off correction has a reason to drop them, so both can be
     taken off on the Recipients step.
     *
     * The sender cannot be. They are accountable for what went out, and a send nobody can be
     asked about afterwards is the gap the evidence trail exists to close. */
  const dropped = new Set(ccRemoved.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const cc = [
    ...new Set(
      [...ctx.apEmails, ...ctx.championEmails, ...extraCc]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && !dropped.has(e)),
    ),
  ];
  const sender = actor.email.trim().toLowerCase();
  if (!cc.includes(sender)) cc.unshift(sender);

  return {
    subject: stored.subject,
    bodyHtml: stored.bodyHtml,
    cc,
    monthYear: ctx.statementMonthYear,
    apEmails: ctx.apEmails,
    championEmails: ctx.championEmails,
    vars: {
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      vendorName: '',
      vendorNo: '',
      countryName: ctx.countryName,
      cycleLabel: ctx.cycleLabel,
      statementPeriodEnd: ctx.statementPeriodEnd,
      statementPeriodEndShort: ctx.statementPeriodEndShort,
      replyBy: ctx.replyBy,
      apEmail: ctx.apEmails.join(', '),
      championName: ctx.championNames.join(' or ') || actor.name,
      championEmail: ctx.championEmails.join(', ') || actor.email,
      // Filled per vendor in mailFor; a letter-wide value would send everyone the same link.
      uploadLink: '',
      senderName: actor.name,
      senderTitle: directory?.position ?? '',
      senderEmail: actor.email,
    },
  };
}

/**
 * Send one vendor their statement request, or a reminder.
 *
 * The dispatch is attempted BEFORE the status moves, and the status only moves if it succeeded.
 * Recording a send that did not happen would put a false entry in the evidence trail, which is
 * worse than not sending at all. The SOP's two-request test is read off exactly these rows.
 *
 * A failed attempt is still recorded, as a failure. A champion needs to see that n8n rejected
 * something rather than wonder why a vendor never replied.
 */
export async function sendSoaOutreach(input: {
  entryId: number;
  kind: 'request' | 'reminder';
  /** Extra NESR addresses to copy on this send only; never stored. */
  cc?: string[];
  /** Default copies the sender chose to drop for this send only; never stored. */
  ccRemoved?: string[];
  /** Supplied by a batch so the letter is composed once rather than per vendor. */
  letter?: RenderedLetter;
}): Promise<SoaResult> {
  let context: EntryContext | null = null;
  try {
    const loaded = await loadEntry(input.entryId);
    context = loaded.context;
    const actor = loaded.actor;
    const letter =
      input.letter ??
      (await prepareLetter(context.countryId, actor, input.cc ?? [], input.ccRemoved ?? []));

    await sendMail(await mailFor(context, input.kind, actor.email, letter));

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
        `${context!.vendorName} (${context!.vendorNo}), sent to ${context!.contacts.join(', ')}.`,
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
        err instanceof MailNotConfiguredError ||
        err instanceof AppUrlNotConfiguredError ||
        err instanceof AccessError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not send.',
    };
  }
}

/**
 * Who a bulk send would write to, before it writes to any of them.
 *
 * The batch below does the whole country in one call and answers when it is finished, which for
 * 120 suppliers is minutes of a page that looks stuck. The screen asks for the list first and then
 * sends one at a time, so it can count them off; this is the query that used to sit inside the
 * loop's own function.
 *
 * Read-only and viewer-level: seeing who is due is not sending to them.
 */
export async function getSoaOutreachDue(input: {
  countryId: string;
  kind: 'request' | 'reminder' | 'retry';
}): Promise<SoaResult<{ entryId: number; vendorName: string; kind: 'request' | 'reminder' }[]>> {
  try {
    await requireSoaCountry(input.countryId, 'viewer');

    if (input.kind === 'retry') {
      const stuck = (await loadDeliveryFailures(input.countryId)).filter((f) => f.retryable);
      return {
        success: true,
        data: stuck.map((f) => ({ entryId: f.entryId, vendorName: f.vendorName, kind: f.kind })),
      };
    }

    const rows = await sql<QueryResultRow[]>(
      `SELECT vce.id, v.name
         FROM vendor_cycle_entries vce
         JOIN vendors v          ON v.id = vce.vendor_id
         JOIN country_cycles cc  ON cc.id = vce.country_cycle_id
         JOIN cycles cy          ON cy.id = cc.cycle_id AND cy.is_active
        WHERE cc.country_id = ? AND vce.status = ANY(?::vendor_cycle_status[])
        ORDER BY vce.open_po_amount DESC`,
      [input.countryId, input.kind === 'request' ? ['scoped'] : ['requested', 'reminded']],
    );
    return {
      success: true,
      data: rows.map((r) => ({
        entryId: Number(r.id),
        vendorName: String(r.name),
        kind: input.kind as 'request' | 'reminder',
      })),
    };
  } catch (err) {
    log.error('getSoaOutreachDue.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not read who is due.',
    };
  }
}


/**
 * Close a vendor that never sent a statement, saying which kind of silence it was.
 *
 * One button used to cover both, and they are not the same fact. A supplier who never answered
 * leaves their balance unconfirmed, which is exactly the gap this exercise exists to find. A
 * supplier the champion has established has nothing outstanding is a reconciliation that came out
 * at nil: there was never a statement to collect, and the account is settled.
 *
 * Only the second counts towards coverage, and because it moves the figure the quarter is judged
 * on, it cannot be recorded without the champion saying why. That is enforced here rather than in
 * the modal: every export of a `'use server'` module is a public POST endpoint, and a disabled
 * button is not a control.
 */
export async function resolveSoaVendor(input: {
  entryId: number;
  outcome: 'nil_balance' | 'non_responder';
  note: string;
}): Promise<SoaResult> {
  try {
    const { actor, context } = await loadEntry(input.entryId);
    const note = (input.note ?? '').trim().slice(0, 2000);

    if (input.outcome !== 'nil_balance' && input.outcome !== 'non_responder') {
      return { success: false, error: 'Choose one of the two outcomes.' };
    }
    if (input.outcome === 'nil_balance' && note.length < 3) {
      return {
        success: false,
        error:
          'Say how you established there are no pending invoices. This vendor will count towards the coverage figure, so the reason goes on the audit trail.',
      };
    }

    const isNil = input.outcome === 'nil_balance';
    await withTransaction(soaPool, async (client) => {
      await client.query(
        `UPDATE vendor_cycle_entries
            SET status = $2::vendor_cycle_status, resolution_note = $3, updated_at = NOW()
          WHERE id = $1`,
        [input.entryId, input.outcome, note || null],
      );
      await writeEvidence(
        client,
        context.countryCycleId,
        input.entryId,
        'info',
        isNil ? 'Closed, no pending invoices' : 'Non-responder flagged',
        actor.email,
        isNil
          ? `${context.vendorName} (${context.vendorNo}) has no pending invoices and counts towards coverage. Reason given: ${note}`
          : `${context.vendorName} (${context.vendorNo}) did not respond; balance unconfirmed and not counted. Correspondence retained.` +
            (note ? ` Note: ${note}` : ''),
      );
    });

    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('resolveSoaVendor.failed', err, { entryId: input.entryId });
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not close that vendor.',
    };
  }
}

/**
 * Accept a vendor's statement.
 *
 * The file is stored as bytes in this database and served from an authenticated route, the way
 * every other document in this app is, a statement of account lists a vendor's invoice numbers
 * and balances and is not something to leave on an unguessable URL.
 */
export async function acceptSoaSubmission(
  entryId: number,
  formData: FormData,
): Promise<SoaResult<{ lines: number; needingReview: number }>> {
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

    /* Two things a champion can file, told apart by the file itself rather than by a toggle they
       would have to remember to set: the template, which is read into invoice rows, and a saved
       reply, which is filed as evidence and read by nobody. */
    const isCorrespondence = /\.(eml|msg)$/i.test(file.name);

    const stored = await storeStatement({
      kind: isCorrespondence ? 'email' : 'workbook',
      entryId,
      countryCycleId: context.countryCycleId,
      vendorNo: context.vendorNo,
      vendorName: context.vendorName,
      countryId: context.countryId,
      cycleLabel: context.cycleLabel,
      fileName: file.name,
      contentType: uploadMimeTypeFor(file.name, file.type),
      content,
      uploadedBy: actor.email,
      actorLabel: actor.email,
      selfService: false,
    });

    revalidatePath('/soa-consolidation');
    return { success: true, data: { lines: stored.lines, needingReview: stored.needingReview } };
  } catch (err) {
    if (err instanceof StatementRejected) return { success: false, error: err.message };
    log.error('acceptSoaSubmission.failed', err, { entryId });
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not record that statement.',
    };
  }
}

export async function handOffSoaCountry(
  countryId: string,
): Promise<SoaResult<{ notified: boolean; apContacts: number }>> {
  try {
    const actor = await requireSoaCountry(countryId, 'champion');
    const rows = await sql<QueryResultRow[]>(
      `SELECT cc.id, cy.coverage_target_pct, cy.label,
              COUNT(vce.id)::int AS vendor_count,
              COUNT(vce.id)
                FILTER (WHERE vce.status::text IN (${COVERED_STATUS_SQL}))::int AS received_count,
              COALESCE(SUM(vce.open_po_amount)
                       FILTER (WHERE vce.status::text IN (${COVERED_STATUS_SQL})), 0) AS received,
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

    /* After the commit, and never allowed to undo it. A cycle closed but not announced is a
       delay somebody can fix by looking at the portal; a close refused because a webhook was down
       is work that has to be done again. The champion is told which happened rather than left to
       assume the notice went. */
    const ctx = await letterContext(countryId);
    const notified = await notifySoaHandoff({
      countryName: ctx.countryName,
      cycleLabel: String(rows[0].label),
      apEmails: ctx.apEmails,
      championEmails: [...new Set([...ctx.championEmails, actor.email])],
      closedBy: actor.name,
      vendors: Number(rows[0].vendor_count),
      statementsReceived: Number(rows[0].received_count),
      coveragePct: pct,
      portalUrl: soaPortalUrl(),
    });

    revalidatePath('/soa-consolidation');
    return {
      success: true,
      data: { notified, apContacts: ctx.apEmails.length },
    };
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
    const resolved = await setVendorContactList({
      vendorId: context.vendorId,
      vendorNo: context.vendorNo,
      desired: cleaned,
      actor: actor.email,
    });
    await withTransaction(soaPool, async (client) => {
      await writeEvidence(
        client,
        context.countryCycleId,
        input.entryId,
        'info',
        'Vendor contacts updated',
        actor.email,
        `${context.vendorName} (${context.vendorNo}), ${resolved.length ? resolved.join(', ') : 'all addresses removed'}.`,
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

/**
 * The sends this country's mailer refused, newest first.
 *
 * Anyone who can see the country can see them: an unreachable vendor is the usual reason a
 * coverage figure stops moving, and a viewer watching that figure needs the reason too.
 */
export async function getSoaOutreachFailures(countryId: string): Promise<DeliveryFailure[]> {
  try {
    await requireSoaActor('viewer');
    await requireSoaCountry(countryId, 'viewer');
    return await loadDeliveryFailures(countryId);
  } catch (err) {
    log.error('getSoaOutreachFailures.failed', err);
    return [];
  }
}

