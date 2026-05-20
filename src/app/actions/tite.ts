'use server';

import titePool from '@/lib/db-tite';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Shipment, ShipmentStats, ShipmentStatus, ShipmentDocument, ActivityLogRow, NotificationContact, CountryStakeholder } from '@/types/tite';
import {
  dbInsertDocument,
  dbGetDocuments,
  dbDeleteDocument,
  dbGetActivityLog,
  dbInsertActivityLog,
  dbUpdateShipmentWithLog,
} from '@/lib/tite-documents';

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
  invoice_value_usd?: number;
  customs_reference_number?: string;
  awb_number?: string;
  po_number?: string;
  import_date?: string;
  expiry_date?: string;
  extended_date?: string;
  deposit_usd?: number;
  comments?: string;
  status?: ShipmentStatus;
  created_by_email?: string;
  additionalContacts?: Array<{
    name: string;
    email: string;
    role: string;
    notify_60_days?: boolean;
    notify_30_days?: boolean;
    notify_14_days?: boolean;
    notify_7_days?:  boolean;
    notify_2_days?:  boolean;
    notify_1_day?:   boolean;
    notify_0_day?:   boolean;
    notify_overdue?: boolean;
  }>;
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
  if (status === 'Closed' || status === 'Closed - Refund Recovered') return 'closed';
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
  invoice_number, invoice_value_usd, customs_reference_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_usd, comments, status, alert_level,
  country, created_by,
  created_at::text AS created_at
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

    const status: ShipmentStatus = 'Open';
    const alert_level = calcAlertLevel(input.expiry_date, input.extended_date, status);

    const { rows: countRows } = await titePool.query<{ next_num: string }>(
      `SELECT LPAD((COUNT(*) + 1)::text, 4, '0') AS next_num FROM shipments`,
    );
    const reference_number = `TI-${countRows[0].next_num}`;

    const { rows } = await titePool.query<{ id: number }>(
      `INSERT INTO shipments (
        reference_number, segment, from_country, to_country,
        invoice_number, invoice_value_usd, customs_reference_number, description,
        mot, awb_number, po_number, movement_type,
        import_date, expiry_date, extended_date,
        deposit_usd, comments, status, alert_level,
        country, created_by
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,$19,
        $20,$21
      ) RETURNING id`,
      [
        reference_number,
        input.segment           ?? null,
        input.from_country      ?? null,
        input.to_country        ?? null,
        input.invoice_number    ?? null,
        input.invoice_value_usd          ?? null,
        input.customs_reference_number   ?? null,
        input.description       ?? null,
        input.mot               ?? null,
        input.awb_number        ?? null,
        input.po_number         ?? null,
        input.movement_type,
        input.import_date       ?? null,
        input.expiry_date       ?? null,
        input.extended_date     ?? null,
        input.deposit_usd       ?? null,
        input.comments          ?? null,
        status,
        alert_level,
        input.country           ?? null,
        createdBy,
      ],
    );
    const shipmentId = rows[0].id;

    /* ─── Insert notification contacts ─── */
    try {
      const allTrue = [true, true, true, true, true, true, true, true];
      const insertContact = (
        email: string | null,
        name:  string | null,
        role:  string | null,
        prefs?: boolean[],
      ) =>
        titePool.query(
          `INSERT INTO shipment_notification_contacts
             (shipment_id, email, name, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [shipmentId, email, name, role, ...(prefs ?? allTrue)],
        );

      // 1. Country stakeholders
      if (input.country) {
        const stakeholders = await getCountryStakeholders(input.country);
        for (const s of stakeholders) {
          await insertContact(s.email, s.name, s.role);
        }
      }

      // 2. Creator
      if (input.created_by_email || createdBy) {
        await insertContact(input.created_by_email || null, createdBy, 'Creator');
      }

      // 3. Additional contacts (use per-contact prefs if provided, else default all true)
      for (const c of (input.additionalContacts ?? [])) {
        if (!c.email) continue;
        const prefs = [
          c.notify_60_days ?? true,
          c.notify_30_days ?? true,
          c.notify_14_days ?? true,
          c.notify_7_days  ?? true,
          c.notify_2_days  ?? true,
          c.notify_1_day   ?? true,
          c.notify_0_day   ?? true,
          c.notify_overdue ?? true,
        ];
        await insertContact(c.email, c.name || null, c.role || null, prefs);
      }
    } catch (contactErr) {
      console.warn('[TI-TE] createShipment: could not insert contacts:', contactErr);
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
        COUNT(*)                    FILTER (WHERE status NOT IN ('Closed', 'Closed - Refund Recovered'))                               AS active_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'overdue')                                                             AS overdue_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'urgent')                                                              AS urgent_count,
        COUNT(*)                    FILTER (WHERE alert_level IN ('action','plan'))                                                    AS action_count,
        COALESCE(SUM(deposit_usd)   FILTER (WHERE status NOT IN ('Closed', 'Closed - Refund Recovered')), 0)                          AS total_deposit_usd,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%import%' AND status NOT IN ('Closed', 'Closed - Refund Recovered')) AS import_count,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%export%' AND status NOT IN ('Closed', 'Closed - Refund Recovered')) AS export_count
       FROM shipments
       ${filtered ? 'WHERE country = ANY($1::text[])' : ''}`,
      filtered ? [approvedCountries] : [],
    );
    const r = rows[0];
    return {
      active_count:      Number(r.active_count),
      overdue_count:     Number(r.overdue_count),
      urgent_count:      Number(r.urgent_count),
      action_count:      Number(r.action_count),
      total_deposit_usd: Number(r.total_deposit_usd),
      import_count:      Number(r.import_count),
      export_count:      Number(r.export_count),
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

/* ─── getShipmentDocuments ────────────────────────────────────── */

export async function getShipmentDocuments(
  shipmentId: number,
): Promise<ShipmentDocument[]> {
  try {
    return await dbGetDocuments(shipmentId);
  } catch (err) {
    console.error('[TI-TE] getShipmentDocuments error:', err);
    return [];
  }
}

/* ─── uploadShipmentDocument ──────────────────────────────────── */

export async function uploadShipmentDocument(
  formData: FormData,
): Promise<{ success: boolean; document?: ShipmentDocument; error?: string }> {
  try {
    const session      = await getServerSession(authOptions);
    const uploadedBy   = session?.user?.name ?? null;
    const shipmentId   = Number(formData.get('shipment_id'));
    const stage        = (formData.get('stage') as string) || 'creation';
    const file         = formData.get('file') as File | null;
    const customName   = ((formData.get('custom_name') as string) || '').trim() || file?.name || 'Untitled';
    const docType      = (formData.get('document_type') as string | null) || null;

    if (!file || !shipmentId) {
      return { success: false, error: 'Missing required fields.' };
    }

    /* Detect MIME from extension — more reliable than browser-reported file.type */
    const MIME_MAP: Record<string, string> = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls:  'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      png:  'image/png',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      gif:  'image/gif',
      webp: 'image/webp',
      txt:  'text/plain',
      csv:  'text/csv',
      zip:  'application/zip',
      msg:  'application/vnd.ms-outlook',
      eml:  'message/rfc822',
    };
    const fileExt     = (file.name.split('.').pop() ?? '').toLowerCase();
    const detectedMime = MIME_MAP[fileExt] || file.type || 'application/octet-stream';

    const arrayBuf   = await file.arrayBuffer();
    const buffer     = Buffer.from(arrayBuf);
    const doc        = await dbInsertDocument({
      shipment_id:    shipmentId,
      document_name:  customName,
      original_name:  file.name !== customName ? file.name : null,
      document_type:  docType,
      document_stage: stage as 'creation' | 'extension' | 'closure' | 'refund',
      file_type:      detectedMime,
      file_size:      file.size,
      file_content:   buffer,
      uploaded_by:    uploadedBy,
    });

    return { success: true, document: doc };
  } catch (err) {
    console.error('[TI-TE] uploadShipmentDocument error:', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

/* ─── deleteShipmentDocument ──────────────────────────────────── */

export async function deleteShipmentDocument(
  documentId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await dbDeleteDocument(documentId);
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] deleteShipmentDocument error:', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

/* ─── getShipmentActivityLog ──────────────────────────────────── */

export async function getShipmentActivityLog(
  shipmentId: number,
): Promise<ActivityLogRow[]> {
  try {
    return await dbGetActivityLog(shipmentId);
  } catch (err) {
    console.error('[TI-TE] getShipmentActivityLog error:', err);
    return [];
  }
}

/* ─── extendShipment ──────────────────────────────────────────── */

export async function extendShipment(params: {
  shipmentId: number;
  extendedDate: string;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session    = await getServerSession(authOptions);
    const performer  = session?.user?.name ?? null;

    const newAlertLevel = calcAlertLevel(undefined, params.extendedDate, 'Open - Extended');

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        extended_date: params.extendedDate,
        status:        'Open - Extended',
        alert_level:   newAlertLevel,
      },
      action:       'extended',
      details:      `Extended to ${params.extendedDate}${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
    });
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] extendShipment error:', err);
    return { success: false, error: 'Failed to extend shipment.' };
  }
}

/* ─── closeShipment ───────────────────────────────────────────── */

export async function closeShipment(params: {
  shipmentId: number;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session    = await getServerSession(authOptions);
    const performer  = session?.user?.name ?? null;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status:      'Closed',
        alert_level: 'closed',
      },
      action:       'closed',
      details:      `File closed${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
    });
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] closeShipment error:', err);
    return { success: false, error: 'Failed to close shipment.' };
  }
}

/* ─── markRefundReceived ──────────────────────────────────────── */

export async function markRefundReceived(params: {
  shipmentId: number;
  notes: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session    = await getServerSession(authOptions);
    const performer  = session?.user?.name ?? null;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status:      'Closed - Refund Recovered',
        alert_level: 'closed',
      },
      action:       'refund_received',
      details:      `Customs refund recovered${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
    });
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] markRefundReceived error:', err);
    return { success: false, error: 'Failed to mark refund received.' };
  }
}

/* ─── updateShipmentStatus ────────────────────────────────────── */

export async function updateShipmentStatus(params: {
  shipmentId:       number;
  newStatus:        string;
  newExpiryDate?:   string | null;
  extensionNotes?:  string | null;
  closureNotes?:    string | null;
  refundAmountUsd?: number | null;
  refundDate?:      string | null;
  refundNotes?:     string | null;
  depositUsd?:      number | null;
  justification?:   string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session   = await getServerSession(authOptions);
    const performer = session?.user?.name ?? null;

    const fields: Record<string, unknown> = {
      status:          params.newStatus,
      last_updated_by: performer,
    };

    const detailLines: string[] = [`Status → ${params.newStatus}`];

    if (params.newStatus === 'Open - Extended') {
      if (!params.newExpiryDate) {
        return { success: false, error: 'New expiry date is required.' };
      }
      fields.extended_date = params.newExpiryDate;
      fields.alert_level   = calcAlertLevel(undefined, params.newExpiryDate, 'Open - Extended');
      detailLines.push(`New expiry: ${params.newExpiryDate}`);
      if (params.extensionNotes) detailLines.push(`Notes: ${params.extensionNotes}`);
    } else if (params.newStatus === 'Closed') {
      fields.alert_level = 'closed';
      if (params.closureNotes) detailLines.push(`Notes: ${params.closureNotes}`);
    } else if (params.newStatus === 'Closed - Refund Recovered') {
      fields.alert_level = 'closed';
      const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
      if (params.refundAmountUsd != null) detailLines.push(`Refund: ${fmt(params.refundAmountUsd)}`);
      if (params.depositUsd      != null) detailLines.push(`Original deposit: ${fmt(params.depositUsd)}`);
      if (params.justification)           detailLines.push(`Justification: ${params.justification}`);
      if (params.refundDate)              detailLines.push(`Refund date: ${params.refundDate}`);
      if (params.refundNotes)             detailLines.push(`Notes: ${params.refundNotes}`);
    } else {
      return { success: false, error: 'Invalid status transition.' };
    }

    await dbUpdateShipmentWithLog({
      shipment_id:  params.shipmentId,
      fields,
      action:       'Status Updated',
      details:      detailLines.join('\n'),
      performed_by: performer,
    });

    return { success: true };
  } catch (err) {
    console.error('[TI-TE] updateShipmentStatus error:', err);
    return { success: false, error: 'Failed to update status. Please try again.' };
  }
}

/* ─── getCountryStakeholders ──────────────────────────────────── */

export async function getCountryStakeholders(
  country: string,
): Promise<CountryStakeholder[]> {
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
    console.error('[TI-TE] getCountryStakeholders error:', err);
    return [];
  }
}

/* ─── getShipmentNotificationStatus ─────────────────────────── */

export interface NotificationLogRow {
  id: number;
  shipment_id: number;
  days_before_expiry: number;
  status: string;
  sent_at: string | null;
}

export async function getShipmentNotificationStatus(
  shipmentId: number,
): Promise<NotificationLogRow[]> {
  try {
    const { rows } = await titePool.query<NotificationLogRow>(
      `SELECT id, shipment_id, days_before_expiry, status, sent_at
       FROM notification_log
       WHERE shipment_id = $1`,
      [shipmentId],
    );
    return rows;
  } catch (err) {
    console.error('[TI-TE] getShipmentNotificationStatus error:', err);
    return [];
  }
}

/* ─── getShipmentNotificationContacts ────────────────────────── */

export async function getShipmentNotificationContacts(
  shipmentId: number,
): Promise<NotificationContact[]> {
  try {
    const { rows } = await titePool.query<NotificationContact>(
      `SELECT id, shipment_id, name, email, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue
       FROM shipment_notification_contacts
       WHERE shipment_id = $1
       ORDER BY id`,
      [shipmentId],
    );
    return rows;
  } catch (err) {
    console.error('[TI-TE] getShipmentNotificationContacts error:', err);
    return [];
  }
}

/* ─── saveNotificationContacts ───────────────────────────────── */

export async function saveNotificationContacts(params: {
  shipmentId: number;
  contacts:   Array<{
    email: string;
    name: string;
    role: string | null;
    notify_60_days?: boolean;
    notify_30_days?: boolean;
    notify_14_days?: boolean;
    notify_7_days?:  boolean;
    notify_2_days?:  boolean;
    notify_1_day?:   boolean;
    notify_0_day?:   boolean;
    notify_overdue?: boolean;
  }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session   = await getServerSession(authOptions);
    const performer = session?.user?.name ?? null;

    await titePool.query(
      `DELETE FROM shipment_notification_contacts WHERE shipment_id = $1`,
      [params.shipmentId],
    );

    for (const c of params.contacts) {
      if (!c.email) continue;
      await titePool.query(
        `INSERT INTO shipment_notification_contacts
           (shipment_id, email, name, role,
            notify_60_days, notify_30_days, notify_14_days, notify_7_days,
            notify_2_days, notify_1_day, notify_0_day, notify_overdue)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING`,
        [
          params.shipmentId, c.email, c.name || null, c.role || null,
          c.notify_60_days ?? true,
          c.notify_30_days ?? true,
          c.notify_14_days ?? true,
          c.notify_7_days  ?? true,
          c.notify_2_days  ?? true,
          c.notify_1_day   ?? true,
          c.notify_0_day   ?? true,
          c.notify_overdue ?? true,
        ],
      );
    }

    await dbInsertActivityLog({
      shipment_id:  params.shipmentId,
      action:       'Notification Contacts Updated',
      details:      `Updated ${params.contacts.length} recipient${params.contacts.length !== 1 ? 's' : ''}`,
      performed_by: performer,
    });

    return { success: true };
  } catch (err) {
    console.error('[TI-TE] saveNotificationContacts error:', err);
    return { success: false, error: 'Failed to save notification contacts.' };
  }
}
