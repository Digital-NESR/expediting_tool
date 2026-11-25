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
  | 'register'
  | 'reports'
  | 'recurrent'
  | 'help';

/** What a page asks of the reader in the country being shown. */
export type RrsmNeed = 'any' | 'validate' | 'buy';

export interface RrsmNavItem {
  id: RrsmNavId;
  path: string;
  label: string;
  /** Section heading the item sits under in the sidebar. */
  group: 'overview' | 'cycle' | 'records' | 'recurrent' | 'support';
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
    label: 'Supplier validation',
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
  {
    id: 'register',
    path: '/rrsm/register',
    label: 'Service Registry',
    group: 'records',
    needs: 'any',
  },
  /* What the country is getting, by supplier and by category, for a month or on hire now. */
  { id: 'reports', path: '/rrsm/reports', label: 'Reports', group: 'records', needs: 'buy' },
  /* Annual contracts, subscriptions and AMCs: renewed, not billed monthly. Its own module. */
  {
    id: 'recurrent',
    path: '/rrsm/recurrent',
    label: 'Recurrent services',
    group: 'recurrent',
    needs: 'any',
  },
  { id: 'help', path: '/rrsm/help', label: 'Help & Training', group: 'support', needs: 'any' },
];

export const RRSM_NAV_GROUP_LABEL: Record<RrsmNavItem['group'], string> = {
  overview: '',
  cycle: 'This month',
  records: 'Records',
  recurrent: 'Recurrent services',
  support: '',
};

export interface RrsmRoles {
  canBuy: boolean;
  canValidate: boolean;
  /** Admins see every page regardless of role. */
  isAdmin?: boolean;
}

/** What a country runs (Admin -> RRSM). Defaults are how every country worked before. */
export interface RrsmCountrySteps {
  supplier: boolean;
  ops: boolean;
  rentals?: boolean;
  recurrent?: boolean;
}

/** The pages that belong to the monthly rentals module. */
const RENTAL_PAGES: RrsmNavId[] = ['suppliers', 'validation', 'purchasing', 'register', 'reports'];

/** True when this reader may open a page that asks `need` of them. */
export function meetsNeed(need: RrsmNeed, roles: RrsmRoles): boolean {
  if (need === 'validate') return roles.canValidate;
  if (need === 'buy') return roles.canBuy;
  return true;
}

/** The items this reader should see, in sidebar order. */
/**
 * The pages this reader sees. A country that does not run a validation step (set per country in
 * Admin -> RRSM) does not show that step's page at all.
 */
export function visibleNav(
  roles: RrsmRoles,
  steps: RrsmCountrySteps = { supplier: true, ops: true },
): RrsmNavItem[] {
  const rentals = steps.rentals ?? true;
  const recurrent = steps.recurrent ?? false;
  /* Somebody who is neither buyer, validator nor admin here is a requester (or a bare viewer):
     the rentals pages have nothing for them to do. */
  const onlyRequester = !roles.canBuy && !roles.canValidate && !roles.isAdmin;
  /* An Ops validator holds no country: a buyer sent them some lines, and those lines (on Ops
     validation) are all they see (user decision, 24 Nov 2026). */
  const onlyValidator = roles.canValidate && !roles.canBuy && !roles.isAdmin;
  return RRSM_NAV.filter((item) => {
    if (onlyValidator && item.id !== 'validation' && item.id !== 'help') return false;
    if (!meetsNeed(item.needs, roles)) return false;
    if (item.id === 'suppliers' && !steps.supplier) return false;
    if (item.id === 'validation' && !steps.ops) return false;
    if (RENTAL_PAGES.includes(item.id) && (!rentals || onlyRequester)) return false;
    /* The dashboard serves whichever module runs: rentals, or recurrent services alone. A
       requester has none; they land on their own services. */
    if (item.id === 'dashboard' && ((!rentals && !recurrent) || onlyRequester)) return false;
    if (item.id === 'recurrent' && !recurrent) return false;
    return true;
  });
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
      /* The rental Renewals page was removed (25 Nov 2026); old reminder links land on the
         dashboard. */
      return '/rrsm';
    default:
      return null;
  }
}
