/* ─── Who is asking, and what the approver matrix says they may do.

   `getActor` is memoised per request with React `cache()`; it was being resolved twice per page
   before that, at four round trips each. ─── */

import { getProcureGuardUser } from '@/lib/auth';
import { asSerialised } from '@/lib/db/sql';
import { bestAccessView, getPermissionProfile } from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import { isToolAdminEmail } from '@/lib/require-access';
import type {
  LaptopActor,
  LaptopPermissionProfile,
  LaptopPermissionRole,
  LaptopPermissionRow,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { cache } from 'react';
import { normaliseScopeValue } from '@/lib/laptop-procurement/access';
import { sql } from '@/lib/laptop-procurement/db';
import { resolveLaptopDelegations } from '@/lib/laptop-procurement/delegation';
import { ensureLaptopApproverMatrixColumns } from '@/lib/laptop-procurement/schema';

const log = logger('laptop-procurement');

// Combined list (platform ADMIN_EMAILS + LAPTOP_PROCUREMENT_ADMIN_EMAILS), used ONLY by
// requireAdminActor()'s bypass below and by the "don't delete this row" guards further
// down — i.e. it only ever affects the /admin console's Laptop Procurement admin pages,
// never the actor's own role on the main /laptop-procurement app (see
// laptopProcurementAdminEmails for that).
export function isLaptopConsoleAdminEmail(email: string | null | undefined): boolean {
  return isToolAdminEmail(email, process.env.LAPTOP_PROCUREMENT_ADMIN_EMAILS);
}

// Deliberately narrower than isLaptopConsoleAdminEmail(): the shared, platform-wide ADMIN_EMAILS
// list only ever grants the outer /admin shell and its console pages (see
// requireAdminActor) — by itself it must never make someone an Admin on the actual
// /laptop-procurement app. Only this app's own dedicated env var can bootstrap a
// laptop-procurement Admin there when no laptop_permissions row exists yet; real
// admins should get an explicit row instead of leaning on either env var.
export function laptopProcurementAdminEmails(): string[] {
  return (process.env.LAPTOP_PROCUREMENT_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getPermissionRowForEmail(email: string): Promise<LaptopPermissionRow | null> {
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_permissions WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ? asSerialised<LaptopPermissionRow>(rows[0]) : null;
  } catch (err) {
    log.error('getPermissionRowForEmail.failed', err);
    return null;
  }
}

// laptop_approver_matrix is the sole source of IT Manager / Country Manager / IT
// Director / Supply Chain Director approval authority — laptop_permissions no longer
// grants it (see buildEffectivePermissions). This lets one person hold several of
// those stages across different countries, which a single role+country permission row
// could never express — e.g. Country Manager for one country and Supply Chain
// Director broadly.
export const APPROVAL_STAGES: LaptopApprovalStage[] = [
  'IT Manager',
  'Country Manager',
  'IT Director',
  'Supply Chain Director',
];

export function emptyMatrixCapabilities(): Record<LaptopApprovalStage, string[]> {
  return {
    'IT Manager': [],
    'Country Manager': [],
    'IT Director': [],
    'Supply Chain Director': [],
  };
}

export async function getApproverMatrixCapabilities(
  email: string,
): Promise<Record<LaptopApprovalStage, string[]>> {
  const capabilities = emptyMatrixCapabilities();
  const target = email.trim().toLowerCase();
  if (!target) return capabilities;
  try {
    await ensureLaptopApproverMatrixColumns();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_approver_matrix WHERE is_active = TRUE`,
    );
    const add = (stage: LaptopApprovalStage, matrixEmail: unknown, country: string) => {
      if (
        String(matrixEmail ?? '')
          .trim()
          .toLowerCase() !== target
      )
        return;
      capabilities[stage].push(country);
    };
    for (const row of rows) {
      const country = String(row.country ?? '').trim();
      if (!country) continue;
      add('IT Manager', row.it_manager_email, country);
      add('IT Manager', row.it_manager_2_email, country);
      add('IT Manager', row.it_manager_3_email, country);
      add('Country Manager', row.cm_email, country);
      add('IT Director', row.itd_email, country);
      add('Supply Chain Director', row.scd_email, country);
    }
  } catch (err) {
    log.error('getApproverMatrixCapabilities.failed', err);
  }
  return capabilities;
}

// The single lookup for "the active approver-matrix row covering this country".
//
// Authorization resolves matrix countries case/whitespace-insensitively (see
// getApproverMatrixCapabilities + normaliseScopeValue), so the routing side has to match
// on exactly the same terms. While these compared with `country = ?`, a matrix row whose
// country differed only by casing or padding let its reviewer act on a request while
// nobody was notified and the "Assigned Approvers" panel showed nobody — the approval
// silently went nowhere.
export async function getActiveApproverMatrixForCountry(
  country: string | null | undefined,
): Promise<QueryResultRow | undefined> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT * FROM laptop_approver_matrix WHERE LOWER(TRIM(country)) = LOWER(TRIM(?)) AND is_active = TRUE LIMIT 1`,
    [country ?? null],
  );
  return rows[0];
}

// Every country already on the matrix. Passed to resolveLaptopMatrixCountry on write so
// legacy spellings (EOS / Jordan / Malaysia) stay editable and a case variant lands on
// the row that already exists instead of creating a second one beside it.
export async function existingMatrixCountries(): Promise<string[]> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT DISTINCT country FROM laptop_approver_matrix WHERE country IS NOT NULL`,
  );
  return rows.map((r) => String(r.country)).filter((c) => c.trim());
}

export function unknownMatrixCountryError(countries: string[]): string {
  const subject =
    countries.length === 1
      ? `"${countries[0]}" is not`
      : `${countries.map((c) => `"${c}"`).join(', ')} are not`;
  return `${subject} a recognised country. Pick one of the standard countries — an approver saved under a spelling nothing else matches is never notified and never shows up on a request.`;
}

export function hasAnyMatrixCapability(
  capabilities: Record<LaptopApprovalStage, string[]>,
): boolean {
  return APPROVAL_STAGES.some((stage) => capabilities[stage].length > 0);
}

// Admin bypasses everything (unchanged); everyone else's view-all/reject/per-stage
// review rights are derived purely from approver-matrix presence, ignoring any IT
// Manager/Country Manager/IT Director/Supply Chain Director role a laptop_permissions
// row might still carry.
export function buildEffectivePermissions(
  baseRole: LaptopPermissionRole,
  capabilities: Record<LaptopApprovalStage, string[]>,
  // In the platform-wide ADMIN_EMAILS list. Those people can always open /admin, and
  // the Laptop Procurement console there links straight into request details on the
  // main app — so without a read grant here every one of those links 404s. Deliberately
  // additive and read-only: it adds unscoped visibility on top of whatever role they
  // already have, and never any review/reject/manage capability. Becoming a real Admin
  // on the app still needs LAPTOP_PROCUREMENT_ADMIN_EMAILS or an explicit permissions row.
  platformConsoleAdmin = false,
): LaptopPermissionProfile {
  const base = getPermissionProfile(baseRole);
  const isAdmin = baseRole === 'Admin';
  // Viewer is read-only oversight: sees everything Admin sees, but never gets any of
  // the review/reject capabilities below (those stay gated on isAdmin/hasCapability only).
  const isViewer = baseRole === 'Viewer';
  const hasCapability = hasAnyMatrixCapability(capabilities);
  return {
    ...base,
    canViewAll: isAdmin || isViewer || platformConsoleAdmin || hasCapability,
    canViewEveryCountry: isAdmin || isViewer || platformConsoleAdmin,
    canReject: isAdmin || hasCapability,
    canReviewItManager: isAdmin || capabilities['IT Manager'].length > 0,
    canReviewCountryManager: isAdmin || capabilities['Country Manager'].length > 0,
    canReviewItDirector: isAdmin || capabilities['IT Director'].length > 0,
    canReviewScmDirector: isAdmin || capabilities['Supply Chain Director'].length > 0,
    accessView: isAdmin ? 'admin' : isViewer ? 'viewer' : hasCapability ? 'reviewer' : 'requester',
  };
}

export function stageHasCountry(
  capabilities: Record<LaptopApprovalStage, string[]> | undefined,
  stage: LaptopApprovalStage,
  country: string | null | undefined,
): boolean {
  const countries = capabilities?.[stage] ?? [];
  if (!countries.length) return false;
  const target = normaliseScopeValue(country);
  return countries.some((c) => normaliseScopeValue(c) === target);
}

export function anyMatrixCapabilityForCountry(
  capabilities: Record<LaptopApprovalStage, string[]> | undefined,
  country: string | null | undefined,
): boolean {
  if (!capabilities) return false;
  return APPROVAL_STAGES.some((stage) => stageHasCountry(capabilities, stage, country));
}

export function allMatrixCountries(
  capabilities: Record<LaptopApprovalStage, string[]> | undefined,
): string[] {
  if (!capabilities) return [];
  return [...new Set(APPROVAL_STAGES.flatMap((stage) => capabilities[stage]))];
}

// Wrapped in React's cache() so the several calls a single request makes all collapse
// onto one resolution. A page render hit it at least twice (the page's own data loader
// and the shell's getLaptopActor), and each hit was four sequential round trips to a
// remote Postgres.
//
// Safe to memoise: cache() is scoped to one request, and nothing within a request can
// legitimately change the answer. The actor is derived purely from the signed-in
// identity plus laptop_permissions / laptop_approver_matrix / laptop_delegations, and
// every action that writes those resolves its actor up front, before the write, and
// never re-reads it afterwards — so no caller can observe a stale value. (Outside a
// request scope React's cache simply doesn't memoise, so behaviour is unchanged there
// too.)
export const getActor = cache(async (): Promise<LaptopActor> => {
  const user = await getProcureGuardUser();
  const email = user?.email ?? '';
  if (!email) throw new Error('You must be signed in to use Laptop Procurement.');

  // Independent of one another — all three only need `email` — so they go together
  // instead of one after the next.
  const [permissionRow, matrixCapabilities, delegatedFrom] = await Promise.all([
    getPermissionRowForEmail(email),
    getApproverMatrixCapabilities(email),
    resolveLaptopDelegations(email),
  ]);
  const fallbackRole: LaptopPermissionRole = laptopProcurementAdminEmails().includes(
    email.toLowerCase(),
  )
    ? 'Admin'
    : 'Requester';
  const baseRole = (permissionRow?.role ?? fallbackRole) as LaptopPermissionRole;
  // Applied even when an explicit permissions row exists, so a platform admin who also
  // holds a Requester row keeps that row's abilities and still isn't 404'd out of the
  // request details the /admin console links them to.
  const permissions = buildEffectivePermissions(
    baseRole,
    matrixCapabilities,
    isLaptopConsoleAdminEmail(email),
  );
  // Whole-page gates (Admin Panel, Analytics, Reviewer Queue) use the best access
  // tier across the actor's own role and every role they hold via delegation, so a
  // delegate can actually reach those pages — not just act on individual requests,
  // which already account for delegation separately via `delegatedFrom`.
  const effectiveAccessView = bestAccessView([
    permissions.accessView,
    ...delegatedFrom.map((d) => d.permissions.accessView),
  ]);

  return {
    email,
    name: permissionRow?.name ?? user?.name ?? email,
    department: user?.department ?? null,
    jobTitle: user?.jobTitle ?? null,
    isAdmin: permissions.role === 'Admin',
    role: permissions.role,
    permissions,
    matrixCapabilities,
    delegatedFrom,
    effectiveAccessView,
  };
});
