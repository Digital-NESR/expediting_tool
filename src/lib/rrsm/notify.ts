import { logger } from '@/lib/logger';

/**
 * RRSM's mail, sent by n8n rather than by this app.
 *
 * One webhook carrying an `event`, the way ProcureGuard, S&S Registry and SOA each do it, rather
 * than a URL per notification the way Laptop Procurement does. The workflow branches on the
 * event, so a new kind of mail is a branch over there and not an environment variable here.
 *
 * THE ONE THAT CANNOT FAIL QUIETLY is `supplier.code_requested`. Every other event is a nudge —
 * a missed one costs somebody a chase. That one is how a supplier gets into the portal at all,
 * so callers are expected to read `ok` and tell the supplier, rather than showing "code sent"
 * over a webhook that was never configured. That is the mistake ProcureGuard made for four days
 * with an empty CC line, and it is worth not repeating.
 */

const log = logger('rrsm-notify');

export type RrsmEvent =
  | 'cycle.opened'
  | 'cycle.reminder'
  | 'supplier.code_requested'
  | 'supplier.submitted'
  | 'validation.completed'
  | 'request.returned'
  | 'po.recorded';

export interface RrsmNotification {
  event: RrsmEvent;
  /** Explicit recipients. Omitted where the workflow decides from the event and the country. */
  to?: string[];
  [key: string]: unknown;
}

export interface NotifyResult {
  ok: boolean;
  /** True when nothing was attempted because no webhook is configured. */
  skipped?: boolean;
  status?: number;
}

/** Strip the quotes a `.env` value sometimes carries, which otherwise land in the header. */
function clean(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

export async function notifyRrsm(payload: RrsmNotification): Promise<NotifyResult> {
  const url = clean(process.env.N8N_RRSM_WEBHOOK_URL);
  if (!url) {
    /* Not an error in development, where no webhook exists and nobody is waiting on a mail. It
       is returned as a failure rather than a success so a caller that depends on delivery can
       say so, and logged at warn so a production instance missing the variable is visible. */
    log.warn('notify.skipped', { event: payload.event, reason: 'N8N_RRSM_WEBHOOK_URL is unset' });
    return { ok: false, skipped: true };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = clean(process.env.N8N_RRSM_WEBHOOK_SECRET);
  if (secret) headers['x-rrsm-secret'] = secret;

  try {
    /* A timeout, because this runs inside a request a supplier is waiting on: a webhook that
       hangs would hold the page open rather than telling them to try again. */
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      log.error('notify.failed', new Error(`HTTP ${res.status}`), { event: payload.event });
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    log.error('notify.threw', err, { event: payload.event });
    return { ok: false };
  }
}
