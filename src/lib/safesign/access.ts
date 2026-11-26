import { cache } from 'react';
import { cookies } from 'next/headers';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { ensureSafeSignSchema, safesignPool } from './db';
import { demoPersonaFor } from './demo';

/**
 * Who may use SafeSign, and for which countries. One definition, used by the layout, the pages,
 * the routes and every action.
 *
 * SafeSign runs per country, like SOA Consolidation:
 *   sender  A row in ss_country_users for each country they work in (set in /admin, SafeSign,
 *           Country Team). They see and send only for those countries.
 *   admin   ADMIN_EMAILS or SAFESIGN_ADMIN_EMAILS. Every country, picked from a dropdown, plus
 *           the admin panel (country team and topics).
 *
 * The country being worked on is kept in a cookie (COUNTRY_COOKIE) and always re-checked against
 * the actor's countries, so a hand-edited cookie can only fall back to a country they already have.
 */

export type SafeSignRole = 'admin' | 'sender';

export interface Country {
  id: string;
  name: string;
}

export interface SafeSignActor {
  email: string;
  name: string;
  role: SafeSignRole | null;
  /** The countries this person may work in, in display order. Empty means no access. */
  countries: Country[];
  /** ADMIN_EMAILS: may open /admin, where SafeSign's country team and topics are kept. */
  platformAdmin: boolean;
  /** Where this person approves communications before they are sent (ss_approvers). */
  approver: Approver;
}

export interface Approver {
  /** Countries whose communications this person approves as supply chain manager. */
  scm: string[];
  /** Gives the final approval, for every country. */
  final: boolean;
}

export const NO_APPROVER: Approver = { scm: [], final: false };

export function isApprover(actor: SafeSignActor | null): boolean {
  return Boolean(actor && (actor.approver.final || actor.approver.scm.length));
}

async function approverFor(email: string): Promise<Approver> {
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT step, country_id FROM ss_approvers WHERE LOWER(email) = $1`,
    [email],
  );
  return {
    scm: rows.filter((r) => r.step === 'scm').map((r) => String(r.country_id)),
    final: rows.some((r) => r.step === 'final'),
  };
}

export const COUNTRY_COOKIE = 'safesign_country';

export const listCountries = cache(async (): Promise<Country[]> => {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT id, name FROM ss_countries WHERE active ORDER BY sort_order, name`,
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
});

export const currentSafeSignActor = cache(async (): Promise<SafeSignActor | null> => {
  const actor = await currentActor();
  if (!actor) return null;
  const email = normalizeEmail(actor.email);
  const all = await listCountries();

  /* Local demo people (never in production; see ./demo.ts). */
  const demo = demoPersonaFor(email);
  if (demo) {
    const countries =
      demo.role === 'admin' ? all : all.filter((c) => demo.countries?.includes(c.id));
    return {
      email,
      name: demo.name,
      role: demo.role,
      countries,
      platformAdmin: false,
      approver: demo.approver ?? NO_APPROVER,
    };
  }

  const approver = await approverFor(email);
  if (actor.isPlatformAdmin || isToolAdminEmail(email, process.env.SAFESIGN_ADMIN_EMAILS)) {
    return { email, name: actor.name, role: 'admin', countries: all, platformAdmin: actor.isPlatformAdmin, approver };
  }

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT country_id FROM ss_country_users WHERE LOWER(email) = $1`,
    [email],
  );
  const mine = new Set(rows.map((r) => String(r.country_id)));
  const countries = all.filter((c) => mine.has(c.id));
  return {
    email,
    name: actor.name,
    role: countries.length ? 'sender' : null,
    countries,
    platformAdmin: actor.isPlatformAdmin,
    approver,
  };
});

/** May create and send communications: someone with at least one country. */
export function canSend(actor: SafeSignActor | null): boolean {
  return Boolean(actor?.role && actor.countries.length);
}

/** Anybody who may open the app at all: a sender, or an approver (who may only approve). */
export function hasAccess(actor: SafeSignActor | null): boolean {
  return canSend(actor) || isApprover(actor);
}

/** May this person approve, at this step, a communication of this country? */
export function approvesStep(actor: SafeSignActor | null, step: 'scm' | 'final', countryId: string): boolean {
  if (!actor) return false;
  return step === 'final' ? actor.approver.final : actor.approver.scm.includes(countryId);
}

export function canUseCountry(actor: SafeSignActor | null, countryId: string | null | undefined): boolean {
  return Boolean(countryId && actor?.countries.some((c) => c.id === countryId));
}

/** The country being worked on: the cookie's, if this person has it, else their first. */
export async function activeCountry(actor: SafeSignActor): Promise<Country> {
  const wanted = (await cookies()).get(COUNTRY_COOKIE)?.value;
  const hit = actor.countries.find((c) => c.id === wanted);
  if (hit) return hit;
  if (!actor.countries.length) throw new AccessError('ComplyConnect is not open to you.');
  return actor.countries[0];
}

/** A sender (or admin): someone who works in at least one country. */
export async function requireSafeSignUser(): Promise<SafeSignActor> {
  const actor = await currentSafeSignActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (!canSend(actor)) throw new AccessError('ComplyConnect is not open to you.');
  return actor;
}

/** Anybody with access, approvers included. Approval actions check the step themselves. */
export async function requireSafeSignAnyone(): Promise<SafeSignActor> {
  const actor = await currentSafeSignActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (!hasAccess(actor)) throw new AccessError('ComplyConnect is not open to you.');
  return actor;
}

export async function requireSafeSignAdmin(): Promise<SafeSignActor> {
  const actor = await requireSafeSignUser();
  if (actor.role !== 'admin') throw new AccessError('Admins only.');
  return actor;
}

/** A signed-in SafeSign user and the country they are working in. */
export async function requireSafeSignCountry(): Promise<{ actor: SafeSignActor; country: Country }> {
  const actor = await requireSafeSignUser();
  return { actor, country: await activeCountry(actor) };
}

/**
 * The communication's country, after checking this person may work in it. Every action that
 * takes a communication id goes through this, so an id from another country is refused rather
 * than acted on.
 */
export async function requireCommunicationAccess(communicationId: number): Promise<SafeSignActor> {
  const actor = await requireSafeSignUser();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT country_id FROM ss_communications WHERE id = $1`,
    [communicationId],
  );
  if (!rows[0] || !canUseCountry(actor, String(rows[0].country_id))) {
    throw new AccessError('That communication is not in your countries.', 404);
  }
  return actor;
}

/** Same check, starting from a request (one supplier on a communication). */
export async function requireRequestAccess(requestId: number): Promise<SafeSignActor> {
  const actor = await requireSafeSignUser();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT c.country_id FROM ss_requests r JOIN ss_communications c ON c.id = r.communication_id
      WHERE r.id = $1`,
    [requestId],
  );
  if (!rows[0] || !canUseCountry(actor, String(rows[0].country_id))) {
    throw new AccessError('That request is not in your countries.', 404);
  }
  return actor;
}
