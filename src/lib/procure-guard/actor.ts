/**
 * Actor resolution and the access guards every ProcureGuard action runs FIRST.
 *
 * A plain module, deliberately NOT `'use server'`: these guards are called by actions, never
 * by the browser. The predicates themselves live in ./access — they came out of a production
 * incident and are not restated here.
 */
import { cache } from 'react';
import { getProcureGuardUser } from '@/lib/auth';
import { normalizeEmail } from '@/lib/require-access';
import {
  canUseProcureGuardAdmin,
  canUseProcureGuardAnalytics,
  canUseProcureGuardOperationalPages,
  canUseProcureGuardReviewerQueue,
  getProcureGuardAccessView,
  getProcureGuardAvailableActions,
  getProcureGuardCountryScopeCountries,
  normalizeProcureGuardCountry,
  procureGuardThreshold,
} from '@/lib/procureGuard-utils';
import type { ProcureGuardAvailableActions } from '@/lib/procureGuard-utils';
import type {
  ProcureGuardActor,
  ProcureGuardRequestType,
  ProcureGuardStatus,
} from '@/types/procureGuard';
import {
  actorCanAccessRequestScope,
  normaliseScopeValue,
  scopedRequestWhere as scopedWhere,
} from './access';
import { resolveProcureGuardActorScope } from './actor-scope';
import { ProcureGuardAccessError } from './constants';
import { isProcureGuardAdminEmail } from './validation';

// Memoized per request (React cache) so the several actions that each resolve the actor during one
// page render share a single resolution instead of re-querying the DB every time.
export const getActor = cache(async (): Promise<ProcureGuardActor> => {
  const user = await getProcureGuardUser();
  // Canonical, lowercase identity everywhere downstream (scopedWhere, ownership checks, writeActivity).
  const email = normalizeEmail(user?.email);

  if (!email) {
    throw new ProcureGuardAccessError('You must be signed in to use ProcureGuard.');
  }

  // Permission row + delegations + review grants, resolved by the SAME helper the document download
  // route uses, so no entry point can end up with a different idea of this actor's scope.
  const scope = await resolveProcureGuardActorScope(email, user?.name ?? null);

  return {
    email: scope.email,
    name: scope.permissionName ?? user?.name ?? scope.email,
    department: user?.department ?? null,
    jobTitle: user?.jobTitle ?? null,
    isAdmin: scope.role === 'Admin',
    role: scope.role,
    permissions: scope.permissions,
    country: scope.country,
    segment: scope.segment,
    reviewGrants: scope.reviewGrants,
  };
});

// Analytics scope. Reviewers, viewers and admins reuse the same scopedWhere() the request lists
// use, so a country-scoped manager's analytics cover only their countries. Analyst / Read Only
// hold no review grant (scopedWhere would collapse them to their own requests) yet the role exists
// solely to read cross-country analytics — they get the global set, narrowed by any country /
// segment recorded on their permission row.
export function analyticsScopedWhere(actor: ProcureGuardActor): {
  where: string;
  params: string[];
} {
  if (actor.permissions.accessView !== 'analyst') return scopedWhere(actor);
  const parts: string[] = [];
  const params: string[] = [];
  const countries = getProcureGuardCountryScopeCountries(actor.country);
  if (countries.length > 0) {
    parts.push(`country IN (${countries.map(() => '?').join(', ')})`);
    params.push(...countries);
  }
  if (actor.segment) {
    parts.push('segment = ?');
    params.push(actor.segment);
  }
  if (parts.length === 0) return { where: '', params: [] };
  return { where: `WHERE ${parts.join(' AND ')}`, params };
}

export function getScopeRestrictionMessage(
  actor: ProcureGuardActor,
  request: { country?: string | null; segment?: string | null },
): string {
  const actorCountry = actor.country?.trim();
  const actorSegment = actor.segment?.trim();
  const requestCountry = request.country?.trim() || 'an unassigned country';
  const requestSegment = request.segment?.trim() || 'an unassigned segment';
  const actorCountries = getProcureGuardCountryScopeCountries(actorCountry);
  const normalizedRequestCountry = normalizeProcureGuardCountry(request.country);

  if (
    actorCountries.length > 0 &&
    (!normalizedRequestCountry || !actorCountries.includes(normalizedRequestCountry))
  ) {
    return `${actor.role} access is limited to ${actorCountry}. This request is for ${requestCountry}.`;
  }
  if (actorSegment && normaliseScopeValue(actorSegment) !== normaliseScopeValue(request.segment)) {
    return `${actor.role} access is limited to ${actorSegment}. This request is for ${requestSegment}.`;
  }
  return `${actor.role} access is limited to your assigned scope.`;
}

export function getScopedProcureGuardAvailableActions(
  actor: ProcureGuardActor,
  requestType: ProcureGuardRequestType,
  request: {
    status: ProcureGuardStatus;
    amount?: number | string | null;
    currency?: string | null;
    spend_value_usd?: number | string | null;
    country?: string | null;
    segment?: string | null;
  },
): ProcureGuardAvailableActions {
  const { amount: thresholdAmount, currency: thresholdCurrency } = procureGuardThreshold(request);
  const actions = getProcureGuardAvailableActions(
    actor.permissions,
    requestType,
    request.status,
    thresholdAmount,
    thresholdCurrency,
  );
  if (actorCanAccessRequestScope(actor, request)) return actions;

  return {
    ...actions,
    canApprove: false,
    canReject: false,
  };
}

export async function requireAdminActor(): Promise<ProcureGuardActor> {
  const actor = await getActor();
  if (
    !canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role)) &&
    !isProcureGuardAdminEmail(actor.email)
  ) {
    throw new Error('Admin access is required.');
  }
  return actor;
}

export async function requirePermissionManager(): Promise<ProcureGuardActor> {
  const actor = await getActor();
  if (!canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role))) {
    throw new Error('Permission management access is required.');
  }
  return actor;
}

// These guards key off actor.permissions.accessView (the MERGED view that includes any
// delegated authority) so a delegate passes the same checks the page gates use. Admin
// checks deliberately stay on the base role — delegation caps accessView at 'reviewer'
// and must never confer admin.
export function requireProcureGuardOperationalAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    throw new ProcureGuardAccessError('Operational ProcureGuard access is required.');
  }
}

export function requireProcureGuardAnalyticsAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardAnalytics(actor.permissions.accessView)) {
    throw new ProcureGuardAccessError('Analytics access is required.');
  }
}

export function requireProcureGuardReviewerQueueAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardReviewerQueue(actor.permissions.accessView)) {
    throw new ProcureGuardAccessError('Reviewer access is required.');
  }
}
