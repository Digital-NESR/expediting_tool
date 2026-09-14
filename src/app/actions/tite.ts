'use server';

import titePool from '@/lib/db-tite';
import { withTransaction, lockForTransaction } from '@/lib/db/tx';
import { titeCountryCode, formatTiteReference } from '@/lib/tite-constants';
import { alertLevelFor, shipmentAlertLevel } from '@/lib/tite-utils';
import { getNextStatusOptions } from '@/lib/tite-stage-config';
import {
  requireTiteUser,
  currentTiteUser,
  isTiteApproved,
  titeReadScope,
  canViewTiteCountry,
  canEditTiteCountry,
  type TiteUser,
} from '@/lib/tite-auth';
import { AccessError, requireAdmin, forbidden, normalizeEmail, isAdminActor } from '@/lib/require-access';
import type { Shipment, ShipmentStats, ShipmentStatus, ShipmentDocument, ActivityLogRow, NotificationContact, CountryStakeholder, CountryStakeholderFull } from '@/types/tite';
import {
  dbInsertDocument,
  dbGetDocuments,
  dbDeleteDocument,
  dbGetActivityLog,
  dbInsertActivityLog,
  dbUpdateShipmentWithLog,
  ensureTiteActivityLogSchema,
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
  customs_docs_location?: string;
  status?: ShipmentStatus;
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

/* ─── Special role sentinel ──────────────────────────────────── */

const VIEW_ALL_COUNTRIES = 'All Countries - View Only';

/* ─── Shipment-level scope guards ─────────────────────────────── */

/**
 * Intersect a caller-supplied country filter with the scope the SESSION allows.
 * The parameter may only narrow the result — never widen it — so a hand-crafted
 * POST cannot read a country the user was not approved for.
 */
function effectiveCountryScope(user: TiteUser, requested?: string[]): string[] | null {
  const allowed = titeReadScope(user); // null → every country
  const narrow = requested?.includes(VIEW_ALL_COUNTRIES) ? undefined : requested;
  if (allowed === null) return narrow != null && narrow.length > 0 ? narrow : null;
  if (narrow == null || narrow.length === 0) return allowed;
  const lower = new Set(allowed.map(c => c.trim().toLowerCase()));
  return narrow.filter(c => lower.has(c.trim().toLowerCase()));
}

/** The country a shipment belongs to, or undefined when the row does not exist. */
async function shipmentCountry(shipmentId: number): Promise<string | null | undefined> {
  const { rows } = await titePool.query<{ country: string | null }>(
    `SELECT country FROM shipments WHERE id = $1`,
    [shipmentId],
  );
  return rows.length ? rows[0].country : undefined;
}

/** Null when the user may mutate this shipment, otherwise the failure message. */
async function denyShipmentEdit(user: TiteUser, shipmentId: number): Promise<string | null> {
  const country = await shipmentCountry(shipmentId);
  if (country === undefined) return 'Shipment not found.';
  if (!canEditTiteCountry(user, country)) return 'You cannot edit shipments for this country.';
  return null;
}

/** True when the user may read this shipment and anything hanging off it. */
async function canReadShipment(user: TiteUser, shipmentId: number): Promise<boolean> {
  const country = await shipmentCountry(shipmentId);
  if (country === undefined) return false;
  return canViewTiteCountry(user, country);
}

/* ─── SELECT columns ──────────────────────────────────────────── */

const SELECT_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, invoice_value_usd, customs_reference_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_usd, comments, customs_docs_location, status, alert_level,
  country, created_by,
  created_at::text AS created_at
`;

/* ─── getAllShipments ─────────────────────────────────────────── */

export async function getAllShipments(approvedCountries?: string[]): Promise<Shipment[] | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope     = effectiveCountryScope(user, approvedCountries);
    const filtered  = scope !== null;
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
      filtered ? [scope] : [],
    );
    // Recalculate alert_level from the effective date rather than trusting the
    // stored column, which only updates on create/extend/close and goes stale.
    const ALERT_ORDER: Record<string, number> = {
      overdue: 1, urgent: 2, action: 3, plan: 4, info: 5, ok: 6, closed: 7,
    };
    const fresh = rows.map(r => ({ ...r, alert_level: shipmentAlertLevel(r) }));
    fresh.sort((a, b) => {
      const oa = ALERT_ORDER[a.alert_level] ?? 8;
      const ob = ALERT_ORDER[b.alert_level] ?? 8;
      if (oa !== ob) return oa - ob;
      const da = a.extended_date || a.expiry_date || '';
      const db = b.extended_date || b.expiry_date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    console.log(`[TI-TE] getAllShipments: ${fresh.length} rows returned`);
    return fresh;
  } catch (err) {
    console.error('[TI-TE] getAllShipments error:', err);
    return null;
  }
}

/* ─── getShipmentById ─────────────────────────────────────────── */

export async function getShipmentById(id: number): Promise<Shipment | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS} FROM shipments WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    // Country scope: an out-of-scope row is indistinguishable from a missing one.
    if (!canViewTiteCountry(user, r.country)) return null;
    return { ...r, alert_level: shipmentAlertLevel(r) };
  } catch (err) {
    console.error('[TI-TE] getShipmentById error:', err);
    return null;
  }
}

/* ─── createShipment ──────────────────────────────────────────── */

export async function createShipment(
  input: CreateShipmentInput,
): Promise<{ id: number } | null> {
  const user = await requireTiteUser();
  // The country decides who may create the row, so it is validated before any work.
  if (!canEditTiteCountry(user, input.country)) {
    throw new AccessError('You cannot create shipments for this country.');
  }
  try {
    const createdBy = user.name;

    const status: ShipmentStatus = 'Open';
    const alert_level = alertLevelFor(input.expiry_date, input.extended_date, status);

    /* Reference numbers are `<country code>-<per-country sequence>` (e.g. OMN-020).
       The advisory lock serialises concurrent creates for the same country so two
       callers cannot compute the same sequence and trip the unique index. */
    const countryCode = titeCountryCode(input.country);

    /* Read on the pool before the transaction opens: this carries its own access
       check, and nothing about a read needs to roll back. */
    const stakeholders = input.country ? await getCountryStakeholders(input.country) : [];

    /* The activity-log column is added outside the transaction: an ALTER that ran
       inside it would abort the shipment insert on the first call after deploy. */
    await ensureTiteActivityLogSchema();

    /* The shipment row, its notification contacts and its creation log entry all
       commit together — a shipment with no recipients would be silently missed by
       the expiry alerts. */
    const shipmentId = await withTransaction(titePool, async (client) => {
      await lockForTransaction(client, `tite_ref_${countryCode}`);

      const { rows: seqRows } = await client.query<{ next_no: number }>(
        `SELECT COALESCE(MAX((regexp_replace(reference_number, '^[A-Z]+-', ''))::int), 0) + 1 AS next_no
           FROM shipments
          WHERE reference_number ~ ('^' || $1 || '-[0-9]+$')`,
        [countryCode],
      );
      const reference_number = formatTiteReference(countryCode, Number(seqRows[0].next_no));

      const { rows } = await client.query<{ id: number }>(
      `INSERT INTO shipments (
        reference_number, segment, from_country, to_country,
        invoice_number, invoice_value_usd, customs_reference_number, description,
        mot, awb_number, po_number, movement_type,
        import_date, expiry_date, extended_date,
        deposit_usd, comments, customs_docs_location, status, alert_level,
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
        input.customs_docs_location      ?? null,
        status,
        alert_level,
        input.country           ?? null,
        createdBy,
      ],
      );
      const newId = rows[0].id;

      /* ─── Insert notification contacts ─── */
      const allTrue = [true, true, true, true, true, true, true, true];
      const insertContact = (
        email: string | null,
        name:  string | null,
        role:  string | null,
        prefs?: boolean[],
      ) =>
        client.query(
          `INSERT INTO shipment_notification_contacts
             (shipment_id, email, name, role,
              notify_60_days, notify_30_days, notify_14_days, notify_7_days,
              notify_2_days, notify_1_day, notify_0_day, notify_overdue)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [newId, email, name, role, ...(prefs ?? allTrue)],
        );

      // 1. Country stakeholders
      for (const s of stakeholders) {
        await insertContact(s.email, s.name, s.role);
      }

      // 2. Creator — identity comes from the session, never from the payload.
      await insertContact(user.email, createdBy, 'Creator');

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

      await client.query(
        `INSERT INTO shipment_activity_log
           (shipment_id, action, details, performed_by, performed_by_email)
         VALUES ($1, 'created', 'Shipment created via portal', $2, $3)`,
        [newId, createdBy, user.email],
      );

      return newId;
    });

    return { id: shipmentId };
  } catch (err) {
    console.error('[TI-TE] createShipment error:', err);
    return null;
  }
}

/* ─── getShipmentStats ────────────────────────────────────────── */

export async function getShipmentStats(approvedCountries?: string[]): Promise<ShipmentStats | null> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return null;
  try {
    const scope    = effectiveCountryScope(user, approvedCountries);
    const filtered = scope !== null;
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
      filtered ? [scope] : [],
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
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    const scope = titeReadScope(user);
    const { rows } = await titePool.query(
      `SELECT DISTINCT country FROM shipments
        WHERE country IS NOT NULL
        ${scope === null ? '' : 'AND country = ANY($1::text[])'}
        ORDER BY country`,
      scope === null ? [] : [scope],
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
    const existing = await titePool.query<{ status: string }>(`SELECT status FROM access_requests WHERE LOWER(user_email) = $1`, [userEmail]);
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
    console.error('[TI-TE] submitTiteAccessRequest error:', err);
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
    console.error('[TI-TE] approveTiteAccess error:', err);
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
    console.error('[TI-TE] rejectTiteAccess error:', err);
    return { success: false, error: 'Failed to reject access.' };
  }
}

/* ─── deleteTiteAccessRequest ────────────────────────────────── */

export async function deleteTiteAccessRequest(
  userEmail: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    await titePool.query(
      `DELETE FROM access_requests WHERE LOWER(user_email) = $1`,
      [normalizeEmail(userEmail)],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] deleteTiteAccessRequest error:', err);
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
    console.error('[TI-TE] revokeTiteAccess error:', err);
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
    console.error('[TI-TE] editTiteAccess error:', err);
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
  if (!(await isAdminActor())) return 0;
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
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
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
  const user = await requireTiteUser();
  try {
    const uploadedBy   = user.name;
    const shipmentId   = Number(formData.get('shipment_id'));
    const stage        = (formData.get('stage') as string) || 'creation';
    const file         = formData.get('file') as File | null;
    const customName   = ((formData.get('custom_name') as string) || '').trim() || file?.name || 'Untitled';
    const docType      = (formData.get('document_type') as string | null) || null;

    if (!file || !shipmentId || !Number.isFinite(shipmentId)) {
      return { success: false, error: 'Missing required fields.' };
    }

    const denied = await denyShipmentEdit(user, shipmentId);
    if (denied) return forbidden(denied);

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
  const user = await requireTiteUser();
  try {
    // Scope is carried by the parent shipment, so resolve it before deleting.
    const { rows } = await titePool.query<{ shipment_id: number }>(
      `SELECT shipment_id FROM shipment_documents WHERE id = $1`,
      [documentId],
    );
    if (!rows[0]) return { success: false, error: 'Document not found.' };
    const denied = await denyShipmentEdit(user, rows[0].shipment_id);
    if (denied) return forbidden(denied);

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
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
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
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    const newAlertLevel = alertLevelFor(undefined, params.extendedDate, 'Open - Extended');

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
      performed_by_email: user.email,
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
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status:      'Closed',
        alert_level: 'closed',
      },
      action:       'closed',
      details:      `File closed${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
      performed_by_email: user.email,
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
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await dbUpdateShipmentWithLog({
      shipment_id: params.shipmentId,
      fields: {
        status:      'Closed - Refund Recovered',
        alert_level: 'closed',
      },
      action:       'refund_received',
      details:      `Customs refund recovered${params.notes ? `. ${params.notes}` : ''}`,
      performed_by: performer,
      performed_by_email: user.email,
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
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    /* The modal only offers the transitions in STATUS_TRANSITIONS; the same map is
       enforced here so a hand-crafted POST cannot skip a step (re-opening a closed
       file, or jumping straight to a refund). */
    const { rows: currentRows } = await titePool.query<{ status: string | null }>(
      `SELECT status FROM shipments WHERE id = $1`,
      [params.shipmentId],
    );
    if (!currentRows[0]) return { success: false, error: 'Shipment not found.' };
    if (!getNextStatusOptions(currentRows[0].status ?? '').includes(params.newStatus)) {
      return { success: false, error: 'Invalid status transition.' };
    }

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
      fields.alert_level   = alertLevelFor(undefined, params.newExpiryDate, 'Open - Extended');
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
      performed_by_email: user.email,
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
    console.error('[TI-TE] getCountryStakeholders error:', err);
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
    console.error('[TI-TE] getAllStakeholders error:', err);
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
    console.error('[TI-TE] addStakeholder error:', err);
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
    console.error('[TI-TE] updateStakeholder error:', err);
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
    console.error('[TI-TE] deleteStakeholder error:', err);
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
    await titePool.query(
      `UPDATE country_stakeholders SET active = $1 WHERE id = $2`,
      [active, id],
    );
    return { success: true };
  } catch (err) {
    console.error('[TI-TE] toggleStakeholderActive error:', err);
    return { success: false, error: 'Failed to toggle status.' };
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
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
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
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    if (!(await canReadShipment(user, shipmentId))) return [];
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
  const user = await requireTiteUser();
  try {
    const denied = await denyShipmentEdit(user, params.shipmentId);
    if (denied) return forbidden(denied);
    const performer = user.name;

    await ensureTiteActivityLogSchema();

    /* Delete-then-insert: outside a transaction a failure between the two would
       leave the shipment with NO recipients, so nobody is alerted before the
       customs deadline. */
    await withTransaction(titePool, async (client) => {
      await client.query(
        `DELETE FROM shipment_notification_contacts WHERE shipment_id = $1`,
        [params.shipmentId],
      );

      for (const c of params.contacts) {
        if (!c.email) continue;
        await client.query(
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
        performed_by_email: user.email,
      }, client);
    });

    return { success: true };
  } catch (err) {
    console.error('[TI-TE] saveNotificationContacts error:', err);
    return { success: false, error: 'Failed to save notification contacts.' };
  }
}

/* ─── getRecentActivity ───────────────────────────────────────── */

export interface RecentActivityRow {
  id: number;
  shipment_id: number;
  action: string;
  details: string | null;
  performed_by: string | null;
  performed_at: string;
  reference_number: string | null;
  description: string | null;
  country: string | null;
}

/**
 * The caller's own recent activity. The identity is the session's, not a parameter.
 *
 * Keyed on `performed_by_email`, not the free-text display name: a rename in Azure
 * AD used to empty a user's feed, and two colleagues with the same display name
 * saw each other's rows. Rows written before the column existed carry a NULL email
 * — those still match on the display name so existing history does not vanish, and
 * that fallback can be dropped once the backfill below has run:
 *
 *   UPDATE shipment_activity_log sal
 *      SET performed_by_email = LOWER(ar.user_email)
 *     FROM access_requests ar
 *    WHERE sal.performed_by_email IS NULL
 *      AND LOWER(TRIM(sal.performed_by)) = LOWER(TRIM(ar.display_name));
 */
export async function getRecentActivity(
  days: number = 7,
): Promise<RecentActivityRow[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    await ensureTiteActivityLogSchema();
    const userName = user.name;
    const { rows } = await titePool.query<RecentActivityRow>(
      `SELECT
         sal.id,
         sal.shipment_id,
         sal.action,
         sal.details,
         sal.performed_by,
         sal.performed_at::text AS performed_at,
         s.reference_number,
         s.description,
         s.country
       FROM shipment_activity_log sal
       JOIN shipments s ON s.id = sal.shipment_id
       WHERE (
               sal.performed_by_email = $1
               OR (sal.performed_by_email IS NULL AND sal.performed_by = $2)
             )
         AND sal.performed_at >= NOW() - ($3 || ' days')::INTERVAL
         ${titeReadScope(user) === null ? '' : 'AND s.country = ANY($4::text[])'}
       ORDER BY sal.performed_at DESC
       LIMIT 20`,
      titeReadScope(user) === null
        ? [user.email, userName, days]
        : [user.email, userName, days, titeReadScope(user)],
    );
    return rows;
  } catch (err) {
    console.error('[TI-TE] getRecentActivity error:', err);
    return [];
  }
}
