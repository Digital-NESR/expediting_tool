'use server';

/* ─── Per-country stakeholders, the people a notification reaches. ─── */

import titePool from '@/lib/db-tite';
import { isAdminActor, requireAdmin } from '@/lib/require-access';
import { canViewTiteCountry, currentTiteUser, isTiteApproved } from '@/lib/tite-auth';
import type { CountryStakeholder, CountryStakeholderFull } from '@/types/tite';
import { log } from '@/lib/tite/internals';

/* ─── getCountryStakeholders ──────────────────────────────────── */

export async function getCountryStakeholders(country: string): Promise<CountryStakeholder[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user) || !canViewTiteCountry(user, country)) return [];
  try {
    const { rows } = await titePool.query<CountryStakeholder>(
      `SELECT id, role, name, email
       FROM country_stakeholders
       WHERE country = $1 AND active = TRUE
       ORDER BY role`,
      [country],
    );
    return rows;
  } catch (err) {
    log.error('getCountryStakeholders.failed', err);
    return [];
  }
}

/* ─── Admin: getAllStakeholders ─────────────────────────────── */

export async function getAllStakeholders(): Promise<CountryStakeholderFull[]> {
  // Read the admin panel renders: degrade to an empty table, never crash.
  if (!(await isAdminActor())) return [];
  try {
    const { rows } = await titePool.query<CountryStakeholderFull>(
      `SELECT id, country, role, name, email, active
       FROM country_stakeholders
       ORDER BY country, role, id`,
    );
    return rows;
  } catch (err) {
    log.error('getAllStakeholders.failed', err);
    return [];
  }
}

/* ─── Admin: addStakeholder ────────────────────────────────── */

export async function addStakeholder(params: {
  country: string;
  role: string;
  name: string;
  email: string;
}): Promise<{ success: boolean; stakeholder?: CountryStakeholderFull; error?: string }> {
  await requireAdmin();
  try {
    const { rows } = await titePool.query<CountryStakeholderFull>(
      `INSERT INTO country_stakeholders (country, role, name, email, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, country, role, name, email, active`,
      [params.country, params.role, params.name, params.email],
    );
    return { success: true, stakeholder: rows[0] };
  } catch (err) {
    log.error('addStakeholder.failed', err);
    return { success: false, error: 'Failed to add notifier.' };
  }
}

/* ─── Admin: updateStakeholder ─────────────────────────────── */

export async function updateStakeholder(params: {
  id: number;
  country: string;
  role: string;
  name: string;
  email: string;
  active: boolean;
}): Promise<{ success: boolean; stakeholder?: CountryStakeholderFull; error?: string }> {
  await requireAdmin();
  try {
    const { rows } = await titePool.query<CountryStakeholderFull>(
      `UPDATE country_stakeholders SET
         country = $1, role = $2, name = $3, email = $4, active = $5
       WHERE id = $6
       RETURNING id, country, role, name, email, active`,
      [params.country, params.role, params.name, params.email, params.active, params.id],
    );
    if (rows.length === 0) return { success: false, error: 'Notifier not found.' };
    return { success: true, stakeholder: rows[0] };
  } catch (err) {
    log.error('updateStakeholder.failed', err);
    return { success: false, error: 'Failed to update notifier.' };
  }
}

/* ─── Admin: deleteStakeholder ─────────────────────────────── */

export async function deleteStakeholder(id: number): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await titePool.query(`DELETE FROM country_stakeholders WHERE id = $1`, [id]);
    return { success: true };
  } catch (err) {
    log.error('deleteStakeholder.failed', err);
    return { success: false, error: 'Failed to delete notifier.' };
  }
}

/* ─── Admin: toggleStakeholderActive ───────────────────────── */

export async function toggleStakeholderActive(
  id: number,
  active: boolean,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await titePool.query(`UPDATE country_stakeholders SET active = $1 WHERE id = $2`, [active, id]);
    return { success: true };
  } catch (err) {
    log.error('toggleStakeholderActive.failed', err);
    return { success: false, error: 'Failed to toggle status.' };
  }
}
