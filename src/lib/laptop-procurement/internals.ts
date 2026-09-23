/* ─── Shared plumbing: input coercion, reference-number minting, the activity log, and the
   dashboard roll-ups. ─── */

import { asSerialised } from '@/lib/db/sql';
import { APPROVAL_ACTIVE_STATUSES } from '@/lib/laptopProcurement-utils';
import type {
  LaptopActor,
  LaptopDashboardStats,
  LaptopMonthlyMetric,
  LaptopRequest,
  LaptopRequestStatus,
} from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { PoolClient, QueryResultRow } from 'pg';
import { getScopedActions } from '@/lib/laptop-procurement/access';
import { QueryParams, exec, execTx, sql, sqlTx } from '@/lib/laptop-procurement/db';

export function blankToNull(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value as string | number;
}

export function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

/**
 * Like requireText, but the value has to be one the form could legitimately
 * have offered.
 *
 * A `<select>` submits whatever the browser decides the option's value is, and
 * that is not always what the app put there: an option carrying no `value`
 * attribute submits its TEXT, which a browser page-translation rewrites in the
 * DOM. Two requests reached the database with "المملكة العربية السعودية" as
 * their country — no row in laptop_approver_matrix matches that, so neither
 * could be routed to an approver.
 *
 * The markup is fixed, but the form was never the gate: this action is a POST
 * endpoint and takes whatever it is sent. Matching case-insensitively and
 * returning the canonical spelling also stops a stray case variant creating a
 * second country that looks identical in a list.
 */
export function requireOneOf(value: unknown, allowed: readonly string[], label: string): string {
  const text = requireText(value, label);
  const match = allowed.find((a) => a.toLowerCase() === text.toLowerCase());
  if (!match) {
    throw new Error(
      `${label} must be one of the listed options. Received "${text}" — if the page was open ` +
        `in a translated view, switch it back to English and choose again.`,
    );
  }
  return match;
}

// laptop_requests was emptied and restarted, so PLP00001–PLP00034 have been issued twice:
// once to the requests that were cleared out, and again to the current ones. Those older
// numbers are already quoted in sent emails and IT tickets, so rather than renumber live
// requests, new references start clear of the reused range. Everything at or below the floor
// keeps whatever number it already has.
export const LAPTOP_REFERENCE_FLOOR = 1500;

// Reads the highest reference and hands out the next one. Read-then-insert, so it only
// holds up under concurrency because the caller runs it inside a transaction that has
// already taken LAPTOP_REFERENCE_LOCK_KEY — without that, two submissions landing at the
// same moment both read the same maximum and are handed the same PLP number. Same shape
// as TI-TE's createShipment. The client is mandatory for exactly that reason: on the pool
// it would run outside the locked transaction.
export async function makeReference(client: PoolClient): Promise<string> {
  const rows = await sqlTx<QueryResultRow[]>(
    client,
    `SELECT reference_number FROM laptop_requests
     WHERE reference_number ~ '^PLP[0-9]+$'
     ORDER BY (substring(reference_number from 4))::int DESC
     LIMIT 1`,
  );
  const last = rows[0]?.reference_number as string | undefined;
  const lastNum = last ? Number(last.slice(3)) : 0;
  const highest = Math.max(Number.isFinite(lastNum) ? lastNum : 0, LAPTOP_REFERENCE_FLOOR - 1);
  return `PLP${String(highest + 1).padStart(5, '0')}`;
}

// Advisory-lock key serialising reference allocation across serverless invocations.
export const LAPTOP_REFERENCE_LOCK_KEY = 'laptop_reference';

export async function writeActivity(input: {
  requestId: number;
  referenceNumber: string;
  action: string;
  actor: LaptopActor;
  notes?: string | null;
  // Set when the log row belongs to a transaction: it has to go through that
  // transaction's client, or it survives a rollback of the change it describes.
  client?: PoolClient;
}): Promise<void> {
  const statement = `INSERT INTO laptop_activity_log (request_id, reference_number, action, actor_name, actor_email, notes)
     VALUES (?, ?, ?, ?, ?, ?)`;
  const params: QueryParams = [
    input.requestId,
    input.referenceNumber,
    input.action,
    input.actor.name,
    input.actor.email,
    input.notes ?? null,
  ];
  if (input.client) await execTx(input.client, statement, params);
  else await exec(statement, params);
}

// pending_review means "awaiting THIS actor's decision" (same filter My Work uses),
// not just "active and in scope" — a country-scoped reviewer/delegate can see
// requests that are active but currently sitting at a different stage entirely.
export function isActionableForActor(actor: LaptopActor, request: LaptopRequest): boolean {
  const actions = getScopedActions(actor, request);
  return (
    actions.canApprove ||
    actions.canReject ||
    actions.canAssignInventory ||
    actions.canProcureNew ||
    actions.canSubmitProcureDetails
  );
}

