/**
 * ProcureGuard visibility — the single definition of "may this actor see this request".
 *
 * There used to be three of these (the list SQL, the detail action, the document download route)
 * and they disagreed: a country-scoped reviewer who was also the requester of an out-of-scope
 * request saw the row in the list but got a 404 on the detail page, and a delegate who could
 * approve a request got a 403 on its attachments. Everything now goes through one predicate:
 *
 *     canActorViewRequest = requesterSide || grants.some(grantCoversRequest)
 *
 * `scopedRequestWhere()` below is the SQL projection of exactly that predicate — the same two
 * halves in the same order — so the list can never drift from the detail page again.
 *
 * Nothing here touches the database or is a `'use server'` export: these are pure predicates so
 * they can be unit-tested and imported from both server actions and route handlers. Callers must
 * still run their own auth guard first.
 */

import {
  getProcureGuardCountryScopeCountries,
  normalizeProcureGuardCountry,
  roleRequiresProcureGuardCountryScope,
} from '@/lib/procureGuard-utils';
import type { ProcureGuardActor, ProcureGuardReviewGrant } from '@/types/procureGuard';

/** The scope fields of a request that a review grant is matched against. */
export interface ProcureGuardRequestScope {
  country?: string | null;
  segment?: string | null;
}

/** The requester-side fields of a request: its owner plus anyone granted per-request view access. */
export interface ProcureGuardRequesterSideScope {
  requested_by_email?: string | null;
  requester_notification_emails?: string[] | null;
}

export type ProcureGuardViewableRequest = ProcureGuardRequestScope & ProcureGuardRequesterSideScope;

export function normaliseScopeValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    ksa: 'saudi arabia (ksa)',
    'saudi arabia': 'saudi arabia (ksa)',
    uae: 'united arab emirates (uae)',
    'united arab emirates': 'united arab emirates (uae)',
  };
  return aliases[trimmed] ?? trimmed;
}

/** The per-request viewer list (a TEXT[] column), lowercased. Anything else is treated as empty. */
export function requesterNotificationEmailsOf(request: ProcureGuardRequesterSideScope): string[] {
  return Array.isArray(request.requester_notification_emails)
    ? request.requester_notification_emails
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean)
    : [];
}

/** The scopes an actor may review within: their own (only if they can review) plus any delegation. */
export function actorReviewGrants(actor: ProcureGuardActor): ProcureGuardReviewGrant[] {
  if (actor.reviewGrants) return actor.reviewGrants;
  // Backward-compatible fallback for actors built without delegation resolution.
  return actor.permissions.canViewAll
    ? [
        {
          source: 'self',
          fromEmail: actor.email,
          fromName: actor.name,
          role: actor.role,
          country: actor.country ?? null,
          segment: actor.segment ?? null,
          isAdmin: actor.role === 'Admin',
        },
      ]
    : [];
}

/**
 * Does this one review grant cover this request's country/segment?
 *
 * The country side goes through `getProcureGuardCountryScopeCountries`, which SPLITS a multi-country
 * scope — `'EOS, Chad, Congo'` (a live Country Controller row) or `'Bahrain, Saudi Arabia (KSA)'` —
 * into its members. Comparing the whole scope string through `normalizeProcureGuardCountry` instead
 * collapses any multi-country scope to the literal `'Other'`, which matches nothing.
 *
 * An empty country scope means "every country", but only for roles that are not country-scoped:
 * a Country Controller / SCM Manager with no country recorded covers nothing at all.
 */
export function grantCoversRequest(
  grant: ProcureGuardReviewGrant,
  request: ProcureGuardRequestScope,
): boolean {
  if (grant.isAdmin) return true;
  if (roleRequiresProcureGuardCountryScope(grant.role) && !grant.country) return false;
  const scopedCountries = getProcureGuardCountryScopeCountries(grant.country);
  const requestCountry = normalizeProcureGuardCountry(request.country);
  const countryOk =
    scopedCountries.length === 0 ||
    (requestCountry ? scopedCountries.includes(requestCountry) : false);
  const segmentOk =
    !grant.segment || normaliseScopeValue(grant.segment) === normaliseScopeValue(request.segment);
  return countryOk && segmentOk;
}

/** True if any review grant (own or delegated) covers this request's scope. */
export function actorCanAccessRequestScope(
  actor: ProcureGuardActor,
  request: ProcureGuardRequestScope,
): boolean {
  return actorReviewGrants(actor).some((grant) => grantCoversRequest(grant, request));
}

/** True if the actor raised this request or was granted per-request view access to it. */
export function actorCanAccessRequesterSideRequest(
  actor: ProcureGuardActor,
  request: ProcureGuardRequesterSideScope,
): boolean {
  const actorEmail = actor.email.toLowerCase();
  return (
    request.requested_by_email?.toLowerCase() === actorEmail ||
    requesterNotificationEmailsOf(request).includes(actorEmail)
  );
}

/**
 * THE view predicate. Used by the request lists (via `scopedRequestWhere`), the detail page, the
 * attachment upload/delete actions and the document download route. Visibility only — approving,
 * uploading and deleting each add their own extra requirements on top of it.
 */
export function canActorViewRequest(
  actor: ProcureGuardActor,
  request: ProcureGuardViewableRequest,
): boolean {
  return (
    actorCanAccessRequesterSideRequest(actor, request) || actorCanAccessRequestScope(actor, request)
  );
}

/**
 * The SQL form of `canActorViewRequest`, for list/dashboard queries that cannot run the predicate
 * per row. `ownClause` is `actorCanAccessRequesterSideRequest`; each grant clause is
 * `grantCoversRequest`. An empty `where` means "no restriction" (a full-scope grant).
 */
export function scopedRequestWhere(actor: ProcureGuardActor): { where: string; params: string[] } {
  const email = actor.email.toLowerCase();
  const ownClause =
    '(LOWER(requested_by_email) = ? OR ? = ANY(COALESCE(requester_notification_emails, ARRAY[]::TEXT[])))';
  const grants = actorReviewGrants(actor);

  // Everyone can always see their own requests.
  if (grants.length === 0) {
    return { where: `WHERE ${ownClause}`, params: [email, email] };
  }

  const clauses = [ownClause];
  const params: string[] = [email, email];
  for (const grant of grants) {
    if (
      grant.isAdmin ||
      (!roleRequiresProcureGuardCountryScope(grant.role) && !grant.country && !grant.segment)
    ) {
      // A full-scope grant (admin or unscoped reviewer) can see everything.
      return { where: '', params: [] };
    }
    if (roleRequiresProcureGuardCountryScope(grant.role) && !grant.country) continue;
    const parts: string[] = [];
    const scopedCountries = getProcureGuardCountryScopeCountries(grant.country);
    if (scopedCountries.length > 0) {
      parts.push(`country IN (${scopedCountries.map(() => '?').join(', ')})`);
      params.push(...scopedCountries);
    }
    if (grant.segment) {
      parts.push('segment = ?');
      params.push(grant.segment);
    }
    if (parts.length === 0) continue;
    clauses.push(`(${parts.join(' AND ')})`);
  }
  return { where: `WHERE (${clauses.join(' OR ')})`, params };
}
