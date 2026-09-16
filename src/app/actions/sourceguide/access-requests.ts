'use server';

/* ─── The access-request queue. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { isToolAdminEmail, normalizeEmail } from '@/lib/require-access';
import type { StoredAccessStatus } from '@/types/access';
import { canReadAdmin, denyAccess, getSgUser } from '@/lib/sourceguide/access';
import { logSafe } from '@/lib/sourceguide/activity';
import { isoOf, log } from '@/lib/sourceguide/internals';
import type { SgAccessRequest } from '@/lib/sourceguide/types';

export async function getSourceGuideAccessRequest(
  userEmail: string,
): Promise<SgAccessRequest | null> {
  // Own record only, unless an admin is asking — this row carries PII.
  const caller = await getSgUser();
  if (!caller) return null;
  if (!caller.isAdmin && caller.email !== normalizeEmail(userEmail)) return null;
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT user_email, display_name, job_title, status, requested_countries, approved_countries, requested_at, reviewed_at
       FROM access_requests WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail)],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      user_email: r.user_email,
      display_name: r.display_name,
      job_title: r.job_title,
      status: r.status,
      requested_countries: r.requested_countries || [],
      approved_countries: r.approved_countries || [],
      requested_at: isoOf(r.requested_at),
      reviewed_at: r.reviewed_at ? isoOf(r.reviewed_at) : null,
    };
  } catch (err) {
    log.error('getSourceGuideAccessRequest.failed', err);
    return null;
  }
}

/** Users request tool access (no country picking — approval grants all-country view). */
export async function submitSourceGuideAccessRequest(input: {
  userEmail: string;
  displayName: string;
  jobTitle?: string | null;
  department?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!input.userEmail) return { success: false, error: 'Not signed in.' };
  const requesterEmail = normalizeEmail(input.userEmail);
  try {
    // Never demote an already-approved user (e.g. a mis-click before the session finished loading).
    if (isToolAdminEmail(input.userEmail, process.env.SOURCEGUIDE_ADMIN_EMAILS))
      return { success: true };
    const existing = await sourceGuidePool.query<{ status: StoredAccessStatus }>(
      `SELECT status FROM access_requests WHERE LOWER(user_email) = $1`,
      [requesterEmail],
    );
    if (existing.rows[0]?.status === 'Approved') return { success: true };

    await sourceGuidePool.query(
      `INSERT INTO access_requests (user_email, display_name, job_title, department, status, requested_countries, requested_at)
       VALUES ($1, $2, $3, $4, 'Pending', '{}', NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'Pending', requested_at = NOW(),
         reviewed_at = NULL, reviewed_by = NULL, notes = NULL, approved_countries = NULL`,
      [requesterEmail, input.displayName, input.jobTitle ?? null, input.department ?? null],
    );
    return { success: true };
  } catch (err) {
    log.error('submitSourceGuideAccessRequest.failed', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

export async function getSourceGuideAccessRequests(): Promise<SgAccessRequest[]> {
  if (!(await canReadAdmin())) return [];
  try {
    const { rows } = await sourceGuidePool.query(`
      SELECT user_email, display_name, job_title, status, requested_countries, approved_countries, requested_at, reviewed_at
      FROM access_requests
      ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC
    `);
    return rows.map((r) => ({
      user_email: r.user_email,
      display_name: r.display_name,
      job_title: r.job_title,
      status: r.status,
      requested_countries: r.requested_countries || [],
      approved_countries: r.approved_countries || [],
      requested_at: isoOf(r.requested_at),
      reviewed_at: r.reviewed_at ? isoOf(r.reviewed_at) : null,
    }));
  } catch (err) {
    log.error('getSourceGuideAccessRequests.failed', err);
    return [];
  }
}

export async function getSourceGuidePendingCount(): Promise<number> {
  if (!(await canReadAdmin())) return 0;
  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT COUNT(*) AS cnt FROM access_requests WHERE status='Pending'`,
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    log.error('getSourceGuidePendingCount.failed', err);
    return 0;
  }
}

/** Approve a user for all-country (read-only) access. */
export async function approveSourceGuideAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    await sourceGuidePool.query(
      `UPDATE access_requests SET status='Approved', approved_countries='{}', reviewed_at=NOW(), reviewed_by=$2 WHERE LOWER(user_email)=$1`,
      [normalizeEmail(userEmail), user.name],
    );
    await logSafe(null, null, 'Access approved', userEmail, user.name, user.email);
    return { success: true };
  } catch (err) {
    log.error('approveSourceGuideAccessRequest.failed', err);
    return { success: false, error: 'Failed to approve request.' };
  }
}

export async function rejectSourceGuideAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  return denyAccess(userEmail, 'Access denied', 'Rejected');
}

export async function revokeSourceGuideAccess(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  return denyAccess(userEmail, 'Access revoked', 'Revoked');
}

export async function editSourceGuideAccess(
  userEmail: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  if (!countries.length) return { success: false, error: 'Please select at least one country.' };
  try {
    await sourceGuidePool.query(
      `UPDATE access_requests SET approved_countries=$2, reviewed_at=NOW() WHERE LOWER(user_email)=$1`,
      [normalizeEmail(userEmail), countries],
    );
    await logSafe(
      null,
      null,
      'Access updated',
      `${userEmail}: ${countries.join(', ')}`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('editSourceGuideAccess.failed', err);
    return { success: false, error: 'Failed to update access.' };
  }
}

export async function deleteSourceGuideAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    await sourceGuidePool.query(`DELETE FROM access_requests WHERE LOWER(user_email)=$1`, [
      normalizeEmail(userEmail),
    ]);
    await logSafe(null, null, 'Access request deleted', userEmail, user.name, user.email);
    return { success: true };
  } catch (err) {
    log.error('deleteSourceGuideAccessRequest.failed', err);
    return { success: false, error: 'Failed to delete request.' };
  }
}
