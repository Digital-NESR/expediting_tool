'use server';

/**
 * ProcureGuard read actions: the actor, the request lists, the reviewer queue, the request detail
 * page and the dashboard. Every export here is a public POST endpoint, so every one of them resolves
 * the actor and runs its access guard as its FIRST statement.
 */
import type { QueryResultRow } from 'pg';
import { getProcureGuardUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  getActor,
  getScopedProcureGuardAvailableActions,
  requireProcureGuardOperationalAccess,
  requireProcureGuardReviewerQueueAccess,
} from '@/lib/procure-guard/actor';
import { canActorViewRequest, scopedRequestWhere as scopedWhere } from '@/lib/procure-guard/access';
import { getCachedDashboardRows } from '@/lib/procure-guard/activity';
import { buildStats } from '@/lib/procure-guard/analytics';
import { ProcureGuardAccessError } from '@/lib/procure-guard/constants';
import { ensureProcureGuardSchema, serialise, sql } from '@/lib/procure-guard/internals';
import { getProcureGuardNotificationContactPreviewRows } from '@/lib/procure-guard/notifications';
import { normalisePaymentCountries, normalisePaymentCountry } from '@/lib/procure-guard/validation';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardActivityRow,
  ProcureGuardActor,
  ProcureGuardDashboardData,
  ProcureGuardDelegation,
  ProcureGuardDocument,
  ProcureGuardNotificationContact,
  ProcureGuardRequestDetailData,
  ProcureGuardRequestListData,
  ProcureGuardRequestType,
  ProcureGuardWorkQueueData,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export async function getProcureGuardActor(): Promise<ProcureGuardActor | null> {
  try {
    return await getActor();
  } catch (err) {
    log.error('getProcureGuardActor.failed', err);
    return null;
  }
}

export async function canAccessProcureGuardApp(): Promise<boolean> {
  const user = await getProcureGuardUser();
  const email = user?.email?.toLowerCase();

  // ProcureGuard is open to everyone who is signed in. Anyone authenticated gets at least
  // Requester access automatically; a matching row in procure_guard_permissions (resolved in
  // getActor) upgrades them to their assigned role.
  return Boolean(email);
}

export async function getAdhocPayments(): Promise<AdhocPaymentRequest[] | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_adhoc_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(rows));
  } catch (err) {
    log.error('getAdhocPayments.failed', err);
    return null;
  }
}

export async function getAdhocPaymentsData(): Promise<ProcureGuardRequestListData<AdhocPaymentRequest> | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_adhoc_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return { actor, requests: normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(rows)) };
  } catch (err) {
    log.error('getAdhocPaymentsData.failed', err);
    return null;
  }
}

export async function getAdvancePaymentRequestsData(): Promise<ProcureGuardRequestListData<AdvancePaymentRequest> | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_advance_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return { actor, requests: normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(rows)) };
  } catch (err) {
    log.error('getAdvancePaymentRequestsData.failed', err);
    return null;
  }
}

export async function getAdvancePaymentRequests(): Promise<AdvancePaymentRequest[] | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_advance_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(rows));
  } catch (err) {
    log.error('getAdvancePaymentRequests.failed', err);
    return null;
  }
}

export async function getProcureGuardWorkQueueData(): Promise<ProcureGuardWorkQueueData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardReviewerQueueAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);
    const [adhocRows, advanceRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_adhoc_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_advance_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
    ]);
    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const items = [
      ...adhoc.map((request) => ({
        request_type: 'adhoc' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(actor, 'adhoc', request),
      })),
      ...advance.map((request) => ({
        request_type: 'advance' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(actor, 'advance', request),
      })),
    ]
      .filter((item) => item.actions.canApprove || item.actions.canReject)
      .sort((a, b) => {
        const priorityRank: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
        return (
          (priorityRank[a.request.priority] ?? 2) - (priorityRank[b.request.priority] ?? 2) ||
          new Date(a.request.created_at).getTime() - new Date(b.request.created_at).getTime()
        );
      });

    return {
      actor,
      items,
      stats: {
        total: items.length,
        adhoc: items.filter((item) => item.request_type === 'adhoc').length,
        advance: items.filter((item) => item.request_type === 'advance').length,
        approval: items.filter((item) => item.actions.canApprove || item.actions.canReject).length,
      },
    };
  } catch (err) {
    log.error('getProcureGuardWorkQueueData.failed', err);
    return null;
  }
}

