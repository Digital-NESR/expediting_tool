/* ─── The n8n webhook client and every notification this tool sends. ─── */

import { asSerialised } from '@/lib/db/sql';
import { getLaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopRequest } from '@/types/laptopProcurement';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { after } from 'next/server';
import type { QueryResultRow } from 'pg';
import { getActiveApproverMatrixForCountry } from '@/lib/laptop-procurement/actor';
import { sql } from '@/lib/laptop-procurement/db';
import { loadLaptopDelegationChain } from '@/lib/laptop-procurement/delegation';

export function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isTlsCertificateError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code =
    typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    message.toLowerCase().includes('unable to verify') ||
    message.toLowerCase().includes('self-signed certificate')
  );
}

export function laptopWebhookErrorMessage(err: unknown): string {
  if (isTlsCertificateError(err)) {
    return 'TLS certificate verification failed for n8n even though the webhook call is configured to bypass TLS verification.';
  }
  return err instanceof Error ? err.message : 'Laptop Procurement n8n webhook failed.';
}

export function getLaptopAppBaseUrl(): string {
  const configured =
    process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  return stripEnvQuotes(configured).replace(/\/$/, '');
}

// De-dupes a notification recipient list by email, keeping the first occurrence's
// name — used once a delegated stage notifies both the original approver and their
// delegate, in case they somehow resolve to the same address.
export function dedupeLaptopRecipients<T extends { email: string }>(recipients: T[]): T[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Approval-email test mode is strictly opt-in: it only turns on when the variable is
// literally 'true'. Anything else — unset, empty, typo'd — means real recipients, so a
// misconfigured production deploy can never silently divert approver mail to a test inbox.
export function isLaptopEmailTestMode(): boolean {
  return (
    stripEnvQuotes(process.env.LAPTOP_APPROVAL_EMAIL_TEST_MODE ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

// Test-mode addresses come from env only — there are deliberately no fallbacks, so a
// half-configured test run fails loudly instead of mailing whoever used to be hardcoded here.
export function requireLaptopTestEmail(varName: string): string {
  const value = stripEnvQuotes(process.env[varName] ?? '').trim();
  if (!value) {
    throw new Error(
      `LAPTOP_APPROVAL_EMAIL_TEST_MODE is enabled but ${varName} is not set. ` +
        `Set ${varName} to a test inbox, or set LAPTOP_APPROVAL_EMAIL_TEST_MODE=false to notify the real approvers.`,
    );
  }
  return value;
}

// The per-stage test roster, shared by the approval-chain and final-approval notifications.
export function laptopTestStageCandidates(
  stage: LaptopApprovalStage,
): Array<{ name: string; email: string }> {
  switch (stage) {
    case 'IT Manager':
      return [
        {
          name: 'IT Manager (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_IT_MANAGER_EMAIL'),
        },
        {
          name: 'IT Manager 2 (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_IT_MANAGER_2_EMAIL'),
        },
      ];
    case 'Country Manager':
      return [
        {
          name: 'Country Manager (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_CM_EMAIL'),
        },
      ];
    case 'IT Director':
      return [
        {
          name: 'IT Director (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_ITD_EMAIL'),
        },
      ];
    case 'Supply Chain Director':
      return [
        {
          name: 'Supply Chain Director (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_SCD_EMAIL'),
        },
      ];
  }
}

/**
 * Hand outbound n8n work to Next's `after()` instead of making the caller wait on it.
 *
 * Every status transition fires up to three webhooks, each with its own 15s timeout,
 * plus the matrix/delegation lookups they need — so a reviewer's click could sit for
 * the better part of a minute while n8n was slow or down, long after their decision was
 * already safely committed. `after(cb)` (stable since Next 15.1 — see
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md) runs `cb`
 * once the response has been sent, and on a serverless platform keeps the invocation
 * alive via `waitUntil` until it settles, so the work still actually runs. The docs also
 * note the callback runs even when the response ended in an error, so nothing is dropped
 * on a thrown action.
 *
 * Only ever used for work that is already durable: the DB write and its activity-log
 * line are committed inside withTransaction before we get here, and a webhook cannot be
 * rolled back anyway. Deferred failures are caught and logged here so a broken n8n can
 * never take down an invocation after the user has already been told it worked — and so
 * they are never silently swallowed either.
 */
