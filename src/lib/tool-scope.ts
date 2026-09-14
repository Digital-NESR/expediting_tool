import type { Session } from 'next-auth';
import { isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { TITE_VIEW_ALL_COUNTRIES } from '@/lib/tite-constants';

/**
 * ONE definition of "what may this user do in this tool".
 *
 * Admin and view-only used to be re-derived in four places per tool — the JWT
 * callback, the tool's layout, its server pages and its actions — and they had
 * drifted apart. Concretely, before this existed:
 *
 *   - the SourceGuide layout called a user view-only when `approvedCountries`
 *     was EMPTY, while `getSgUser()` called them view-only only when the list
 *     contained the 'All Countries - View Only' sentinel. An approved SourceGuide
 *     user with no champion countries was therefore read-only in the UI and
 *     write-capable in the actions;
 *   - the TI-TE layout and every TI-TE page parsed `ADMIN_EMAILS` inline with
 *     their own `split(',').map(trim).toLowerCase()`, ignoring
 *     `SOURCEGUIDE_ADMIN_EMAILS`-style per-tool lists and the `isAdmin` flag the
 *     JWT already carries.
 *
 * Everything now goes through {@link getToolScope}, which is a pure function of
 * the session — no database, no I/O — so an auth guard can run before anything
 * takes a connection.
 *
 * NOTE the two tools define `viewOnly` differently, ON PURPOSE:
 *
 *   - TI-TE: view-only is an explicit grant. A user is scoped to the countries
 *     they were approved for; the sentinel widens READS to every country. An
 *     approved TI-TE user with an empty country list must NOT be view-only —
 *     that would silently promote "approved for nothing" into "reads
 *     everything".
 *   - SourceGuide: every approved user reads everything already; champions are
 *     the ones who additionally get edit rights on their countries. So an empty
 *     country list there means "no edit rights", which IS view-only.
 */

export type ToolName = 'sourceguide' | 'tite';

export type ToolAccessStatus =
  | 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';

export interface ToolScope {
  /** Always lowercase. The canonical identity for reads and writes. */
  email: string;
  name: string;
  /** Tool admin: ADMIN_EMAILS, plus the tool's own env list, plus the JWT flag. */
  isAdmin: boolean;
  /** The tool's access-request status carried on the session. */
  status: ToolAccessStatus;
  /** Countries approved on the request. Empty for admins. */
  approvedCountries: string[];
  /** Reads everything, writes nothing. */
  viewOnly: boolean;
  /** May the user read this tool at all? */
  approved: boolean;
  /** May the user WRITE rows belonging to `country`? */
  canEdit(country?: string | null): boolean;
}

/**
 * Each tool's own extra admin list, on top of the platform-wide `ADMIN_EMAILS`
 * that `isToolAdminEmail` always includes. Read per call rather than captured at
 * module load, so a value injected after import is still picked up.
 */
function toolAdminEnv(tool: ToolName): string | undefined {
  return tool === 'sourceguide'
    ? process.env.SOURCEGUIDE_ADMIN_EMAILS
    : process.env.TITE_ADMIN_EMAILS;
}

function eq(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Resolve the caller's scope for one tool from their session.
 *
 * Pure and synchronous: callers must have the session already, so this can be
 * evaluated before any database connection is taken.
 */
export function getToolScope(session: Session | null | undefined, tool: ToolName): ToolScope {
  const email = normalizeEmail(session?.user?.email);
  const name  = session?.user?.name ?? email;

  const isAdmin =
    !!email &&
    (isToolAdminEmail(email, toolAdminEnv(tool)) || session?.user?.isAdmin === true);

  const entry  = session?.user?.toolAccess?.[tool];
  const status = (entry?.status ?? 'new') as ToolAccessStatus;
  const approvedCountries = entry?.approvedCountries ?? [];

  const hasSentinel = approvedCountries.includes(TITE_VIEW_ALL_COUNTRIES);

  const viewOnly =
    !isAdmin &&
    (tool === 'tite'
      // Also honour the dedicated JWT field, so a cookie predating it is still
      // enforced without forcing a re-login.
      ? (session?.user?.titeViewOnly === true || hasSentinel)
      // SourceGuide: an approved non-champion has no countries and edits nothing.
      : (hasSentinel || approvedCountries.length === 0));

  const approved = isAdmin || status === 'approved';

  return {
    email,
    name,
    isAdmin,
    status,
    approvedCountries,
    viewOnly,
    approved,
    canEdit(country?: string | null): boolean {
      if (!approved) return false;
      if (isAdmin) return true;
      if (viewOnly) return false;
      const c = (country ?? '').trim();
      if (!c) return false;
      return approvedCountries.some(a => eq(a, c));
    },
  };
}

/**
 * The country list a READ should be scoped to, or `null` for "no restriction".
 * Admins and view-only users read every country.
 */
export function toolReadScope(scope: ToolScope): string[] | null {
  if (scope.isAdmin || scope.viewOnly) return null;
  return scope.approvedCountries;
}
