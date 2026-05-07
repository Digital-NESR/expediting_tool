'use server';

import pool from '@/lib/db';

/* ─── Types ──────────────────────────────────────────────────── */

export interface AccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked';
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
}

/* ─── getAccessRequests ──────────────────────────────────────── */

export async function getAccessRequests(): Promise<AccessRequestRow[]> {
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
      WHERE ar.tool_name = 'po_expediting'
      ORDER BY
        CASE ar.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
        ar.requested_at DESC
    `);
    console.log('Pending requests:', rows.filter(r => r.status === 'Pending'));
    return rows.map(r => ({
      user_email:          String(r.user_email),
      display_name:        r.display_name ? String(r.display_name) : null,
      job_title:           r.job_title    ? String(r.job_title)    : null,
      status:              r.status as 'Pending' | 'Approved' | 'Rejected' | 'Revoked',
      requested_countries: r.requested_countries || [],
      approved_countries:  r.approved_countries  || [],
      requested_at:        r.requested_at instanceof Date ? r.requested_at.toISOString() : String(r.requested_at),
      reviewed_at:         r.reviewed_at  instanceof Date ? r.reviewed_at.toISOString()  : (r.reviewed_at ?? null),
    }));
  } catch (err) {
    console.error('[getAccessRequests]', err);
    return [];
  }
}

/* ─── getPendingAccessCount ──────────────────────────────────── */

export async function getPendingAccessCount(): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM access_requests WHERE status = 'Pending' AND tool_name = 'po_expediting'`,
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[getPendingAccessCount]', err);
    return 0;
  }
}

/* ─── approveAccessRequest ───────────────────────────────────── */

export async function approveAccessRequest(
  userEmail: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!countries.length) {
    return { success: false, error: 'Please select at least one country to approve.' };
  }
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Approved',
              approved_countries = $2,
              reviewed_at        = NOW()
        WHERE user_email = $1 AND tool_name = 'po_expediting'`,
      [userEmail, countries],
    );
    return { success: true };
  } catch (err) {
    console.error('[approveAccessRequest]', err);
    return { success: false, error: 'Failed to approve request.' };
  }
}

/* ─── rejectAccessRequest ────────────────────────────────────── */

export async function rejectAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Denied',
              approved_countries = '{}',
              reviewed_at        = NOW()
        WHERE user_email = $1 AND tool_name = 'po_expediting'`,
      [userEmail],
    );
    return { success: true };
  } catch (err) {
    console.error('[rejectAccessRequest]', err);
    return { success: false, error: 'Failed to reject request.' };
  }
}

/* ─── revokeAccess ───────────────────────────────────────────── */

export async function revokeAccess(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.query(
      `UPDATE access_requests
          SET status             = 'Denied',
              approved_countries = '{}',
              reviewed_at        = NOW()
        WHERE user_email = $1 AND tool_name = 'po_expediting'`,
      [userEmail],
    );
    return { success: true };
  } catch (err) {
    console.error('[revokeAccess]', err);
    return { success: false, error: 'Failed to revoke access.' };
  }
}

/* ─── editUserAccess ─────────────────────────────────────────── */

export async function editUserAccess(
  userEmail: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!countries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    await pool.query(
      `UPDATE access_requests
          SET approved_countries = $2,
              reviewed_at        = NOW()
        WHERE user_email = $1 AND tool_name = 'po_expediting'`,
      [userEmail, countries],
    );
    return { success: true };
  } catch (err) {
    console.error('[editUserAccess]', err);
    return { success: false, error: 'Failed to update access.' };
  }
}
