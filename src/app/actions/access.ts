'use server';

import https from 'https';
import pool from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/* ─── httpsPost (fire-and-forget, mirrors expediteDispatch) ──── */

function httpsPost(url: string, payload: unknown): void {
  const data = JSON.stringify(payload);
  const parsedUrl = new URL(url);
  const req = https.request(
    {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || 443,
      path:     parsedUrl.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      rejectUnauthorized: false,
    },
    res => { console.log('Access notification webhook status:', res.statusCode); },
  );
  req.on('error', err => { console.error('Access notification webhook failed:', err.message); });
  req.write(data);
  req.end();
}

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
    // Fire-and-forget admin notification email
    sendAdminNotificationEmail(displayName, userEmail, jobTitle, countries)
      .catch(err => console.error('Admin notification failed:', err));
    return { success: true };
  } catch (err) {
    console.error('[submitAccessRequest]', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

/* ─── sendAdminNotificationEmail ────────────────────────────── */

async function sendAdminNotificationEmail(
  userDisplayName: string,
  userEmail: string,
  jobTitle: string | null,
  requestedCountries: string[],
): Promise<void> {
  const webhookUrl = process.env.N8N_ACCESS_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return;

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  if (adminEmails.length === 0) return;

  const toRecipients = adminEmails.map(email => ({
    emailAddress: { address: email },
  }));

  const countriesList = requestedCountries.join(', ');

  const emailBody = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="border-bottom:3px solid #059669;padding-bottom:16px;margin-bottom:24px;">
        <span style="font-size:18px;font-weight:700;color:#059669;">NESR SC Agents</span>
        <span style="font-size:12px;color:#6b7280;margin-left:8px;">Access Control</span>
      </div>
      <h2 style="color:#1f2937;margin-bottom:8px;">New Access Request</h2>
      <p style="color:#6b7280;margin-bottom:24px;">
        A new user has requested access to the SC Agents platform.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px;font-weight:600;color:#374151;width:140px;">Name</td>
          <td style="padding:10px;color:#1f2937;">${userDisplayName}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px;font-weight:600;color:#374151;">Email</td>
          <td style="padding:10px;color:#1f2937;">${userEmail}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px;font-weight:600;color:#374151;">Job Title</td>
          <td style="padding:10px;color:#1f2937;">${jobTitle || 'Not provided'}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px;font-weight:600;color:#374151;">Countries</td>
          <td style="padding:10px;color:#1f2937;">${countriesList}</td>
        </tr>
      </table>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://scagents.nesr.com/admin"
           style="display:inline-block;background:#059669;color:#ffffff;
                  padding:12px 28px;border-radius:6px;text-decoration:none;
                  font-weight:600;font-size:15px;">
          Review Request →
        </a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;
                  font-size:12px;color:#9ca3af;">
        This is an automated notification from NESR SC Agents.
      </div>
    </div>
  `;

  const payload = {
    message: {
      subject: `SC Agents — New Access Request: ${userDisplayName}`,
      body: { contentType: 'HTML', content: emailBody },
      toRecipients,
    },
    saveToSentItems: true,
  };

  httpsPost(webhookUrl, payload);
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