export function deferLaptopNotifications(label: string, run: () => Promise<void>): void {
  after(async () => {
    try {
      await run();
    } catch (err) {
      console.error(
        `[Laptop Procurement n8n] Deferred notification failed (${label})`,
        laptopWebhookErrorMessage(err),
        err,
      );
    }
  });
}

export async function postLaptopWebhook(
  webhookUrl: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(stripEnvQuotes(webhookUrl));
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        method: 'POST',
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
        rejectUnauthorized: isHttps ? false : undefined,
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: response.statusMessage ?? '',
          });
        });
      },
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error('Laptop Procurement n8n webhook timed out.'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Notifies the delegate (and, on grant, includes context) when a delegation is created or revoked. */
export async function sendLaptopDelegationNotification(
  kind: 'granted' | 'revoked',
  params: {
    delegatorEmail: string;
    delegatorName: string;
    delegateEmail: string;
    delegateName: string | null;
    roles: Array<{ stage: string; country: string }>;
    expiresAt: string | null;
  },
): Promise<void> {
  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_DELEGATION_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      '[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_DELEGATION_WEBHOOK_URL not configured; skipping delegation notification.',
    );
    return;
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const payload = {
      event:
        kind === 'granted'
          ? 'laptop_procurement.delegation_granted'
          : 'laptop_procurement.delegation_revoked',
      occurred_at: new Date().toISOString(),
      delegator: { email: params.delegatorEmail, name: params.delegatorName },
      delegate: { email: params.delegateEmail, name: params.delegateName },
      roles: params.roles,
      expires_at: params.expiresAt,
      app_url: `${getLaptopAppBaseUrl()}/laptop-procurement/my-work`,
    };
    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error(
        '[Laptop Procurement n8n] Delegation webhook failed',
        response.status,
        response.statusText,
      );
    } else {
      console.log('[Laptop Procurement n8n] Delegation webhook sent', {
        kind,
        status: response.status,
      });
    }
  } catch (err) {
    console.error(
      '[Laptop Procurement n8n] Delegation webhook failed',
      laptopWebhookErrorMessage(err),
      err,
    );
  }
}

/**
 * Notifies whoever is next in the approval chain (IT Manager → Country Manager →
 * IT Director → Supply Chain Director) that a request needs their attention. The
 * recipients are resolved from laptop_approver_matrix. Setting
 * LAPTOP_APPROVAL_EMAIL_TEST_MODE=true instead routes every stage to the test roster in
 * the LAPTOP_APPROVAL_TEST_*_EMAIL vars; any other value delivers to the real approvers.
 */
