/**
 * Resolves a signed-in email into the ProcureGuard scope it acts with: its permission row, its
 * effective (delegation-merged) permission profile and its review grants.
 *
 * This exists so that every entry point resolves an actor the SAME way. The document download route
 * used to read the permission row by itself and never looked at delegations, so a delegate who could
 * open and approve a request got a 403 on its attachments. The route and `getActor()` in
 * `src/app/actions/procureGuard.ts` now both come through here.
 *
 * Not a `'use server'` export — importing it never creates a public endpoint. Callers guard first.
 */

import type { QueryResultRow } from 'pg';
import { normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { getPermissionProfile, normalizeProcureGuardCountryScope } from '@/lib/procureGuard-utils';
import { ensureProcureGuardSchema, serialise, sql } from './internals';
import type {
  ProcureGuardPermissionProfile,
  ProcureGuardPermissionRole,
  ProcureGuardPermissionRow,
  ProcureGuardReviewGrant,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export function procureGuardAdminEmails(): string[] {
  return `${process.env.ADMIN_EMAILS ?? ''},${process.env.PROCURE_GUARD_ADMIN_EMAILS ?? ''}`
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Matched case-insensitively: Azure AD can hand back a mixed-case `mail` claim while every writer
// lowercases the stored email. A case-sensitive lookup silently downgraded such an approver to
// Requester in every action.
export async function getPermissionRowForEmail(
  email: string,
): Promise<ProcureGuardPermissionRow | null> {
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_permissions WHERE LOWER(email) = ? LIMIT 1`,
      [normalizeEmail(email)],
    );
    if (!rows[0]) return null;
    const row = serialise<ProcureGuardPermissionRow>(rows[0]);
    return { ...row, country: normalizeProcureGuardCountryScope(row.country) };
  } catch (err) {
    log.error('permissionRow.lookupFailed', err, { email: normalizeEmail(email) });
    return null;
  }
}

const ACCESS_VIEW_RANK: Record<string, number> = {
  requester: 0,
  analyst: 1,
  reviewer: 2,
  admin: 3,
};

// Delegation grants the delegate the delegator's APPROVAL authority only — not data/permission/delete
// admin powers — and never elevates the UI past 'reviewer'. So an admin can hand off their approvals
// without handing over the admin panel.
function mergeApprovalAuthority(
  base: ProcureGuardPermissionProfile,
  granted: ProcureGuardPermissionProfile,
): ProcureGuardPermissionProfile {
  const grantedView = granted.accessView === 'admin' ? 'reviewer' : granted.accessView;
  const accessView =
    ACCESS_VIEW_RANK[grantedView] > ACCESS_VIEW_RANK[base.accessView]
      ? grantedView
      : base.accessView;
  return {
    ...base,
    accessView,
    canViewAll: base.canViewAll || granted.canViewAll,
    canReject: base.canReject || granted.canReject,
    canReviewAdhocScm: base.canReviewAdhocScm || granted.canReviewAdhocScm,
    canReviewAdhocDirector: base.canReviewAdhocDirector || granted.canReviewAdhocDirector,
    canReviewAdvanceCountryController:
      base.canReviewAdvanceCountryController || granted.canReviewAdvanceCountryController,
    canReviewAdvanceSupplyChainDirector:
      base.canReviewAdvanceSupplyChainDirector || granted.canReviewAdvanceSupplyChainDirector,
    canReviewAdvanceTreasuryDirector:
      base.canReviewAdvanceTreasuryDirector || granted.canReviewAdvanceTreasuryDirector,
    canReviewAdvanceCorporateController:
      base.canReviewAdvanceCorporateController || granted.canReviewAdvanceCorporateController,
    canReviewAdvanceCfo: base.canReviewAdvanceCfo || granted.canReviewAdvanceCfo,
  };
}

export interface ProcureGuardActorScope {
  email: string;
  /** The name on the permission row, if any — callers apply their own display-name fallbacks. */
  permissionName: string | null;
  role: ProcureGuardPermissionRole;
  /** Effective profile: the base role merged with any delegated approval authority. */
  permissions: ProcureGuardPermissionProfile;
  /** The base role's profile, before delegation is merged in. */
  basePermissions: ProcureGuardPermissionProfile;
  country: string | null;
  segment: string | null;
  reviewGrants: ProcureGuardReviewGrant[];
}

/**
 * Loads the permission row and every active delegation for `email`, then builds the review grants
 * that `grantCoversRequest` / `scopedRequestWhere` consume.
 *
 * `fallbackName` is used for the actor's own grant label when no permission row carries a name.
 */
export async function resolveProcureGuardActorScope(
  rawEmail: string,
  fallbackName?: string | null,
): Promise<ProcureGuardActorScope> {
  const email = normalizeEmail(rawEmail);
  const adminEmails = procureGuardAdminEmails();

  // The permission row and the user's delegations are independent — fetch them in parallel.
  await ensureProcureGuardSchema();
  const [permissionRow, delegationRows] = await Promise.all([
    getPermissionRowForEmail(email),
    sql<QueryResultRow[]>(
      `SELECT delegator_email, delegator_name FROM procure_guard_delegations
       WHERE LOWER(delegate_email) = LOWER(?) AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [email],
    ).catch((err) => {
      log.error('actorScope.delegationsFailed', err, { email });
      return [] as QueryResultRow[];
    }),
  ]);

  const fallbackRole: ProcureGuardPermissionRole = adminEmails.includes(email)
    ? 'Admin'
    : 'Requester';
  const role = (permissionRow?.role ?? fallbackRole) as ProcureGuardPermissionRole;
  const basePermissions = getPermissionProfile(role);
  const baseName = permissionRow?.name ?? fallbackName ?? email;
  const baseCountry = normalizeProcureGuardCountryScope(permissionRow?.country);
  const baseSegment = permissionRow?.segment ?? null;

  const reviewGrants: ProcureGuardReviewGrant[] = [];
  if (basePermissions.canViewAll) {
    reviewGrants.push({
      source: 'self',
      fromEmail: email,
      fromName: baseName,
      role: basePermissions.role,
      country: baseCountry,
      segment: baseSegment,
      isAdmin: basePermissions.role === 'Admin',
    });
  }

  let permissions = basePermissions;
  for (const row of delegationRows) {
    const delegatorEmail = String(row.delegator_email);
    const delegatorRow = await getPermissionRowForEmail(delegatorEmail);
    const delegatorRole = (delegatorRow?.role ??
      (adminEmails.includes(delegatorEmail.toLowerCase())
        ? 'Admin'
        : 'Requester')) as ProcureGuardPermissionRole;
    const delegatorProfile = getPermissionProfile(delegatorRole);
    if (!delegatorProfile.canViewAll) continue; // delegator had no approval authority to hand off
    permissions = mergeApprovalAuthority(permissions, delegatorProfile);
    reviewGrants.push({
      source: 'delegation',
      fromEmail: delegatorEmail,
      fromName: (row.delegator_name as string) || delegatorRow?.name || delegatorEmail,
      role: delegatorRole,
      country: normalizeProcureGuardCountryScope(delegatorRow?.country),
      segment: delegatorRow?.segment ?? null,
      isAdmin: delegatorRole === 'Admin',
    });
  }

  return {
    email,
    permissionName: permissionRow?.name ?? null,
    role: basePermissions.role,
    permissions,
    basePermissions,
    country: baseCountry,
    segment: baseSegment,
    reviewGrants,
  };
}
