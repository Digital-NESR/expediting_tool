'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { currentActor, normalizeEmail } from '@/lib/require-access';
import { currentRrsmActor, toCountryOption, type RrsmCountryOption } from '@/lib/rrsm/access';

/**
 * The RRSM admin editor's endpoints: who may use the tool, and which countries are switched on.
 *
 * EVERY EXPORT OF THIS FILE IS A PUBLIC POST ENDPOINT. Being rendered behind /admin proves
 * nothing about who can call one, so each function below asks `requireRrsmAdmin()` first rather
 * than trusting the screen it is usually called from. That is also why this file exports no
 * constants: a non-function export fails the Next build outright.
 */

const log = logger('rrsm-admin');

export interface RrsmCountryRow extends RrsmCountryOption {
  /** Active grants against this country, so a country is not switched on with nobody to run it. */
  users: number;
}

export interface RrsmTeamRow {
  id: number;
  email: string;
  name: string;
  role: 'buyer' | 'ops' | 'admin';
  countryCode: string;
  countryName: string;
  addedBy: string;
  createdAt: string;
}

export type RrsmActionResult = { success: boolean; error?: string };

/** Admins only, and said once so the eight endpoints below cannot drift. */
async function requireRrsmAdmin(): Promise<string> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  if (!actor.isAdmin) throw new Error('RRSM admins only.');
  return actor.email;
}

/** Every country, live or not, with the size of its team. The editor needs the dark ones too. */
export async function getRrsmCountries(): Promise<RrsmCountryRow[]> {
  await requireRrsmAdmin();
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT c.code, c.name, c.currency, c.flag, c.live,
            (SELECT count(*)::int FROM rrsm_users u
              WHERE u.active AND u.country_code = c.code) AS users
       FROM rrsm_countries c
      ORDER BY c.sort_order, c.name`,
  );
  return rows.map((r) => ({ ...toCountryOption(r), users: Number(r.users ?? 0) }));
}

/**
 * Switch a country on or off.
 *
 * Switching ON is refused when nobody is assigned to the country. A live country with no buyer
 * and no validator is a cycle that opens and then sits there, and the first person to notice is
 * a supplier who was asked for a submission nobody can accept. Switching OFF is always allowed:
 * stopping is never the dangerous direction.
 */
export async function setRrsmCountryLive(code: string, live: boolean): Promise<RrsmActionResult> {
  try {
    const admin = await requireRrsmAdmin();
    const target = String(code ?? '').trim();
    if (!target) return { success: false, error: 'No country given.' };

    if (live) {
      const { rows } = await rrsmPool.query<QueryResultRow>(
        `SELECT count(*)::int AS n FROM rrsm_users WHERE active AND country_code = $1`,
        [target],
      );
      if (!Number(rows[0]?.n ?? 0)) {
        return {
          success: false,
          error: 'Assign at least one person to this country before switching it on.',
        };
      }
    }

    const { rowCount } = await rrsmPool.query(
      `UPDATE rrsm_countries SET live = $2 WHERE code = $1`,
      [target, live],
    );
    if (!rowCount) return { success: false, error: 'No such country.' };

    log.info('country.live', { code: target, live, by: admin });
    return { success: true };
  } catch (err) {
    log.error('setRrsmCountryLive.failed', err, { code });
    return { success: false, error: (err as Error).message };
  }
}

/** The whole team, newest first within a country. */
export async function getRrsmTeam(): Promise<RrsmTeamRow[]> {
  await requireRrsmAdmin();
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT u.id, u.email, COALESCE(u.name, '') AS name, u.role,
            u.country_code, c.name AS country_name,
            COALESCE(u.added_by, '') AS added_by, u.created_at
       FROM rrsm_users u
       JOIN rrsm_countries c ON c.code = u.country_code
      WHERE u.active
      ORDER BY c.sort_order, c.name, u.role, lower(u.email)`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    name: String(r.name ?? ''),
    role: String(r.role) as RrsmTeamRow['role'],
    countryCode: String(r.country_code),
    countryName: String(r.country_name),
    addedBy: String(r.added_by ?? ''),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 10) : '',
  }));
}

/**
 * Appoint somebody, or re-appoint somebody who was removed.
 *
 * `ON CONFLICT` on the table's own (email, role, country) key, because removal is a soft delete:
 * without it, re-adding a person who was removed last month fails on a unique violation and the
 * screen says "already exists" about a row the reader cannot see.
 */
export async function setRrsmUser(input: {
  email: string;
  name?: string;
  role: 'buyer' | 'ops' | 'admin';
  countryCode: string;
}): Promise<RrsmActionResult> {
  try {
    const admin = await requireRrsmAdmin();

    const email = normalizeEmail(input?.email);
    const role = input?.role;
    const country = String(input?.countryCode ?? '').trim();
    const name = String(input?.name ?? '').trim();

    if (!email || !email.includes('@'))
      return { success: false, error: 'A valid email is needed.' };
    if (!['buyer', 'ops', 'admin'].includes(role))
      return { success: false, error: 'Unknown role.' };
    if (!country) return { success: false, error: 'Pick a country.' };

    const { rowCount } = await rrsmPool.query(
      `INSERT INTO rrsm_users (email, name, role, country_code, added_by, active)
       VALUES ($1, NULLIF($2, ''), $3, $4, $5, TRUE)
       ON CONFLICT (email, role, country_code)
       DO UPDATE SET active = TRUE,
                     name = COALESCE(NULLIF(EXCLUDED.name, ''), rrsm_users.name),
                     added_by = EXCLUDED.added_by`,
      [email, name, role, country, admin],
    );
    if (!rowCount) return { success: false, error: 'Nothing was saved.' };

    log.info('user.set', { email, role, country, by: admin });
    return { success: true };
  } catch (err) {
    log.error('setRrsmUser.failed', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Remove an appointment.
 *
 * A soft delete, so the activity log's `actor` still resolves to somebody who was on the team at
 * the time. It also refuses to strip the last person off a country that is live: that would leave
 * a running cycle with nobody to work it, which the switch-on guard exists to prevent and this
 * would walk straight around.
 */
export async function removeRrsmUser(id: number): Promise<RrsmActionResult> {
  try {
    const admin = await requireRrsmAdmin();
    const rowId = Number(id);
    if (!Number.isInteger(rowId) || rowId <= 0) return { success: false, error: 'Unknown row.' };

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT u.country_code, c.live,
              (SELECT count(*)::int FROM rrsm_users o
                WHERE o.active AND o.country_code = u.country_code AND o.id <> u.id) AS others
         FROM rrsm_users u JOIN rrsm_countries c ON c.code = u.country_code
        WHERE u.id = $1 AND u.active`,
      [rowId],
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'That appointment is already gone.' };

    if (Boolean(row.live) && !Number(row.others ?? 0)) {
      return {
        success: false,
        error: `${row.country_code} is live and this is its last person. Switch the country off first.`,
      };
    }

    await rrsmPool.query(`UPDATE rrsm_users SET active = FALSE WHERE id = $1`, [rowId]);
    log.info('user.removed', { id: rowId, by: admin });
    return { success: true };
  } catch (err) {
    log.error('removeRrsmUser.failed', err, { id });
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Whether the signed-in user may open this editor at all.
 *
 * Read by the admin shell to decide whether to render the section. Not a gate — the gate is
 * `requireRrsmAdmin` inside each endpoint above — just the answer to "should this be on screen".
 */
export async function isRrsmAdmin(): Promise<boolean> {
  const actor = await currentActor();
  if (!actor) return false;
  return (await currentRrsmActor())?.isAdmin ?? false;
}
