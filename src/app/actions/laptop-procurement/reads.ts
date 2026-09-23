'use server';

/* ─── Everything the pages read. Each one resolves the actor first and scopes its query to them. ─── */

import { asSerialised } from '@/lib/db/sql';
import {
  ADMIN_REQUESTS_PAGE_SIZE,
  APPROVAL_ACTIVE_STATUSES,
  IT_MANAGER_STATUSES,
  canUseLaptopAnalytics,
} from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type {
  LaptopActivityRow,
  LaptopActor,
  LaptopAdminData,
  LaptopAnalyticsData,
  LaptopDashboardData,
  LaptopDelegationRow,
  LaptopDeviceCatalogRow,
  LaptopDocument,
  LaptopPermissionRow,
  LaptopRequest,
  LaptopRequestDetailData,
  LaptopRequestListData,
  LaptopWorkQueueData,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import {
  getScopedActions,
  laptopActingIdentities,
  requireAdminActor,
  requireReviewerQueueAccess,
  scopedWhere,
} from '@/lib/laptop-procurement/access';
import { anyMatrixCapabilityForCountry, getActor } from '@/lib/laptop-procurement/actor';
import {
  buildDelegatableRoles,
  buildMergedPermissionsList,
  computeLaptopAnalytics,
  resolveStageAssignees,
} from '@/lib/laptop-procurement/admin-data';
import { MEANINGFUL_ACTIVITY_WHERE, sql } from '@/lib/laptop-procurement/db';
import { applyLaptopDelegationExpiry } from '@/lib/laptop-procurement/delegation';
import { computeLaptopStats } from '@/lib/laptop-procurement/internals';
import { ensureLaptopSchema } from '@/lib/laptop-procurement/schema';

const log = logger('laptop-procurement');

export async function getLaptopRequestsData(): Promise<LaptopRequestListData | null> {
  try {
    const actor = await getActor();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_requests ${scope.where} ORDER BY created_at DESC, id DESC`,
      scope.params,
    );
    return { actor, requests: asSerialised<LaptopRequest[]>(rows) };
  } catch (err) {
    log.error('getLaptopRequestsData.failed', err);
    return null;
  }
}

export async function getLaptopDashboardData(): Promise<LaptopDashboardData | null> {
  try {
    const actor = await getActor();
    const scope = scopedWhere(actor);

    // Pull a generous batch of active-approval requests in scope, then keep only the
    // ones actually awaiting this actor's decision (same "needs my action" filter as
    // My Work) — being in scope isn't enough, since scope includes requests already
    // past this actor's stage and sitting with someone else.
    const activePlaceholders = APPROVAL_ACTIVE_STATUSES.map(() => '?').join(', ');
    const pendingWhere = scope.where
      ? `${scope.where} AND status IN (${activePlaceholders})`
      : `WHERE status IN (${activePlaceholders})`;

    // One fetch of the in-scope active-approval rows, shared with computeLaptopStats
    // below — it needs exactly this set for pending_review and used to issue the very
    // same query itself. The LIMIT 50 that used to be in SQL is applied in JS instead,
    // after the same ORDER BY, so the queue is still the 50 most recent and the count
    // still spans everything.
    const activeRequestsPromise = sql<QueryResultRow[]>(
      `SELECT * FROM laptop_requests ${pendingWhere} ORDER BY created_at DESC`,
      [...scope.params, ...APPROVAL_ACTIVE_STATUSES],
    ).then((rows) => asSerialised<LaptopRequest[]>(rows));

    const [activeRequests, activityRows, stats] = await Promise.all([
      activeRequestsPromise,
      // Always the actor's own actions — not everything canViewAll can see — so
      // "Recent Activity" reflects what this person actually did.
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_activity_log WHERE actor_email = ? AND ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 12`,
        [actor.email],
      ),
      // Handed the same promise, so its aggregate query still runs in parallel with the
      // fetch it is reusing rather than waiting on it.
      computeLaptopStats(actor, scope.where, scope.params, activeRequestsPromise),
    ]);

    const pendingQueue = activeRequests.slice(0, 50).filter((r) => {
      const actions = getScopedActions(actor, r);
      return (
        actions.canApprove ||
        actions.canReject ||
        actions.canAssignInventory ||
        actions.canProcureNew ||
        actions.canSubmitProcureDetails
      );
    });

    return {
      stats,
      pendingQueue,
      activity: asSerialised<LaptopActivityRow[]>(activityRows),
      actor,
    };
  } catch (err) {
    log.error('getLaptopDashboardData.failed', err);
    return null;
  }
}

