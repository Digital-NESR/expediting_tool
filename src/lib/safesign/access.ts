import { cache } from 'react';
import { cookies } from 'next/headers';
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
 *
 * "View as": a signed-in admin can look at the tool with a manager's or a viewer's rights, to see
 * what those people see. It is a cookie that can only LOWER the role of someone who is already an
 * admin through SSO: the identity stays the admin's own (so anything done is recorded under their
 * name), the cookie is ignored for everybody else, and it is not a login of any kind.
 */

export type SafeSignRole = 'admin' | 'manager' | 'viewer';

export const VIEW_AS_COOKIE = 'safesign_view_as';
export const VIEW_AS_ROLES = ['manager', 'viewer'] as const;
export type ViewAsRole = (typeof VIEW_AS_ROLES)[number];

export interface SafeSignActor {
  email: string;
  name: string;
  /** The role in effect: what every check uses. */
  role: SafeSignRole | null;
  /** The role the person really holds. Differs from `role` only while an admin uses View as. */
  realRole: SafeSignRole | null;
}

export const currentSafeSignActor = cache(async (): Promise<SafeSignActor | null> => {
  const actor = await currentActor();
  if (!actor) return null;
  const email = normalizeEmail(actor.email);

  let realRole: SafeSignRole | null;
  let name = actor.name;

  /* Local demo people (never in production; see ./demo.ts). */
  const demo = demoPersonaFor(email);
  if (demo) {
    realRole = demo.role;
    name = demo.name;
  } else if (actor.isPlatformAdmin || isToolAdminEmail(email, process.env.SAFESIGN_ADMIN_EMAILS)) {
    realRole = 'admin';
  } else {
    const { rows } = await safesignPool.query<QueryResultRow>(
      `SELECT role FROM ss_users WHERE LOWER(email) = $1`,
      [email],
    );
    realRole = rows[0] ? (String(rows[0].role) as SafeSignRole) : null;
  }

  let role = realRole;
  if (realRole === 'admin') {
    const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    if (viewAs && (VIEW_AS_ROLES as readonly string[]).includes(viewAs)) role = viewAs as ViewAsRole;
  }

  return { email, name, role, realRole };
});

/** What the page frame needs to know about the reader. */
export function shellUser(actor: SafeSignActor) {
  return {
    name: actor.name,
    email: actor.email,
    role: actor.role ?? 'viewer',
    realRole: actor.realRole ?? 'viewer',
  };
}

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

/** For the View as switch itself: the person's REAL role must be admin, whatever they view as. */
export async function requireRealSafeSignAdmin(): Promise<SafeSignActor> {
  const actor = await currentSafeSignActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  if (actor.realRole !== 'admin') throw new AccessError('Admins only.');
  return actor;
}