export async function notifyLaptopNextApprover(request: LaptopRequest): Promise<void> {
  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      '[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_WEBHOOK_URL not configured; skipping approval-chain notification.',
    );
    return;
  }
  const stage = getLaptopApprovalStage(request.status);
  if (!stage) return;

  try {
    const [matrix, delegations] = await Promise.all([
      getActiveApproverMatrixForCountry(request.country),
      loadLaptopDelegationChain(request.country),
    ]);

    const matrixRecipients: Array<{ name: string | null; email: string }> =
      stage === 'IT Manager'
        ? ([
            {
              name: (matrix?.it_manager_name as string) ?? null,
              email: matrix?.it_manager_email as string,
            },
            {
              name: (matrix?.it_manager_2_name as string) ?? null,
              email: matrix?.it_manager_2_email as string,
            },
            {
              name: (matrix?.it_manager_3_name as string) ?? null,
              email: matrix?.it_manager_3_email as string,
            },
          ].filter((r) => r.email) as Array<{ name: string | null; email: string }>)
        : stage === 'Country Manager'
          ? matrix?.cm_email
            ? [{ name: (matrix.cm_name as string) ?? null, email: matrix.cm_email as string }]
            : []
          : stage === 'IT Director'
            ? matrix?.itd_email
              ? [{ name: (matrix.itd_name as string) ?? null, email: matrix.itd_email as string }]
              : []
            : matrix?.scd_email
              ? [{ name: (matrix.scd_name as string) ?? null, email: matrix.scd_email as string }]
              : [];

    // The approver matrix is static per country — if whoever it names has delegated
    // their authority (laptop_delegations), the notification needs to follow that to
    // the delegate, same as getActor() already does for who can actually act on the
    // request. The original approver stays on the notification too (rather than being
    // replaced), so they're kept in the loop even while someone else is covering for
    // them.
    const realRecipients = dedupeLaptopRecipients(
      matrixRecipients.flatMap((r) => {
        const delegate = delegations.resolve(r.email, stage);
        return delegate ? [r, { name: delegate.name, email: delegate.email }] : [r];
      }),
    );

    // TESTING OVERRIDE (opt-in): replace the real laptop_approver_matrix lookup above with a
    // per-stage test roster taken from LAPTOP_APPROVAL_TEST_*_EMAIL, so the full chain —
    // including the IT Manager → IT Manager 2 escalation — can be exercised safely.
    // Only active when LAPTOP_APPROVAL_EMAIL_TEST_MODE=true.
    const testMode = isLaptopEmailTestMode();
    const testCandidates = testMode ? laptopTestStageCandidates(stage) : null;

    // `intended_recipients` is the full candidate list for the stage (used by the n8n workflow
    // to pick an escalation target); `recipients` is only the primary — who gets emailed right now.
    const intendedRecipients = testCandidates ?? realRecipients;
    const routedRecipients = testCandidates ? [testCandidates[0]] : realRecipients;

    if (routedRecipients.length === 0) {
      console.warn(
        '[Laptop Procurement n8n] No approver configured for stage; skipping notification',
        { stage, country: request.country },
      );
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const payload = {
      event: 'laptop_procurement.approval_needed',
      occurred_at: new Date().toISOString(),
      test_mode: testMode,
      stage,
      request: {
        id: request.id,
        reference_number: request.reference_number,
        status: request.status,
        priority: request.priority,
        request_type: request.request_type,
        country: request.country,
        segment: request.segment,
        type_of_device: request.type_of_device,
        requested_model: request.requested_model,
        requested_by_name: request.requested_by_name,
        requested_by_email: request.requested_by_email,
        created_at: request.created_at,
      },
      intended_recipients: intendedRecipients,
      recipients: routedRecipients,
      detail_url: `${getLaptopAppBaseUrl()}/laptop-procurement/requests/${request.id}`,
    };

    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error(
        '[Laptop Procurement n8n] Approval webhook failed',
        response.status,
        response.statusText,
      );
    } else {
      console.log('[Laptop Procurement n8n] Approval webhook sent', {
        stage,
        requestId: request.id,
        status: response.status,
      });
    }
  } catch (err) {
    console.error(
      '[Laptop Procurement n8n] Approval webhook failed',
      laptopWebhookErrorMessage(err),
      err,
    );
  }
}

/**
 * Notifies the IT Manager once a request is FULLY, finally approved — the two cases
 * are the assign-from-inventory chain ending at Country Manager, and the procure-new
 * chain ending at Supply Chain Director. Every other stage transition only tells the
 * *next* approver (see notifyLaptopNextApprover); this is the one closing-the-loop
 * notification back to whoever originally triaged the request, so they know it's done
 * and can go ahead and fulfil it.
 */
export async function notifyLaptopFinalApproval(request: LaptopRequest): Promise<void> {
  if (request.status !== 'Assign from Inventory' && request.status !== 'Procure New') return;

  // Its own dedicated workflow/webhook — not the shared "approval needed" one, which is
  // hardcoded around that event's own field names (intended_recipients, stage) and isn't
  // meant to also serve this notification's different purpose/wording.
  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_FINAL_APPROVAL_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      '[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_FINAL_APPROVAL_WEBHOOK_URL not configured; skipping final-approval notification.',
    );
    return;
  }

  try {
    const [matrix, delegations] = await Promise.all([
      getActiveApproverMatrixForCountry(request.country),
      loadLaptopDelegationChain(request.country),
    ]);
    const itManagerCandidates: Array<{ name: string | null; email: string }> = [
      {
        name: (matrix?.it_manager_name as string) ?? null,
        email: matrix?.it_manager_email as string,
      },
      {
        name: (matrix?.it_manager_2_name as string) ?? null,
        email: matrix?.it_manager_2_email as string,
      },
      {
        name: (matrix?.it_manager_3_name as string) ?? null,
        email: matrix?.it_manager_3_email as string,
      },
    ].filter((r) => r.email) as Array<{ name: string | null; email: string }>;

    const realRecipients = dedupeLaptopRecipients(
      itManagerCandidates.flatMap((r) => {
        const delegate = delegations.resolve(r.email, 'IT Manager');
        return delegate ? [r, { name: delegate.name, email: delegate.email }] : [r];
      }),
    );

    const testMode = isLaptopEmailTestMode();
    // Deduped because LAPTOP_APPROVAL_TEST_IT_MANAGER_EMAIL and
    // LAPTOP_APPROVAL_TEST_IT_MANAGER_2_EMAIL are often pointed at the same test inbox,
    // which would otherwise email it twice.
    const recipients = dedupeLaptopRecipients(
      testMode ? laptopTestStageCandidates('IT Manager') : realRecipients,
    );

    if (recipients.length === 0) {
      console.warn(
        '[Laptop Procurement n8n] No IT Manager configured; skipping final-approval notification',
        { country: request.country },
      );
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const payload = {
      event: 'laptop_procurement.request_finally_approved',
      occurred_at: new Date().toISOString(),
      test_mode: testMode,
      outcome: request.status,
      request: {
        id: request.id,
        reference_number: request.reference_number,
        status: request.status,
        request_type: request.request_type,
        country: request.country,
        segment: request.segment,
        type_of_device: request.type_of_device,
        requested_model: request.requested_model,
        requested_by_name: request.requested_by_name,
        requested_by_email: request.requested_by_email,
        created_at: request.created_at,
      },
      recipients,
      detail_url: `${getLaptopAppBaseUrl()}/laptop-procurement/requests/${request.id}`,
    };

    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error(
        '[Laptop Procurement n8n] Final-approval webhook failed',
        response.status,
        response.statusText,
      );
    } else {
      console.log('[Laptop Procurement n8n] Final-approval webhook sent', {
        requestId: request.id,
        status: response.status,
      });
    }
  } catch (err) {
    console.error(
      '[Laptop Procurement n8n] Final-approval webhook failed',
      laptopWebhookErrorMessage(err),
      err,
    );
  }
}

