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