export async function getProcureGuardNotificationPreview(input: {
  requestType: ProcureGuardRequestType;
  country?: string;
  amount?: number | string | null;
  currency?: string | null;
}): Promise<ProcureGuardNotificationContact[]> {
  try {
    // This returns the approver directory for a country, so it needs the same access the request
    // forms that render it need — not merely a signed-in session.
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    return await getProcureGuardNotificationContactPreviewRows({
      requestType: input.requestType,
      country: input.country,
      amount: input.amount,
      currency: input.currency || 'USD',
    });
  } catch (err) {
    log.error('getProcureGuardNotificationPreview.failed', err);
    return [];
  }
}

export async function getProcureGuardRequestDetail(
  requestType: ProcureGuardRequestType,
  id: number,
): Promise<ProcureGuardRequestDetailData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const table =
      requestType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);

    if (!rows[0]) {
      log.info('requestDetail.notFound', { requestType, id });
      return null;
    }

    const request = normalisePaymentCountry(
      serialise<AdhocPaymentRequest | AdvancePaymentRequest>(rows[0]),
    );
    // ONE view predicate, shared with the list SQL and the document download route. The detail page
    // used to check the requester side ONLY for actors without canViewAll, so a country-scoped
    // reviewer opening a request they had raised themselves (or been added as a viewer on) outside
    // their review scope got a 404 on a row their own list had just shown them.
    if (!canActorViewRequest(actor, request)) {
      log.info('requestDetail.denied', {
        requestType,
        id,
        actor: actor.email,
        reason: 'out of scope',
      });
      return null;
    }

    const [activityRows, documentRows, notificationContacts, delegationRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_activity_log
         WHERE request_type = ? AND request_id = ?
         ORDER BY created_at DESC`,
        [requestType, id],
      ),
      sql<QueryResultRow[]>(
        `SELECT id, request_type, request_id, document_name, original_name, document_type, file_type, file_size,
                uploaded_by_name, uploaded_by_email, uploaded_at
         FROM procure_guard_documents
         WHERE request_type = ? AND request_id = ?
         ORDER BY uploaded_at DESC`,
        [requestType, id],
      ),
      getProcureGuardNotificationContactPreviewRows({
        requestType,
        country: request.country,
        amount: request.amount,
        currency: request.currency,
      }),
      ensureProcureGuardSchema().then(() =>
        sql<QueryResultRow[]>(
          `SELECT * FROM procure_guard_delegations
           WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
           ORDER BY created_at DESC`,
        ).catch((err) => {
          log.error('requestDetail.delegationsFailed', err, { requestType, id });
          return [] as QueryResultRow[];
        }),
      ),
    ]);

    return {
      actor,
      request_type: requestType,
      request,
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
      documents: serialise<ProcureGuardDocument[]>(documentRows),
      notification_contacts: notificationContacts,
      active_delegations: serialise<ProcureGuardDelegation[]>(delegationRows),
      actions: getScopedProcureGuardAvailableActions(actor, requestType, request),
    };
  } catch (err) {
    // `null` means "there is nothing here for you", and the page turns it into a 404. A failed
    // query is NOT that: 404-ing on it told the user the request did not exist when the database
    // was simply unreachable. Refusals stay a 404; everything else is logged and rethrown so it
    // surfaces as an error page instead of a silent, wrong "not found".
    if (err instanceof ProcureGuardAccessError) {
      log.info('requestDetail.denied', { requestType, id, reason: err.message });
      return null;
    }
    log.error('requestDetail.failed', err, { requestType, id });
    throw err;
  }
}

export async function getProcureGuardDashboardData(): Promise<ProcureGuardDashboardData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardSchema();
    const scope = scopedWhere(actor);

    const { adhoc, advance, activity } = await getCachedDashboardRows(
      scope.where,
      scope.params,
      actor.permissions.canViewAll,
      actor.email.toLowerCase(),
    );

    return {
      stats: buildStats(adhoc, advance),
      adhoc,
      advance,
      activity,
      actor,
    };
  } catch (err) {
    log.error('getProcureGuardDashboardData.failed', err);
    return null;
  }
}
