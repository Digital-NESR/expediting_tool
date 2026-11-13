import { logger } from '@/lib/logger';

const log = logger('icsa-mail');

/**
 * ICSA email goes out through an n8n webhook (N8N_ICSA_WEBHOOK_URL), the same way every other
 * tool here sends mail. The payload shape matches SOA Consolidation's, so the n8n workflow can be
 * a copy of that one: { kind, to[], cc[], subject, bodyHtml, bodyText, meta }.
 */

export class MailNotConfiguredError extends Error {
  constructor() {
    super(
      'Email is not set up for ICSA yet (N8N_ICSA_WEBHOOK_URL is missing), so nothing was emailed.',
    );
    this.name = 'MailNotConfiguredError';
  }
}

export interface IcsaMail {
  kind:
    'request' | 'reminder' | 'returned' | 'assigned' | 'extension-request' | 'extension-decision';
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  meta?: Record<string, string | number | null>;
}

export function mailConfigured(): boolean {
  return !!process.env.N8N_ICSA_WEBHOOK_URL;
}

function unquote(v: string): string {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

/**
 * While testing, ICSA_MAIL_TEST_RECIPIENT sends every ICSA email to that one address instead of
 * the real people (demo people included), with the intended recipients shown at the top.
 */
export function mailTestRecipient(): string | null {
  const v = unquote(process.env.ICSA_MAIL_TEST_RECIPIENT ?? '').toLowerCase();
  return v.includes('@') ? v : null;
}

/** The message re-addressed to the test recipient, saying who it was meant for. */
export function redirectForTest(message: IcsaMail, testTo: string): IcsaMail {
  const meantFor = [...message.to, ...(message.cc ?? []).map((c) => `${c} (cc)`)].join(', ');
  const note = `TEST MODE: in production this email would go to ${meantFor}.`;
  return {
    ...message,
    to: [testTo],
    cc: [],
    subject: `[ICSA TEST] ${message.subject}`,
    bodyHtml: `<p style="font-family:Arial,Helvetica,sans-serif;background:#fff4d6;border:1px solid #f0c36d;padding:8px 12px;margin:0 0 12px;font-size:13px">${esc(note)}</p>${message.bodyHtml}`,
    bodyText: `${note}\n\n${message.bodyText}`,
    meta: { ...message.meta, intendedTo: meantFor },
  };
}

export async function sendIcsaMail(original: IcsaMail): Promise<void> {
  const url = process.env.N8N_ICSA_WEBHOOK_URL;
  const testTo = mailTestRecipient();
  let message = original;
  if (testTo && url && original.to.length) {
    message = redirectForTest(original, testTo);
  } else if (message.to.length && message.to.every((a) => /\.invalid$/i.test(a))) {
    /* Demo people live on the reserved .invalid domain (see ./demo.ts): there is nobody to
       deliver to, so a demo email counts as sent without leaving the app. */
    log.info('mail.skipped_demo', { kind: message.kind, ...message.meta });
    return;
  }
  if (!url) throw new MailNotConfiguredError();
  if (!message.to.length) throw new Error('That message has no recipient.');

  const secret = process.env.N8N_ICSA_WEBHOOK_SECRET;
  let res: Response;
  try {
    res = await fetch(unquote(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Webhook-Secret': unquote(secret) } : {}),
      },
      body: JSON.stringify({ cc: [], ...message }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    log.warn('mail.unreachable', { kind: message.kind, ...message.meta });
    throw new Error(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'The mail workflow did not answer within 15 seconds.'
        : 'The mail workflow could not be reached.',
    );
  }
  if (!res.ok) {
    log.warn('mail.rejected', { kind: message.kind, status: res.status, ...message.meta });
    throw new Error(`The mail workflow rejected the email (${res.status} ${res.statusText}).`);
  }
}

/* ─── Templates ─────────────────────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').replace(
    /\/$/,
    '',
  );
  return `${base}${path}`;
}

function frame(
  heading: string,
  paragraphs: string[],
  cta: { label: string; href: string },
): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f1f1d;max-width:640px">
  <div style="background:#2a7e4f;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">${esc(heading)}</div>
  <div style="padding:20px;border:1px solid #d1d3d4;border-top:0">
  ${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${p}</p>`).join('')}
  <p style="margin:20px 0"><a href="${esc(cta.href)}" style="background:#2a7e4f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block">${esc(cta.label)}</a></p>
  <p style="margin:0;color:#58595b;font-size:12px">Internal Control Self-Assessment (ICSA), Supply Chain function, aligned with SOX controls.</p>
  </div></div>`;
}

export interface RequestMailInput {
  kind: 'request' | 'reminder';
  to: string;
  name: string | null;
  cycleLabel: string;
  country: string;
  sections: string[];
  deadline: string;
  championName: string | null;
  championEmail: string;
  assessmentId: number;
}

export function requestMail(i: RequestMailInput): IcsaMail {
  const link = appUrl(`/icsa/assessments/${i.assessmentId}`);
  const first = i.kind === 'request';
  const subject = first
    ? `ICSA ${i.cycleLabel}: your self-assessment for ${i.country}`
    : `Reminder: ICSA ${i.cycleLabel} self-assessment due ${i.deadline}`;
  const greeting = `Dear ${esc(i.name || 'colleague')},`;
  const ask = first
    ? `You have been asked to complete the Internal Control Self-Assessment for <b>${esc(i.country)}</b>, cycle <b>${esc(i.cycleLabel)}</b>.`
    : `This is a reminder that your Internal Control Self-Assessment for <b>${esc(i.country)}</b>, cycle <b>${esc(i.cycleLabel)}</b>, has not been submitted yet.`;
  const paras = [
    greeting,
    ask,
    `Sections assigned to you: ${i.sections.map(esc).join(', ')}.`,
    `Please submit by <b>${esc(i.deadline)}</b>. Your answers save as you go, so you can leave and come back.`,
    `Questions? Contact your ICSA champion, ${esc(i.championName || i.championEmail)} (${esc(i.championEmail)}).`,
  ];
  return {
    kind: i.kind,
    to: [i.to],
    cc: [],
    subject,
    bodyHtml: frame('Internal Control Self-Assessment', paras, {
      label: 'Open my assessment',
      href: link,
    }),
    bodyText: [
      `Dear ${i.name || 'colleague'},`,
      first
        ? `You have been asked to complete the ICSA for ${i.country}, cycle ${i.cycleLabel}.`
        : `Reminder: your ICSA for ${i.country}, cycle ${i.cycleLabel}, has not been submitted yet.`,
      `Sections: ${i.sections.join(', ')}.`,
      `Due ${i.deadline}. Open it here: ${link}`,
    ].join('\n\n'),
    meta: { assessmentId: i.assessmentId, country: i.country, cycle: i.cycleLabel },
  };
}

/** To a champion: the administrator has put their country into a cycle. */
export function assignedMail(i: {
  to: string;
  name: string | null;
  cycleLabel: string;
  country: string;
  deadline: string;
  thresholdPct: number;
  enrollmentId: number;
}): IcsaMail {
  const link = appUrl(`/icsa/enrollments/${i.enrollmentId}`);
  return {
    kind: 'assigned',
    to: [i.to],
    cc: [],
    subject: `ICSA ${i.cycleLabel}: ${i.country} is assigned to you`,
    bodyHtml: frame(
      'ICSA cycle assigned',
      [
        `Dear ${esc(i.name || 'colleague')},`,
        `The ICSA administrator has added <b>${esc(i.country)}</b> to cycle <b>${esc(i.cycleLabel)}</b>, with you as its champion.`,
        `Please choose the people who should complete the self-assessment, give each of them their form sections, and send them the form. The deadline is <b>${esc(i.deadline)}</b>, and the country can be closed once ${i.thresholdPct}% of them have submitted.`,
      ],
      { label: 'Choose respondents', href: link },
    ),
    bodyText: [
      `Dear ${i.name || 'colleague'},`,
      `${i.country} has been added to ICSA cycle ${i.cycleLabel} with you as champion.`,
      `Choose the respondents and send them the form by ${i.deadline}: ${link}`,
    ].join('\n\n'),
    meta: { enrollmentId: i.enrollmentId, country: i.country, cycle: i.cycleLabel },
  };
}

export function returnedMail(i: {
  to: string;
  name: string | null;
  cycleLabel: string;
  country: string;
  note: string;
  assessmentId: number;
}): IcsaMail {
  const link = appUrl(`/icsa/assessments/${i.assessmentId}`);
  return {
    kind: 'returned',
    to: [i.to],
    subject: `ICSA ${i.cycleLabel}: your self-assessment was returned for changes`,
    bodyHtml: frame(
      'Self-assessment returned',
      [
        `Dear ${esc(i.name || 'colleague')},`,
        `Your ICSA for <b>${esc(i.country)}</b>, cycle <b>${esc(i.cycleLabel)}</b>, was returned with this note:`,
        `<i>${esc(i.note)}</i>`,
        'Please update your answers and submit again.',
      ],
      { label: 'Open my assessment', href: link },
    ),
    bodyText: `Your ICSA for ${i.country} (${i.cycleLabel}) was returned: ${i.note}\n\n${link}`,
    meta: { assessmentId: i.assessmentId },
  };
}
