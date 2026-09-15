'use server';

import pool from '@/lib/db';
import { normalizeEmail, requireAdmin, withAccessFallback } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import type { StoredAccessStatus } from '@/types/access';

/* One structured logger for the whole file. NOTE: the request rows carry
   requester email, display name and job title — a list of people. Read paths
   therefore log a COUNT only; the mutation paths log the one actor and the one
   subject that the audit trail genuinely needs. */
const log = logger('po-expediting-access');

/* ─── Types ──────────────────────────────────────────────────── */

export interface AccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  // Reads tolerate the legacy 'Denied' until the one-off migration has run everywhere.
  status: StoredAccessStatus;
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
}

/* ─── getAccessRequests ──────────────────────────────────────── */

export async function getAccessRequests(): Promise<AccessRequestRow[]> {
  return withAccessFallback(async () => {
    await requireAdmin();
    try {
      const { rows } = await pool.query(`
        SELECT
          ar.user_email,
          ar.display_name,
          ar.job_title,
          ar.status,
          ar.requested_countries,
          ar.approved_countries,
          ar.requested_at,
          ar.reviewed_at
        FROM access_requests ar
        ORDER BY
          CASE ar.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
          ar.requested_at DESC
      `);
      log.debug('access_requests.read', { count: rows.length });
      return rows.map(r => ({
        user_email:          String(r.user_email),
        display_name:        r.display_name ? String(r.display_name) : null,
        job_title:           r.job_title    ? String(r.job_title)    : null,
        status:              r.status as StoredAccessStatus,
        requested_countries: r.requested_countries || [],
        approved_countries:  r.approved_countries  || [],
        requested_at:        r.requested_at instanceof Date ? r.requested_at.toISOString() : String(r.requested_at),
        reviewed_at:         r.reviewed_at  instanceof Date ? r.reviewed_at.toISOString()  : (r.reviewed_at ?? null),
      }));
    } catch (err) {
      log.error('access_requests.read_failed', err);
      return [];
    }
  }, []);
}

/* ─── getPendingAccessCount ──────────────────────────────────── */

export async function getPendingAccessCount(): Promise<number> {
  return withAccessFallback(async () => {
    await requireAdmin();
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM access_requests WHERE status = 'Pending'`,
      );
      return Number(rows[0]?.cnt ?? 0);
    } catch (err) {
      log.error('access_requests.pending_count_failed', err);
      return 0;
    }
  }, 0);
}

/* ─── approveAccessRequest ───────────────────────────────────── */

export async function approveAccessRequest(
  userEmail: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireAdmin();
  if (!countries.length) {
    return { success: false, error: 'Please select at least one country to approve.' };
  }
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Approved',
              approved_countries = $2,
              reviewed_at        = NOW(),
              reviewed_by        = $3
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), countries, actor.email],
    );
    log.info('access.approved', { subject: normalizeEmail(userEmail), actor: actor.email, countries: countries.length });
    return { success: true };
  } catch (err) {
    log.error('access.approve_failed', err, { subject: normalizeEmail(userEmail) });
    return { success: false, error: 'Failed to approve request.' };
  }
}

/* ─── rejectAccessRequest ────────────────────────────────────── */

export async function rejectAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireAdmin();
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Rejected',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), actor.email],
    );
    log.info('access.rejected', { subject: normalizeEmail(userEmail), actor: actor.email });
    return { success: true };
  } catch (err) {
    log.error('access.reject_failed', err, { subject: normalizeEmail(userEmail) });
    return { success: false, error: 'Failed to reject request.' };
  }
}

/* ─── deleteAccessRequest ────────────────────────────────────── */

export async function deleteAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await pool.query(
      `DELETE FROM access_requests WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail)],
    );
    log.info('access.request_deleted', { subject: normalizeEmail(userEmail) });
    return { success: true };
  } catch (err) {
    log.error('access.delete_failed', err, { subject: normalizeEmail(userEmail) });
    return { success: false, error: 'Failed to delete access request.' };
  }
}

/* ─── revokeAccess ───────────────────────────────────────────── */

export async function revokeAccess(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireAdmin();
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Revoked',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), actor.email],
    );
    log.info('access.revoked', { subject: normalizeEmail(userEmail), actor: actor.email });
    return { success: true };
  } catch (err) {
    log.error('access.revoke_failed', err, { subject: normalizeEmail(userEmail) });
    return { success: false, error: 'Failed to revoke access.' };
  }
}

/* ─── editUserAccess ─────────────────────────────────────────── */

export async function editUserAccess(
  userEmail: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireAdmin();
  if (!countries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    await pool.query(
      `UPDATE access_requests
          SET approved_countries = $2,
              reviewed_at        = NOW(),
              reviewed_by        = $3
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), countries, actor.email],
    );
    log.info('access.edited', { subject: normalizeEmail(userEmail), actor: actor.email, countries: countries.length });
    return { success: true };
  } catch (err) {
    log.error('access.edit_failed', err, { subject: normalizeEmail(userEmail) });
    return { success: false, error: 'Failed to update access.' };
  }
}
