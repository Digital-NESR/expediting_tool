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
import { isActiveApprovalStatus, normalizeProcureGuardCountry } from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardDelegation,
  ProcureGuardRequestType,
  ProcureGuardStatus,
} from '@/types/procureGuard';

export type QueryParam = string | number | boolean | null | Date | Buffer | number[] | string[] | undefined;
export type QueryParams = QueryParam[];
export type ExecResult = { rowCount: number; insertId: number };

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

function normaliseParams(params: QueryParams): QueryParams {
  return params.map(value => value === undefined ? null : value);
}

export async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await procureGuardPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}

export async function exec(statement: string, params: QueryParams = []): Promise<ExecResult> {
  const result = await procureGuardPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return {
    rowCount: result.rowCount ?? 0,
    insertId: Number.isFinite(insertId) ? insertId : 0,
  };
}

export function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Memoized so the ~11 idempotent schema statements run once per process (e.g. on a warm serverless
// instance) instead of on every page load — that per-request DDL was the main ProcureGuard load lag.
// A fresh deploy starts a new process, so genuinely new columns still get applied.
let paymentRequestColumnsEnsured: Promise<void> | null = null;
export async function ensureProcureGuardPaymentRequestColumns(): Promise<void> {
  if (paymentRequestColumnsEnsured) return paymentRequestColumnsEnsured;
  paymentRequestColumnsEnsured = (async () => {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710' && code !== '42701') throw err;
    }
  }

  // Add all columns per table in a single ALTER (one round-trip, one lock), and run the two tables
  // in parallel — collapses the cold-start cost from ~8 sequential round-trips to ~1.
  await Promise.all([
    execSchema(`ALTER TABLE procure_guard_adhoc_payments
      ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS email_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_test_recipients TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS email_test_recipient_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
      ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_14d_sent_at TIMESTAMPTZ`),
    execSchema(`ALTER TABLE procure_guard_advance_payments
      ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS email_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_test_recipients TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS email_test_recipient_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
      ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_14d_sent_at TIMESTAMPTZ`),
    // Delegation attribution: when a delegate acts using someone else's authority, record who.
    execSchema(`ALTER TABLE procure_guard_activity_log
      ADD COLUMN IF NOT EXISTS on_behalf_of_name TEXT,
      ADD COLUMN IF NOT EXISTS on_behalf_of_email TEXT`),
  ]);
  // Indexes after the columns exist (they depend on requester_notification_emails); both in parallel.
  await Promise.all([
    execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_adhoc_requester_notification_emails ON procure_guard_adhoc_payments USING GIN (requester_notification_emails)`),
    execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_advance_requester_notification_emails ON procure_guard_advance_payments USING GIN (requester_notification_emails)`),
  ]);
  // Note: the reference_number UNIQUE index is ensured in the insert path
  // (insertProcureGuardPaymentRequest), not here — read-only page loads don't need it.
  })().catch(err => {
    paymentRequestColumnsEnsured = null; // allow a retry on the next request if it genuinely failed
    throw err;
  });
  return paymentRequestColumnsEnsured;
}

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
  return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || message.toLowerCase().includes('unable to verify')
    || message.toLowerCase().includes('self-signed certificate');
}

export function procureGuardWebhookErrorMessage(err: unknown): string {
  if (isTlsCertificateError(err)) {
    return 'TLS certificate verification failed for n8n even though ProcureGuard is configured to bypass TLS verification for webhook calls.';
  }
  return err instanceof Error ? err.message : 'ProcureGuard n8n webhook failed.';
}

let delegationTableEnsured: Promise<void> | null = null;
export async function ensureProcureGuardDelegationTable(): Promise<void> {
  if (delegationTableEnsured) return delegationTableEnsured;
  delegationTableEnsured = (async () => {
    try {
      await exec(`CREATE TABLE IF NOT EXISTS procure_guard_delegations (
        id SERIAL PRIMARY KEY,
        delegator_email TEXT NOT NULL,
        delegator_name TEXT,
        delegate_email TEXT NOT NULL,
        delegate_name TEXT,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await exec(`CREATE INDEX IF NOT EXISTS idx_pg_delegations_delegate ON procure_guard_delegations (LOWER(delegate_email))`);
      await exec(`CREATE INDEX IF NOT EXISTS idx_pg_delegations_delegator ON procure_guard_delegations (LOWER(delegator_email))`);
    } catch (err) {
      delegationTableEnsured = null; // allow a later retry
      console.error('[ensureProcureGuardDelegationTable]', err);
    }
  })();
  return delegationTableEnsured;
}

// All active (non-expired) delegations grouped by delegator email (lowercased). Fail-safe → {}.
// Shared by the initial approval notification and the reminder job so a delegate is emailed by both.
export async function getActiveDelegatesByDelegator(): Promise<Record<string, ProcureGuardDelegation[]>> {
  const map: Record<string, ProcureGuardDelegation[]> = {};
  try {
    await ensureProcureGuardDelegationTable();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_delegations WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    );
    for (const d of serialise<ProcureGuardDelegation[]>(rows)) {
      const key = d.delegator_email.trim().toLowerCase();
      (map[key] ??= []).push(d);
    }
  } catch (err) {
    console.error('[ProcureGuard] active-delegates lookup failed', err);
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

export function getAppBaseUrl(): string {
  const configured = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  return stripEnvQuotes(configured).replace(/\/$/, '');
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
  if (normalized === 'united arab emirates (uae)' || normalized === 'united arab emirates') keys.add('UAE');
  if (normalized === 'uae') keys.add('United Arab Emirates (UAE)');
  // 'Indonesia + Malaysia' is one combined country in the UI; its notification recipients are
  // still stored per-country, so match both. getProcureGuardNotificationRecipients dedupes by email.
  if (normalized === 'indonesia + malaysia') { keys.add('Indonesia'); keys.add('Malaysia'); }
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

export function formatWebhookAmount(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const value = Number(amount || 0);
  return `${currency || 'USD'} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// Email table rows for the requester-entered identifiers (the PR / PO number approvers recognise in
// SAP), so recipients can tie the email to the source document. Renders nothing when both are blank.
export function procureGuardRefRowsHtml(request: Pick<ProcureGuardWebhookRequest, 'requisition_number' | 'po_number'>): string {
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
  return serialise<ProcureGuardNotificationRecipient[]>(rows)
    .filter(row => {
      const key = row.email.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    const request = (isHttps ? httpsRequest : httpRequest)({
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
    }, response => {
      response.resume();
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: response.statusMessage ?? '',
        });
      });
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error('ProcureGuard n8n webhook timed out.'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
