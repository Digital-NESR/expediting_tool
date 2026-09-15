/**
 * Activity-log writes, delegation attribution and the cache invalidation ProcureGuard writes share.
 *
 * A plain module, deliberately NOT `'use server'`: writeActivity forges audit rows, so it must not
 * be callable from a browser on its own.
 */
import type { QueryResultRow } from 'pg';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import {
  getPermissionProfile,
  getRequiredPermissionForTransition,
  procureGuardThreshold,
} from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardActivityRow,
  ProcureGuardActor,
  ProcureGuardRequestType,
  ProcureGuardReviewGrant,
  ProcureGuardStatus,
} from '@/types/procureGuard';
import { actorReviewGrants, grantCoversRequest } from './access';
import { MEANINGFUL_ACTIVITY_WHERE, PROCUREGUARD_DATA_TAG } from './constants';
import { exec, serialise, sql } from './internals';
import { normalisePaymentCountries } from './validation';

export async function writeActivity(input: {
  requestType: 'adhoc' | 'advance';
  requestId: number;
  referenceNumber: string;
  action: string;
  actor: ProcureGuardActor;
  notes?: string | null;
  onBehalfOfName?: string | null;
  onBehalfOfEmail?: string | null;
}) {
  await exec(
    `INSERT INTO procure_guard_activity_log
      (request_type, request_id, reference_number, action, actor_name, actor_email, notes, on_behalf_of_name, on_behalf_of_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestType,
      input.requestId,
      input.referenceNumber,
      input.action,
      input.actor.name,
      input.actor.email,
      input.notes ?? null,
      input.onBehalfOfName ?? null,
      input.onBehalfOfEmail ?? null,
    ],
  );
}

// When a delegate acts on a request, work out whose authority they actually used for this
// transition. Returns the delegator (source 'delegation') only when the actor's own role could
// NOT have performed the move — i.e. the action was possible only because of a delegation. Returns
// null for actions taken under the actor's own authority (no "on behalf of" needed).
export function resolveDelegationAttribution(
  actor: ProcureGuardActor,
  requestType: ProcureGuardRequestType,
  currentStatus: ProcureGuardStatus,
  targetStatus: ProcureGuardStatus,
  request: { country?: string | null; segment?: string | null; amount?: number | string | null; currency?: string | null; spend_value_usd?: number | string | null },
): { name: string; email: string } | null {
  const { amount: thresholdAmount, currency: thresholdCurrency } = procureGuardThreshold(request);
  const requiredPermission = getRequiredPermissionForTransition(
    requestType,
    currentStatus,
    targetStatus,
    thresholdAmount,
    thresholdCurrency,
  );
  if (!requiredPermission) return null;

  // Scope is judged by the SAME predicate that decides visibility and approval rights. This used to
  // compare the whole scope string through normalizeProcureGuardCountry(), which collapses any
  // multi-country scope ('Bahrain, Saudi Arabia (KSA)', or the live 'EOS, Chad, Congo') to 'Other'
  // and so matched nothing — silently dropping "on behalf of" from the log for those delegations.
  const grantHasPermission = (grant: ProcureGuardReviewGrant): boolean =>
    Boolean(getPermissionProfile(grant.role)[requiredPermission]) && grantCoversRequest(grant, request);

  const grants = actorReviewGrants(actor);
  // Own authority takes precedence — if the actor could do this themselves, it's not "on behalf of".
  if (grants.some(grant => grant.source === 'self' && grantHasPermission(grant))) return null;
  const delegated = grants.find(grant => grant.source === 'delegation' && grantHasPermission(grant));
  return delegated ? { name: delegated.fromName, email: delegated.fromEmail } : null;
}

export function revalidateProcureGuardPaths() {
  revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
  revalidatePath('/admin');
  revalidatePath('/procure-guard/admin');
  revalidatePath('/procure-guard/analytics');
  revalidatePath('/procure-guard');
  revalidatePath('/procure-guard/adhoc-payments');
  revalidatePath('/procure-guard/advance-payments');
}

// Short-lived per-user cache for the read-only dashboard queries, so repeat navigations are instant.
// Keyed by the scope/email arguments (so one user never sees another's data) and busted on any write
// via revalidateTag(PROCUREGUARD_DATA_TAG); the TTL is a backstop in case a write path is missed.
//
// NOTE: the rows are serialised/normalised INSIDE this function, not by the caller. unstable_cache
// already JSON round-trips whatever it stores, so doing serialise() again on the way out meant every
// dashboard load JSON.parse(JSON.stringify(...))'d both whole tables a second time for nothing.
export const getCachedDashboardRows = unstable_cache(
  async (where: string, params: string[], canViewAll: boolean, email: string) => {
    const [adhocRows, advanceRows, activityRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ${where} ORDER BY created_at DESC`, params),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ${where} ORDER BY created_at DESC`, params),
      sql<QueryResultRow[]>(
        canViewAll
          ? `SELECT * FROM procure_guard_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 12`
          : `SELECT a.* FROM procure_guard_activity_log a
             LEFT JOIN procure_guard_adhoc_payments ap
               ON a.request_type = 'adhoc' AND a.request_id = ap.id
             LEFT JOIN procure_guard_advance_payments adv
               ON a.request_type = 'advance' AND a.request_id = adv.id
             WHERE (
                 LOWER(ap.requested_by_email) = ?
                 OR ? = ANY(COALESCE(ap.requester_notification_emails, ARRAY[]::TEXT[]))
                 OR LOWER(adv.requested_by_email) = ?
                 OR ? = ANY(COALESCE(adv.requester_notification_emails, ARRAY[]::TEXT[]))
               )
               AND a.request_id > 0
               AND a.action NOT ILIKE '%seeded%'
             ORDER BY a.created_at DESC LIMIT 12`,
        canViewAll ? [] : [email, email, email, email],
      ),
    ]);
    return {
      adhoc: normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows)),
      advance: normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows)),
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
    };
  },
  ['procureguard-dashboard'],
  { revalidate: 20, tags: [PROCUREGUARD_DATA_TAG] },
);
