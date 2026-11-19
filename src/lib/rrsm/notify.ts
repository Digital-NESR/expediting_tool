import { logger } from '@/lib/logger';

/**
 * RRSM's mail. The app writes the message; n8n cleans the recipients and sends it.
 *
 * The same division ICSA uses, and for its reasons: the wording of an email is content, it
 * belongs in review and in git history, and a workflow that composes its own is a place where
 * copy changes without anybody seeing a diff. n8n keeps the part that is genuinely operational —
 * which mailbox it goes from, de-duplicating recipients, and never sending an empty CC.
 *
 * THE ONE THAT CANNOT FAIL QUIETLY is the supplier's code. Every other message here is a nudge,
 * and a lost one costs somebody a chase. That one is how a supplier gets into the portal at all,
 * so its caller reads the result and tells them, rather than printing "code sent" over a webhook
 * that was never configured. That is the ProcureGuard empty-CC failure, which was silent for
 * four days.
 */

const log = logger('rrsm-notify');

export type RrsmMailKind =
  | 'supplier.code'
  | 'supplier.invitation'
  | 'supplier.submitted'
  | 'cycle.reminder'
  | 'renewal.reminder'
  | 'line.returned';

export interface RrsmMail {
  kind: RrsmMailKind;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  /** Anything useful in an n8n execution log. Never shown to a recipient. */
  meta?: Record<string, unknown>;
}

export interface NotifyResult {
  ok: boolean;
  /** True when nothing was attempted because no webhook is configured. */
  skipped?: boolean;
  status?: number;
  error?: string;
}

