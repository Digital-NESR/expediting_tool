import { getCachedSession } from '@/lib/session';
import { AccessError, normalizeEmail, isPlatformAdminEmail } from '@/lib/require-access';

/**
 * One authorization boundary for TI-TE.
 *
 * Every TI-TE server action, route handler and server page derives the caller's
 * identity and country scope from here — never from a parameter. Mirrors
 * `getSgUser()` in the SourceGuide actions, but centralised so the check is
 * written once.
 *
 *   - `requireTiteUser()` throws {@link AccessError}. Use for mutations.
 *   - `currentTiteUser()` returns null. Use for reads a server page renders,
 *     and for the pre-approval flows (access request / status lookup).
 */

/** The sentinel country that grants read-everything, write-nothing. */
export const TITE_VIEW_ALL_COUNTRIES = 'All Countries - View Only';

export type TiteAccessStatus =
  | 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';

export interface TiteUser {
  /** Always lowercase. */
  email: string;
  name: string;
  /** Platform admin (ADMIN_EMAILS). Sees and edits every country. */
  isAdmin: boolean;
  /** Countries approved on the TI-TE access request. Empty for admins. */
  approvedCountries: string[];
  /** Read-everything, write-nothing. */
  viewOnly: boolean;
  /** TI-TE access-request status carried on the session. */
  status: TiteAccessStatus;
}

/**
 * The signed-in TI-TE user, or null when there is no session. Never throws.
 * Returns the user even when their TI-TE access is not approved — callers that
 * need approval must use {@link requireTiteUser} or check {@link isTiteApproved}.
 */
export async function currentTiteUser(): Promise<TiteUser | null> {
  const session = await getCachedSession();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return null;

  const isAdmin = isPlatformAdminEmail(email) || session?.user?.isAdmin === true;
  const tite = session?.user?.toolAccess?.tite;
  const approvedCountries = tite?.approvedCountries ?? [];

  // Derive view-only from BOTH the dedicated JWT field and approvedCountries, so
  // a JWT cookie that predates the titeViewOnly field is still enforced.
  const viewOnly =
    !isAdmin &&
    (session?.user?.titeViewOnly === true || approvedCountries.includes(TITE_VIEW_ALL_COUNTRIES));

  return {
    email,
    name: session?.user?.name ?? email,
    isAdmin,
    approvedCountries,
    viewOnly,
    status: (tite?.status ?? 'new') as TiteAccessStatus,
  };
}

/** True when the user may see any TI-TE data at all. */
export function isTiteApproved(user: TiteUser | null): user is TiteUser {
  return !!user && (user.isAdmin || user.status === 'approved');
}

/**
 * A signed-in user with approved TI-TE access.
 * Throws {@link AccessError} when signed out or not approved.
 */
export async function requireTiteUser(): Promise<TiteUser> {
  const user = await currentTiteUser();
  if (!user) throw new AccessError('Sign in required.', 401);
  if (!isTiteApproved(user)) throw new AccessError('TI-TE access is not approved.');
  return user;
}

/**
 * The country list a read should be scoped to, or `null` for "no restriction".
 * Admins and view-only users read every country.
 */
export function titeReadScope(user: TiteUser): string[] | null {
  if (user.isAdmin || user.viewOnly) return null;
  return user.approvedCountries;
}

/** True when the user may READ rows belonging to `country`. */
export function canViewTiteCountry(user: TiteUser, country: string | null | undefined): boolean {
  const scope = titeReadScope(user);
  if (scope === null) return true;
  const c = (country ?? '').trim().toLowerCase();
  if (!c) return false;
  return scope.some(s => s.trim().toLowerCase() === c);
}

/**
 * True when the user may WRITE rows belonging to `country`.
 * View-only users can never write, whatever their country list says.
 */
export function canEditTiteCountry(user: TiteUser, country: string | null | undefined): boolean {
  if (user.viewOnly) return false;
  if (user.isAdmin) return true;
  const c = (country ?? '').trim().toLowerCase();
  if (!c) return false;
  return user.approvedCountries.some(s => s.trim().toLowerCase() === c);
}
