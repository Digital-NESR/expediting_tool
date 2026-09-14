'use server';

import pool from '@/lib/db';
import { getCachedSession } from '@/lib/session';
import { isPlatformAdminEmail, normalizeEmail } from '@/lib/require-access';
import { ensureActiveExpeditingColumns } from '@/lib/po-expediting-schema';

/* ─── Access ─────────────────────────────────────────────────── */

/**
 * Cross-buyer PO reads: platform admins, plus users with approved
 * `po_expediting` access. These actions back both the admin panel and
 * `/po-expediting/team-analytics` ("All Analytics"), which the sidebar offers to
 * every approved buyer — so `requireAdmin()` alone would break that page. Reads
 * degrade to an empty shape instead of throwing so panels render an empty state.
 */
async function hasPoTeamAccess(): Promise<boolean> {
  const session = await getCachedSession();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return false;
  if (isPlatformAdminEmail(email) || session?.user?.isAdmin) return true;
  return session?.user?.toolAccess?.po_expediting?.status === 'approved';
}

/* ─── Types ──────────────────────────────────────────────────── */

export interface BuyerRow {
  email: string;
  display_name: string | null;
  job_title: string | null;
  last_active_at: string | null;
  total_sessions: number;
  total_lines: number;
  total_suppliers: number;
  total_emails: number;
  avg_response_rate: number | null;
}

export interface SupplierRow {
  supplier_name: string;
  times_expedited: number;
  total_lines: number;
  lines_responded: number;
  response_rate: number | null;
  last_response: string | null;
}

export interface RecentSession {
  session_ref: string;
  dispatched_at: string;
  dispatched_by: string;
  display_name: string | null;
  total_suppliers: number;
  total_po_lines: number;
  total_emails_sent: number;
  suppliers_responded: number | null;
  response_rate_pct: number | null;
  fully_closed: boolean | null;
}

export interface WeeklyRateRow {
  week: string;
  lines_expedited: number;
  lines_responded: number;
  avg_response_rate: number | null;
  sessions_count: number;
}

export interface SupplierResponseTimeRow {
  supplier_name: string;
  avg_days_to_respond: number;
  responses_count: number;
}

export interface ExpeditingAnalytics {
  totalLinesExpedited: number;
  totalSuppliersContacted: number;
  totalEmailsSent: number;
  overallResponseRate: number | null;
  buyerBreakdown: BuyerRow[];
  supplierBreakdown: SupplierRow[];
  recentSessions: RecentSession[];
  weeklyRateData: WeeklyRateRow[];
  supplierResponseTime: SupplierResponseTimeRow[];
}

/* ─── getExpeditingAnalytics — DELETED ────────────────────────
   It was an unfiltered clone of teamAnalytics.getTeamAnalyticsData, kept in sync
   by hand and drifting. Its callers (src/app/admin/[app]/page.tsx and
   src/app/admin/PoAnalyticsPanel.tsx) now call getTeamAnalyticsData({}), which
   returns a superset of ExpeditingAnalytics. The ExpeditingAnalytics type stays
   here because the admin panel's props are still typed against it. */

/* ─── Buyer Detail ────────────────────────────────────────────── */

export interface BuyerSessionRow {
  session_ref: string;
  dispatched_at: string;
  total_suppliers: number;
  total_po_lines: number;
  total_emails_sent: number;
  suppliers_responded: number | null;
  lines_responded: number | null;
  response_rate_pct: number | null;
  fully_closed: boolean | null;
  display_name: string | null;
  job_title: string | null;
}

export async function getBuyerDetail(buyerEmail: string): Promise<BuyerSessionRow[]> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  if (!(await hasPoTeamAccess())) return [];
  try {
    const res = await pool.query(`
      SELECT
        es.session_ref,
        es.dispatched_at,
        es.total_suppliers,
        es.total_po_lines,
        es.total_emails_sent,
        es.suppliers_responded,
        es.lines_responded,
        es.response_rate_pct,
        es.fully_closed,
        up.display_name,
        up.job_title
      FROM expediting_sessions es
      JOIN user_profiles up ON up.email = es.dispatched_by
      WHERE LOWER(es.dispatched_by) = $1
      ORDER BY es.dispatched_at DESC
    `, [normalizeEmail(buyerEmail)]);

    return res.rows.map(r => ({
      session_ref:         String(r.session_ref ?? ''),
      dispatched_at:       toStr(r.dispatched_at) ?? '',
      total_suppliers:     Number(r.total_suppliers ?? 0),
      total_po_lines:      Number(r.total_po_lines ?? 0),
      total_emails_sent:   Number(r.total_emails_sent ?? 0),
      suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
      lines_responded:     r.lines_responded != null ? Number(r.lines_responded) : null,
      response_rate_pct:   r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
      fully_closed:        r.fully_closed != null ? Boolean(r.fully_closed) : null,
      display_name:        toStr(r.display_name),
      job_title:           toStr(r.job_title),
    }));
  } catch (err) {
    console.error('[getBuyerDetail]', err);
    return [];
  }
}

/* ─── Admin Supplier Detail (all buyers) ─────────────────────── */

export interface AdminSupplierDetailLine {
  po_number: string;
  po_line: string;
  expedite_token: string;
  workflow_state: string;
  current_status: string | null;
  new_delivery_date: string | null;
  supplier_comments: string | null;
  buyer_comments: string | null;
  dispatched_at: string;
  item_description: string | null;
  sap_mat_id: string | null;
  open_qty: number | null;
  open_po_value_usd: number | null;
  original_delivery_date: string | null;
  sap_delivery_code: string | null;
  buyer_email: string;
  buyer_display_name: string | null;
}