// Outcome-category counts computed with SQL aggregates against an optional scope
// (WHERE clause + params) rather than pulling every matching row into JS first.
// pending_review is the one exception: it has to mean "awaiting THIS actor's decision"
// (see isActionableForActor), which isn't expressible as a SQL aggregate, so it's
// computed separately from the (bounded, active-only) rows.
//
// `activeRows` lets a caller that has already fetched the in-scope active-approval rows
// (the dashboard, which needs them for its pending queue anyway) hand them over instead
// of making this run the identical query a second time.
export async function computeLaptopStats(
  actor: LaptopActor,
  whereClause: string,
  whereParams: QueryParams,
  activeRowsProvided?: LaptopRequest[] | Promise<LaptopRequest[]>,
): Promise<LaptopDashboardStats> {
  const activePlaceholders = APPROVAL_ACTIVE_STATUSES.map(() => '?').join(', ');
  const [rows, activeRows] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('Procure New', 'Approved'))::int AS procure_new,
         COUNT(*) FILTER (WHERE status IN ('Assign from Inventory', 'Assign from Inventory & Closed'))::int AS assigned_inventory,
         COUNT(*) FILTER (WHERE status = 'Repaired & Closed')::int AS repaired,
         COUNT(*) FILTER (WHERE status LIKE 'Rejected%')::int AS rejected,
         COUNT(*) FILTER (WHERE LOWER(type_of_device) = 'laptop')::int AS laptops,
         COUNT(*) FILTER (WHERE LOWER(type_of_device) = 'desktop')::int AS desktops
       FROM laptop_requests
       ${whereClause}`,
      whereParams,
    ),
    activeRowsProvided ??
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_requests ${whereClause ? `${whereClause} AND status IN (${activePlaceholders})` : `WHERE status IN (${activePlaceholders})`}`,
        [...whereParams, ...APPROVAL_ACTIVE_STATUSES],
      ),
  ]);
  const row = rows[0] ?? {};
  const pendingReview = asSerialised<LaptopRequest[]>(activeRows).filter((r) =>
    isActionableForActor(actor, r),
  ).length;
  return {
    total: Number(row.total ?? 0),
    pending_review: pendingReview,
    procure_new: Number(row.procure_new ?? 0),
    assigned_inventory: Number(row.assigned_inventory ?? 0),
    repaired: Number(row.repaired ?? 0),
    rejected: Number(row.rejected ?? 0),
    laptops: Number(row.laptops ?? 0),
    desktops: Number(row.desktops ?? 0),
  };
}

// Takes only the two date columns it reads, so analytics can fetch just those rather
// than every column of every request.
export function buildMonthlyTrend(
  requests: Array<Pick<LaptopRequest, 'requested_date' | 'created_at'>>,
): LaptopMonthlyMetric[] {
  const map = new Map<string, number>();
  for (const r of requests) {
    const basis = r.requested_date || r.created_at;
    const d = new Date(basis);
    if (Number.isNaN(d.getTime())) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(month, (map.get(month) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-18);
}

// Label describing who a request is currently waiting on (or its terminal outcome).
export function getPendingWithLabel(status: LaptopRequestStatus): string {
  switch (status) {
    case 'Submitted':
    case 'IT Approval':
      return 'IT Team';
    case 'CM Approval':
      return 'Country Manager';
    case 'IT Director Approval':
      return 'IT Director';
    case 'Supply Chain Director Approval':
      return 'Supply Chain Director';
    case 'Rejected':
    case 'Rejected by CM':
    case 'Rejected by ITD':
    case 'Rejected by SCD':
      return 'Rejected';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return 'Closed';
  }
}

// Maps the stage being approved to the column that records its approval timestamp.
export const STAGE_APPROVED_DATE_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'it_team_approved_date',
  'IT Approval': 'it_team_approved_date',
  'CM Approval': 'cm_approved_date',
  'IT Director Approval': 'itd_approved_date',
  'Supply Chain Director Approval': 'scd_approved_date',
};

// Maps the stage being decided to the column that records who acted on it.
export const STAGE_APPROVER_NAME_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'it_manager',
  'IT Approval': 'it_manager',
  'CM Approval': 'country_manager',
  'IT Director Approval': 'it_director',
  'Supply Chain Director Approval': 'sc_director',
};

/* The admin console this tool owns. Mutations used to revalidate all of '/admin', back
   when that one route fetched every tool's data in a single Promise.all — a laptop
   mutation then paid for ProcureGuard's, SourceGuide's and TI-TE's databases too, and
   for their failures. That shell is now split one route per application, so the laptop
   pages can be refreshed without touching any other tool's. */
const LAPTOP_ADMIN_PATH = '/admin/laptop';

// Both this and revalidateLaptopPaths below refresh that console, so every laptop
// mutation now reaches it by one policy — the console's own actions used to reach for
// revalidatePath('/admin') by hand while this module insisted they must not.
export function revalidateLaptopAdminPath(): void {
  revalidatePath(LAPTOP_ADMIN_PATH);
}

export function revalidateLaptopPaths(): void {
  revalidatePath('/laptop-procurement');
  revalidatePath('/laptop-procurement/requests');
  revalidatePath('/laptop-procurement/requests/new');
  revalidatePath('/laptop-procurement/my-work');
  revalidatePath('/laptop-procurement/analytics');
  revalidateLaptopAdminPath();
}

/* ── Device catalogue ─────────────────────────────────────────── */

// document_type lands in a column the detail page groups on, so it's a closed
// vocabulary, not free text — the request form is the only uploader and only ever
// sends 'request_attachment'. Anything else is a hand-crafted POST; reject it
// rather than store an arbitrary client string next to a 10 MB blob.
export const LAPTOP_DOCUMENT_TYPES = new Set(['request_attachment']);
