/* ─── The access predicates: what this actor may see, what they may act on, and the SQL scope that
   narrows every list query to it. Nothing here is an endpoint, which is the point — these used
   to sit in a 'use server' file where `scopedWhere` and `resolveLaptopActing` were one export
   keyword away from being callable over the network. ─── */

import {
  canUseLaptopAdmin,
  canUseLaptopAnalytics,
  canUseLaptopReviewerQueue,
  getLaptopApprovalStage,
  getLaptopAvailableActions,
  laptopHasAssignedUnit,
  laptopIsProcureNewFlow,
} from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage, LaptopPermissionKey } from '@/lib/laptopProcurement-utils';
import { normalizeEmail } from '@/lib/require-access';
import type {
  LaptopActor,
  LaptopDelegationGrant,
  LaptopPermissionProfile,
  LaptopRequestStatus,
} from '@/types/laptopProcurement';
import {
  allMatrixCountries,
  buildEffectivePermissions,
  getActor,
  isLaptopConsoleAdminEmail,
  stageHasCountry,
} from '@/lib/laptop-procurement/actor';

export function normaliseScopeValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// Maps the required permission for a stage transition back to the approver-matrix
// stage it corresponds to, so resolveLaptopActing can check the acting identity's
// matrix countries for that stage — see getRequiredPermissionForStage.
export const PERMISSION_KEY_TO_STAGE: Partial<Record<LaptopPermissionKey, LaptopApprovalStage>> = {
  canReviewItManager: 'IT Manager',
  canReviewCountryManager: 'Country Manager',
  canReviewItDirector: 'IT Director',
  canReviewScmDirector: 'Supply Chain Director',
};

export function scopedWhere(actor: LaptopActor): { where: string; params: string[] } {
  const delegated = (actor.delegatedFrom ?? []).filter((d) => d.permissions.canViewAll);

  if (
    actor.permissions.canViewEveryCountry ||
    delegated.some((d) => d.permissions.canViewEveryCountry)
  ) {
    return { where: '', params: [] };
  }

  const orGroups: string[] = [];
  const params: string[] = [];

  if (actor.permissions.canViewAll) {
    const countries = allMatrixCountries(actor.matrixCapabilities);
    if (countries.length) {
      orGroups.push(`country IN (${countries.map(() => '?').join(', ')})`);
      params.push(...countries);
    }
  }
  // Always see your own submitted requests too, regardless of reviewer scope.
  orGroups.push('requested_by_email = ?');
  params.push(actor.email);

  for (const d of delegated) {
    const countries = allMatrixCountries(d.matrixCapabilities);
    if (!countries.length) continue;
    orGroups.push(`country IN (${countries.map(() => '?').join(', ')})`);
    params.push(...countries);
  }

  return { where: `WHERE ${orGroups.join(' OR ')}`, params };
}

// Identities (self + delegators) the actor can act through, each with its own
// approver-matrix capabilities.
export function laptopActingIdentities(actor: LaptopActor): LaptopDelegationGrant[] {
  return [
    {
      email: actor.email,
      name: actor.name,
      role: actor.role,
      permissions: actor.permissions,
      matrixCapabilities: actor.matrixCapabilities,
    },
    ...(actor.delegatedFrom ?? []),
  ];
}

export function getScopedActions(
  actor: LaptopActor,
  request: {
    status: LaptopRequestStatus;
    request_type?: string | null;
    country?: string | null;
    assigned_serial_no?: string | null;
    assigned_model?: string | null;
    assigned_age?: string | null;
    procure_new_requested?: boolean | null;
  },
) {
  const hasAssignedUnit = laptopHasAssignedUnit(request);
  const isProcureNewFlow = laptopIsProcureNewFlow(request);
  const requiredStage = getLaptopApprovalStage(request.status);
  const ownsCurrentStep =
    Boolean(requiredStage) &&
    laptopActingIdentities(actor).some(
      (id) =>
        id.role === 'Admin' ||
        stageHasCountry(
          id.matrixCapabilities,
          requiredStage as LaptopApprovalStage,
          request.country,
        ),
    );
  return getLaptopAvailableActions(
    ownsCurrentStep,
    request.status,
    hasAssignedUnit,
    isProcureNewFlow,
    request.request_type,
  );
}

/**
 * Decide whether the actor may perform a stage transition needing
 * `requiredPermission` (and, when rejecting, canReject) on `request` — using
 * their OWN authority first, then any delegated authority whose approver-matrix
 * capabilities cover the request's country for that stage. Returns the "on behalf
 * of" label to record.
 */
