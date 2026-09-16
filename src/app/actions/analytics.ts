'use server';

import pool from '@/lib/db';
import { currentActor } from '@/lib/require-access';
import { ensurePoExpeditingSchema } from '@/lib/po-expediting-schema';

/* ─── Types ──────────────────────────────────────────────────── */

export interface MySupplierRow {
  supplier_name: string;
  times_expedited: number;
  total_lines: number;
  lines_responded: number;
  response_rate: number | null;
  last_response: string | null;
}

export interface MyRecentSession {
  session_ref: string;
  dispatched_at: string;
  total_suppliers: number;
  total_po_lines: number;
  total_emails_sent: number;
  suppliers_responded: number | null;
  response_rate_pct: number | null;
  fully_closed: boolean | null;
}

export interface MyWeeklyRateRow {
  week: string;
  lines_expedited: number;
  lines_responded: number;
  avg_response_rate: number | null;
  sessions_count: number;
}

export interface MySupplierResponseTimeRow {
  supplier_name: string;
  avg_days_to_respond: number;
  responses_count: number;
}

export interface MyAnalytics {
  totalLinesExpedited: number;
  totalSuppliersContacted: number;
  totalEmailsSent: number;
  overallResponseRate: number | null;
  supplierBreakdown: MySupplierRow[];
  recentSessions: MyRecentSession[];
  weeklyRateData: MyWeeklyRateRow[];
  supplierResponseTime: MySupplierResponseTimeRow[];
}

/* ─── getMyExpeditingAnalytics ───────────────────────────────── */

