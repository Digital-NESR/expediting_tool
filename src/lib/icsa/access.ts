import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { ensureIcsaSchema, sql } from './db';
import { currentDemoUser } from './demo';

/**
 * Who may do what in ICSA.
 *
 *   admin       ADMIN_EMAILS or ICSA_ADMIN_EMAILS. Opens and closes cycles, sets deadlines and
 *               the threshold, appoints champions, decides extensions, sees every country.
 *   champion    A row in icsa_champions per country. Runs that country inside a cycle.
 *   respondent  Has at least one assessment sent to them. Fills in their own forms only.
 *
 * A person can be several of these at once (a champion is often also nominated as a respondent),
 * so the actor carries each fact separately rather than collapsing them into one role.
 */
export interface IcsaActor {
  email: string;
  name: string;
  isAdmin: boolean;
  /** Countries this person champions. Empty for non-champions; admins see all regardless. */
  championCountries: string[];
  /** True when at least one form has been sent to this person. */
  isRespondent: boolean;
  /** Signed in through the ICSA demo login rather than SSO (see ./demo.ts). */
  isDemo: boolean;
}

export function hasAnyAccess(actor: IcsaActor): boolean {
  return actor.isAdmin || actor.championCountries.length > 0 || actor.isRespondent;
}

export function isChampion(actor: IcsaActor): boolean {
  return actor.championCountries.length > 0;
}

/** Admins manage every country; a champion manages the countries they were appointed for. */
export function canManageCountry(actor: IcsaActor, country: string): boolean {
  return actor.isAdmin || actor.championCountries.includes(country);
}

/** The countries an actor can see as a manager. `'all'` for admins. */
export function managedCountries(actor: IcsaActor): string[] | 'all' {
  return actor.isAdmin ? 'all' : actor.championCountries;
}

/**
 * The signed-in person's ICSA access, memoised per request. Null only when signed out.
 *
 * A demo sign-in wins over an SSO session in the same browser: whoever opened the demo login
 * meant to act as that demo person.
 */
export const getIcsaActor = cache(async (): Promise<IcsaActor | null> => {
  const demo = await currentDemoUser();
  const actor = demo ? { email: demo.email, name: demo.name } : await currentActor();
  if (!actor) return null;
  await ensureIcsaSchema();

  const email = normalizeEmail(actor.email);
  const [champ, resp] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT country FROM icsa_champions WHERE LOWER(email) = ? ORDER BY country`,
      [email],
    ),
    sql<QueryResultRow[]>(
      `SELECT 1 FROM icsa_assessments WHERE LOWER(respondent_email) = ? AND status <> 'nominated' LIMIT 1`,
      [email],
    ),
  ]);

  return {
    email,
    name: actor.name,
    /* A demo person is an admin only by their demo role: demo addresses are never on
       ADMIN_EMAILS, and a real admin list must not be able to promote one. */
    isAdmin: demo ? demo.role === 'admin' : isToolAdminEmail(email, process.env.ICSA_ADMIN_EMAILS),
    championCountries: champ.map((r) => String(r.country)),
    isRespondent: resp.length > 0,
    isDemo: Boolean(demo),
  };
});

/** Any signed-in employee, as an ICSA actor. */
export async function requireIcsaActor(): Promise<IcsaActor> {
  const actor = await getIcsaActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  return actor;
}

export async function requireIcsaAdmin(): Promise<IcsaActor> {
  const actor = await requireIcsaActor();
  if (!actor.isAdmin) throw new AccessError('ICSA administrator access is required.');
  return actor;
}

/** An admin, or a champion of this country. */
export async function requireIcsaCountry(country: string): Promise<IcsaActor> {
  const actor = await requireIcsaActor();
  if (!canManageCountry(actor, country)) {
    throw new AccessError(`You are not the ICSA champion for ${country}.`);
  }
  return actor;
}

/** An admin or any champion. */
export async function requireIcsaManager(): Promise<IcsaActor> {
  const actor = await requireIcsaActor();
  if (!actor.isAdmin && !isChampion(actor)) {
    throw new AccessError('Only ICSA champions and administrators can do that.');
  }
  return actor;
}
