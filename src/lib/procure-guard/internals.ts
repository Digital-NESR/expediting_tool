/**
 * ProcureGuard internals shared by the server actions (`src/app/actions/procureGuard.ts`) and the
 * plain modules that must NOT be server actions (the reminder job in `./reminders`).
 *
 * Nothing here is a `'use server'` export, so importing it never turns a helper into a public POST
 * endpoint. Guard access in the caller, not here.
 */

import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { QueryResultRow } from 'pg';
import procureGuardPool from '@/lib/db-procureguard';
import { asSerialised, createSqlHelpers, serialise } from '@/lib/db/sql';
import { requireSchema } from '@/lib/db/schema-version';
import { logger } from '@/lib/logger';
import { isActiveApprovalStatus, normalizeProcureGuardCountry } from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardDelegation,
  ProcureGuardRequestType,
  ProcureGuardStatus,
} from '@/types/procureGuard';

export type QueryParam =
  string | number | boolean | null | Date | Buffer | number[] | string[] | undefined;
export type QueryParams = QueryParam[];
export type { ExecResult } from '@/lib/db/sql';

export const { sql, exec } = createSqlHelpers(procureGuardPool);

const log = logger('procure-guard');

/**
 * Assert that the procureguard database has had its migrations applied.
 *
 * There were five of these, one per group of DDL — the usage-event tables, the access-request
 * table, the permission role values, the payment-request columns, the delegation table — each
 * behind its own `let xEnsured` memo, and a caller picked whichever one guarded the columns it
 * was about to touch. That distinction only meant something while each ran its own statements.
 * The DDL is now database/migrations/procureguard/001_baseline.sql, applied at deploy, and a
 * caller needs one thing from this module: that the migrations ran.
 *
 * It lives here rather than in ./schema because schema.ts imports from this file, and the
 * reverse edge would make the pair circular.
 */
export function ensureProcureGuardSchema(): Promise<void> {
  return requireSchema(procureGuardPool, 'procureguard', '001_baseline');
}

export { serialise };

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

function isTlsCertificateError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  return (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    message.toLowerCase().includes('unable to verify') ||
    message.toLowerCase().includes('self-signed certificate')
  );
}

export function procureGuardWebhookErrorMessage(err: unknown): string {
  if (isTlsCertificateError(err)) {
    return 'TLS certificate verification failed for n8n even though ProcureGuard is configured to bypass TLS verification for webhook calls.';
  }
  return err instanceof Error ? err.message : 'ProcureGuard n8n webhook failed.';
}

// All active (non-expired) delegations grouped by delegator email (lowercased). Fail-safe → {}.
// Shared by the initial approval notification and the reminder job so a delegate is emailed by both.
export async function getActiveDelegatesByDelegator(): Promise<
  Record<string, ProcureGuardDelegation[]>
> {
  const map: Record<string, ProcureGuardDelegation[]> = {};
  try {
    await ensureProcureGuardSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_delegations WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    );
    for (const d of asSerialised<ProcureGuardDelegation[]>(rows)) {
      const key = d.delegator_email.trim().toLowerCase();
      (map[key] ??= []).push(d);
    }
  } catch (err) {
    log.error('activeDelegates.lookupFailed', err);
  }
  return map;
}

export type ProcureGuardWebhookRequest = Pick<
  AdhocPaymentRequest | AdvancePaymentRequest,
  | 'id'
  | 'reference_number'
  | 'requisition_number'
  | 'po_number'
  | 'status'
  | 'priority'
  | 'vendor_name'
  | 'amount'
  | 'currency'
  | 'spend_value_usd'
  | 'country'
  | 'segment'
  | 'spend_category'
  | 'requested_by_name'
  | 'requested_by_email'
  | 'requester_notification_emails'
  | 'email_test_mode'
  | 'email_test_recipients'
  | 'email_test_recipient_overrides'
  | 'requester_comments'
  | 'created_at'
  | 'updated_at'
>;

export type ProcureGuardNotificationRecipient = {
  display_name: string;
  email: string;
  notification_role: string;
  approval_status: ProcureGuardStatus | null;
  country: string;
  source_column: string;
};

/**
 * Base URL for the links in ProcureGuard's approval emails.
 *
 * This used to fall back to `http://localhost:4001` unconditionally, so a production deployment
 * with none of these set sent approvers an email whose "Open ProcureGuard" button pointed at their
 * own machine — a dead link, with nothing in the logs to say why. It now throws in production
 * rather than mailing out a link that cannot work; the localhost default survives only in
 * development, where it is the right answer.
 */
