'use server';

import { revalidatePath } from 'next/cache';
import { withTransaction } from '@/lib/db/tx';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import {
  requireCommunicationAccess,
  requireRequestAccess,
  requireSafeSignCountry,
} from '@/lib/safesign/access';
import { recipientsFor } from '@/lib/safesign/suppliers';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';
import { remindRequests } from '@/lib/safesign/delivery';
import {
  ATTACHMENT_MODES,
  MAX_FILE_BYTES,
  RESPONSE_TYPES,
  needsLetter,
  type AttachmentMode,
  type ResponseType,
} from '@/lib/safesign/model';
import {
  acceptedMail,
  changesRequestedMail,
  requestMail,
  sendSafeSignMail,
} from '@/lib/safesign/notify';
import { dateOnly, respondUrl } from '@/lib/safesign/supplier-access';

/**
 * Creating, sending and closing communications, reminding suppliers and reviewing plans.
 * Any SafeSign user, and only in their own countries: a new communication belongs to the country
 * being worked on, and every action on an existing one checks its country first.
 */

const log = logger('safesign-comms');

export type Result = { success: boolean; error?: string; id?: number; message?: string };

function fail(err: unknown, event: string): Result {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: 'Something went wrong. Try again.' };
}

/**
 * Save a new communication as a draft, with its documents and the suppliers it will go to.
 * FormData because it carries files: title, topicId, message, responseType, attachments,
 * deadline, remindDaysBefore ("3,1"), overdueEveryDays, vendorIds (repeated), files (repeated),
 * letterIndex (which of the files is the letter to sign).
 */
