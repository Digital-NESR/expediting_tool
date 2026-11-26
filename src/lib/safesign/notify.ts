import { logger } from '@/lib/logger';
import { formatDay, RESPONSE_TYPE_LABEL, type ResponseType } from './model';

/**
 * ComplyConnect's mail (the app was called SafeSign; code and settings keep that name). The app writes the message; n8n sends it.
 *
 * The same split RRSM and ICSA use: wording is content and belongs in git, while n8n owns the
 * mailbox, de-duplicates recipients and never sends an empty CC. Payload shape is RRSM's, so the
 * same kind of workflow can serve it:
 *   POST N8N_SAFESIGN_WEBHOOK_URL  { kind, to, cc, subject, bodyHtml, meta }
 *   header X-Webhook-Secret: N8N_SAFESIGN_WEBHOOK_SECRET
 *
 * SAFESIGN_MAIL_TEST_RECIPIENT, when set, reroutes every message to that one inbox with
 * "[COMPLYCONNECT TEST]" in the subject and the real recipients listed at the top, so the pilot can be
 * rehearsed without mailing a supplier.
 */

const log = logger('safesign-notify');

export type SafeSignMailKind =
  | 'supplier.code'
  | 'supplier.request'
  | 'supplier.reminder'
  | 'supplier.changes_requested'
  | 'supplier.accepted'
  | 'staff.responded'
  | 'staff.approval_request'
  | 'staff.approved'
  | 'staff.rejected';

export interface SafeSignMail {
  kind: SafeSignMailKind;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  meta?: Record<string, unknown>;
}

export interface NotifyResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

function clean(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text with line breaks, safe for an HTML body. */
function paragraphs(text: string): string {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

const SHELL = (inner: string): string =>
  `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#15201a;max-width:600px">` +
  inner +
  `<p style="margin-top:28px;padding-top:14px;border-top:1px solid #dde3df;font-size:12px;color:#74837c">` +
  `National Petroleum Technology Company (NESR) · Supplier communications · ComplyConnect` +
  `</p></div>`;

const BUTTON = (url: string, label: string): string =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#307c4c;color:#fff;` +
  `text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">` +
  `${esc(label)}</a></p>`;

const ACTION_LINE: Record<ResponseType, string> = {
  acknowledge: 'review the document(s) and confirm your acknowledgment',
  sign_letter: 'review the document(s) and sign the acknowledgment letter',
  upload_signed: 'review the document(s), sign the letter and upload the signed copy',
  submit_documents: 'review the request and upload the documents asked for',
  action_plan: 'review the request and submit your action plan',
};

export function requestMail(input: {
  to: string[];
  cc: string[];
  vendorName: string;
  title: string;
  message: string;
  responseType: ResponseType;
  deadline: string;
  url: string;
}): SafeSignMail {
  return {
    kind: 'supplier.request',
    to: input.to,
    cc: input.cc,
    subject: `Action required by ${formatDay(input.deadline)}: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.vendorName)} team,</p>` +
        paragraphs(input.message) +
        `<p>Please ${ACTION_LINE[input.responseType]} by <b>${esc(formatDay(input.deadline))}</b>.</p>` +
        BUTTON(input.url, `Open: ${RESPONSE_TYPE_LABEL[input.responseType]}`) +
        `<p style="color:#4a5852;font-size:13px">For security, the page will ask you to choose one ` +
        `of the email addresses this message was sent to and enter a code we email to it.</p>`,
    ),
    meta: { vendor: input.vendorName, title: input.title },
  };
}

export function reminderMail(input: {
  to: string[];
  cc: string[];
  vendorName: string;
  title: string;
  responseType: ResponseType;
  deadline: string;
  overdue: boolean;
  url: string;
}): SafeSignMail {
  return {
    kind: 'supplier.reminder',
    to: input.to,
    cc: input.cc,
    subject: `${input.overdue ? 'Overdue' : 'Reminder'}: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.vendorName)} team,</p>` +
        (input.overdue
          ? `<p>We have not yet received your response to <b>${esc(input.title)}</b>, which was ` +
            `due on <b>${esc(formatDay(input.deadline))}</b>. Please complete it as soon as possible.</p>`
          : `<p>This is a reminder to ${ACTION_LINE[input.responseType]} for ` +
            `<b>${esc(input.title)}</b> by <b>${esc(formatDay(input.deadline))}</b>.</p>`) +
        BUTTON(input.url, 'Open the request'),
    ),
    meta: { vendor: input.vendorName, title: input.title, overdue: input.overdue },
  };
}

