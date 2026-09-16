'use server';

/* ─── The access-request queue and the country grants it issues. ─── */

import titePool from '@/lib/db-tite';
import { forbidden, isAdminActor, normalizeEmail, requireAdmin } from '@/lib/require-access';
import { currentTiteUser } from '@/lib/tite-auth';
import { log } from '@/lib/tite/internals';
import type { TiteAccessRequestRow } from '@/lib/tite/types';

/* ─── getTiteUserAccess ───────────────────────────────────────── */

export async function getTiteUserAccess(userEmail: string): Promise<{
  status: 'new' | 'pending' | 'approved' | 'rejected' | 'revoked';
  approvedCountries: string[];
}> {
  // A user may look up their own access; anyone else's is admin-only.
  const actor = await currentTiteUser();
  const target = normalizeEmail(userEmail);
  if (!actor || !target) return { status: 'new', approvedCountries: [] };
  if (actor.email !== target && !actor.isAdmin) return { status: 'new', approvedCountries: [] };
  try {
    const { rows } = await titePool.query(
      `SELECT status, approved_countries FROM access_requests WHERE LOWER(user_email) = $1`,
      [target],
    );
    if (rows.length === 0) return { status: 'new', approvedCountries: [] };
    const r = rows[0];
    const s = String(r.status).toLowerCase();
    const status =
      s === 'pending'
        ? 'pending'
        : s === 'approved'
          ? 'approved'
          : s === 'rejected'
            ? 'rejected'
            : s === 'revoked'
              ? 'revoked'
              : 'new';
    return {
      status,
      approvedCountries: status === 'approved' ? (r.approved_countries ?? []) : [],
    };
  } catch (err) {
    log.error('getTiteUserAccess.failed', err);
    return { status: 'new', approvedCountries: [] };
  }
}

/* ─── submitTiteAccessRequest ────────────────────────────────── */

export async function submitTiteAccessRequest(params: {
  userEmail: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  requestedCountries: string[];
}): Promise<{ success: boolean; error?: string }> {
  // A user may only request access for themselves — the payload email is checked
  // against the session rather than trusted.
  const actor = await currentTiteUser();
  if (!actor) return forbidden('Sign in required.');
  const { displayName, jobTitle, department, requestedCountries } = params;
  const userEmail = actor.email;
  if (normalizeEmail(params.userEmail) !== userEmail) {
    return forbidden('You can only request access for your own account.');
  }
  if (!requestedCountries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    // Never demote an already-approved user (e.g. a mis-click before the session finished loading).
    if (actor.isAdmin) return { success: true };
    const existing = await titePool.query<{ status: string }>(
      `SELECT status FROM access_requests WHERE LOWER(user_email) = $1`,
      [userEmail],
    );
    if (existing.rows[0]?.status === 'Approved') return { success: true };

    await titePool.query(
      `INSERT INTO access_requests
         (user_email, display_name, job_title, department, status, requested_countries, requested_at)
       VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         requested_countries = EXCLUDED.requested_countries,
         status              = 'Pending',
         requested_at        = NOW(),
         reviewed_at         = NULL,
         reviewed_by         = NULL,
         approved_countries  = NULL`,
      [userEmail, displayName, jobTitle, department, requestedCountries],
    );
    return { success: true };
  } catch (err) {
    log.error('submitTiteAccessRequest.failed', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

/* ─── approveTiteAccess ───────────────────────────────────────── */

export async function approveTiteAccess(params: {
  userEmail: string;
  approvedCountries: string[];
  notes: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdmin();
  const { userEmail, approvedCountries, notes } = params;
  const reviewedBy = admin.email;
  if (!approvedCountries.length) {
    return { success: false, error: 'Please select at least one country to approve.' };
  }
  try {
    await titePool.query(
      `UPDATE access_requests
          SET status             = 'Approved',
              approved_countries = $2,
              reviewed_at        = NOW(),
              reviewed_by        = $3,
              notes              = $4
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), approvedCountries, reviewedBy, notes],
    );
    return { success: true };
  } catch (err) {
    log.error('approveTiteAccess.failed', err);
    return { success: false, error: 'Failed to approve access.' };
  }
}

/* ─── rejectTiteAccess ────────────────────────────────────────── */

export async function rejectTiteAccess(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdmin();
  const reviewedBy = admin.email;
  try {
    await titePool.query(
      `UPDATE access_requests
          SET status             = 'Rejected',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), reviewedBy],
    );
    return { success: true };
  } catch (err) {
    log.error('rejectTiteAccess.failed', err);
    return { success: false, error: 'Failed to reject access.' };
  }
}

/* ─── deleteTiteAccessRequest ────────────────────────────────── */

export async function deleteTiteAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await titePool.query(`DELETE FROM access_requests WHERE LOWER(user_email) = $1`, [
      normalizeEmail(userEmail),
    ]);
    return { success: true };
  } catch (err) {
    log.error('deleteTiteAccessRequest.failed', err);
    return { success: false, error: 'Failed to delete access request.' };
  }
}