export function getAppBaseUrl(): string {
  const configured =
    process.env.CLIENT_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  const base = stripEnvQuotes(configured || '').replace(/\/$/, '');
  if (base) return base;

  if (process.env.NODE_ENV === 'production') {
    log.error('appBaseUrl.unconfigured', null, {
      hint: 'Set CLIENT_URL or NEXT_PUBLIC_APP_URL; email links cannot be built without it.',
    });
    throw new Error('ProcureGuard email links need CLIENT_URL or NEXT_PUBLIC_APP_URL to be set.');
  }
  return 'http://localhost:4001';
}

export function getRequestDetailUrl(requestType: ProcureGuardRequestType, id: number): string {
  const segment = requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments';
  return `${getAppBaseUrl()}/procure-guard/${segment}/${id}`;
}

export function countryRecipientKeys(country: string | null | undefined): string[] {
  const raw = normalizeProcureGuardCountry(country)?.trim();
  if (!raw) return [];

  const keys = new Set([raw]);
  const normalized = raw.toLowerCase();
  if (normalized === 'saudi arabia (ksa)' || normalized === 'ksa') keys.add('Saudi Arabia');
  if (normalized === 'saudi arabia') keys.add('Saudi Arabia (KSA)');
  if (normalized === 'united arab emirates (uae)' || normalized === 'united arab emirates')
    keys.add('UAE');
  if (normalized === 'uae') keys.add('United Arab Emirates (UAE)');
  // 'Indonesia + Malaysia' is one combined country in the UI; its notification recipients are
  // still stored per-country, so match both. getProcureGuardNotificationRecipients dedupes by email.
  if (normalized === 'indonesia + malaysia') {
    keys.add('Indonesia');
    keys.add('Malaysia');
  }
  return [...keys];
}