/** Strip the quotes a `.env` value sometimes carries, which otherwise land in the header. */
function clean(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

/** Escape anything that goes into the HTML body, since supplier names come from the database. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 'November 2026' from a `yyyy-mm-dd`. */
function periodLabel(period: string): string {
  const d = new Date(String(period).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime())
    ? String(period)
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* ─── the messages ───────────────────────────────────────────────────────────────────────── */

const SHELL = (inner: string): string =>
  `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#15201a;max-width:560px">` +
  inner +
  `<p style="margin-top:28px;padding-top:14px;border-top:1px solid #dde3df;font-size:12px;color:#74837c">` +
  `National Energy Services Reunited · Rental &amp; Recurrent Services Management` +
  `</p></div>`;

/**
 * The six-digit code.
 *
 * Deliberately says who it is for and what it opens, because a code with no context is
 * indistinguishable from a phishing attempt — and tells the reader to ignore it if they did not
 * ask, which is the only thing they can usefully do if somebody else is poking at their link.
 */
export function supplierCodeMail(input: {
  email: string;
  supplierName: string;
  countryName: string;
  period: string;
  code: string;
  expiresInSeconds: number;
}): RrsmMail {
  const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
  return {
    kind: 'supplier.code',
    to: [input.email],
    subject: `Your NESR verification code: ${input.code}`,
    bodyHtml: SHELL(
      `<p>Here is the code to open the ${esc(periodLabel(input.period))} submission for ` +
        `<b>${esc(input.supplierName)}</b> in ${esc(input.countryName)}.</p>` +
        `<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:22px 0;color:#307c4c">` +
        `${esc(input.code)}</p>` +
        `<p>It is valid for ${minutes} minute${minutes === 1 ? '' : 's'} and can be used once.</p>` +
        `<p style="color:#4a5852">If you did not ask for this code, ignore this email — ` +
        `nobody can submit anything without it.</p>`,
    ),
    meta: { supplier: input.supplierName, period: input.period },
  };
}

/** The invitation that carries the link. */
export function supplierInvitationMail(input: {
  to: string[];
  supplierName: string;
  countryName: string;
  period: string;
  closesOn: string;
  url: string;
}): RrsmMail {
  return {
    kind: 'supplier.invitation',
    to: input.to,
    subject: `NESR: confirm your ${periodLabel(input.period)} rentals and services`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.supplierName)},</p>` +
        `<p>Please confirm what NESR ${esc(input.countryName)} had on hire from you during ` +
        `<b>${esc(periodLabel(input.period))}</b>. The list is already filled in from last month, ` +
        `so in most cases you are checking rather than typing.</p>` +
        `<p style="margin:24px 0"><a href="${esc(input.url)}" ` +
        `style="background:#307c4c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">` +
        `Open your ${esc(periodLabel(input.period))} submission</a></p>` +
        `<p>Please submit by <b>${esc(input.closesOn)}</b>. You will be asked for a short code ` +
        `sent to this address, so that only your company can open it.</p>`,
    ),
    meta: { supplier: input.supplierName, period: input.period },
  };
}

/**
 * A buyer's reminder to a supplier who was invited and has not submitted. Same link as the
 * invitation; says what is still owed, including any document the buyer asked for.
 */
export function supplierReminderMail(input: {
  to: string[];
  supplierName: string;
  countryName: string;
  period: string;
  closesOn: string;
  url: string;
  documents: string[];
}): RrsmMail {
  const docs = input.documents.length
    ? `<p>Please also upload your <b>${input.documents.map(esc).join('</b> and <b>')}</b> on the same page.</p>`
    : '';
  return {
    kind: 'cycle.reminder',
    to: input.to,
    subject: `Reminder: confirm your ${periodLabel(input.period)} rentals and services for NESR`,
    bodyHtml: SHELL(
      `<p>Dear ${esc(input.supplierName)},</p>` +
        `<p>We have not yet received your confirmation of what NESR ${esc(input.countryName)} had ` +
        `on hire from you during <b>${esc(periodLabel(input.period))}</b>.</p>` +
        docs +
        `<p style="margin:24px 0"><a href="${esc(input.url)}" ` +
        `style="background:#307c4c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">` +
        `Open your ${esc(periodLabel(input.period))} submission</a></p>` +
        `<p>Please submit by <b>${esc(input.closesOn)}</b>. If you have already sent it, ` +
        `you can ignore this email.</p>`,
    ),
    meta: { supplier: input.supplierName, period: input.period, reminder: true },
  };
}

/** Told to the people who have to act on it. */
export function supplierSubmittedMail(input: {
  to: string[];
  supplierName: string;
  countryName: string;
  period: string;
  lines: number;
  total: number;
  currency: string;
  submittedBy: string;
}): RrsmMail {
  const money = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(input.total);
  return {
    kind: 'supplier.submitted',
    to: input.to,
    subject: `${input.supplierName} submitted ${periodLabel(input.period)} (${input.countryName})`,
    bodyHtml: SHELL(
      `<p><b>${esc(input.supplierName)}</b> has submitted ${esc(periodLabel(input.period))} ` +
        `for ${esc(input.countryName)}.</p>` +
        `<p>${input.lines} line${input.lines === 1 ? '' : 's'}, ${esc(money)} ${esc(input.currency)} ` +
        `at the rates on the register. Submitted by ${esc(input.submittedBy)}.</p>` +
        `<p>It is waiting on Ops to confirm what was actually used.</p>`,
    ),
    meta: { supplier: input.supplierName, period: input.period, lines: input.lines },
  };
}

/**
 * The annual renewal nudge: one email per person, listing everything of theirs that is running out.
 *
 * A digest rather than one mail per contract, for the reason ProcureGuard learnt the hard way:
 * built per row, a buyer covering a country with thirty expiring hires received thirty emails in
 * the same minute, and the rule they wrote to silence them buried the genuine ones too.
 *
 * Soonest first, so a reader who stops after the first row has seen the worst one. Twelve months
 * of use sits in the table because it is the figure the decision turns on, and a line that ran at
 * zero all year is called out rather than left to be noticed.
 */
export function renewalReminderMail(input: {
  to: string[];
  cc?: string[];
  items: {
    description: string;
    assetRef: string;
    segment: string;
    supplierName: string;
    countryName: string;
    dueOn: string;
    daysLeft: number;
    monthsUsed: number;
  }[];
  url: string;
}): RrsmMail {
  const items = [...input.items].sort((a, b) => a.daysLeft - b.daysLeft);
  const soonest = items[0];
  const n = items.length;

  /* The subject is the only part of this that most people read, so it has to be true of the
     whole digest rather than of its worst line. Driving the wording off the most urgent item
     alone produced "4 contracts have expired" for a digest in which one had: a subject that
     overstates once teaches a reader to stop trusting every later one.
     
     So the count of expired lines decides the wording, not the soonest line's state. */
  const expired = items.filter((i) => i.daysLeft < 0).length;
  const one = n === 1;
  const subject =
    expired === n
      ? `NESR RRSM: ${one ? 'a contract has' : `${n} contracts have`} expired without a renewal decision`
      : expired > 0
        ? `NESR RRSM: ${n} contracts need a renewal decision, ${expired} already expired`
        : soonest.daysLeft === 0
          ? one
            ? `NESR RRSM: a contract ends today`
            : `NESR RRSM: ${n} contracts need a renewal decision, one ends today`
          : one
            ? `NESR RRSM: a contract needs a renewal decision in ${soonest.daysLeft} days`
            : `NESR RRSM: ${n} contracts need a renewal decision, the first in ${soonest.daysLeft} days`;

  const rows = items
    .map((i) => {
      const when =
        i.daysLeft < 0
          ? `<span style="color:#b42318;font-weight:700">${Math.abs(i.daysLeft)} days overdue</span>`
          : i.daysLeft === 0
            ? `<span style="color:#b42318;font-weight:700">ends today</span>`
            : `<b>${i.daysLeft}</b> days`;
      const used =
        i.monthsUsed === 0
          ? `<span style="color:#9a6700;font-weight:700">unused for 12 months</span>`
          : `${i.monthsUsed} of 12 months`;
      return (
        `<tr>` +
        `<td style="padding:9px;border-bottom:1px solid #e5e7eb">${esc(i.description)}` +
        `<div style="font-size:11px;color:#74837c;margin-top:2px">` +
        `${i.assetRef ? esc(i.assetRef) + ' &middot; ' : ''}${esc(i.segment)} &middot; ${esc(i.supplierName)} &middot; ${esc(i.countryName)}` +
        `</div></td>` +
        `<td style="padding:9px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${esc(i.dueOn)}</td>` +
        `<td style="padding:9px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${when}</td>` +
        `<td style="padding:9px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${used}</td>` +
        `</tr>`
      );
    })
    .join('');

  return {
    kind: 'renewal.reminder',
    to: input.to,
    cc: input.cc,
    subject,
    bodyHtml: SHELL(
      `<p>${n === 1 ? 'This contract needs' : `These ${n} contracts need`} a renewal decision.</p>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0">` +
        `<tr style="background:#f4f7f5">` +
        `<th style="padding:9px;text-align:left;border-bottom:2px solid #dde3df">Service</th>` +
        `<th style="padding:9px;text-align:left;border-bottom:2px solid #dde3df">Ends</th>` +
        `<th style="padding:9px;text-align:left;border-bottom:2px solid #dde3df">Left</th>` +
        `<th style="padding:9px;text-align:left;border-bottom:2px solid #dde3df">Used</th>` +
        `</tr>${rows}</table>` +
        `<p style="margin:22px 0"><a href="${esc(input.url)}" ` +
        `style="background:#307c4c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">` +
        `Open in RRSM</a></p>` +
        `<p style="color:#4a5852">Extending runs twelve months from the end date rather than from ` +
        `the day it is decided, so a late decision does not move the anniversary. Declining ` +
        `leaves the end date alone, so somebody still has to off-hire the line when it arrives.</p>`,
    ),
    meta: { renewals: n, soonestDueOn: soonest.dueOn, soonestDaysLeft: soonest.daysLeft },
  };
}

