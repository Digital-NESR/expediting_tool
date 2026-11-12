import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';

/**
 * Who may do what in RRSM, and in which countries.
 *
 * Modelled on `src/lib/soa/access.ts`, which solves the same problem for the same shape of tool,
 * and deliberately so: two tools that both scope by country should not disagree about what "my
 * country" means.
 *
 * ONE DEFINITION, used by the layout, the pages and the actions. The bug this is written against
 * is the one `tool-scope.ts` records: a permission re-derived in four places drifts apart, and
 * the half that is wrong is usually the half that grants.
 */

export type RrsmRole = 'buyer' | 'ops' | 'admin';

/**
 * Ranked so a caller can ask for "ops or better" without enumerating.
 *
 * `buyer` and `ops` are peers rather than a ladder: they do different halves of the cycle and
 * neither contains the other. Ranking them equal is what stops "ops or better" quietly admitting
 * every buyer, which is the mistake the SOA module records making with its old `manager` rung.
 */
const RANK: Record<RrsmRole, number> = { buyer: 0, ops: 0, admin: 1 };

export interface RrsmGrant {
  role: RrsmRole;
  countryCode: string;
}

export interface RrsmActor {
  email: string;
  /** A platform admin, or an address in RRSM_ADMIN_EMAILS. Admins are not country-scoped. */
  isAdmin: boolean;
  grants: RrsmGrant[];
}

export interface RrsmCountryOption {
  code: string;
  name: string;
  currency: string;
  flag: string | null;
  live: boolean;
}

/**
 * The countries an actor may act on at `role` or better.
 *
 * `'all'` rather than a list of every code, because the two mean different things: an admin keeps
 * spanning every country when a twentieth is added, and a list quietly would not.
 */
export function countriesFor(actor: RrsmActor, role: RrsmRole): string[] | 'all' {
  if (actor.isAdmin) return 'all';
  const relevant = actor.grants.filter((g) => RANK[g.role] >= RANK[role]);
  if (!relevant.length) return [];
  return [...new Set(relevant.map((g) => g.countryCode))];
}

/** True when the actor may act on this country at `role` or better. */
export function canAccessCountry(actor: RrsmActor, code: string, role: RrsmRole): boolean {
  const scope = countriesFor(actor, role);
  return scope === 'all' || scope.includes(code);
}

/**
 * The signed-in actor's RRSM access. Memoised per request by React `cache`, so the layout, the
 * page and the actions that each need it share one query.
 *
 * Returns null only when nobody is signed in. A signed-in employee with no grants still gets an
 * actor, with an empty list, because the screen has to tell them they have no access rather than
 * crash on the absence.
 */
export const currentRrsmActor = cache(async (): Promise<RrsmActor | null> => {
  const actor = await currentActor();
  if (!actor) return null;

  const email = normalizeEmail(actor.email);
  const isAdmin = actor.isPlatformAdmin || isToolAdminEmail(email, process.env.RRSM_ADMIN_EMAILS);

  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT role, country_code FROM rrsm_users WHERE active AND lower(email) = $1`,
    [email],
  );

  return {
    email,
    isAdmin,
    grants: rows.map((r) => ({
      role: String(r.role) as RrsmRole,
      countryCode: String(r.country_code),
    })),
  };
});

/**
 * Which country the screen is showing, and which ones the reader could switch to.
 *
 * The rule the SOA tool already uses, and the reason the two halves of the answer come back
 * together: a buyer holding one country has no choice to make and should be shown a label, while
 * an admin gets a picker. The caller renders a `<select>` when `available.length > 1` and a
 * static badge otherwise, so the decision is made once here rather than guessed at in the markup.
 *
 * An unrecognised or out-of-scope request falls back to the first country in scope rather than
 * erroring: a stale bookmark should land somewhere sensible, not on a wall.
 *
 * ONLY LIVE COUNTRIES. The rollout is phased and nineteen countries are seeded from day one, so a
 * buyer granted a country that has not been switched on sees nothing for it — which is the point
 * of the switch.
 */
export async function resolveRrsmCountry(
  actor: RrsmActor,
  requested?: string | null,
): Promise<{ countryCode: string | null; available: RrsmCountryOption[] }> {
  const scope = countriesFor(actor, 'buyer');
  if (scope !== 'all' && !scope.length) return { countryCode: null, available: [] };

  const { rows } = await rrsmPool.query<QueryResultRow>(
    scope === 'all'
      ? `SELECT code, name, currency, flag, live FROM rrsm_countries
          WHERE live ORDER BY sort_order, name`
      : `SELECT code, name, currency, flag, live FROM rrsm_countries
          WHERE live AND code = ANY($1) ORDER BY sort_order, name`,
    scope === 'all' ? [] : [scope],
  );

  const available = rows.map(toCountryOption);
  const chosen = available.find((c) => c.code === requested) ?? available[0];
  return { countryCode: chosen?.code ?? null, available };
}

export function toCountryOption(r: QueryResultRow): RrsmCountryOption {
  return {
    code: String(r.code),
    name: String(r.name),
    currency: String(r.currency),
    flag: r.flag === null || r.flag === undefined ? null : String(r.flag),
    live: Boolean(r.live),
  };
}
