import { logger } from '@/lib/logger';

/**
 * Sending mail for SOA Consolidation.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * One webhook carries every kind of message this tool sends: the vendor statement request, its
 * reminder, the upload verification code, and the handoff notice to AP. The automation makes no
 * decisions — it receives a finished message with its recipients, its rendered body and its
 * attachments, and delivers it. Everything that varies between the four is decided here, where it
 * can be read, tested and changed in a reviewed commit, rather than split across four n8n
 * workflows that drift from each other and from this code.
 *
 * `kind` and `meta` travel with the message for tracing and for anything the automation wants to
 * log. They are not instructions: nothing downstream should branch on them to decide what to send.
 *
 * Deliberately plain `fetch` rather than the hand-rolled http/https request used by ProcureGuard
 * and Laptop Procurement. Those two disable TLS certificate verification, which is an open finding
 * in the September audit; a new tool should not add a third instance of it. If n8n turns out to
 * present a certificate this cannot verify, that is worth knowing rather than worth suppressing.
 *
 * Nothing here decides whether a vendor has been chased. The caller records the dispatch and only
 * advances a vendor's status when this reports success — a request that failed to send is not a
 * request, and the evidence trail is the one thing in this tool that must never be optimistic.
 */

const log = logger('soa-mail');

export type MailKind = 'soa.request' | 'soa.reminder' | 'soa.otp' | 'soa.handoff';

export interface MailAttachment {
  fileName: string;
  contentType: string;
  contentBase64: string;
}

export interface MailMessage {
  /** What this message is. For tracing and logging, not for routing decisions downstream. */
  kind: MailKind;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  /** Plain-text alternative, so the message is not HTML-only. */
  bodyText: string;
  /** Always an array, empty when there is nothing attached, so the automation needs no branch. */
  attachments: MailAttachment[];
  /** Context for the audit trail: which vendor, country and cycle this belonged to. */
  meta?: Record<string, string | number | null>;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super(
      'Email is not configured: N8N_SOA_WEBHOOK_URL is unset, so nothing can be sent yet. ' +
        'Nothing has been recorded as sent.',
    );
    this.name = 'MailNotConfiguredError';
  }
}

function stripQuotes(value: string): string {
  const t = value.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

/**
 * Post one message.
 *
 * Throws {@link MailNotConfiguredError} when no webhook is set, rather than returning a failure a
 * caller might mistake for "the vendor did not answer". The two are completely different problems
 * and the champion needs to be told which one they have.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const url = process.env.N8N_SOA_WEBHOOK_URL;
  if (!url) throw new MailNotConfiguredError();

  if (!message.to.length) {
    throw new Error('That message has no recipient address to send to.');
  }

  const secret = process.env.N8N_SOA_WEBHOOK_SECRET;
  const response = await fetch(stripQuotes(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Webhook-Secret': stripQuotes(secret) } : {}),
    },
    body: JSON.stringify(message),
    // A single message is not worth hanging a server action on indefinitely.
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    log.warn('mail.rejected', { kind: message.kind, detail, ...message.meta });
    throw new Error(`The mail workflow rejected this ${message.kind}: ${detail}`);
  }
}
