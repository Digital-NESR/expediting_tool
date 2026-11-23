'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { getCachedSession } from '@/lib/session';
import { currentRrsmActor } from '@/lib/rrsm/access';
import { notifyAccessDecision, notifyAccessRequest } from '@/lib/access-request-notify';

/**
 * Asking for RRSM, and an admin deciding.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT. Asking is open to any signed-in employee (that is the
 * point: they have no grant yet), but only ever for themselves and only for the buyer role in a
 * live country. Listing and deciding are RRSM admins only, checked here, not by the screen.
 */

const log = logger('rrsm-access-requests');

export interface RrsmRequestableCountry {
  code: string;
  name: string;
}

export interface MyRrsmRequest {
  countryCode: string;
  countryName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  decisionNote: string;
}

export interface RrsmAccessRequestRow {
  id: number;
  email: string;
  name: string;
  jobTitle: string;
  department: string;
  countryCode: string;
  countryName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  decidedBy: string;
  decidedAt: string;
  decisionNote: string;
}

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

/** What the request form offers, and what this person has already asked for. */
export async function getRrsmRequestForm(): Promise<{
  countries: RrsmRequestableCountry[];
  mine: MyRrsmRequest[];
}> {
  const actor = await currentRrsmActor();
  if (!actor) return { countries: [], mine: [] };
  try {
    const [countries, mine] = await Promise.all([
      rrsmPool.query<QueryResultRow>(
        `SELECT code, name FROM rrsm_countries WHERE live ORDER BY sort_order, name`,
      ),
      rrsmPool.query<QueryResultRow>(
        `SELECT r.country_code, c.name, r.status, r.requested_at, COALESCE(r.decision_note, '') AS note
           FROM rrsm_access_requests r JOIN rrsm_countries c ON c.code = r.country_code
          WHERE lower(r.email) = $1 ORDER BY r.requested_at DESC LIMIT 20`,
        [actor.email],
      ),
    ]);
    return {
      countries: countries.rows.map((r) => ({ code: String(r.code), name: String(r.name) })),
      mine: mine.rows.map((r) => ({
        countryCode: String(r.country_code),
        countryName: String(r.name),
        status: String(r.status) as MyRrsmRequest['status'],
        requestedAt: day(r.requested_at),
        decisionNote: String(r.note ?? ''),
      })),
    };
  } catch (err) {
    log.error('getRrsmRequestForm.failed', err);
    return { countries: [], mine: [] };
  }
}

/** Ask for buyer access in one country, for yourself. */
export async function requestRrsmAccess(input: {
  countryCode: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await currentRrsmActor();
    if (!actor) return { success: false, error: 'Sign in first.' };
    const code = String(input?.countryCode ?? '').trim();
    const reason = String(input?.reason ?? '')
      .trim()
      .slice(0, 1000);

    const { rows: country } = await rrsmPool.query<QueryResultRow>(
      `SELECT name FROM rrsm_countries WHERE code = $1 AND live`,
      [code],
    );
    if (!country[0]) return { success: false, error: 'Pick a country RRSM is running in.' };
    if (actor.grants.some((g) => g.countryCode === code && g.role === 'buyer')) {
      return { success: false, error: 'You already have buyer access there.' };
    }

    const session = await getCachedSession();
    const user = session?.user as
      { name?: string | null; jobTitle?: string | null; department?: string | null } | undefined;
    const name = String(user?.name ?? actor.email);

    const { rowCount } = await rrsmPool.query(
      `INSERT INTO rrsm_access_requests (email, name, job_title, department, country_code, reason)
       VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
       ON CONFLICT (lower(email), country_code) WHERE status = 'pending' DO NOTHING`,
      [actor.email, name, user?.jobTitle ?? null, user?.department ?? null, code, reason],
    );
    if (!rowCount)
      return {
        success: false,
        error: 'You have already asked for that country. It is waiting for an admin.',
      };

    await notifyAccessRequest({
      tool: 'RRSM',
      name,
      email: actor.email,
      country: String(country[0].name),
      role: 'Buyer',
      jobTitle: user?.jobTitle ?? null,
      department: user?.department ?? null,
      reason: reason || null,
    });
    return { success: true };
  } catch (err) {
    log.error('requestRrsmAccess.failed', err);
    return { success: false, error: 'The request did not go through. Try again.' };
  }
}

async function requireRrsmAdmin(): Promise<string> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  if (!actor.isAdmin) throw new Error('RRSM admins only.');
  return actor.email;
}

/** Every request, pending first. */
export async function getRrsmAccessRequests(): Promise<RrsmAccessRequestRow[]> {
  await requireRrsmAdmin();
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT r.*, c.name AS country_name FROM rrsm_access_requests r
       JOIN rrsm_countries c ON c.code = r.country_code
      ORDER BY (r.status = 'pending') DESC, r.requested_at DESC
      LIMIT 200`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    name: String(r.name ?? ''),
    jobTitle: String(r.job_title ?? ''),
    department: String(r.department ?? ''),
    countryCode: String(r.country_code),
    countryName: String(r.country_name),
    reason: String(r.reason ?? ''),
    status: String(r.status) as RrsmAccessRequestRow['status'],
    requestedAt: day(r.requested_at),
    decidedBy: String(r.decided_by ?? ''),
    decidedAt: r.decided_at ? day(r.decided_at) : '',
    decisionNote: String(r.decision_note ?? ''),
  }));
}

/**
 * Approve (grants buyer in that country) or reject. The person is told either way, through the
 * shared access-decision notice.
 */
export async function decideRrsmAccessRequest(input: {
  id: number;
  approve: boolean;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireRrsmAdmin();
    const note = String(input?.note ?? '')
      .trim()
      .slice(0, 500);
    const client = await rrsmPool.connect();
    let row: QueryResultRow | undefined;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<QueryResultRow>(
        `UPDATE rrsm_access_requests
            SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = NULLIF($4, '')
          WHERE id = $1 AND status = 'pending'
          RETURNING email, name, country_code, role`,
        [Number(input?.id), input?.approve ? 'approved' : 'rejected', admin, note],
      );
      row = rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { success: false, error: 'That request has already been decided.' };
      }
      if (input.approve) {
        await client.query(
          `INSERT INTO rrsm_users (email, name, role, country_code, added_by)
           VALUES (lower($1), $2, 'buyer', $3, $4)
           ON CONFLICT (email, role, country_code) DO UPDATE SET active = TRUE`,
          [String(row.email), row.name ? String(row.name) : null, String(row.country_code), admin],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const { rows: c } = await rrsmPool.query<QueryResultRow>(
      `SELECT name FROM rrsm_countries WHERE code = $1`,
      [String(row.country_code)],
    );
    await notifyAccessDecision({
      tool: 'RRSM',
      decision: input.approve ? 'approved' : 'rejected',
      name: String(row.name ?? row.email),
      email: String(row.email),
      country: String(c[0]?.name ?? row.country_code),
      role: 'Buyer',
      decidedBy: admin,
      note: note || null,
    });
    return { success: true };
  } catch (err) {
    log.error('decideRrsmAccessRequest.failed', err, { id: input?.id });
    return { success: false, error: (err as Error).message };
  }
}