export async function getLaptopRequestDetail(id: number): Promise<LaptopRequestDetailData | null> {
  try {
    const actor = await getActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    if (!rows[0]) return null;

    const request = asSerialised<LaptopRequest>(rows[0]);
    // Visible if EITHER the actor's own identity or any identity they hold via
    // delegation can see it — mirrors the list query (scopedWhere), which already
    // accounts for delegation. Every delegation grant already has canViewAll=true
    // (enforced in resolveLaptopDelegations), so only the actor's own identity ever
    // needs the "it's my own request" fallback.
    const canView = laptopActingIdentities(actor).some((id) =>
      id.permissions.canViewAll
        ? id.permissions.canViewEveryCountry ||
          anyMatrixCapabilityForCountry(id.matrixCapabilities, request.country)
        : id.email.toLowerCase() === request.requested_by_email?.toLowerCase(),
    );
    if (!canView) return null;

    const [activityRows, documentRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_activity_log WHERE request_id = ? ORDER BY created_at DESC`,
        [id],
      ),
      sql<QueryResultRow[]>(
        `SELECT id, request_id, document_name, original_name, document_type, file_type, file_size,
                uploaded_by_name, uploaded_by_email, uploaded_at
         FROM laptop_documents WHERE request_id = ? ORDER BY uploaded_at DESC`,
        [id],
      ),
    ]);

    return {
      actor,
      request,
      activity: asSerialised<LaptopActivityRow[]>(activityRows),
      documents: asSerialised<LaptopDocument[]>(documentRows),
      actions: getScopedActions(actor, request),
      stageAssignees: await resolveStageAssignees(request),
    };
  } catch (err) {
    log.error('getLaptopRequestDetail.failed', err);
    return null;
  }
}

export async function getLaptopWorkQueueData(): Promise<LaptopWorkQueueData | null> {
  try {
    const actor = await getActor();
    requireReviewerQueueAccess(actor);
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_requests ${scope.where} ORDER BY created_at DESC, id DESC`,
      scope.params,
    );
    const requests = asSerialised<LaptopRequest[]>(rows);
    const items = requests
      .map((request) => ({ request, actions: getScopedActions(actor, request) }))
      .filter(
        (item) =>
          item.actions.canApprove ||
          item.actions.canReject ||
          item.actions.canAssignInventory ||
          item.actions.canProcureNew ||
          item.actions.canSubmitProcureDetails,
      )
      .sort(
        (a, b) =>
          new Date(a.request.created_at).getTime() - new Date(b.request.created_at).getTime(),
      );

    return {
      actor,
      items,
      stats: {
        total: items.length,
        approval: items.filter((item) => item.actions.canApprove).length,
        it_review: items.filter((item) => IT_MANAGER_STATUSES.includes(item.request.status)).length,
      },
    };
  } catch (err) {
    log.error('getLaptopWorkQueueData.failed', err);
    return null;
  }
}

