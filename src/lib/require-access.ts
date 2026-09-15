import { getCachedSession } from '@/lib/session';

/**
 * One authorization boundary for every `'use server'` action.
 *
 * Server actions are public POST endpoints: any signed-in employee can invoke
 * an exported action directly, so a layout redirect or a UI prop is NOT a
 * security control. Every exported action must start with one of the guards
 * below.
 *
 * Two flavours, deliberately:
 *   - `require*` throws {@link AccessError}. Use for mutations, so a denied
 *     call can never fall through to a write.
 *   - `current*` / `is*` return null/false. Use for reads that server pages
 *     render, so a panel degrades to an empty state instead of a crash.
 */

/** Thrown by the `require*` guards. Carries no internal detail. */
export class AccessError extends Error {
  readonly status: number;
  constructor(message = 'Forbidden', status = 403) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

export interface Actor {
  /** Always lowercase. Use this as the canonical identity for reads and writes. */
  email: string;
  name: string;
  /** True when the email is listed in ADMIN_EMAILS (platform-wide admin). */
  isPlatformAdmin: boolean;
}

/**
 * Canonical email form. Azure AD can hand back a mixed-case `mail` claim while
 * every writer lowercases, which silently splits one person into two identities
 * (a downgraded approver, a duplicate progress row). Normalise on both sides of
 * every comparison.
 */
export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Parse a comma-separated env list into lowercase emails. */
function parseEmailList(...values: (string | undefined)[]): string[] {
  return values
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Platform-wide admins (env ADMIN_EMAILS). The single source of truth. */
export function platformAdminEmails(): string[] {
  return parseEmailList(process.env.ADMIN_EMAILS);
}

export function isPlatformAdminEmail(email?: string | null): boolean {
  const e = normalizeEmail(email);
  return !!e && platformAdminEmails().includes(e);
}

/**
 * Admins for one tool: the platform list plus that tool's own env list.
 * e.g. `toolAdminEmails(process.env.SOURCEGUIDE_ADMIN_EMAILS)`.
 */
export function isToolAdminEmail(email: string | null | undefined, toolEnv?: string): boolean {
  const e = normalizeEmail(email);
  return !!e && parseEmailList(process.env.ADMIN_EMAILS, toolEnv).includes(e);
}

/** The signed-in actor, or null when there is no session. Never throws. */
export async function currentActor(): Promise<Actor | null> {
  const session = await getCachedSession();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return null;
  return {
    email,
    name: session?.user?.name ?? email,
    isPlatformAdmin: isPlatformAdminEmail(email),
  };
}

/** True when a platform admin is signed in. Never throws. */
export async function isAdminActor(): Promise<boolean> {
  return (await currentActor())?.isPlatformAdmin ?? false;
}

/** Any signed-in employee. Throws {@link AccessError} when signed out. */
export async function requireUser(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  return actor;
}

/** Platform admin only. Throws {@link AccessError} otherwise. */
export async function requireAdmin(): Promise<Actor> {
  const actor = await requireUser();
  if (!actor.isPlatformAdmin) throw new AccessError('Admins only.');
  return actor;
}

/**
 * Admin for one tool: platform admins plus that tool's own env list.
 * Throws {@link AccessError} otherwise.
 */
export async function requireToolAdmin(toolEnv?: string): Promise<Actor> {
  const actor = await requireUser();
  if (!isToolAdminEmail(actor.email, toolEnv)) throw new AccessError('Admins only.');
  return actor;
}

/** Standard denial shape for actions that report failure instead of throwing. */
export function forbidden(message = 'Forbidden'): { success: false; error: string } {
  return { success: false, error: message };
}

/**
 * Run `fn`, converting an {@link AccessError} into `fallback`. For read actions
 * that server pages render: the panel shows an empty state instead of throwing
 * a digest error at the user.
 */
export async function withAccessFallback<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AccessError) return fallback;
    throw err;
  }
}