export function getRecipientApprovalStatus(
  requestType: ProcureGuardRequestType,
  request: ProcureGuardWebhookRequest,
): ProcureGuardStatus | null {
  if (!isActiveApprovalStatus(request.status)) return null;
  if (request.status === 'Submitted') {
    // First-approver notification recipients (SCM / Country Controller) are keyed to
    // 'Under Review', so route submission notifications there even though the request now
    // moves straight to the first approved status when approved.
    return 'Under Review';
  }
  return request.status;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatWebhookAmount(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  const value = Number(amount || 0);
  return `${currency || 'USD'} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// Email table rows for the requester-entered identifiers (the PR / PO number approvers recognise in
// SAP), so recipients can tie the email to the source document. Renders nothing when both are blank.
export function procureGuardRefRowsHtml(
  request: Pick<ProcureGuardWebhookRequest, 'requisition_number' | 'po_number'>,
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">${label}</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td></tr>`;
  const rows: string[] = [];
  const pr = request.requisition_number?.toString().trim();
  const po = request.po_number?.toString().trim();
  if (pr) rows.push(row('Requisition / PR No.', pr));
  if (po) rows.push(row('PO No.', po));
  return rows.join('');
}

// Approver roles that are NOT country-scoped (they can approve any country's request). For these
// steps the notification lookup must NOT be gated by the request's country — otherwise a single
// global approver only gets emailed for countries where a recipient row happens to be seeded, and
// the request silently stalls at the final step. Mirrors COUNTRY_SCOPED_PERMISSION_ROLES (which is
// only SCM Manager + Country Controller).
const GLOBAL_APPROVER_OWNER_LABELS = new Set<string>([
  'Supply Chain Director',
  'Treasury Director',
  'Corporate Controller',
  'CFO',
]);

export async function getProcureGuardNotificationRecipients(input: {
  requestType: ProcureGuardRequestType;
  country: string | null | undefined;
  approvalStatus: ProcureGuardStatus;
  ownerLabel: string;
}): Promise<ProcureGuardNotificationRecipient[]> {
  const countries = countryRecipientKeys(input.country);
  if (countries.length === 0) return [];

  const countryPlaceholders = countries.map(() => '?').join(', ');
  // For a global approver step, also match recipients tagged with that role regardless of country,
  // so a single Supply Chain Director / Treasury Director / Corporate Controller / CFO is notified
  // for every country's request (not only the country their recipient row is filed under).
  const isGlobalOwner = GLOBAL_APPROVER_OWNER_LABELS.has(input.ownerLabel);
  const globalClause = isGlobalOwner ? 'OR LOWER(notification_role) = LOWER(?)' : '';
  const rows = await sql<QueryResultRow[]>(
    `SELECT display_name, email, notification_role, approval_status, country, source_column
     FROM procure_guard_notification_recipients
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND (request_type = ? OR request_type = 'both')
       AND (
         (country IN (${countryPlaceholders}) AND (approval_status = ? OR LOWER(notification_role) = LOWER(?)))
         ${globalClause}
       )
     ORDER BY CASE WHEN approval_status = ? THEN 0 ELSE 1 END,
              is_required DESC,
              display_name ASC`,
    [
      input.requestType,
      ...countries,
      input.approvalStatus,
      input.ownerLabel,
      ...(isGlobalOwner ? [input.ownerLabel] : []),
      input.approvalStatus,
    ],
  );

  const seen = new Set<string>();
  return asSerialised<ProcureGuardNotificationRecipient[]>(rows).filter((row) => {
    const key = row.email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Batched sibling of getProcureGuardNotificationRecipients(): resolves the recipients for SEVERAL
 * workflow steps in ONE query instead of one round-trip per step. The detail page's "who gets
 * emailed" preview walked every step of the workflow sequentially, so a 5-step advance request cost
 * 5 identical-shaped queries.
 *
 * The matching and ordering rules are byte-for-byte the single-step ones, just evaluated in JS over
 * the union of candidate rows: a recipient matches a step when it is filed under one of the
 * request's country keys AND (its stored approval_status is that step's status OR its
 * notification_role is that step's owner label), or — for a global approver step — when its
 * notification_role is that owner label regardless of country.
 */
export async function getProcureGuardNotificationRecipientsForStatuses(input: {
  requestType: ProcureGuardRequestType;
  country: string | null | undefined;
  steps: Array<{ status: ProcureGuardStatus; ownerLabel: string }>;
}): Promise<Map<ProcureGuardStatus, ProcureGuardNotificationRecipient[]>> {
  const result = new Map<ProcureGuardStatus, ProcureGuardNotificationRecipient[]>();
  const countries = countryRecipientKeys(input.country);
  if (countries.length === 0 || input.steps.length === 0) {
    for (const step of input.steps) result.set(step.status, []);
    return result;
  }

  const statuses = [...new Set(input.steps.map((step) => step.status))];
  const ownerLabels = [...new Set(input.steps.map((step) => step.ownerLabel))];
  const globalLabels = ownerLabels.filter((label) => GLOBAL_APPROVER_OWNER_LABELS.has(label));

  const countryPlaceholders = countries.map(() => '?').join(', ');
  const statusPlaceholders = statuses.map(() => '?').join(', ');
  const ownerPlaceholders = ownerLabels.map(() => 'LOWER(?)').join(', ');
  const globalClause = globalLabels.length
    ? `OR LOWER(notification_role) IN (${globalLabels.map(() => 'LOWER(?)').join(', ')})`
    : '';

  // Ordered by the two step-independent keys of the single-step query; the step-dependent
  // "approval_status matches this step first" key is applied per step below.
  const rows = await sql<QueryResultRow[]>(
    `SELECT display_name, email, notification_role, approval_status, country, source_column, is_required
     FROM procure_guard_notification_recipients
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND (request_type = ? OR request_type = 'both')
       AND (
         (country IN (${countryPlaceholders}) AND (approval_status IN (${statusPlaceholders}) OR LOWER(notification_role) IN (${ownerPlaceholders})))
         ${globalClause}
       )
     ORDER BY is_required DESC, display_name ASC`,
    [input.requestType, ...countries, ...statuses, ...ownerLabels, ...globalLabels],
  );

  type CandidateRow = ProcureGuardNotificationRecipient & { is_required?: boolean | null };
  const candidates = asSerialised<CandidateRow[]>(rows);
  const countryKeys = new Set(countries);

  for (const step of input.steps) {
    const ownerLower = step.ownerLabel.toLowerCase();
    const isGlobalOwner = GLOBAL_APPROVER_OWNER_LABELS.has(step.ownerLabel);
    const matched = candidates.filter((row) => {
      const roleLower = (row.notification_role ?? '').toLowerCase();
      const countryMatch =
        countryKeys.has(row.country) &&
        (row.approval_status === step.status || roleLower === ownerLower);
      return countryMatch || (isGlobalOwner && roleLower === ownerLower);
    });
    // Array.prototype.sort is stable, so re-sorting the already correctly ordered candidate list by
    // the single step-dependent key reproduces the original three-key SQL ORDER BY exactly.
    matched.sort(
      (a, b) =>
        (a.approval_status === step.status ? 0 : 1) - (b.approval_status === step.status ? 0 : 1),
    );

    const seen = new Set<string>();
    result.set(
      step.status,
      matched
        .filter((row) => {
          const key = row.email.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(({ is_required: _isRequired, ...recipient }) => recipient),
    );
  }

  return result;
}

export async function postProcureGuardWebhook(
  webhookUrl: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(stripEnvQuotes(webhookUrl));
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const request = (isHttps ? httpsRequest : httpRequest)(
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

    request.setTimeout(15000, () => {
      request.destroy(new Error('ProcureGuard n8n webhook timed out.'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
