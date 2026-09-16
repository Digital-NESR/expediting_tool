import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { ensureSoaSchema, sql } from './db';

/**
 * Who may do what in SOA Consolidation.
 *
 * Four roles, and they do not all come from the same place — which is the thing to understand
 * before changing anything here:
 *
 *   admin     ADMIN_EMAILS (or SOA_ADMIN_EMAILS). A property of the platform, not of this tool,
 *             so it is not in the database and cannot be requested.
 *   manager   Appointed in the matrix on /admin, the way ProcureGuard's approvers are. Sees the
 *             corporate rollup. Never self-requested.
 *   champion  Runs a country's chase: scopes vendors, sends requests, accepts statements, hands
 *             off to Finance. Requested and approved.
 *   viewer    Reads a country's progress and its evidence trail, and changes nothing. Requested
 *             and approved.
 *
 * A grant is (role, country), and `country` may be NULL, meaning every country — one grant for a
 * regional lead rather than a row per country that a newly added country would silently fall out
 * of. One person may hold several grants: champion of Saudi Arabia and viewer of Oman is a real
 * arrangement, so this module returns the whole set rather than collapsing it to a single "role"
 * that would have to lie about one of them.
 */

export type SoaRole = 'admin' | 'manager' | 'champion' | 'viewer';

/** Ranked so a caller can ask for "champion or better" without enumerating. */
const RANK: Record<SoaRole, number> = { viewer: 0, champion: 1, manager: 2, admin: 3 };

export interface SoaGrant {
  role: Exclude<SoaRole, 'admin'>;
  /** NULL means every country. */
  countryId: string | null;
}

export interface SoaActor {
  email: string;
  name: string;
  isAdmin: boolean;
  grants: SoaGrant[];
  /** Highest role held anywhere. `null` when the person has no access at all. */
  role: SoaRole | null;
  /** Their access request, when they have one and no grant yet. */
  requestStatus: 'Pending' | 'Approved' | 'Rejected' | 'Revoked' | null;
}

/** True when this actor holds `role` (or better) somewhere. */
export function holdsRole(actor: SoaActor, role: SoaRole): boolean {
  return actor.role !== null && RANK[actor.role] >= RANK[role];
}

/**
 * The countries an actor may act on at `role` or better.
 *
 * `'all'` rather than a list of every code, because the two mean different things: a grant that
 * spans every country keeps spanning it when a country is added next quarter, and a list would
 * quietly stop.
 */
export function countriesFor(actor: SoaActor, role: SoaRole): string[] | 'all' {
  if (actor.isAdmin) return 'all';
  const relevant = actor.grants.filter((g) => RANK[g.role] >= RANK[role]);
  if (!relevant.length) return [];
  if (relevant.some((g) => g.countryId === null)) return 'all';
  return [...new Set(relevant.map((g) => g.countryId as string))];
}

/** True when the actor may act on this country at `role` or better. */
export function canAccessCountry(actor: SoaActor, countryId: string, role: SoaRole): boolean {
  const scope = countriesFor(actor, role);
  return scope === 'all' || scope.includes(countryId);
}

/**
 * The signed-in actor's SOA access. Memoised per request by React `cache`, so the several server
 * components that each need it share one pair of queries.
 *
 * Returns null only when nobody is signed in. A signed-in employee with no access still gets an
 * actor — with no grants — because the layout needs to tell them how to ask for some.
 */
export const getSoaActor = cache(async (): Promise<SoaActor | null> => {
  const actor = await currentActor();
  if (!actor) return null;

  const isAdmin = isToolAdminEmail(actor.email, process.env.SOA_ADMIN_EMAILS);
  await ensureSoaSchema();

  const email = normalizeEmail(actor.email);
  const [grantRows, requestRows] = await Promise.all([
    sql<QueryResultRow[]>(`SELECT role, country_id FROM country_users WHERE LOWER(email) = ?`, [
      email,
    ]),
    sql<QueryResultRow[]>(
      `SELECT status FROM soa_access_requests WHERE LOWER(user_email) = ? LIMIT 1`,
      [email],
    ),
  ]);

  const grants: SoaGrant[] = grantRows.map((r) => ({
    role: String(r.role) as SoaGrant['role'],
    countryId: r.country_id === null ? null : String(r.country_id),
  }));

  const best = grants.reduce<SoaRole | null>(
    (acc, g) => (acc === null || RANK[g.role] > RANK[acc] ? g.role : acc),
    null,
  );

  return {
    email,
    name: actor.name,
    isAdmin,
    grants,
    role: isAdmin ? 'admin' : best,
    requestStatus: (requestRows[0]?.status as SoaActor['requestStatus']) ?? null,
  };
});

/**
 * Guard for mutations. Throws rather than returning null, so a denied call cannot fall through to
 * a write — every exported server action in this tool starts with one of these.
 */
export async function requireSoaActor(min: SoaRole = 'viewer'): Promise<SoaActor> {
  const actor = await getSoaActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (!holdsRole(actor, min)) {
    throw new AccessError(
      min === 'admin'
        ? 'Administrator access is required.'
        : `This action requires ${min} access to SOA Consolidation.`,
    );
  }
  return actor;
}

/** Guard for a mutation scoped to one country. */
export async function requireSoaCountry(
  countryId: string,
  min: SoaRole = 'champion',
): Promise<SoaActor> {
  const actor = await requireSoaActor(min);
  if (!canAccessCountry(actor, countryId, min)) {
    throw new AccessError(`You do not have ${min} access to that country.`);
  }
  return actor;
}
