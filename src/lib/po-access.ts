/**
 * PO Expediting access, read from the database rather than the session cookie.
 *
 * WHY THIS EXISTS. Tool access is resolved once in the NextAuth `jwt` callback and written into
 * the JWT, which lives in a cookie. Only the browser can be handed a new cookie, so nothing
 * rendering on the server can refresh it: a user approved a minute ago carried the old
 * `status: 'new'` until they signed out and back in, or until something client-side called
 * `useSession().update()`. The proxy gate then bounced them to /home, and the data route
 * returned nothing, with no way for anyone to tell the difference between "not approved" and
 * "approved, stale cookie". The memo comment claiming changes propagate within a few seconds
 * described the memo's TTL, not the cookie's.
 *
 * So the gate reads the row. One indexed lookup on an email, on a page that then issues far
 * heavier queries, in exchange for approval taking effect on the next page load.
 *
 * NOT a server action, deliberately: an export in a `'use server'` file is a public POST
 * endpoint, and this one takes an identity.
 */

import { cache } from 'react';
import pool from '@/lib/db';
import { logger } from '@/lib/logger';
import { currentActor } from '@/lib/require-access';

const log = logger('po-expediting');

export type PoAccessStatus =
  'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected' | 'unknown';

export interface PoAccess {
  email: string;
  name: string;
  /** Platform admin. Reads everything, regardless of any access row. */
  isAdmin: boolean;
  status: PoAccessStatus;
  /** Countries on an approved row. Empty for everyone else, and for admins. */
  approvedCountries: string[];
  /** May this person open the tool at all? */
  approved: boolean;
}

const SIGNED_OUT: PoAccess = {
  email: '',
  name: '',
  isAdmin: false,
  status: 'unknown',
  approvedCountries: [],
  approved: false,
};

/** The same normalisation the JWT callback applies, so the two cannot disagree about a row. */
function normaliseStatus(raw: unknown): PoAccessStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'pending' || s === 'approved' || s === 'revoked' || s === 'rejected') return s;
  return s ? 'denied' : 'new';
}

/**
 * Current access for the signed-in user. Memoised per request, so a layout and the page beneath
 * it share one lookup.
 *
 * A database failure denies rather than admits. That is the safe direction for a gate, and it
 * matches what the cookie-based check did when the claim was missing.
 */
export const getPoExpeditingAccess = cache(async (): Promise<PoAccess> => {
  const actor = await currentActor();
  if (!actor) return SIGNED_OUT;

  const base = {
    email: actor.email,
    name: actor.name,
    isAdmin: actor.isPlatformAdmin,
    approvedCountries: [] as string[],
  };
  if (actor.isPlatformAdmin) {
    return { ...base, status: 'approved', approved: true };
  }

  try {
    const { rows } = await pool.query<{ status: string; approved_countries: string[] | null }>(
      `SELECT status, approved_countries FROM access_requests WHERE LOWER(user_email) = $1`,
      [actor.email],
    );
    if (rows.length === 0) return { ...base, status: 'new', approved: false };
    const status = normaliseStatus(rows[0].status);
    return {
      ...base,
      status,
      approvedCountries: status === 'approved' ? (rows[0].approved_countries ?? []) : [],
      approved: status === 'approved',
    };
  } catch (err) {
    log.error('access.lookup.failed', err, { email: actor.email });
    return { ...base, status: 'unknown', approved: false };
  }
});
