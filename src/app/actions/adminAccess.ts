'use server';

import pool from '@/lib/db';

/* ─── Types ──────────────────────────────────────────────────── */

export interface AccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: 'Pending' | 'Approved' | 'Denied';
  requested_countries: string[];
  approved_countries: string[];
  created_at: string;
  updated_at: string;
}

/* ─── getAccessRequests ──────────────────────────────────────── */

export async function getAccessRequests(): Promise<AccessRequestRow[]> {
  try {
    const { rows } = await pool.query(`
      SELECT
        ar.user_email,
        up.display_name,
        up.job_title,
        ar.status,
        ar.requested_countries,
        ar.approved_countries,
        ar.created_at,
        ar.updated_at
      FROM access_requests ar
      LEFT JOIN user_profiles up ON up.email = ar.user_email
      ORDER BY
        CASE ar.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
        ar.updated_at DESC
    `);
    return rows.map(r => ({
      user_email:          String(r.user_email),
      display_name:        r.display_name  ? String(r.display_name)  : null,
      job_title:           r.job_title     ? String(r.job_title)     : null,
      status:              r.status as 'Pending' | 'Approved' | 'Denied',
      requested_countries: r.requested_countries ?? [],
      approved_countries:  r.approved_countries  ?? [],
      created_at:          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updated_at:          r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
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
      `SELECT COUNT(*) AS cnt FROM access_requests WHERE status = 'Pending'`,
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
              updated_at         = NOW()
        WHERE user_email = $1`,
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
              updated_at         = NOW()
        WHERE user_email = $1`,
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
              updated_at         = NOW()
        WHERE user_email = $1`,
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
              updated_at         = NOW()
        WHERE user_email = $1`,
      [userEmail, countries],
    );
    return { success: true };
  } catch (err) {
    console.error('[editUserAccess]', err);
    return { success: false, error: 'Failed to update access.' };
  }
}