export function resolveLaptopActing(
  actor: LaptopActor,
  requiredPermission: LaptopPermissionKey,
  needsReject: boolean,
  request: { country?: string | null },
): {
  allowed: boolean;
  reason: 'permission' | 'reject' | 'scope' | null;
  onBehalfOf: string | null;
} {
  let sawPermission = false;
  let sawReject = true;
  const stage = PERMISSION_KEY_TO_STAGE[requiredPermission];
  const identities = laptopActingIdentities(actor);
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    if (!id.permissions[requiredPermission]) continue;
    sawPermission = true;
    if (needsReject && !id.permissions.canReject) {
      sawReject = false;
      continue;
    }
    const inScope =
      id.role === 'Admin' ||
      (stage ? stageHasCountry(id.matrixCapabilities, stage, request.country) : false);
    if (inScope) {
      return { allowed: true, reason: null, onBehalfOf: i === 0 ? null : id.name };
    }
  }
  if (!sawPermission) return { allowed: false, reason: 'permission', onBehalfOf: null };
  if (!sawReject) return { allowed: false, reason: 'reject', onBehalfOf: null };
  return { allowed: false, reason: 'scope', onBehalfOf: null };
}

export function requireAnalyticsAccess(actor: LaptopActor): void {
  if (!canUseLaptopAnalytics(actor.effectiveAccessView)) {
    throw new Error('Analytics access is required.');
  }
}

export function requireReviewerQueueAccess(actor: LaptopActor): void {
  if (!canUseLaptopReviewerQueue(actor.effectiveAccessView)) {
    throw new Error('Reviewer access is required.');
  }
}

/**
 * Gate for the /admin console's Laptop Procurement pages.
 *
 * A real laptop Admin (an `Admin` laptop_permissions row, or LAPTOP_PROCUREMENT_ADMIN_EMAILS
 * with no row at all — see getActor's fallback) passes through untouched, with full rights.
 *
 * Everyone else on ADMIN_EMAILS gets a READ-ONLY elevation. The old bypass handed them the
 * complete Admin profile — manage-permissions, delete-records, manage-data — on the theory
 * that these functions are "reached only through /admin". Server actions are public POST
 * endpoints, so that was never a control: being on the platform-wide admin list silently
 * made someone a full laptop Admin, contradicting laptopProcurementAdminEmails' own stated
 * policy. They keep exactly what the console needs to render (unscoped read across every
 * country) and nothing that writes; every write action re-checks its own capability flag
 * and now refuses them.
 *
 * Bootstrapping is preserved deliberately — see canBootstrapOwnLaptopPermission.
 */
export async function requireAdminActor(): Promise<LaptopActor> {
  const actor = await getActor();
  if (canUseLaptopAdmin(actor.effectiveAccessView)) return actor;
  if (!isLaptopConsoleAdminEmail(actor.email)) {
    throw new Error('Admin access is required.');
  }
  // Scoped to the actor object this call returns; it never touches what getActor() hands
  // back, so someone here only via the env var still shows up as a plain Requester on the
  // main /laptop-procurement app. Their real role and matrix-derived review rights are kept
  // as-is — this only adds console visibility, and explicitly removes every write flag.
  const permissions: LaptopPermissionProfile = {
    ...buildEffectivePermissions(actor.role, actor.matrixCapabilities, true),
    canManageData: false,
    canManagePermissions: false,
    canDeleteRecords: false,
  };
  return { ...actor, permissions, effectiveAccessView: 'admin' };
}

/**
 * The one write a read-only console admin keeps: granting a laptop_permissions row to
 * THEMSELVES, and only themselves.
 *
 * Without it, an environment whose laptop_permissions table is empty and whose
 * LAPTOP_PROCUREMENT_ADMIN_EMAILS is unset would be locked out for good — the console would
 * render, and every write, including the one that creates the first Admin row, would be
 * refused. Unlike the blanket elevation it replaces, this is explicit and leaves a row
 * behind naming who holds what, instead of applying invisibly to every admin action.
 */
export function canBootstrapOwnLaptopPermission(actor: LaptopActor, targetEmail: string): boolean {
  return (
    isLaptopConsoleAdminEmail(actor.email) &&
    normalizeEmail(targetEmail) === normalizeEmail(actor.email)
  );
}

/* ── n8n webhooks (mirrors ProcureGuard's notifier) ───────────── */
