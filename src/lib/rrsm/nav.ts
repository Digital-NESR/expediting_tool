/**
 * RRSM's pages, and who sees which.
 *
 * One list read by the sidebar, the dashboard's links and the old `?view=` redirect, so a page
 * cannot be added to one of them and forgotten in another. Plain module rather than part of the
 * sidebar component so the rules can be tested without rendering anything.
 */

export type RrsmNavId =
  | 'dashboard'
  | 'validation'
  | 'purchasing'
  | 'suppliers'
  | 'renewals'
  | 'register'
  | 'history'
  | 'help';

/** What a page asks of the reader in the country being shown. */
export type RrsmNeed = 'any' | 'validate' | 'buy';

export interface RrsmNavItem {
  id: RrsmNavId;
  path: string;
  label: string;
  /** Section heading the item sits under in the sidebar. */
  group: 'overview' | 'cycle' | 'records' | 'support';
  needs: RrsmNeed;
}

export const RRSM_NAV: readonly RrsmNavItem[] = [
  { id: 'dashboard', path: '/rrsm', label: 'Dashboard', group: 'overview', needs: 'any' },
  /* Listed in the order the month runs, so the sidebar reads as the process. */
  /* Buyers send the invitations (and choose which documents each supplier must upload); Ops see
     where each supplier has got to, since their validation waits on it. */
  {
    id: 'suppliers',
    path: '/rrsm/suppliers',
    label: 'Supplier invitations',
    group: 'cycle',
    needs: 'any',
  },
  {
    id: 'validation',
    path: '/rrsm/validation',
    label: 'Ops validation',
    group: 'cycle',
    needs: 'validate',
  },
  { id: 'purchasing', path: '/rrsm/purchasing', label: 'PR & PO', group: 'cycle', needs: 'buy' },
  /* Visible to both roles: a validator should see what is running out even though only a buyer
     may commit to another year of it. */
  { id: 'renewals', path: '/rrsm/renewals', label: 'Renewals', group: 'records', needs: 'any' },
  {
    id: 'register',
    path: '/rrsm/register',
    label: 'Service register',
    group: 'records',
    needs: 'any',
  },
  { id: 'history', path: '/rrsm/history', label: 'Cycle history', group: 'records', needs: 'any' },
  { id: 'help', path: '/rrsm/help', label: 'Help & Training', group: 'support', needs: 'any' },
];

export const RRSM_NAV_GROUP_LABEL: Record<RrsmNavItem['group'], string> = {
  overview: '',
  cycle: 'This month',
  records: 'Records',
  support: '',
};

export interface RrsmRoles {
  canBuy: boolean;
  canValidate: boolean;
}

/** True when this reader may open a page that asks `need` of them. */
export function meetsNeed(need: RrsmNeed, roles: RrsmRoles): boolean {
  if (need === 'validate') return roles.canValidate;
  if (need === 'buy') return roles.canBuy;
  return true;
}

/** The items this reader should see, in sidebar order. */
export function visibleNav(roles: RrsmRoles): RrsmNavItem[] {
  return RRSM_NAV.filter((item) => meetsNeed(item.needs, roles));
}

/**
 * A page's href, carrying the country being shown.
 *
 * The country rides in the URL rather than in a cookie so that a link copied out of the browser
 * opens on the same country for whoever it is pasted to, and so an admin can hold two countries
 * open in two tabs without one quietly switching the other.
 */
export function rrsmHref(path: string, country?: string | null): string {
  const code = String(country ?? '').trim();
  return code ? `${path}?country=${encodeURIComponent(code)}` : path;
}

/** Which item a pathname belongs to. The dashboard matches only itself, not every RRSM page. */
export function activeNavId(pathname: string): RrsmNavId | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/rrsm') return 'dashboard';
  const hit = RRSM_NAV.find(
    (item) => item.id !== 'dashboard' && (clean === item.path || clean.startsWith(item.path + '/')),
  );
  return hit?.id ?? null;
}

/**
 * Where an old `/rrsm?view=` link should now go.
 *
 * Renewal reminder emails already sent carry `?view=renew`, and they will keep being clicked for
 * weeks after this ships. Null means the view was absent or unrecognised, so the dashboard stands.
 */
export function legacyViewPath(view?: string | null): string | null {
  switch (String(view ?? '').trim()) {
    case 'ops':
      return '/rrsm/validation';
    case 'buyer':
      return '/rrsm/purchasing';
    case 'invite':
      return '/rrsm/suppliers';
    case 'renew':
      return '/rrsm/renewals';
    default:
      return null;
  }
}