export function changesRequestedMail(input: {
  to: string[];
  cc: string[];
  vendorName: string;
  title: string;
  comment: string;
  deadline: string;
  url: string;
}): SafeSignMail {
  return {
    kind: 'supplier.changes_requested',
    to: input.to,
    cc: input.cc,
    subject: `Changes requested: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.vendorName)} team,</p>` +
        `<p>Thank you for your submission for <b>${esc(input.title)}</b>. NESR has reviewed it and ` +
        `asks for the following changes:</p>` +
        `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #307c4c;background:#f4f7f5">` +
        paragraphs(input.comment) +
        `</blockquote>` +
        `<p>Please upload a revised version by <b>${esc(formatDay(input.deadline))}</b>.</p>` +
        BUTTON(input.url, 'Upload a revised version'),
    ),
    meta: { vendor: input.vendorName, title: input.title },
  };
}

export function acceptedMail(input: {
  to: string[];
  cc: string[];
  vendorName: string;
  title: string;
}): SafeSignMail {
  return {
    kind: 'supplier.accepted',
    to: input.to,
    cc: input.cc,
    subject: `Accepted: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.vendorName)} team,</p>` +
        `<p>Your submission for <b>${esc(input.title)}</b> has been reviewed and accepted. ` +
        `No further action is needed. Thank you.</p>`,
    ),
    meta: { vendor: input.vendorName, title: input.title },
  };
}

export function codeMail(input: {
  email: string;
  vendorName: string;
  title: string;
  code: string;
  expiresInSeconds: number;
}): SafeSignMail {
  const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
  return {
    kind: 'supplier.code',
    to: [input.email],
    subject: `Your NESR verification code: ${input.code}`,
    bodyHtml: SHELL(
      `<p>Here is the code to open <b>${esc(input.title)}</b> for ${esc(input.vendorName)}.</p>` +
        `<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:22px 0;color:#307c4c">` +
        `${esc(input.code)}</p>` +
        `<p>It is valid for ${minutes} minutes and can be used once.</p>` +
        `<p style="color:#4a5852">If you did not ask for this code, ignore this email.</p>`,
    ),
    meta: { vendor: input.vendorName },
  };
}

export function respondedMail(input: {
  to: string[];
  vendorName: string;
  title: string;
  responseType: ResponseType;
  respondedBy: string;
  needsReview: boolean;
  url: string;
}): SafeSignMail {
  return {
    kind: 'staff.responded',
    to: input.to,
    subject: `${input.needsReview ? 'To review' : 'Received'}: ${input.vendorName} – ${input.title}`,
    bodyHtml: SHELL(
      `<p><b>${esc(input.vendorName)}</b> has responded to <b>${esc(input.title)}</b> ` +
        `(${esc(RESPONSE_TYPE_LABEL[input.responseType])}), submitted by ${esc(input.respondedBy)}.</p>` +
        (input.needsReview ? `<p>The action plan is waiting for your review.</p>` : '') +
        BUTTON(input.url, 'Open the communication'),
    ),
    meta: { vendor: input.vendorName, title: input.title },
  };
}

/** To the approvers at one step: a communication is waiting for them. */
export function approvalRequestMail(input: {
  to: string[];
  step: 'scm' | 'final';
  countryName: string;
  title: string;
  sender: string;
  suppliers: number;
  url: string;
}): SafeSignMail {
  const who = input.step === 'scm' ? 'as supply chain manager' : 'for final approval';
  return {
    kind: 'staff.approval_request',
    to: input.to,
    subject: `Approval needed: ${input.title} (${input.countryName})`,
    bodyHtml: SHELL(
      `<p><b>${esc(input.sender)}</b> has submitted a supplier communication for ` +
        `<b>${esc(input.countryName)}</b> and it needs your approval ${who} before it is sent.</p>` +
        `<p><b>${esc(input.title)}</b><br/>${input.suppliers} supplier${input.suppliers === 1 ? '' : 's'}</p>` +
        BUTTON(input.url, 'Review and approve'),
    ),
    meta: { title: input.title, step: input.step, country: input.countryName },
  };
}