/* ─── delivery ───────────────────────────────────────────────────────────────────────────── */

export async function sendRrsmMail(mail: RrsmMail): Promise<NotifyResult> {
  const url = clean(process.env.N8N_RRSM_WEBHOOK_URL);
  if (!url) {
    /* Not an error in development, where no webhook exists and nobody is waiting on a mail. It
       is still returned as a failure rather than a success, so a caller that depends on delivery
       can say so, and logged at warn so a production instance missing the variable is visible. */
    log.warn('mail.skipped', { kind: mail.kind, reason: 'N8N_RRSM_WEBHOOK_URL is unset' });
    return { ok: false, skipped: true, error: 'No mail webhook is configured.' };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = clean(process.env.N8N_RRSM_WEBHOOK_SECRET);
  if (secret) headers['X-Webhook-Secret'] = secret;

  try {
    /* A timeout, because this runs inside a request a supplier is waiting on: a webhook that
       hangs would hold the page open rather than telling them to try again. */
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: mail.kind,
        to: mail.to,
        cc: mail.cc ?? [],
        subject: mail.subject,
        bodyHtml: mail.bodyHtml,
        meta: mail.meta ?? {},
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      /* The workflow answers 422 when it had nobody to send to and 502 when Outlook refused.
         Both are failures, and the difference is worth having in the log. */
      const body = await res.text().catch(() => '');
      log.error('mail.failed', new Error(`HTTP ${res.status}`), { kind: mail.kind, body });
      return {
        ok: false,
        status: res.status,
        error: res.status === 422 ? 'No deliverable address.' : 'The mail workflow refused it.',
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    log.error('mail.threw', err, { kind: mail.kind });
    return { ok: false, error: 'The mail workflow could not be reached.' };
  }
}