/**
 * Sends a plain-language status update to the REQUESTER whenever their request moves —
 * forwarded to (or now pending with) the next approver, rejected back to them, or
 * finally approved/completed — separate from notifyLaptopNextApprover/
 * notifyLaptopFinalApproval, which tell the approver/IT Manager it's their turn, not
 * the person who originally asked for the device. Its own dedicated workflow/webhook,
 * same reasoning as notifyLaptopFinalApproval above.
 */
export async function notifyLaptopRequesterUpdate(
  request: LaptopRequest,
  params: {
    kind: 'forwarded' | 'rejected' | 'final_approved';
    actorName: string;
    actorEmail: string;
    comment: string | null;
    nextOwnerLabel: string | null;
  },
): Promise<void> {
  if (!request.requested_by_email) return;

  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_REQUESTER_UPDATE_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn(
      '[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_REQUESTER_UPDATE_WEBHOOK_URL not configured; skipping requester update.',
    );
    return;
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const testMode = isLaptopEmailTestMode();
    const recipient = testMode
      ? {
          name: 'Requester (test)',
          email: requireLaptopTestEmail('LAPTOP_APPROVAL_TEST_REQUESTER_EMAIL'),
        }
      : { name: request.requested_by_name, email: request.requested_by_email };

    const payload = {
      event: 'laptop_procurement.requester_update',
      occurred_at: new Date().toISOString(),
      test_mode: testMode,
      kind: params.kind,
      status: request.status,
      by: { name: params.actorName, email: params.actorEmail },
      comment: params.comment,
      next_owner: params.nextOwnerLabel,
      request: {
        id: request.id,
        reference_number: request.reference_number,
        status: request.status,
        request_type: request.request_type,
        country: request.country,
        type_of_device: request.type_of_device,
        requested_model: request.requested_model,
      },
      recipients: [recipient],
      detail_url: `${getLaptopAppBaseUrl()}/laptop-procurement/requests/${request.id}`,
    };

    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error(
        '[Laptop Procurement n8n] Requester-update webhook failed',
        response.status,
        response.statusText,
      );
    } else {
      console.log('[Laptop Procurement n8n] Requester-update webhook sent', {
        kind: params.kind,
        requestId: request.id,
        status: response.status,
      });
    }
  } catch (err) {
    console.error(
      '[Laptop Procurement n8n] Requester-update webhook failed',
      laptopWebhookErrorMessage(err),
      err,
    );
  }
}

/* ── Validation / misc helpers ────────────────────────────────── */

export async function notifyNewLaptopRequest(id: number): Promise<void> {
  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    if (rows[0]) await notifyLaptopNextApprover(asSerialised<LaptopRequest>(rows[0]));
  } catch (err) {
    console.error('[notifyNewLaptopRequest]', err);
  }
}