export async function getMyExpeditingAnalytics(): Promise<MyAnalytics> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  const empty: MyAnalytics = {
    totalLinesExpedited: 0,
    totalSuppliersContacted: 0,
    totalEmailsSent: 0,
    overallResponseRate: null,
    supplierBreakdown: [],
    recentSessions: [],
    weeklyRateData: [],
    supplierResponseTime: [],
  };

  // Identity comes from the session, never from the caller: a server action is a
  // public POST endpoint, so a buyer-email argument would be a read-any-buyer IDOR.
  const actor = await currentActor();
  if (!actor) return empty;
  const userEmail = actor.email;

  try {
    await ensurePoExpeditingSchema();

    /* Every query below reads active_expediting's dispatch-time snapshot instead
       of joining sap_open_po_master, which n8n truncates and reloads nightly with
       only the POs still open — the join silently dropped every line whose PO had
       since closed, so completed work vanished from these totals. */
    const [kpiRes, supplierRes, sessionsRes, weeklyRes, responseTimeRes] = await Promise.all([
      /* ── KPI block ── */
      pool.query(
        `
        SELECT
          (SELECT COUNT(*)
             FROM active_expediting
             WHERE LOWER(dispatched_by) = $1
          ) AS total_lines,
          (SELECT COUNT(DISTINCT ae.supplier_name)
             FROM active_expediting ae
             WHERE LOWER(ae.dispatched_by) = $1
          ) AS total_suppliers,
          (SELECT COALESCE(SUM(total_emails_sent), 0)
             FROM expediting_sessions
             WHERE LOWER(dispatched_by) = $1
          ) AS total_emails,
          (SELECT ROUND(
             COUNT(CASE WHEN workflow_state = 'Submitted' THEN 1 END) * 100.0
               / NULLIF(COUNT(*), 0), 1
           ) FROM active_expediting WHERE LOWER(dispatched_by) = $1) AS response_rate
      `,
        [userEmail],
      ),

      /* ── My supplier breakdown ── */
      pool.query(
        `
        SELECT
          ae.supplier_name,
          COUNT(DISTINCT ae.expedite_token)                                      AS times_expedited,
          COUNT(ae.id)                                                           AS total_lines,
          COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END)            AS lines_responded,
          ROUND(
            COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
              / NULLIF(COUNT(ae.id), 0), 1
          )                                                                      AS response_rate,
          MAX(ae.responded_at)                                                   AS last_response
        FROM active_expediting ae
        WHERE LOWER(ae.dispatched_by) = $1
        GROUP BY ae.supplier_name
        ORDER BY response_rate DESC NULLS LAST
      `,
        [userEmail],
      ),

      /* ── My recent sessions ── */
      pool.query(
        `
        SELECT
          session_ref,
          dispatched_at,
          total_suppliers,
          total_po_lines,
          total_emails_sent,
          suppliers_responded,
          response_rate_pct,
          fully_closed
        FROM expediting_sessions
        WHERE LOWER(dispatched_by) = $1
        ORDER BY dispatched_at DESC
        LIMIT 20
      `,
        [userEmail],
      ),

      /* ── Weekly expediting vs responses trend ── */
      pool.query(
        `
        SELECT
          DATE_TRUNC('week', dispatched_at)  AS week,
          SUM(total_po_lines)                AS lines_expedited,
          SUM(lines_responded)               AS lines_responded,
          ROUND(AVG(response_rate_pct), 1)   AS avg_response_rate,
          COUNT(*)                           AS sessions_count
        FROM expediting_sessions
        WHERE LOWER(dispatched_by) = $1
        GROUP BY DATE_TRUNC('week', dispatched_at)
        ORDER BY week ASC
      `,
        [userEmail],
      ),

      /* ── My avg response time by supplier ──
         responded_at, not updated_at: saveBuyerComment also bumps updated_at, so
         every buyer note used to shorten the supplier's apparent turnaround. */
      pool.query(
        `
        SELECT
          ae.supplier_name,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (ae.responded_at - ae.dispatched_at)) / 86400
          ), 1) AS avg_days_to_respond,
          COUNT(*) AS responses_count
        FROM active_expediting ae
        WHERE ae.workflow_state = 'Submitted'
          AND LOWER(ae.dispatched_by) = $1
          AND ae.dispatched_at IS NOT NULL
          AND ae.responded_at IS NOT NULL
        GROUP BY ae.supplier_name
        ORDER BY avg_days_to_respond ASC
      `,
        [userEmail],
      ),
    ]);

    const kpi = kpiRes.rows[0] ?? {};

    return {
      totalLinesExpedited: Number(kpi.total_lines ?? 0),
      totalSuppliersContacted: Number(kpi.total_suppliers ?? 0),
      totalEmailsSent: Number(kpi.total_emails ?? 0),
      overallResponseRate: kpi.response_rate != null ? Number(kpi.response_rate) : null,

      supplierBreakdown: supplierRes.rows.map((r) => ({
        supplier_name: String(r.supplier_name ?? ''),
        times_expedited: Number(r.times_expedited ?? 0),
        total_lines: Number(r.total_lines ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        response_rate: r.response_rate != null ? Number(r.response_rate) : null,
        last_response: toStr(r.last_response),
      })),

      recentSessions: sessionsRes.rows.map((r) => ({
        session_ref: String(r.session_ref ?? ''),
        dispatched_at: toStr(r.dispatched_at) ?? '',
        total_suppliers: Number(r.total_suppliers ?? 0),
        total_po_lines: Number(r.total_po_lines ?? 0),
        total_emails_sent: Number(r.total_emails_sent ?? 0),
        suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
        response_rate_pct: r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
        fully_closed: r.fully_closed != null ? Boolean(r.fully_closed) : null,
      })),

      weeklyRateData: weeklyRes.rows.map((r) => ({
        week: toStr(r.week) ?? '',
        lines_expedited: Number(r.lines_expedited ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
        sessions_count: Number(r.sessions_count ?? 0),
      })),

      supplierResponseTime: responseTimeRes.rows.map((r) => ({
        supplier_name: String(r.supplier_name ?? ''),
        avg_days_to_respond: Number(r.avg_days_to_respond ?? 0),
        responses_count: Number(r.responses_count ?? 0),
      })),
    };
  } catch (err) {
    console.error('[getMyExpeditingAnalytics]', err);
    return empty;
  }
}

/* ─── Supplier Detail ────────────────────────────────────────── */

export interface SupplierDetailLine {
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
}

export async function getSupplierDetail(supplierName: string): Promise<SupplierDetailLine[]> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  // Scope to the signed-in buyer; never to a caller-supplied email.
  const actor = await currentActor();
  if (!actor) return [];
  const userEmail = actor.email;
  try {
    await ensurePoExpeditingSchema();
    /* Matched and read off the snapshot; the master is LEFT JOINed only for the
       two fields that are not snapshotted. The old INNER JOIN on s.supplier_name
       hid every line whose PO had since closed, so this drill-down showed fewer
       lines than the supplier row that opened it. */
    const res = await pool.query(
      `
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
        COALESCE(ae.item_description,  s.item_description)  AS item_description,
        s.sap_mat_id,
        COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
        COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
        COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
        s.delivery_code  AS sap_delivery_code
      FROM active_expediting ae
      LEFT JOIN sap_open_po_master s
        ON ae.po_number = s.po_number AND ae.po_line = s.po_line
      WHERE COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name) = $1
        AND LOWER(ae.dispatched_by) = $2
      ORDER BY ae.po_number, ae.po_line
    `,
      [supplierName, userEmail],
    );

    return res.rows.map((r) => ({
      po_number: String(r.po_number ?? ''),
      po_line: String(r.po_line ?? ''),
      expedite_token: String(r.expedite_token ?? ''),
      workflow_state: String(r.workflow_state ?? ''),
      current_status: toStr(r.current_status),
      new_delivery_date: toStr(r.new_delivery_date),
      supplier_comments: toStr(r.supplier_comments),
      buyer_comments: toStr(r.buyer_comments),
      dispatched_at: toStr(r.dispatched_at) ?? '',
      item_description: toStr(r.item_description),
      sap_mat_id: toStr(r.sap_mat_id),
      open_qty: r.open_qty != null ? Number(r.open_qty) : null,
      open_po_value_usd: r.open_po_value_usd != null ? Number(r.open_po_value_usd) : null,
      original_delivery_date: toStr(r.original_delivery_date),
      sap_delivery_code: toStr(r.sap_delivery_code),
    }));
  } catch (err) {
    console.error('[getSupplierDetail]', err);
    return [];
  }
}

