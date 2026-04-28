'use server';

import pool from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/* ─── Types ──────────────────────────────────────────────────── */

export interface AccessRequest {
  user_email: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked';
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
}

/* ─── getCountries ───────────────────────────────────────────── */

export async function getCountries(): Promise<string[]> {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT country
      FROM sap_open_po_master
      WHERE country IS NOT NULL AND country <> ''
      ORDER BY country ASC
    `);
    return rows.map(r => String(r.country));
  } catch (err) {
    console.error('[getCountries]', err);
    return [];
  }
}

/* ─── getCurrentAccessRequest ────────────────────────────────── */

export async function getCurrentAccessRequest(
  userEmail: string,
): Promise<AccessRequest | null> {
  try {
    const { rows } = await pool.query(
      `SELECT user_email, status, requested_countries, approved_countries,
              requested_at
         FROM access_requests
        WHERE user_email = $1`,
      [userEmail],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      user_email:          String(r.user_email),
      status:              r.status as 'Pending' | 'Approved' | 'Rejected' | 'Revoked',
      requested_countries: r.requested_countries || [],
      approved_countries:  r.approved_countries  || [],
      requested_at:        r.requested_at instanceof Date ? r.requested_at.toISOString() : String(r.requested_at),
    };
  } catch (err) {
    console.error('[getCurrentAccessRequest]', err);
    return null;
  }
}

/* ─── submitAccessRequest ────────────────────────────────────── */

export async function submitAccessRequest(
  userEmail: string,
  displayName: string,
  countries: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!countries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    const session = await getServerSession(authOptions);
    const jobTitle   = session?.user?.jobTitle   ?? null;
    const department = session?.user?.department ?? null;

    await pool.query(
      `INSERT INTO access_requests (user_email, display_name, job_title, department, status, requested_countries, requested_at)
            VALUES ($1, $3, $4, $5, 'Pending', $2, NOW())
       ON CONFLICT (user_email)
       DO UPDATE SET
         display_name        = $3,
         job_title           = $4,
         department          = $5,
         status              = 'Pending',
         requested_countries = $2,
         requested_at        = NOW()`,
      [userEmail, countries, displayName, jobTitle, department],
    );
    // Fire-and-forget admin notification
    notifyAdmin(userEmail, displayName, countries).catch(() => {});
    return { success: true };
  } catch (err) {
    console.error('[submitAccessRequest]', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

/* ─── notifyAdmin ────────────────────────────────────────────── */

export async function notifyAdmin(
  userEmail: string,
  displayName: string,
  countries: string[],
): Promise<void> {
  const webhookUrl = process.env.ADMIN_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:        'access_request',
        user_email:   userEmail,
        display_name: displayName,
        countries,
        requested_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[notifyAdmin webhook]', err);
  }
}
