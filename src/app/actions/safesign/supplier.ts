'use server';

import { headers } from 'next/headers';
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';
import {
  MAX_FILE_BYTES,
  type AttachmentMode,
  type RequestStatus,
  type ResponseType,
} from '@/lib/safesign/model';
import { codeMail, respondedMail, sendSafeSignMail } from '@/lib/safesign/notify';
import { buildSignedCopy } from '@/lib/safesign/sign';
import { demoAllowed } from '@/lib/safesign/demo';
import {
  appBase,
  CODE_TTL_SECONDS,
  issueCode,
  maskEmail,
  sessionEmailFor,
  targetForToken,
  verifyCode,
} from '@/lib/safesign/supplier-access';

/**
 * The supplier's side, reached by an emailed link with no NESR account.
 *
 * EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT ANYONE ON THE INTERNET CAN CALL. `/safesign/respond`
 * is in PUBLIC_PATHS in src/proxy.ts, so nothing upstream stands in the way. Each function
 * re-derives everything from the token: the token resolves to one request, the session token
 * proves the holder read one of that request's own addresses, and every document id is checked
 * as belonging to that request's communication. Failures never say why a token was refused.
 */

const log = logger('safesign-supplier');

export interface SupplierDocument {
  id: number;
  filename: string;
  sizeBytes: number;
  isLetter: boolean;
}

export interface SupplierView {
  ok: boolean;
  vendorName: string;
  topicName: string;
  title: string;
  deadline: string;
  responseType: ResponseType;
  attachments: AttachmentMode;
  status: RequestStatus;
  accepting: boolean;
  contacts: string[];
  verifiedAs: string | null;
  /** Only after verification. */
  message: string;
  documents: SupplierDocument[];
  /** Latest NESR comment when a plan was sent back. */
  reviewComment: string | null;
  respondedAt: string | null;
  respondedName: string | null;
  codeTtlSeconds: number;
}

const DENIED: SupplierView = {
  ok: false,
  vendorName: '',
  topicName: '',
  title: '',
  deadline: '',
  responseType: 'acknowledge',
  attachments: 'none',
  status: 'pending',
  accepting: false,
  contacts: [],
  verifiedAs: null,
  message: '',
  documents: [],
  reviewComment: null,
  respondedAt: null,
  respondedName: null,
  codeTtlSeconds: CODE_TTL_SECONDS,
};

export async function getSupplierView(token: string, sessionToken?: string | null): Promise<SupplierView> {
  try {
    await ensureSafeSignSchema();
    const t = await targetForToken(token);
    if (!t) return DENIED;
    const verifiedAs = await sessionEmailFor(t.requestId, sessionToken);

    let documents: SupplierDocument[] = [];
    let reviewComment: string | null = null;
    let respondedAt: string | null = null;
    let respondedName: string | null = null;
    if (verifiedAs) {
      const [{ rows: docs }, { rows: rev }, { rows: req }] = await Promise.all([
        safesignPool.query<QueryResultRow>(
          `SELECT id, filename, size_bytes, is_letter FROM ss_documents
            WHERE communication_id = $1 ORDER BY is_letter DESC, id`,
          [t.communicationId],
        ),
        safesignPool.query<QueryResultRow>(
          `SELECT detail->>'comment' AS comment FROM ss_events
            WHERE request_id = $1 AND kind = 'review.changes_requested' ORDER BY at DESC LIMIT 1`,
          [t.requestId],
        ),
        safesignPool.query<QueryResultRow>(
          `SELECT responded_at, responded_name FROM ss_requests WHERE id = $1`,
          [t.requestId],
        ),
      ]);
      documents = docs.map((d) => ({
        id: Number(d.id),
        filename: String(d.filename),
        sizeBytes: Number(d.size_bytes),
        isLetter: Boolean(d.is_letter),
      }));
      reviewComment = rev[0]?.comment ? String(rev[0].comment) : null;
      respondedAt = req[0]?.responded_at ? new Date(req[0].responded_at).toISOString() : null;
      respondedName = req[0]?.responded_name ? String(req[0].responded_name) : null;
    }

    return {
      ok: true,
      vendorName: t.vendorName,
      topicName: t.topicName,
      title: t.title,
      deadline: t.deadline,
      responseType: t.responseType,
      attachments: t.attachments,
      status: t.status,
      accepting: t.accepting,
      contacts: t.contacts.map(maskEmail),
      verifiedAs,
      message: verifiedAs ? t.message : '',
      documents,
      reviewComment,
      respondedAt,
      respondedName,
      codeTtlSeconds: CODE_TTL_SECONDS,
    };
  } catch (err) {
    log.error('getSupplierView.failed', err);
    return DENIED;
  }
}