/* ─── Session Detail ─────────────────────────────────────────── */

export interface SessionDetailLine {
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

export async function getSessionDetail(sessionRef: string): Promise<SessionDetailLine[]> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  // Scope to the signed-in buyer; never to a caller-supplied email.
  const actor = await currentActor();
  if (!actor) return [];
  const userEmail = actor.email;
  try {
    await ensurePoExpeditingSchema();
    const res = await pool.query(
      `
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
        AND LOWER(ae.dispatched_by) = $2
      ORDER BY COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name, 'Unknown Supplier'),
               ae.po_number, ae.po_line
    `,
      [sessionRef, userEmail],
    );

    return res.rows.map((r) => ({
      po_number: String(r.po_number ?? ''),
      po_line: String(r.po_line ?? ''),
      workflow_state: String(r.workflow_state ?? ''),
      current_status: toStr(r.current_status),
      new_delivery_date: toStr(r.new_delivery_date),
      supplier_comments: toStr(r.supplier_comments),
      buyer_comments: toStr(r.buyer_comments),
      expedite_token: String(r.expedite_token ?? ''),
      supplier_name: String(r.supplier_name ?? ''),
      item_description: toStr(r.item_description),
      sap_mat_id: toStr(r.sap_mat_id),
      open_qty: r.open_qty != null ? Number(r.open_qty) : null,
      open_po_value_usd: r.open_po_value_usd != null ? Number(r.open_po_value_usd) : null,
      original_delivery_date: toStr(r.original_delivery_date),
      sap_delivery_code: toStr(r.sap_delivery_code),
    }));
  } catch (err) {
    console.error('[getSessionDetail]', err);
    return [];
  }
}