export async function getLaptopAdminData(
  requestsPage: number = 0,
): Promise<LaptopAdminData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureLaptopSchema();
    const offset = Math.max(0, Math.floor(requestsPage)) * ADMIN_REQUESTS_PAGE_SIZE;
    const [
      requestRows,
      requestsCountRows,
      activityRows,
      permissionRows,
      delegationRows,
      deviceRows,
      matrixRows,
      stats,
    ] = await Promise.all([
      // Only the current page — the table only ever shows ADMIN_REQUESTS_PAGE_SIZE
      // rows at a time, so there's no reason to pull the entire (and ever-growing)
      // requests table on every admin panel load or action.
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_requests ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [ADMIN_REQUESTS_PAGE_SIZE, offset],
      ),
      sql<QueryResultRow[]>(`SELECT COUNT(*)::int AS count FROM laptop_requests`),
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 100`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions ORDER BY role, email`),
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_delegations ORDER BY is_active DESC, COALESCE(revoked_at, created_at) DESC`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_device_catalog ORDER BY type_of_device, model`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_approver_matrix WHERE is_active = TRUE`),
      computeLaptopStats(actor, '', []),
    ]);
    const delegations = applyLaptopDelegationExpiry(
      asSerialised<LaptopDelegationRow[]>(delegationRows),
    );
    return {
      actor,
      requests: asSerialised<LaptopRequest[]>(requestRows),
      requestsTotal: Number(requestsCountRows[0]?.count ?? 0),
      activity: asSerialised<LaptopActivityRow[]>(activityRows),
      permissions: asSerialised<LaptopPermissionRow[]>(permissionRows),
      delegations,
      deviceCatalog: asSerialised<LaptopDeviceCatalogRow[]>(deviceRows),
      stats,
      delegatableRoles: buildDelegatableRoles(matrixRows),
      permissionsList: buildMergedPermissionsList(permissionRows, matrixRows),
    };
  } catch (err) {
    log.error('getLaptopAdminData.failed', err);
    return null;
  }
}

// Scoped to the actor's own approval countries (plus their own submitted requests) —
// same scoping the request list and reviewer queue use. This is what the admin panel's
// embedded analytics tab has always shown (admin's own scope is unrestricted, so it
// reads as "global" there), and what the laptop-procurement Analytics page's Personal
// tab shows for everyone else.
export async function getLaptopAnalyticsData(): Promise<LaptopAnalyticsData | null> {
  /* The access check sits outside the try. A refusal is not a fault, and
     folding the two together is what made a permission denial render as
     "Check the Laptop Procurement database connection" — a message that sent
     people looking at a database that was fine. Null is still the right answer
     to the caller either way; the difference belongs in the log. */
  const actor = await getActor().catch((err) => {
    log.error('getLaptopAnalyticsData.actorFailed', err);
    return null;
  });
  if (!actor) return null;
  if (!canUseLaptopAnalytics(actor.effectiveAccessView)) {
    log.warn('getLaptopAnalyticsData.forbidden', {
      actor: actor.email,
      accessView: actor.effectiveAccessView,
    });
    return null;
  }
  return analyticsFor(actor);
}

/**
 * Analytics for the /admin console.
 *
 * Separate from the function above because the two answer to different gates.
 * The app's own page asks what this person may do on /laptop-procurement;
 * the console asks whether they may be in /admin at all, which is
 * ADMIN_EMAILS plus LAPTOP_PROCUREMENT_ADMIN_EMAILS.
 *
 * Before 157c829 those were the same question — ADMIN_EMAILS made you a laptop
 * Admin outright — so one loader served both. That commit scoped ADMIN_EMAILS
 * to the console on purpose, and `requireAdminActor` is the per-call elevation
 * it introduced to replace it: admin rights on the object it returns only,
 * never on what getActor() hands the main app. Analytics was the one console
 * section still calling getActor() directly, so it alone stopped working.
 *
 * Deliberately not a flag on the function above. A boolean saying "skip the
 * permission check" is the kind of parameter that eventually gets passed true
 * from somewhere that should not.
 */
export async function getLaptopAdminAnalyticsData(): Promise<LaptopAnalyticsData | null> {
  const actor = await requireAdminActor().catch((err) => {
    log.warn('getLaptopAdminAnalyticsData.forbidden', { error: String(err) });
    return null;
  });
  if (!actor) return null;
  return analyticsFor(actor);
}

async function analyticsFor(actor: LaptopActor): Promise<LaptopAnalyticsData | null> {
  try {
    const scope = scopedWhere(actor);
    return await computeLaptopAnalytics(actor, scope.where, scope.params);
  } catch (err) {
    log.error('getLaptopAnalyticsData.failed', err);
    return null;
  }
}

/* ── Create / update ──────────────────────────────────────────── */
