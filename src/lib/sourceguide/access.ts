/* ─── Who is asking and what they may do. Reader, admin and editor are decided here, once, so a
   layout and an action cannot disagree about the same person. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { authOptions } from '@/lib/auth';
import { AccessError, normalizeEmail, withAccessFallback } from '@/lib/require-access';
import { getToolScope } from '@/lib/tool-scope';
import type { ToolAccessStatus } from '@/lib/tool-scope';
import type { AccessStatus } from '@/types/access';
import { getServerSession } from 'next-auth';
import { logSafe } from '@/lib/sourceguide/activity';
import { log } from '@/lib/sourceguide/internals';

export interface SgUser {
  email: string;
  name: string;
  isAdmin: boolean;
  /** SourceGuide access status from the session ('approved' = champion or approved user). */
  status: ToolAccessStatus;
  approvedCountries: string[];
  viewOnly: boolean;
}

export async function getSgUser(): Promise<SgUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !normalizeEmail(session.user.email)) return null;

  /* Admin list and view-only come from the one shared definition (`getToolScope`),
     which the SourceGuide layout also consumes. They previously disagreed: the
     layout treated an empty champion-country list as view-only, this function only
     the 'All Countries - View Only' sentinel. The guards and status strings below
     are unchanged — this reads the scope, it does not reinterpret it. */
  const scope = getToolScope(session, 'sourceguide');

  return {
    email: scope.email,
    name: scope.name,
    isAdmin: scope.isAdmin,
    status: scope.status,
    approvedCountries: scope.approvedCountries,
    viewOnly: scope.viewOnly,
  };
}

/* ─── access guards ──────────────────────────────────────────────
 * Every export in this file is a public POST endpoint: any signed-in
 * employee can invoke it directly, so the UI access overlay is not a
 * security control. Reads must be gated here.                        */

/** Approved SourceGuide access (approved user or champion) or an admin. Throws {@link AccessError}. */
export async function requireSgReader(): Promise<SgUser> {
  const user = await getSgUser();
  if (!user) throw new AccessError('Sign in required.', 401);
  if (!user.isAdmin && user.status !== 'approved')
    throw new AccessError('SourceGuide access required.');
  return user;
}

/** SourceGuide admin (ADMIN_EMAILS + SOURCEGUIDE_ADMIN_EMAILS). Throws {@link AccessError}. */
export async function requireSgAdmin(): Promise<SgUser> {
  const user = await getSgUser();
  if (!user) throw new AccessError('Sign in required.', 401);
  if (!user.isAdmin) throw new AccessError('Admins only.');
  return user;
}

/**
 * Read gate for actions a server page renders. The SourceGuide layout shows the
 * access overlay for a pending/rejected user while the page body renders in
 * parallel, so a denied read must degrade to an empty result rather than throw —
 * otherwise the overlay the user is supposed to see never reaches them.
 */
export async function canRead(): Promise<boolean> {
  return withAccessFallback(async () => {
    await requireSgReader();
    return true;
  }, false);
}

/** Same, for the admin-only reads (analytics, audit, access requests). */
export async function canReadAdmin(): Promise<boolean> {
  return withAccessFallback(async () => {
    await requireSgAdmin();
    return true;
  }, false);
}

/**
 * {@link canRead} that hands back the user it already resolved. Read paths that
 * also write a usage log used to resolve the session twice (once to decide
 * access, once inside `logUsage`); they now resolve it once and pass it down.
 * Same gate, same fallback — `null` means "denied", exactly as `false` did.
 */
export async function readUser(): Promise<SgUser | null> {
  return withAccessFallback<SgUser | null>(async () => requireSgReader(), null);
}

/* ─── mutations (audit-logged) ───────────────────────────────── */

export async function canEdit(user: SgUser, country: string): Promise<boolean> {
  if (user.isAdmin) return true;
  if (user.viewOnly) return false;
  return user.approvedCountries.includes(country);
}

export async function denyAccess(
  userEmail: string,
  action: 'Access denied' | 'Access revoked',
  status: Extract<AccessStatus, 'Rejected' | 'Revoked'>,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    await sourceGuidePool.query(
      `UPDATE access_requests SET status=$3, approved_countries='{}', reviewed_at=NOW(), reviewed_by=$2 WHERE LOWER(user_email)=$1`,
      [normalizeEmail(userEmail), user.name, status],
    );
    await logSafe(null, null, action, userEmail, user.name, user.email);
    return { success: true };
  } catch (err) {
    log.error('accessDecision.failed', err, { action });
    return { success: false, error: 'Action failed.' };
  }
}