/* ─── revokeTiteAccess ────────────────────────────────────────── */

export async function revokeTiteAccess(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdmin();
  const reviewedBy = admin.email;
  try {
    await titePool.query(
      `UPDATE access_requests
          SET status             = 'Revoked',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), reviewedBy],
    );
    return { success: true };
  } catch (err) {
    log.error('revokeTiteAccess.failed', err);
    return { success: false, error: 'Failed to revoke access.' };
  }
}

/* ─── editTiteAccess ──────────────────────────────────────────── */

export async function editTiteAccess(
  userEmail: string,
  approvedCountries: string[],
): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdmin();
  const reviewedBy = admin.email;
  if (!approvedCountries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    await titePool.query(
      `UPDATE access_requests
          SET approved_countries = $2,
              reviewed_at        = NOW(),
              reviewed_by        = $3
        WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail), approvedCountries, reviewedBy],
    );
    return { success: true };
  } catch (err) {
    log.error('editTiteAccess.failed', err);
    return { success: false, error: 'Failed to update access.' };
  }
}

/* ─── getTiteAccessRequests ───────────────────────────────────── */

export async function getTiteAccessRequests(): Promise<TiteAccessRequestRow[]> {
  // Read the admin panel renders: degrade to an empty table, never crash.
  if (!(await isAdminActor())) return [];
  try {
    const { rows } = await titePool.query(`
      SELECT
        user_email, display_name, job_title, status,
        requested_countries, approved_countries,
        requested_at, reviewed_at, reviewed_by, notes
      FROM access_requests
      ORDER BY
        CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
        requested_at DESC
    `);
    return rows.map((r) => ({
      user_email: String(r.user_email),
      display_name: r.display_name ? String(r.display_name) : null,
      job_title: r.job_title ? String(r.job_title) : null,
      status: r.status as 'Pending' | 'Approved' | 'Rejected' | 'Revoked',
      requested_countries: r.requested_countries || [],
      approved_countries: r.approved_countries || [],
      requested_at:
        r.requested_at instanceof Date ? r.requested_at.toISOString() : String(r.requested_at),
      reviewed_at:
        r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : (r.reviewed_at ?? null),
      reviewed_by: r.reviewed_by ?? null,
      notes: r.notes ?? null,
    }));
  } catch (err) {
    log.error('getTiteAccessRequests.failed', err);
    return [];
  }
}

/* ─── getTitePendingCount ─────────────────────────────────────── */

export async function getTitePendingCount(): Promise<number> {
  if (!(await isAdminActor())) return 0;
  try {
    const { rows } = await titePool.query(
      `SELECT COUNT(*) AS cnt FROM access_requests WHERE status = 'Pending'`,
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    log.error('getTitePendingCount.failed', err);
    return 0;
  }
}
