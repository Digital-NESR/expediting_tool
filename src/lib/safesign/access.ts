import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import { safesignPool } from './db';
import { demoPersonaFor } from './demo';

/**
 * Who may do what in SafeSign. One definition, used by the layout, the pages and
 * every action, so a button the page shows is never one the action then refuses.
 *
 *   admin    ADMIN_EMAILS or SAFESIGN_ADMIN_EMAILS. Manager rights plus the user list.
 *   manager  ss_users row. Vendors, topics, sending, reminders, reviewing plans.
 *   viewer   ss_users row. Dashboards and exports only.
 */

export type SafeSignRole = 'admin' | 'manager' | 'viewer';

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
    `SELECT role FROM ss_users WHERE LOWER(email) = $1`,
    [email],
  );
  const role = rows[0] ? (String(rows[0].role) as SafeSignRole) : null;
  return { email, name: actor.name, role };
});

export function canManage(actor: SafeSignActor | null): boolean {
  return actor?.role === 'admin' || actor?.role === 'manager';
}

export function canView(actor: SafeSignActor | null): boolean {
  return Boolean(actor?.role);
}

export async function requireSafeSignViewer(): Promise<SafeSignActor> {
  const actor = await currentSafeSignActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (!canView(actor)) throw new AccessError('SafeSign is not open to you.');
  return actor;
}

export async function requireSafeSignManager(): Promise<SafeSignActor> {
  const actor = await requireSafeSignViewer();
  if (!canManage(actor)) throw new AccessError('Only managers can do that.');
  return actor;
}

export async function requireSafeSignAdmin(): Promise<SafeSignActor> {
  const actor = await requireSafeSignViewer();
  if (actor.role !== 'admin') throw new AccessError('Admins only.');
  return actor;
}
