'use server';

import titePool from '@/lib/db-tite';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Shipment, ShipmentStats } from '@/types/tite';

/* ─── CreateShipmentInput ─────────────────────────────────────── */

export interface CreateShipmentInput {
  movement_type: 'Temporary Import' | 'Temporary Export';
  segment?: string;
  description?: string;
  from_country?: string;
  to_country?: string;
  country?: string;
  mot?: string;
  invoice_number?: string;
  invoice_value?: number;
  bayan_number?: string;
  awb_number?: string;
  po_number?: string;
  import_date?: string;
  expiry_date?: string;
  extended_date?: string;
  deposit_local?: number;
  deposit_usd?: number;
  comments?: string;
  status: 'Active' | 'Closed';
  contacts?: Array<{ name: string; email: string; role: string }>;
}

/* ─── Access request types ────────────────────────────────────── */

export interface TiteAccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked';
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

/* ─── Alert level helper ──────────────────────────────────────── */

function calcAlertLevel(
  expiryDate: string | undefined,
  extendedDate: string | undefined,
  status: string,
): string {
  if (status === 'Closed') return 'closed';
  const effective = extendedDate || expiryDate;
  if (!effective) return 'info';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil(
    (new Date(effective).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0)   return 'overdue';
  if (days <= 7)  return 'urgent';
  if (days <= 14) return 'action';
  if (days <= 30) return 'plan';
  if (days <= 60) return 'info';
  return 'ok';
}

/* ─── SELECT columns ──────────────────────────────────────────── */

const SELECT_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, invoice_value, bayan_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_local, deposit_usd, comments, status, alert_level,
  country, created_by
`;

/* ─── getAllShipments ─────────────────────────────────────────── */

export async function getAllShipments(approvedCountries?: string[]): Promise<Shipment[] | null> {
  try {
    const filtered = approvedCountries && approvedCountries.length > 0;
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS}
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}
       ORDER BY
         CASE alert_level
           WHEN 'overdue' THEN 1
           WHEN 'urgent'  THEN 2
           WHEN 'action'  THEN 3
           WHEN 'plan'    THEN 4
           WHEN 'info'    THEN 5
           WHEN 'ok'      THEN 6
           WHEN 'closed'  THEN 7
           ELSE 8
         END,
         COALESCE(extended_date, expiry_date) ASC NULLS LAST`,
      filtered ? [approvedCountries] : [],
    );
    console.log(`[TI-TE] getAllShipments: ${rows.length} rows returned`);
    return rows;
  } catch (err) {
    console.error('[TI-TE] getAllShipments error:', err);
    return null;
  }
}

/* ─── getShipmentById ─────────────────────────────────────────── */

export async function getShipmentById(id: number): Promise<Shipment | null> {
  try {
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS} FROM shipments WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error('[TI-TE] getShipmentById error:', err);
    return null;
  }
}

/* ─── createShipment ──────────────────────────────────────────── */

