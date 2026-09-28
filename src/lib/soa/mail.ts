import { logger } from '@/lib/logger';

/**
 * Sending mail for SOA Consolidation.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * One webhook carries every kind of message this tool sends: the vendor statement request, its
 * reminder, the upload verification code, and the handoff notice to AP. The automation makes no
 * decisions. It receives a finished message with its recipients, its rendered body and its
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
 * advances a vendor's status when this reports success, a request that failed to send is not a
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

/**
 * Turn a failed fetch into something somebody can act on.
 *
 * Node reports every network-level failure as the single word "fetch failed" and hides the reason
 * in `cause`: ENOTFOUND for a host that does not resolve, ECONNREFUSED for a port nothing is
 * listening on, UNABLE_TO_VERIFY_LEAF_SIGNATURE for a certificate chain Node will not accept. All
 * three mean completely different things and have completely different fixes, and a champion
 * reading "fetch failed" on a toast has been told nothing at all.
 */
export function describeFetchFailure(err: unknown, url: string): string {
  const host = (() => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return url;
    }
  })();

  const cause = (err as { cause?: unknown })?.cause;
  const code = (cause as { code?: string })?.code ?? (err as { code?: string })?.code;
  const detail = cause instanceof Error ? cause.message : code ? String(code) : '';

  const hint: Record<string, string> = {
    ENOTFOUND: `${host} does not resolve. Check the URL for a typo, and that the hostname is public rather than internal-only.`,
    EAI_AGAIN: `${host} could not be resolved just now. That is usually DNS rather than the workflow.`,
    ECONNREFUSED: `Nothing is listening at ${host}. Check the port, and that the workflow is published rather than only open in the editor.`,
    ECONNRESET: `${host} closed the connection. If n8n sits behind a proxy, that is the place to look.`,
    ETIMEDOUT: `${host} did not answer. It is most likely not reachable from the internet, which is where this runs.`,
    CERT_HAS_EXPIRED: `The certificate at ${host} has expired.`,
    DEPTH_ZERO_SELF_SIGNED_CERT: `${host} presents a self-signed certificate, which is refused deliberately: a webhook this carries vendor addresses and a shared secret to should be verifiable.`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: `The certificate chain at ${host} is incomplete, so it cannot be verified. Usually a missing intermediate certificate on the server.`,
    SELF_SIGNED_CERT_IN_CHAIN: `${host} presents a self-signed certificate in its chain, which is refused deliberately.`,
  };

  const known = code ? hint[code] : undefined;
  return known
    ? `Could not reach the mail workflow. ${known}`
    : `Could not reach the mail workflow at ${host}${detail ? `: ${detail}` : '.'}`;
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
  const endpoint = stripQuotes(url);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Webhook-Secret': stripQuotes(secret) } : {}),
      },
      body: JSON.stringify(message),
      // A single message is not worth hanging a server action on indefinitely.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      log.warn('mail.timedOut', { kind: message.kind, ...message.meta });
      throw new Error(
        'The mail workflow did not answer within 15 seconds. It may be reachable but slow, or the workflow may be waiting on something.',
      );
    }
    const described = describeFetchFailure(err, endpoint);
    log.warn('mail.unreachable', {
      kind: message.kind,
      cause: (err as { cause?: { code?: string } })?.cause?.code ?? null,
      ...message.meta,
    });
    throw new Error(described);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    log.warn('mail.rejected', { kind: message.kind, detail, ...message.meta });
    throw new Error(`The mail workflow rejected this ${message.kind}: ${detail}`);
  }
}
