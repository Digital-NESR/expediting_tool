import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { safesignPool } from './db';
import { demoPersonaFor } from './demo';

/**
 * Who may use SafeSign. Two roles, one definition, used by the layout, the pages and every action.
 *
 *   sender  An ss_users row. The people who send QHSE communications to suppliers, like the
 *           sourcing team: vendor library, topics, sending, reminders, reviewing plans, reports.
 *   admin   ADMIN_EMAILS or SAFESIGN_ADMIN_EMAILS. Everything a sender does, plus deciding who
 *           else may use the tool.
 */

export type SafeSignRole = 'admin' | 'sender';

export interface SafeSignActor {
  email: string;
  name: string;
  role: SafeSignRole | null;
}

export const currentSafeSignActor = cache(async (): Promise<SafeSignActor | null> => {
  const actor = await currentActor();
  if (!actor) return null;
  const email = normalizeEmail(actor.email);

  /* Local demo people (never in production; see ./demo.ts). */
  const demo = demoPersonaFor(email);
  if (demo) return { email, name: demo.name, role: demo.role };

  if (actor.isPlatformAdmin || isToolAdminEmail(email, process.env.SAFESIGN_ADMIN_EMAILS)) {
    return { email, name: actor.name, role: 'admin' };
  }

  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT 1 FROM ss_users WHERE LOWER(email) = $1`,
    [email],
  );
  return { email, name: actor.name, role: rows.length ? 'sender' : null };
});

/** Anybody who may use SafeSign at all. */
export function hasAccess(actor: SafeSignActor | null): boolean {
  return Boolean(actor?.role);
}

export async function requireSafeSignUser(): Promise<SafeSignActor> {
  const actor = await currentSafeSignActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (!hasAccess(actor)) throw new AccessError('SafeSign is not open to you.');
  return actor;
}

export async function requireSafeSignAdmin(): Promise<SafeSignActor> {
  const actor = await requireSafeSignUser();
  if (actor.role !== 'admin') throw new AccessError('Admins only.');
  return actor;
}
