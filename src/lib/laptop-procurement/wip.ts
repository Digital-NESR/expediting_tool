import { getActiveApproverMatrixForCountry } from '@/lib/laptop-procurement/actor';
import { exec } from '@/lib/laptop-procurement/db';
import {
  buildWipPayload,
  stripEnvQuotes,
  unitPriceUsd,
  wipBuildError,
  type WipPayload,
} from '@/lib/laptop-procurement/freshservice';
import { logger } from '@/lib/logger';
import type { LaptopRequest } from '@/types/laptopProcurement';

const log = logger('laptop-wip');

/* ═══ Switches ═══════════════════════════════════════════════════ */

/**
 * Strictly opt-in, matching the approval-email test mode next door: only the
 * literal 'true' turns it on. Unset, empty or typo'd means off, so a
 * half-configured deploy raises nothing rather than quietly filing WIPs
 * against real cost centres.
 */
export function isWipEnabled(): boolean {
  return (
    stripEnvQuotes(process.env.LAPTOP_FRESHSERVICE_WIP_ENABLED ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/** Real WIPs, but raised under a test inbox and marked in the subject line. */
export function isWipTestMode(): boolean {
  return (
    stripEnvQuotes(process.env.LAPTOP_FRESHSERVICE_WIP_TEST_MODE ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function wipWebhookUrl(): string | null {
  const raw = stripEnvQuotes(process.env.N8N_LAPTOP_WIP_WEBHOOK_URL ?? '').trim();
  return raw || null;
}

/* ═══ Who the ticket belongs to ══════════════════════════════════ */

/**
 * The Freshservice requester: the country's IT Manager.
 *
 * They own the WIP because they are the one who specified the device at the
 * Procure New step, so they are who the SAP team comes back to. The matrix
 * holds up to three named slots per country; the first filled one owns it and
 * the rest would be CC'd, which is why they are returned together.
 */
export async function resolveWipParticipants(
  country: string | null | undefined,
): Promise<{ owner: string | null; cc: string[] }> {
  const row = await getActiveApproverMatrixForCountry(country);
  if (!row) return { owner: null, cc: [] };

  const slots = [row.it_manager_email, row.it_manager_2_email, row.it_manager_3_email]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

  // De-duplicated here rather than relying on the payload builder, so `owner`
  // is never also the first CC.
  const seen = new Set<string>();
  const unique = slots.filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { owner: unique[0] ?? null, cc: unique.slice(1) };
}

/* ═══ Raising it ═════════════════════════════════════════════════ */

export interface WipOutcome {
  /** 'skipped' means nothing was attempted — the column stays untouched. */
  state: 'raised' | 'failed' | 'skipped';
  serviceRequestId?: number;
  error?: string;
}

/**
 * Posts the payload to n8n, which forwards it to Freshservice and answers with
 * the service request id through a Respond to Webhook node.
 *
 * The app waits for that answer, which it can afford to: this runs inside
 * deferLaptopNotifications, after the approver's response has already gone
 * back, so nobody is watching a spinner while it happens.
 */
async function postToWipWorkflow(url: string, payload: WipPayload): Promise<WipOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { state: 'failed', error: `n8n returned ${res.status}: ${text.slice(0, 300)}` };
    }

    /* The id can come back at the top level or nested, depending on how the
       Respond to Webhook node is set up, so both are accepted rather than
       pinning the workflow to one shape. */
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { state: 'failed', error: `n8n returned an unreadable body: ${text.slice(0, 300)}` };
    }
    const id = extractServiceRequestId(body);
    if (id == null) {
      return {
        state: 'failed',
        error: `n8n answered without a service request id: ${text.slice(0, 300)}`,
      };
    }
    return { state: 'raised', serviceRequestId: id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // A timeout is the dangerous one: Freshservice may well have created the
    // WIP and the answer was lost. Recorded as failed, which leaves the id
    // NULL, so a retry has to be a deliberate act by someone who has checked.
    return { state: 'failed', error: `Could not reach the WIP workflow: ${reason}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Finds the ticket id wherever the workflow put it. */
export function extractServiceRequestId(body: unknown): number | null {
  if (body == null || typeof body !== 'object') return null;
  const seen = new Set<object>();
  const walk = (node: unknown, depth: number): number | null => {
    if (depth > 4 || node == null || typeof node !== 'object') return null;
    if (seen.has(node as object)) return null;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = walk(entry, depth + 1);
        if (found != null) return found;
      }
      return null;
    }
    const rec = node as Record<string, unknown>;
    for (const key of ['id', 'service_request_id', 'serviceRequestId', 'ticket_id']) {
      const raw = rec[key];
      const n = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof n === 'number' && Number.isInteger(n) && n > 0) return n;
    }
    for (const value of Object.values(rec)) {
      const found = walk(value, depth + 1);
      if (found != null) return found;
    }
    return null;
  };
  return walk(body, 0);
}

/**
 * Raises the SAP WIP for a request that has just reached Procure New.
 *
 * Never throws: the approval is already committed, and a WIP that could not be
 * raised must not take down the invocation that approved it. Every outcome is
 * written to the request so "which approved requests have no WIP?" is a query
 * rather than a trawl through logs.
 */
export async function raiseFreshserviceWip(request: LaptopRequest): Promise<WipOutcome> {
  if (!isWipEnabled()) return { state: 'skipped' };

  const url = wipWebhookUrl();
  if (!url) {
    log.warn('wip.unconfigured', { reference: request.reference_number });
    return { state: 'skipped' };
  }

  /* Already raised. The guard that makes a retry safe: a response lost to a
     timeout must not become a second WIP for the same laptop. */
  if (request.freshservice_request_id) {
    return { state: 'raised', serviceRequestId: Number(request.freshservice_request_id) };
  }

  const outcome = await buildAndPost(request, url);
  await recordOutcome(request.id, outcome);
  return outcome;
}

async function buildAndPost(request: LaptopRequest, url: string): Promise<WipOutcome> {
  const { owner, cc } = await resolveWipParticipants(request.country);

  const testMode = isWipTestMode();
  const testInbox = stripEnvQuotes(process.env.LAPTOP_FRESHSERVICE_WIP_TEST_EMAIL ?? '').trim();
  if (testMode && !testInbox) {
    return {
      state: 'failed',
      error:
        'LAPTOP_FRESHSERVICE_WIP_TEST_MODE is on but LAPTOP_FRESHSERVICE_WIP_TEST_EMAIL is not set.',
    };
  }

  // In test mode the ticket is raised under the test inbox and nobody real is
  // CC'd, so a trial run cannot land in an IT Manager's queue.
  const requester = testMode ? testInbox : (owner ?? '');
  const ccList = testMode ? [] : cc;

  if (!requester) {
    return {
      state: 'failed',
      error: `No active IT Manager is configured for ${request.country ?? 'this country'}, so the WIP has no owner.`,
    };
  }

  const price = unitPriceUsd(request.requested_model ?? '', request.country ?? '');
  const built = buildWipPayload(request, requester, price, ccList);
  if (!built.ok) return { state: 'failed', error: wipBuildError(built.missing) };

  const payload = testMode
    ? {
        ...built.payload,
        custom_fields: {
          ...built.payload.custom_fields,
          name: `[TEST] ${built.payload.custom_fields.name}`,
        },
      }
    : built.payload;

  return postToWipWorkflow(url, payload);
}

async function recordOutcome(requestId: number, outcome: WipOutcome): Promise<void> {
  if (outcome.state === 'skipped') return;
  try {
    await exec(
      `UPDATE laptop_requests
          SET freshservice_request_id = ?, freshservice_error = ?, freshservice_attempted_at = NOW()
        WHERE id = ?`,
      [outcome.serviceRequestId ?? null, outcome.error ?? null, requestId],
    );
  } catch (err) {
    // The WIP may well exist; only the record of it failed. Logged loudly
    // because this is the one case the request screen will misreport.
    log.error('wip.record.failed', err, { requestId, state: outcome.state });
  }
}
