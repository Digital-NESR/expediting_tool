import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { logger } from '@/lib/logger';

/**
 * n8n dispatch for the S&S Registry.
 *
 * Mirrors the ProcureGuard integration rather than inventing a second style:
 * one webhook URL, an optional shared secret in a header, and a JSON payload
 * carrying both the structured record and a pre-rendered subject/body. n8n
 * decides routing and delivery; this app decides who and what.
 */

const log = logger('sns-registry');

/* ═══ Env ════════════════════════════════════════════════════════ */

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && /^["'][^]*["']$/.test(trimmed)) return trimmed.slice(1, -1);
  return trimmed;
}

export function snsWebhookUrl(): string | null {
  const raw = process.env.N8N_SNS_REGISTRY_WEBHOOK_URL?.trim();
  return raw ? stripEnvQuotes(raw) : null;
}

function snsWebhookHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.N8N_SNS_REGISTRY_WEBHOOK_SECRET?.trim();
  if (secret) headers['x-sns-registry-secret'] = stripEnvQuotes(secret);
  return headers;
}

/** Absolute link back into the tool, for the "open the record" button in emails. */
export function snsRecordUrl(rid: number): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  return base ? `${base}/sns-registry?record=${rid}` : `/sns-registry?record=${rid}`;
}

/* ═══ Transport ══════════════════════════════════════════════════ */

export interface WebhookOutcome {
  ok: boolean;
  status: number;
  statusText: string;
}

/**
 * POSTs to n8n over the raw node client rather than fetch, for the same reason
 * ProcureGuard does: the internal n8n endpoint presents a certificate that does
 * not chain to a public root, and fetch offers no per-request way to accept it.
 */
export function postSnsWebhook(url: string, payload: unknown): Promise<WebhookOutcome> {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const isHttps = target.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        method: 'POST',
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port ? Number(target.port) : undefined,
        path: `${target.pathname}${target.search}`,
        headers: { ...snsWebhookHeaders(), 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: isHttps ? false : undefined,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage ?? '',
          });
        });
      },
    );

    req.setTimeout(15000, () => req.destroy(new Error('S&S Registry n8n webhook timed out.')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Never lets a notification failure take down the action that triggered it. */
export async function trySnsWebhook(
  label: string,
  payload: unknown,
): Promise<WebhookOutcome | null> {
  const url = snsWebhookUrl();
  if (!url) {
    log.warn('webhook.unconfigured', { label });
    return null;
  }
  try {
    const outcome = await postSnsWebhook(url, payload);
    if (!outcome.ok)
      log.error('webhook.rejected', null, {
        label,
        status: outcome.status,
        statusText: outcome.statusText,
      });
    return outcome;
  } catch (err) {
    log.error('webhook.failed', err, { label });
    return null;
  }
}

/* ═══ Email bodies ═══════════════════════════════════════════════ */

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* The expiry reminder email is NOT built here. The n8n reminder workflow owns
   it end to end: it queries this database on a schedule, renders the message in
   a Code node, sends it, and writes the result back to sns_notification_log.
   See database/SNS_REGISTRY_BACKEND.md for the SQL and the Code-node template.

   What remains below is the workflow mail the app itself sends -- submitted,
   validated, published, rejected, renewed, closed -- which fires inside a
   signed-in user action and reaches n8n over the webhook as before.        */

export interface WorkflowEmailInput {
  event: 'submitted' | 'level1_approved' | 'published' | 'rejected' | 'renewed' | 'closed';
  registryId: string;
  classification: string;
  country: string;
  supplierName: string;
  supplierId: string;
  scope: string;
  actor: string;
  note: string;
  recordUrl: string;
}

const WORKFLOW_COPY: Record<
  WorkflowEmailInput['event'],
  { headline: string; body: string; tone: string }
> = {
  submitted: {
    headline: 'Awaiting your Country Supply Chain Manager validation',
    body: 'A new registry record has been raised in your country and is waiting on the Country Supply Chain Manager.',
    tone: '#E09A4E',
  },
  level1_approved: {
    headline: 'Awaiting your Supply Chain Director / Category Manager sign-off',
    body: 'Country Supply Chain Manager validation is complete. The record now needs the Supply Chain Director or the Category Manager.',
    tone: '#E09A4E',
  },
  published: {
    headline: 'Published to Active',
    body: 'The record has been signed off and issued a Registry ID, valid for twelve months from today.',
    tone: '#2A7E4F',
  },
  rejected: {
    headline: 'Returned to the requestor',
    body: 'The record was rejected during validation and is back with the requestor to amend and resubmit.',
    tone: '#B34141',
  },
  renewed: {
    headline: 'Renewed for a further twelve months',
    body: 'The periodic review is complete. The original Registry ID is retained and expiry has moved out twelve months.',
    tone: '#2A7E4F',
  },
  closed: {
    headline: 'Supplier account closed',
    body: 'The record has been retired and its renewal reminders have stopped.',
    tone: '#58595B',
  },
};

export function buildWorkflowEmail(input: WorkflowEmailInput): {
  subject: string;
  bodyHtml: string;
} {
  const copy = WORKFLOW_COPY[input.event];
  const subject = `[S&S Registry] ${input.registryId} — ${copy.headline} — ${input.supplierName}`;

  const rows: [string, string][] = [
    ['Registry ID', input.registryId],
    ['Classification', input.classification],
    ['Country', input.country],
    ['Supplier', `${input.supplierId} — ${input.supplierName}`],
    ['Scope', input.scope],
    ['Actioned by', input.actor],
  ];

  const bodyHtml = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#1F1F1D;">
      <div style="border-left:4px solid ${copy.tone};padding-left:12px;margin-bottom:18px;">
        <div style="font-size:18px;font-weight:bold;">${escapeHtml(copy.headline)}</div>
        <div style="font-size:13px;color:#58595B;margin-top:3px;">Single &amp; Sole Source Registry</div>
      </div>

      <div style="font-size:13px;line-height:1.6;margin-bottom:16px;">${escapeHtml(copy.body)}</div>

      <table style="border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 18px 4px 0;color:#58595B;white-space:nowrap;">${escapeHtml(k)}</td>` +
              `<td style="padding:4px 0;font-weight:bold;">${escapeHtml(v)}</td></tr>`,
          )
          .join('')}
      </table>

      ${
        input.note
          ? `<div style="background:#FCF4F4;border-left:4px solid #B34141;padding:12px 14px;font-size:13px;line-height:1.55;margin-bottom:16px;">
               <strong>Note:</strong> ${escapeHtml(input.note)}
             </div>`
          : ''
      }

      <a href="${escapeHtml(input.recordUrl)}"
         style="background:#2A7E4F;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:11px 20px;display:inline-block;">
        Open the record
      </a>

      <div style="border-top:1px solid #E4E6E6;margin-top:24px;padding-top:14px;font-size:12px;color:#58595B;">
        Automated message from the NESR S&amp;S Registry workflow.
      </div>
    </div>
  `;

  return { subject, bodyHtml };
}