export async function getAdminSupplierDetail(supplierName: string): Promise<AdminSupplierDetailLine[]> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  if (!(await hasPoTeamAccess())) return [];
  try {
    await ensureActiveExpeditingColumns();
    /* Matched and read off the dispatch-time snapshot, with the master LEFT
       JOINed only for the two fields that are not snapshotted (sap_mat_id and
       the live SAP delivery code). Matching on s.supplier_name through an INNER
       JOIN used to drop every line whose PO had since closed, so this drill-down
       showed fewer lines than the supplier breakdown that opened it. */
    const res = await pool.query(`
      SELECT
        ae.po_number,
        ae.po_line,
        ae.expedite_token,
        ae.workflow_state,
        ae.current_status,
        ae.new_delivery_date,
        ae.supplier_comments,
        ae.buyer_comments,
        ae.dispatched_at,
        ae.dispatched_by         AS buyer_email,
        up.display_name          AS buyer_display_name,
        COALESCE(ae.item_description,  s.item_description)  AS item_description,
        s.sap_mat_id,
        COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
        COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
        COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
        s.delivery_code          AS sap_delivery_code
      FROM active_expediting ae
      LEFT JOIN sap_open_po_master s
        ON ae.po_number = s.po_number AND ae.po_line = s.po_line
      LEFT JOIN user_profiles up ON up.email = ae.dispatched_by
      WHERE COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name) = $1
      ORDER BY ae.po_number, ae.po_line
    `, [supplierName]);

    return res.rows.map(r => ({
      po_number:             String(r.po_number ?? ''),
      po_line:               String(r.po_line ?? ''),
      expedite_token:        String(r.expedite_token ?? ''),
      workflow_state:        String(r.workflow_state ?? ''),
      current_status:        toStr(r.current_status),
      new_delivery_date:     toStr(r.new_delivery_date),
      supplier_comments:     toStr(r.supplier_comments),
      buyer_comments:        toStr(r.buyer_comments),
      dispatched_at:         toStr(r.dispatched_at) ?? '',
      item_description:      toStr(r.item_description),
      sap_mat_id:            toStr(r.sap_mat_id),
      open_qty:              r.open_qty != null ? Number(r.open_qty) : null,
      open_po_value_usd:     r.open_po_value_usd != null ? Number(r.open_po_value_usd) : null,
      original_delivery_date: toStr(r.original_delivery_date),
      sap_delivery_code:     toStr(r.sap_delivery_code),
      buyer_email:           String(r.buyer_email ?? ''),
      buyer_display_name:    toStr(r.buyer_display_name),
    }));
  } catch (err) {
    console.error('[getAdminSupplierDetail]', err);
    return [];
  }
}

/* ─── Admin Session Detail (all buyers) ──────────────────────── */

export interface AdminSessionDetailLine {
  po_number: string;
  po_line: string;
  workflow_state: string;
  current_status: string | null;
  new_delivery_date: string | null;
  supplier_comments: string | null;
  buyer_comments: string | null;
  expedite_token: string;
  supplier_name: string;
  item_description: string | null;
  sap_mat_id: string | null;
  open_qty: number | null;
  open_po_value_usd: number | null;
  original_delivery_date: string | null;
  sap_delivery_code: string | null;
}

export async function getAdminSessionDetail(sessionRef: string): Promise<AdminSessionDetailLine[]> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  if (!(await hasPoTeamAccess())) return [];
  try {
    await ensureActiveExpeditingColumns();
    const res = await pool.query(`
      SELECT
        ae.po_number,
        ae.po_line,
        ae.workflow_state,
        ae.current_status,
        ae.new_delivery_date,
        ae.supplier_comments,
        ae.buyer_comments,
        ae.expedite_token,
        COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name, 'Unknown Supplier') AS supplier_name,
        COALESCE(ae.item_description,  s.item_description)  AS item_description,
        s.sap_mat_id,
        COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
        COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
        COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
        s.delivery_code  AS sap_delivery_code
      FROM active_expediting ae
      LEFT JOIN sap_open_po_master s
        ON ae.po_number = s.po_number AND ae.po_line = s.po_line
      WHERE ae.session_ref = $1::uuid
      ORDER BY COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name, 'Unknown Supplier'), ae.po_number, ae.po_line
    `, [sessionRef]);

    return res.rows.map(r => ({
      po_number:             String(r.po_number ?? ''),
      po_line:               String(r.po_line ?? ''),
      workflow_state:        String(r.workflow_state ?? ''),
      current_status:        toStr(r.current_status),
      new_delivery_date:     toStr(r.new_delivery_date),
      supplier_comments:     toStr(r.supplier_comments),
      buyer_comments:        toStr(r.buyer_comments),
      expedite_token:        String(r.expedite_token ?? ''),
      supplier_name:         String(r.supplier_name ?? ''),
      item_description:      toStr(r.item_description),
      sap_mat_id:            toStr(r.sap_mat_id),
      open_qty:              r.open_qty != null ? Number(r.open_qty) : null,
      open_po_value_usd:     r.open_po_value_usd != null ? Number(r.open_po_value_usd) : null,
      original_delivery_date: toStr(r.original_delivery_date),
      sap_delivery_code:     toStr(r.sap_delivery_code),
    }));
  } catch (err) {
    console.error('[getAdminSessionDetail]', err);
    return [];
  }
}