export type SupplierResult = {
  success: boolean;
  error?: string;
  retryAfterSeconds?: number;
  sessionToken?: string;
  /** Local dev only, when no mail workflow exists: the code, so a tester can carry on. */
  devCode?: string;
};

/** Send a code to one of the request's addresses, chosen by position in the masked list. */
export async function requestSupplierCode(token: string, contactIndex: number): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t) return { success: false, error: 'That link is not valid.' };
    const issued = await issueCode(t.requestId, t.contacts, Number(contactIndex));
    if (!issued.ok) return { success: false, error: issued.reason, retryAfterSeconds: issued.retryAfterSeconds };

    const sent = await sendSafeSignMail(
      codeMail({
        email: issued.email,
        vendorName: t.vendorName,
        title: t.title,
        code: issued.code,
        expiresInSeconds: CODE_TTL_SECONDS,
      }),
    );
    if (!sent.ok) {
      return { success: false, error: 'The code could not be sent. Reply to the email and ask your NESR contact.' };
    }
    await safesignPool.query(
      `INSERT INTO ss_events (request_id, kind, actor) VALUES ($1, 'code.sent', $2)`,
      [t.requestId, issued.email],
    );
    /* Never in production: demoAllowed() is NODE_ENV !== 'production', and `skipped` only comes
       back when no webhook is configured. */
    return { success: true, devCode: sent.skipped && demoAllowed() ? issued.code : undefined };
  } catch (err) {
    log.error('requestSupplierCode.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

export async function verifySupplierCode(token: string, attempt: string): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t) return { success: false, error: 'That link is not valid.' };
    const v = await verifyCode(t.requestId, attempt);
    if (!v.ok) return { success: false, error: v.reason };
    await safesignPool.query(
      `INSERT INTO ss_events (request_id, kind, actor) VALUES ($1, 'code.verified', $2)`,
      [t.requestId, v.email],
    );
    return { success: true, sessionToken: v.sessionToken };
  } catch (err) {
    log.error('verifySupplierCode.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/** One of the communication's documents, as base64, for a verified holder. */
export async function downloadSupplierDocument(
  token: string,
  sessionToken: string,
  documentId: number,
): Promise<{ success: boolean; error?: string; filename?: string; mime?: string; base64?: string }> {
  try {
    const t = await targetForToken(token);
    if (!t) return { success: false, error: 'That link is not valid.' };
    const email = await sessionEmailFor(t.requestId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };
    const { rows } = await safesignPool.query<QueryResultRow>(
      `SELECT filename, mime, data FROM ss_documents WHERE id = $1 AND communication_id = $2`,
      [documentId, t.communicationId],
    );
    if (!rows[0]) return { success: false, error: 'That document is not available.' };
    await safesignPool.query(
      `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, 'document.downloaded', $2, $3)`,
      [t.requestId, email, JSON.stringify({ documentId, filename: rows[0].filename })],
    );
    return {
      success: true,
      filename: String(rows[0].filename),
      mime: String(rows[0].mime),
      base64: (rows[0].data as Buffer).toString('base64'),
    };
  } catch (err) {
    log.error('downloadSupplierDocument.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim().slice(0, 64);
}

/**
 * The response itself. FormData fields:
 *   token, sessionToken, name, title, confirm ("yes"), comment
 *   signature   data URL of a PNG (sign_letter)
 *   main        the signed scan / plan / documents (upload_signed, action_plan, submit_documents)
 *   supporting  extra files (repeated)
 */
export async function submitSupplierResponse(form: FormData): Promise<SupplierResult> {
  try {
    const token = String(form.get('token') ?? '');
    const t = await targetForToken(token);
    if (!t) return { success: false, error: 'That link is not valid.' };
    if (!t.accepting) return { success: false, error: 'This request is no longer accepting responses.' };
    const email = await sessionEmailFor(t.requestId, String(form.get('sessionToken') ?? ''));
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };

    const name = String(form.get('name') ?? '').trim().slice(0, 200);
    const jobTitle = String(form.get('title') ?? '').trim().slice(0, 200);
    const comment = String(form.get('comment') ?? '').trim().slice(0, 4000);
    if (!name) return { success: false, error: 'Enter your full name.' };
    if (String(form.get('confirm')) !== 'yes') {
      return { success: false, error: 'Tick the confirmation to continue.' };
    }

    const main = form.getAll('main').filter((f): f is File => f instanceof File && f.size > 0);
    const supporting = form.getAll('supporting').filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of [...main, ...supporting]) {
      if (f.size > MAX_FILE_BYTES) return { success: false, error: `${f.name} is larger than 15 MB.` };
    }
    if (t.attachments === 'required' && !supporting.length) {
      return { success: false, error: 'Attach the supporting documents requested.' };
    }

    const type = t.responseType;
    if ((type === 'upload_signed' || type === 'action_plan' || type === 'submit_documents') && !main.length) {
      return {
        success: false,
        error:
          type === 'upload_signed'
            ? 'Upload the signed letter.'
            : type === 'action_plan'
              ? 'Upload your action plan.'
              : 'Upload the documents requested.',
      };
    }

    const ip = await clientIp();
    const now = new Date();
    const { rows: roundRows } = await safesignPool.query<QueryResultRow>(
      `SELECT COALESCE(MAX(round), 0) + 1 AS next FROM ss_response_files WHERE request_id = $1`,
      [t.requestId],
    );
    const round = Number(roundRows[0]?.next ?? 1);

    const files: { kind: string; filename: string; mime: string; data: Buffer }[] = [];

    if (type === 'sign_letter') {
      const dataUrl = String(form.get('signature') ?? '');
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return { success: false, error: 'Draw your signature in the box.' };
      const png = Buffer.from(m[1], 'base64');
      if (png.length < 200 || png.length > 2_000_000) return { success: false, error: 'Draw your signature in the box.' };
      const { rows: letterRows } = await safesignPool.query<QueryResultRow>(
        `SELECT filename, mime, data FROM ss_documents
          WHERE communication_id = $1 ORDER BY is_letter DESC, (mime = 'application/pdf') DESC, id LIMIT 1`,
        [t.communicationId],
      );
      const letter = letterRows[0];
      const isPdf = letter && (String(letter.mime) === 'application/pdf' || /\.pdf$/i.test(String(letter.filename)));
      const signed = await buildSignedCopy({
        letter: isPdf ? (letter.data as Buffer) : null,
        signaturePng: png,
        vendorName: t.vendorName,
        title: t.title,
        signerName: name,
        signerTitle: jobTitle,
        signerEmail: email,
        signedAt: now,
        ip,
        reference: `SafeSign request ${t.requestId}`,
      });
      const base = letter ? String(letter.filename).replace(/\.[^.]+$/, '') : 'letter';
      files.push({ kind: 'signed_letter', filename: `${base} - signed by ${t.vendorName}.pdf`, mime: 'application/pdf', data: signed });
    }

    const mainKind = type === 'upload_signed' ? 'signed_letter' : type === 'action_plan' ? 'plan' : 'document';
    for (const f of main) {
      files.push({ kind: mainKind, filename: f.name, mime: f.type || 'application/octet-stream', data: Buffer.from(await f.arrayBuffer()) });
    }
    for (const f of supporting) {
      files.push({ kind: 'supporting', filename: f.name, mime: f.type || 'application/octet-stream', data: Buffer.from(await f.arrayBuffer()) });
    }

    const status: RequestStatus = type === 'action_plan' ? 'under_review' : 'completed';

    const client = await safesignPool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE ss_requests
            SET status = $2, responded_at = NOW(), responded_email = $3, responded_name = $4,
                responded_title = NULLIF($5, ''), responded_ip = NULLIF($6, ''),
                response_comment = NULLIF($7, ''),
                completed_at = CASE WHEN $2 = 'completed' THEN NOW() END
          WHERE id = $1 AND status IN ('pending', 'changes_requested')`,
        [t.requestId, status, email, name, jobTitle, ip, comment],
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return { success: false, error: 'This request has already been answered.' };
      }
      for (const f of files) {
        await client.query(
          `INSERT INTO ss_response_files (request_id, round, kind, filename, mime, size_bytes, data, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [t.requestId, round, f.kind, f.filename.slice(0, 255), f.mime, f.data.length, f.data, email],
        );
      }
      await client.query(
        `INSERT INTO ss_events (request_id, kind, actor, detail) VALUES ($1, 'response.submitted', $2, $3)`,
        [
          t.requestId,
          email,
          JSON.stringify({ type, name, jobTitle, ip, round, files: files.map((f) => f.filename), comment }),
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    /* Tell whoever sent it. A nudge, so a failure is logged and not shown to the supplier. */
    try {
      const { rows } = await safesignPool.query<QueryResultRow>(
        `SELECT COALESCE(sent_by, created_by) AS owner FROM ss_communications WHERE id = $1`,
        [t.communicationId],
      );
      const owner = rows[0]?.owner ? String(rows[0].owner) : '';
      if (owner.includes('@')) {
        await sendSafeSignMail(
          respondedMail({
            to: [owner],
            vendorName: t.vendorName,
            title: t.title,
            responseType: type,
            respondedBy: `${name} (${email})`,
            needsReview: status === 'under_review',
            url: `${appBase()}/safesign/communications/${t.communicationId}`,
          }),
        );
      }
    } catch (err) {
      log.warn('respondedMail.failed', { error: String(err) });
    }

    return { success: true };
  } catch (err) {
    log.error('submitSupplierResponse.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}