/** To the sender: fully approved, it can be sent now. */
export function approvedMail(input: { to: string[]; title: string; approvedBy: string; url: string }): SafeSignMail {
  return {
    kind: 'staff.approved',
    to: input.to,
    subject: `Approved: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Your communication <b>${esc(input.title)}</b> has been approved by ${esc(input.approvedBy)}. ` +
        `It has not been emailed to the suppliers yet: open it and press Send when you are ready.</p>` +
        BUTTON(input.url, 'Open the communication'),
    ),
    meta: { title: input.title },
  };
}

/** To the sender: rejected, and why. */
export function rejectedMail(input: {
  to: string[];
  title: string;
  rejectedBy: string;
  step: 'scm' | 'final';
  comment: string;
  url: string;
}): SafeSignMail {
  return {
    kind: 'staff.rejected',
    to: input.to,
    subject: `Rejected: ${input.title}`,
    bodyHtml: SHELL(
      `<p>Your communication <b>${esc(input.title)}</b> was not approved by ${esc(input.rejectedBy)} ` +
        `(${input.step === 'scm' ? 'supply chain manager' : 'final approval'}). It has not been sent to the suppliers.</p>` +
        `<p><b>Reason:</b></p>` +
        `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #b42318;background:#fdf3f2">` +
        paragraphs(input.comment) +
        `</blockquote>` +
        `<p>Open it to submit it again, or delete it and create a corrected one.</p>` +
        BUTTON(input.url, 'Open the communication'),
    ),
    meta: { title: input.title, step: input.step },
  };
}

/** Send one message through n8n. Never throws; the caller decides whether a failure matters. */
export async function sendSafeSignMail(mail: SafeSignMail): Promise<NotifyResult> {
  const url = clean(process.env.N8N_SAFESIGN_WEBHOOK_URL);
  if (!url) {
    /* On a developer's machine there is no workflow, and without mail nothing can be sent and no
       supplier can get a code. So outside production the message is printed to the server log
       (the code is in the subject) and counted as delivered. In production a missing webhook is
       a real failure and is reported as one. */
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[safesign mail, not sent: no webhook] ${mail.kind} to=${mail.to.join(',')} cc=${(mail.cc ?? []).join(',')} subject="${mail.subject}"`);
      return { ok: true, skipped: true };
    }
    log.warn('mail.skipped', { kind: mail.kind, reason: 'N8N_SAFESIGN_WEBHOOK_URL is unset' });
    return { ok: false, skipped: true, error: 'No mail webhook is configured.' };
  }

  let { to, cc = [], subject, bodyHtml } = mail;
  const testInbox = clean(process.env.SAFESIGN_MAIL_TEST_RECIPIENT);
  if (testInbox) {
    bodyHtml =
      `<p style="background:#fff7e6;padding:8px 12px;font-size:12px;color:#8a5a00">` +
      `TEST MODE. Would have gone to: ${esc(to.join(', '))}` +
      (cc.length ? ` · CC: ${esc(cc.join(', '))}` : '') +
      `</p>` +
      bodyHtml;
    to = [testInbox];
    cc = [];
    subject = `[COMPLYCONNECT TEST] ${subject}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = clean(process.env.N8N_SAFESIGN_WEBHOOK_SECRET);
  if (secret) headers['X-Webhook-Secret'] = secret;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: mail.kind, to, cc, subject, bodyHtml, meta: mail.meta ?? {} }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error('mail.failed', new Error(`HTTP ${res.status}`), { kind: mail.kind, body });
      return { ok: false, status: res.status, error: 'The mail workflow refused it.' };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    log.error('mail.threw', err, { kind: mail.kind });
    return { ok: false, error: 'The mail workflow could not be reached.' };
  }
}