export async function createShipment(
  input: CreateShipmentInput,
): Promise<{ id: number } | null> {
  try {
    const session = await getServerSession(authOptions);
    const createdBy = session?.user?.name ?? null;

    const alert_level = calcAlertLevel(input.expiry_date, input.extended_date, input.status);

    const { rows: countRows } = await titePool.query<{ next_num: string }>(
      `SELECT LPAD((COUNT(*) + 1)::text, 4, '0') AS next_num FROM shipments`,
    );
    const reference_number = `TI-${countRows[0].next_num}`;

    const { rows } = await titePool.query<{ id: number }>(
      `INSERT INTO shipments (
        reference_number, segment, from_country, to_country,
        invoice_number, invoice_value, bayan_number, description,
        mot, awb_number, po_number, movement_type,
        import_date, expiry_date, extended_date,
        deposit_local, deposit_usd, comments, status, alert_level,
        country, created_by
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22
      ) RETURNING id`,
      [
        reference_number,
        input.segment       ?? null,
        input.from_country  ?? null,
        input.to_country    ?? null,
        input.invoice_number ?? null,
        input.invoice_value  ?? null,
        input.bayan_number  ?? null,
        input.description   ?? null,
        input.mot           ?? null,
        input.awb_number    ?? null,
        input.po_number     ?? null,
        input.movement_type,
        input.import_date   ?? null,
        input.expiry_date   ?? null,
        input.extended_date ?? null,
        input.deposit_local ?? null,
        input.deposit_usd   ?? null,
        input.comments      ?? null,
        input.status,
        alert_level,
        input.country       ?? null,
        createdBy,
      ],
    );
    const shipmentId = rows[0].id;

    if (input.contacts && input.contacts.length > 0) {
      try {
        for (const c of input.contacts) {
          if (!c.name && !c.email) continue;
          await titePool.query(
            `INSERT INTO shipment_notification_contacts (shipment_id, name, email, role)
             VALUES ($1, $2, $3, $4)`,
            [shipmentId, c.name || null, c.email || null, c.role || null],
          );
        }
      } catch (contactErr) {
        console.warn('[TI-TE] createShipment: could not insert contacts:', contactErr);
      }
    }

    try {
      await titePool.query(
        `INSERT INTO shipment_activity_log (shipment_id, action, details, performed_by)
         VALUES ($1, 'created', 'Shipment created via portal', $2)`,
        [shipmentId, createdBy],
      );
    } catch (logErr) {
      console.warn('[TI-TE] createShipment: could not insert activity log:', logErr);
    }

    return { id: shipmentId };
  } catch (err) {
    console.error('[TI-TE] createShipment error:', err);
    return null;
  }
}

/* ─── getShipmentStats ────────────────────────────────────────── */

export async function getShipmentStats(approvedCountries?: string[]): Promise<ShipmentStats | null> {
  try {
    const filtered = approvedCountries && approvedCountries.length > 0;
    const { rows } = await titePool.query(
      `SELECT
        COUNT(*)                    FILTER (WHERE status != 'Closed')                               AS active_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'overdue')                          AS overdue_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'urgent')                           AS urgent_count,
        COUNT(*)                    FILTER (WHERE alert_level IN ('action','plan'))                 AS action_count,
        COALESCE(SUM(deposit_local) FILTER (WHERE status != 'Closed'), 0)                          AS total_deposit_local,
        COALESCE(SUM(deposit_usd)   FILTER (WHERE status != 'Closed'), 0)                          AS total_deposit_usd,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%import%' AND status != 'Closed') AS import_count,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%export%' AND status != 'Closed') AS export_count
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}`,
      filtered ? [approvedCountries] : [],
    );
    const r = rows[0];
    return {
      active_count:       Number(r.active_count),
      overdue_count:      Number(r.overdue_count),
      urgent_count:       Number(r.urgent_count),
      action_count:       Number(r.action_count),
      total_deposit_local: Number(r.total_deposit_local),
      total_deposit_usd:  Number(r.total_deposit_usd),
      import_count:       Number(r.import_count),
      export_count:       Number(r.export_count),
    };
  } catch (err) {
    console.error('[TI-TE] getShipmentStats error:', err);
    return null;
  }
}

/* ─── getAllTiteCountries ─────────────────────────────────────── */

export async function getAllTiteCountries(): Promise<string[]> {
  try {
    const { rows } = await titePool.query(
      `SELECT DISTINCT country FROM shipments WHERE country IS NOT NULL ORDER BY country`,
    );
    return rows.map(r => String(r.country));
  } catch (err) {
    console.error('[TI-TE] getAllTiteCountries error:', err);
    return [];
  }
}

/* ─── getTiteUserAccess ───────────────────────────────────────── */