export async function createCommunication(form: FormData): Promise<Result> {
  try {
    const { actor, country } = await requireSafeSignCountry();
    await ensureSafeSignSchema();

    const title = String(form.get('title') ?? '').trim();
    const topicId = Number(form.get('topicId'));
    const message = String(form.get('message') ?? '').trim();
    const responseType = String(form.get('responseType')) as ResponseType;
    const attachments = String(form.get('attachments') ?? 'none') as AttachmentMode;
    const deadline = String(form.get('deadline') ?? '').slice(0, 10);
    const remindDaysBefore = String(form.get('remindDaysBefore') ?? '')
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
    const overdueEveryDays = Math.max(0, Math.min(30, Number(form.get('overdueEveryDays') ?? 2) || 0));
    const vendorIds = [...new Set(form.getAll('vendorIds').map(Number).filter(Number.isFinite))];
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    const letterIndex = Number(form.get('letterIndex') ?? -1);

    if (!title) return { success: false, error: 'Enter a title.' };
    if (!topicId) return { success: false, error: 'Choose a topic.' };
    if (!RESPONSE_TYPES.includes(responseType)) return { success: false, error: 'Choose a response type.' };
    if (!ATTACHMENT_MODES.includes(attachments)) return { success: false, error: 'Choose an attachments option.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { success: false, error: 'Choose a deadline.' };
    if (!vendorIds.length) return { success: false, error: 'Choose at least one supplier.' };
    if (!files.length && responseType !== 'submit_documents' && responseType !== 'action_plan') {
      return { success: false, error: 'Attach the document(s) the suppliers need to review.' };
    }
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return { success: false, error: `${f.name} is larger than 15 MB.` };
    }
    if (needsLetter(responseType) && !files.length) {
      return { success: false, error: 'Attach the letter the suppliers will sign.' };
    }

    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    /* The letter to sign: the one picked, else the first PDF, else the first file. */
    let letter = needsLetter(responseType) ? letterIndex : -1;
    if (needsLetter(responseType) && !(letter >= 0 && letter < files.length)) {
      const pdf = files.findIndex((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      letter = pdf >= 0 ? pdf : 0;
    }

    const id = await withTransaction(safesignPool, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO ss_communications
           (topic_id, title, message, response_type, attachments, deadline,
            remind_days_before, overdue_every_days, created_by, country_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [topicId, title, message, responseType, attachments, deadline, remindDaysBefore, overdueEveryDays, actor.email, country.id],
      );
      const commId = Number(rows[0].id);
      for (const [i, f] of files.entries()) {
        await client.query(
          `INSERT INTO ss_documents (communication_id, filename, mime, size_bytes, data, is_letter, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [commId, f.name, f.type || 'application/octet-stream', f.size, buffers[i], i === letter, actor.email],
        );
      }
      await client.query(
        `INSERT INTO ss_requests (communication_id, vendor_id)
         SELECT $1, id FROM ss_vendors WHERE id = ANY($2::bigint[]) AND active AND country_id = $3`,
        [commId, vendorIds, country.id],
      );
      await client.query(
        `INSERT INTO ss_events (communication_id, kind, actor, detail) VALUES ($1, 'communication.created', $2, $3)`,
        [commId, actor.email, JSON.stringify({ suppliers: vendorIds.length, files: files.length })],
      );
      return commId;
    });

    revalidatePath('/safesign', 'layout');
    return { success: true, id };
  } catch (err) {
    return fail(err, 'createCommunication.failed');
  }
}

export async function deleteDraft(id: number): Promise<Result> {
  try {
    await requireCommunicationAccess(id);
    await ensureSafeSignSchema();
    const { rowCount } = await safesignPool.query(
      `DELETE FROM ss_communications WHERE id = $1 AND status = 'draft'`,
      [id],
    );
    if (!rowCount) return { success: false, error: 'Only drafts can be deleted.' };
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'deleteDraft.failed');
  }
}

/**
 * Email every supplier on the communication. Each request freezes the addresses it went to.
 * Safe to call again: suppliers already sent are left alone, so a partial failure can be retried.
 */
export async function sendCommunication(id: number): Promise<Result> {
  try {
    const actor = await requireCommunicationAccess(id);
    await ensureSafeSignSchema();

    const { rows: comms } = await safesignPool.query(
      `SELECT id, title, message, response_type, deadline, status, approval FROM ss_communications WHERE id = $1`,
      [id],
    );
    const c = comms[0];
    if (!c) return { success: false, error: 'That communication no longer exists.' };
    if (c.status === 'closed') return { success: false, error: 'This communication is closed.' };
    /* Nothing reaches a supplier before the country SCM and a final approver have both approved. */
    if (c.approval !== 'approved') {
      return { success: false, error: 'This communication has not been approved yet. Submit it for approval first.' };
    }

    const { rows: reqs } = await safesignPool.query(
      `SELECT r.id, r.token, r.vendor_id, v.name AS vendor_name
         FROM ss_requests r
         JOIN ss_vendors v ON v.id = r.vendor_id
        WHERE r.communication_id = $1 AND r.sent_at IS NULL`,
      [id],
    );
    /* TO: the vendor master's emails plus the ones the team added. CC: the added ones, and
       always the person sending, so replies and the audit trail reach them. */
    const recipients = await recipientsFor(reqs.map((r) => Number(r.vendor_id)));
    const me = actor.email.toLowerCase();

    let sent = 0;
    const failed: string[] = [];
    for (const r of reqs) {
      const found = recipients.get(Number(r.vendor_id));
      const to = found?.to ?? [];
      const cc = [...new Set([...(found?.cc ?? []), me])].filter((e) => !to.includes(e));
      if (!to.length) {
        failed.push(`${r.vendor_name} (no TO address)`);
        continue;
      }
      const mail = await sendSafeSignMail(
        requestMail({
          to,
          cc,
          vendorName: String(r.vendor_name),
          title: String(c.title),
          message: String(c.message ?? ''),
          responseType: String(c.response_type) as ResponseType,
          deadline: dateOnly(c.deadline),
          url: respondUrl(String(r.token)),
        }),
      );
      if (!mail.ok) {
        failed.push(`${r.vendor_name} (${mail.error ?? 'mail failed'})`);
        continue;
      }
      await safesignPool.query(
        `UPDATE ss_requests SET sent_at = NOW(), sent_to = $2, sent_cc = $3 WHERE id = $1`,
        [r.id, to, cc],
      );
      await safesignPool.query(
        `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, 'request.sent', $2, $3)`,
        [r.id, actor.email, JSON.stringify({ to, cc })],
      );
      sent += 1;
    }

    if (sent > 0 || reqs.length === 0) {
      await safesignPool.query(
        `UPDATE ss_communications
            SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), sent_by = COALESCE(sent_by, $2)
          WHERE id = $1`,
        [id, actor.email],
      );
    }
    revalidatePath('/safesign', 'layout');

    if (failed.length) {
      return {
        success: sent > 0,
        error: `Not sent to: ${failed.join('; ')}.`,
        message: sent ? `Sent to ${sent} supplier${sent === 1 ? '' : 's'}.` : undefined,
      };
    }
    return { success: true, message: `Sent to ${sent} supplier${sent === 1 ? '' : 's'}.` };
  } catch (err) {
    return fail(err, 'sendCommunication.failed');
  }
}

export async function remindSuppliers(communicationId: number, requestIds: number[]): Promise<Result> {
  try {
    const actor = await requireCommunicationAccess(communicationId);
    await ensureSafeSignSchema();
    const r = await remindRequests(communicationId, requestIds, actor.email);
    revalidatePath(`/safesign/communications/${communicationId}`);
    const parts = [`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`];
    if (r.failed) parts.push(`${r.failed} failed`);
    if (r.skipped) parts.push(`${r.skipped} skipped (already responded)`);
    return { success: r.failed === 0, message: parts.join(', ') + '.' };
  } catch (err) {
    return fail(err, 'remindSuppliers.failed');
  }
}

/** Stop accepting responses and stop reminders. Responses already in are kept. */
export async function setCommunicationClosed(id: number, closed: boolean): Promise<Result> {
  try {
    const actor = await requireCommunicationAccess(id);
    await ensureSafeSignSchema();
    await safesignPool.query(
      closed
        ? `UPDATE ss_communications SET status = 'closed', closed_at = NOW(), closed_by = $2
            WHERE id = $1 AND status = 'sent'`
        : `UPDATE ss_communications SET status = 'sent', closed_at = NULL, closed_by = NULL
            WHERE id = $1 AND status = 'closed' AND $2::text IS NOT NULL`,
      [id, actor.email],
    );
    await safesignPool.query(
      `INSERT INTO ss_events (communication_id, kind, actor) VALUES ($1, $2, $3)`,
      [id, closed ? 'communication.closed' : 'communication.reopened', actor.email],
    );
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'setCommunicationClosed.failed');
  }
}

/** Move the deadline, e.g. to give suppliers more time. */
export async function changeDeadline(id: number, deadline: string): Promise<Result> {
  try {
    const actor = await requireCommunicationAccess(id);
    await ensureSafeSignSchema();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { success: false, error: 'Choose a date.' };
    await safesignPool.query(`UPDATE ss_communications SET deadline = $2 WHERE id = $1`, [id, deadline]);
    await safesignPool.query(
      `INSERT INTO ss_events (communication_id, kind, actor, detail) VALUES ($1, 'deadline.changed', $2, $3)`,
      [id, actor.email, JSON.stringify({ deadline })],
    );
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'changeDeadline.failed');
  }
}

/** Accept an action plan, or send it back with a comment. */
export async function reviewSubmission(
  requestId: number,
  decision: 'accept' | 'changes',
  comment: string,
): Promise<Result> {
  try {
    const actor = await requireRequestAccess(requestId);
    await ensureSafeSignSchema();
    const note = String(comment ?? '').trim();
    if (decision === 'changes' && !note) {
      return { success: false, error: 'Say what needs to change, so the supplier knows what to fix.' };
    }

    const { rows } = await safesignPool.query(
      `SELECT r.id, r.token, r.sent_to, r.sent_cc, r.communication_id, v.name AS vendor_name,
              c.title, c.deadline
         FROM ss_requests r
         JOIN ss_vendors v ON v.id = r.vendor_id
         JOIN ss_communications c ON c.id = r.communication_id
        WHERE r.id = $1 AND r.status = 'under_review'`,
      [requestId],
    );
    const r = rows[0];
    if (!r) return { success: false, error: 'This submission is not waiting for review.' };

    const status = decision === 'accept' ? 'completed' : 'changes_requested';
    await safesignPool.query(
      `UPDATE ss_requests SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() END
        WHERE id = $1`,
      [requestId, status],
    );
    await safesignPool.query(
      `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, $2, $3, $4)`,
      [requestId, decision === 'accept' ? 'review.accepted' : 'review.changes_requested', actor.email, JSON.stringify({ comment: note })],
    );

    const to = (r.sent_to as string[]) ?? [];
    const cc = (r.sent_cc as string[]) ?? [];
    const mail =
      decision === 'accept'
        ? acceptedMail({ to, cc, vendorName: String(r.vendor_name), title: String(r.title) })
        : changesRequestedMail({
            to,
            cc,
            vendorName: String(r.vendor_name),
            title: String(r.title),
            comment: note,
            deadline: dateOnly(r.deadline),
            url: respondUrl(String(r.token)),
          });
    const sent = await sendSafeSignMail(mail);

    revalidatePath(`/safesign/communications/${r.communication_id}`);
    return {
      success: true,
      message: sent.ok ? 'Saved and the supplier has been emailed.' : 'Saved, but the email could not be sent.',
    };
  } catch (err) {
    return fail(err, 'reviewSubmission.failed');
  }
}
