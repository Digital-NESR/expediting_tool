import { logger } from '@/lib/logger';

/**
 * Dispatching statement requests and reminders to n8n.
 *
 * Deliberately plain `fetch` rather than the hand-rolled http/https request used by ProcureGuard
 * and Laptop Procurement. Those two disable TLS certificate verification, which is an open finding
 * in the September audit; a new tool should not add a third instance of it. If n8n turns out to
 * present a certificate this cannot verify, that is worth knowing rather than worth suppressing.
 *
 * Nothing here decides whether a vendor has been chased. The caller records the dispatch and only
 * advances the vendor's status when this reports success — a request that failed to send is not a
 * request, and the evidence trail is the one thing in this tool that must never be optimistic.
 */

const log = logger('soa-outreach');

export interface OutreachPayload {
  kind: 'request' | 'reminder';
  cycleLabel: string;
  countryId: string;
  countryName: string;
  vendorName: string;
  vendorNo: string;
  amountUsd: number;
  currency: string;
  recipients: string[];
  /** Copied on every message: the sender, the country AP mailbox, and anyone they added for
   *  this send only. Distinct from `recipients`, which is the vendor. */
  cc: string[];
  submissionDeadline: string;
  sentBy: string;
  /** The letter itself, already rendered for this vendor. n8n delivers it rather than composing
   *  it — the wording is the champion's, and it is approved in the portal where they can read it. */
  subject: string;
  bodyHtml: string;
  /** Plain-text alternative, so the message is not HTML-only. */
  bodyText: string;
}

export class OutreachNotConfiguredError extends Error {
  constructor() {
    super(
      'Outreach is not configured: N8N_SOA_WEBHOOK_URL is unset, so no statement request can be ' +
        'sent yet. Nothing has been recorded as sent.',
    );
    this.name = 'OutreachNotConfiguredError';
  }
}

function stripQuotes(value: string): string {
  const t = value.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

/**
 * Post one outreach message.
 *
 * Throws {@link OutreachNotConfiguredError} when no webhook is set, rather than returning a
 * failure that a caller might mistake for "the vendor did not answer". The two are completely
 * different problems and the champion needs to be told which one they have.
 */
export async function dispatchOutreach(payload: OutreachPayload): Promise<void> {
  const url = process.env.N8N_SOA_WEBHOOK_URL;
  if (!url) throw new OutreachNotConfiguredError();

  if (!payload.recipients.length) {
    throw new Error(`${payload.vendorName} has no contact address to send to.`);
  }

  const secret = process.env.N8N_SOA_WEBHOOK_SECRET;
  const response = await fetch(stripQuotes(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Webhook-Secret': stripQuotes(secret) } : {}),
    },
    body: JSON.stringify(payload),
    // A statement request is not worth hanging a server action on indefinitely.
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    log.warn('outreach.rejected', { vendorNo: payload.vendorNo, kind: payload.kind, detail });
    throw new Error(`n8n rejected the ${payload.kind}: ${detail}`);
  }
}