export async function getTiteUserAccess(userEmail: string): Promise<{
  status: 'new' | 'pending' | 'approved' | 'rejected' | 'revoked';
  approvedCountries: string[];
}> {
  try {
    const { rows } = await titePool.query(
      `SELECT status, approved_countries FROM access_requests WHERE user_email = $1`,
      [userEmail],
    );
    if (rows.length === 0) return { status: 'new', approvedCountries: [] };
    const r = rows[0];
    const s = String(r.status).toLowerCase();
    const status =
      s === 'pending'  ? 'pending'  :
      s === 'approved' ? 'approved' :
      s === 'rejected' ? 'rejected' :
      s === 'revoked'  ? 'revoked'  : 'new';
    return {
      status,
      approvedCountries: status === 'approved' ? (r.approved_countries ?? []) : [],
    };
  } catch (err) {
    console.error('[TI-TE] getTiteUserAccess error:', err);
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
  const { userEmail, displayName, jobTitle, department, requestedCountries } = params;
  if (!requestedCountries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
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
    console.error('[TI-TE] submitTiteAccessRequest error:', err);
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }
}

/* ─── approveTiteAccess ───────────────────────────────────────── */

export async function approveTiteAccess(params: {
  userEmail: string;
  approvedCountries: string[];
  reviewedBy: string;
  notes: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { userEmail, approvedCountries, reviewedBy, notes } = params;
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
        WHERE user_email = $1`,
      [userEmail, approvedCountries, reviewedBy, notes],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] approveTiteAccess error:', err);
    return { success: false, error: 'Failed to approve access.' };
  }
}

/* ─── rejectTiteAccess ────────────────────────────────────────── */

export async function rejectTiteAccess(
  userEmail: string,
  reviewedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await titePool.query(
      `UPDATE access_requests
          SET status             = 'Rejected',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE user_email = $1`,
      [userEmail, reviewedBy],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] rejectTiteAccess error:', err);
    return { success: false, error: 'Failed to reject access.' };
  }
}

/* ─── revokeTiteAccess ────────────────────────────────────────── */

export async function revokeTiteAccess(
  userEmail: string,
  reviewedBy: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await titePool.query(
      `UPDATE access_requests
          SET status             = 'Revoked',
              approved_countries = '{}',
              reviewed_at        = NOW(),
              reviewed_by        = $2
        WHERE user_email = $1`,
      [userEmail, reviewedBy],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] revokeTiteAccess error:', err);
    return { success: false, error: 'Failed to revoke access.' };
  }
}

/* ─── editTiteAccess ──────────────────────────────────────────── */

export async function editTiteAccess(
  userEmail: string,
  approvedCountries: string[],
  reviewedBy: string,
): Promise<{ success: boolean; error?: string }> {
  if (!approvedCountries.length) {
    return { success: false, error: 'Please select at least one country.' };
  }
  try {
    await titePool.query(
      `UPDATE access_requests
          SET approved_countries = $2,
              reviewed_at        = NOW(),
              reviewed_by        = $3
        WHERE user_email = $1`,
      [userEmail, approvedCountries, reviewedBy],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] editTiteAccess error:', err);
    return { success: false, error: 'Failed to update access.' };
  }
}

/* ─── getTiteAccessRequests ───────────────────────────────────── */

export async function getTiteAccessRequests(): Promise<TiteAccessRequestRow[]> {
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
    return rows.map(r => ({
      user_email:          String(r.user_email),
      display_name:        r.display_name ? String(r.display_name) : null,
      job_title:           r.job_title    ? String(r.job_title)    : null,
      status:              r.status as 'Pending' | 'Approved' | 'Rejected' | 'Revoked',
      requested_countries: r.requested_countries || [],
      approved_countries:  r.approved_countries  || [],
      requested_at:        r.requested_at instanceof Date ? r.requested_at.toISOString() : String(r.requested_at),
      reviewed_at:         r.reviewed_at  instanceof Date ? r.reviewed_at.toISOString()  : (r.reviewed_at  ?? null),
      reviewed_by:         r.reviewed_by  ?? null,
      notes:               r.notes        ?? null,
    }));
  } catch (err) {
    console.error('[TI-TE] getTiteAccessRequests error:', err);
    return [];
  }
}

/* ─── getTitePendingCount ─────────────────────────────────────── */

export async function getTitePendingCount(): Promise<number> {
  try {
    const { rows } = await titePool.query(
      `SELECT COUNT(*) AS cnt FROM access_requests WHERE status = 'Pending'`,
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[TI-TE] getTitePendingCount error:', err);
    return 0;
  }
}
