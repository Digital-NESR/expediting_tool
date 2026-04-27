'use server';

import pool from '@/lib/db';

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
  avg_response_rate: number | null;
  sessions_count: number;
  total_lines: number;
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
}

/* ─── getExpeditingAnalytics ─────────────────────────────────── */

export async function getExpeditingAnalytics(): Promise<ExpeditingAnalytics> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  try {
    const [kpiRes, buyerRes, supplierRes, sessionsRes, weeklyRes] = await Promise.all([

      /* ── KPI block ── */
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM active_expediting) AS total_lines,
          (SELECT COUNT(DISTINCT s.supplier_name)
             FROM active_expediting ae
             JOIN sap_open_po_master s
               ON ae.po_number = s.po_number AND ae.po_line = s.po_line
          ) AS total_suppliers,
          (SELECT COALESCE(SUM(total_emails_sent), 0) FROM expediting_sessions) AS total_emails,
          (SELECT ROUND(
             COUNT(CASE WHEN workflow_state = 'Submitted' THEN 1 END) * 100.0
               / NULLIF(COUNT(*), 0), 1
           ) FROM active_expediting) AS response_rate
      `),

      /* ── Buyer breakdown ── */
      pool.query(`
        SELECT
          up.email,
          up.display_name,
          up.job_title,
          up.last_active_at,
          COUNT(DISTINCT es.id)                          AS total_sessions,
          COALESCE(SUM(es.total_po_lines), 0)            AS total_lines,
          COALESCE(SUM(es.total_suppliers), 0)           AS total_suppliers,
          COALESCE(SUM(es.total_emails_sent), 0)         AS total_emails,
          ROUND(AVG(es.response_rate_pct), 1)            AS avg_response_rate
        FROM user_profiles up
        LEFT JOIN expediting_sessions es ON es.dispatched_by = up.email
        GROUP BY up.email, up.display_name, up.job_title, up.last_active_at
        ORDER BY total_lines DESC
      `),

      /* ── Supplier breakdown ── */
      pool.query(`
        SELECT
          s.supplier_name,
          COUNT(DISTINCT ae.expedite_token)                                      AS times_expedited,
          COUNT(ae.id)                                                           AS total_lines,
          COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END)            AS lines_responded,
          ROUND(
            COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
              / NULLIF(COUNT(ae.id), 0), 1
          )                                                                      AS response_rate,
          MAX(CASE WHEN ae.workflow_state = 'Submitted' THEN ae.updated_at END) AS last_response
        FROM active_expediting ae
        JOIN sap_open_po_master s
          ON ae.po_number = s.po_number AND ae.po_line = s.po_line
        GROUP BY s.supplier_name
        ORDER BY response_rate DESC NULLS LAST
      `),

      /* ── Recent sessions ── */
      pool.query(`
        SELECT
          es.session_ref,
          es.dispatched_at,
          es.dispatched_by,
          es.total_suppliers,
          es.total_po_lines,
          es.total_emails_sent,
          es.suppliers_responded,
          es.response_rate_pct,
          es.fully_closed,
          up.display_name
        FROM expediting_sessions es
        LEFT JOIN user_profiles up ON up.email = es.dispatched_by
        ORDER BY es.dispatched_at DESC
        LIMIT 20
      `),

      /* ── Weekly response rate trend ── */
      pool.query(`
        SELECT
          DATE_TRUNC('week', dispatched_at) AS week,
          ROUND(AVG(response_rate_pct), 1)  AS avg_response_rate,
          COUNT(*)                           AS sessions_count,
          SUM(total_po_lines)               AS total_lines
        FROM expediting_sessions
        WHERE dispatched_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', dispatched_at)
        ORDER BY week ASC
      `),
    ]);

    const kpi = kpiRes.rows[0] ?? {};

    return {
      totalLinesExpedited:     Number(kpi.total_lines ?? 0),
      totalSuppliersContacted: Number(kpi.total_suppliers ?? 0),
      totalEmailsSent:         Number(kpi.total_emails ?? 0),
      overallResponseRate:     kpi.response_rate != null ? Number(kpi.response_rate) : null,

      buyerBreakdown: buyerRes.rows.map(r => ({
        email:             String(r.email ?? ''),
        display_name:      toStr(r.display_name),
        job_title:         toStr(r.job_title),
        last_active_at:    toStr(r.last_active_at),
        total_sessions:    Number(r.total_sessions ?? 0),
        total_lines:       Number(r.total_lines ?? 0),
        total_suppliers:   Number(r.total_suppliers ?? 0),
        total_emails:      Number(r.total_emails ?? 0),
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
      })),

      supplierBreakdown: supplierRes.rows.map(r => ({
        supplier_name:   String(r.supplier_name ?? ''),
        times_expedited: Number(r.times_expedited ?? 0),
        total_lines:     Number(r.total_lines ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        response_rate:   r.response_rate != null ? Number(r.response_rate) : null,
        last_response:   toStr(r.last_response),
      })),

      recentSessions: sessionsRes.rows.map(r => ({
        session_ref:        String(r.session_ref ?? ''),
        dispatched_at:      toStr(r.dispatched_at) ?? '',
        dispatched_by:      String(r.dispatched_by ?? ''),
        display_name:       toStr(r.display_name),
        total_suppliers:    Number(r.total_suppliers ?? 0),
        total_po_lines:     Number(r.total_po_lines ?? 0),
        total_emails_sent:  Number(r.total_emails_sent ?? 0),
        suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
        response_rate_pct:  r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
        fully_closed:       r.fully_closed != null ? Boolean(r.fully_closed) : null,
      })),

      weeklyRateData: weeklyRes.rows.map(r => ({
        week:              toStr(r.week) ?? '',
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
        sessions_count:    Number(r.sessions_count ?? 0),
        total_lines:       Number(r.total_lines ?? 0),
      })),
    };
  } catch (err) {
    console.error('[getExpeditingAnalytics]', err);
    return {
      totalLinesExpedited: 0,
      totalSuppliersContacted: 0,
      totalEmailsSent: 0,
      overallResponseRate: null,
      buyerBreakdown: [],
      supplierBreakdown: [],
      recentSessions: [],
      weeklyRateData: [],
    };
  }
}

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
      WHERE es.dispatched_by = $1
      ORDER BY es.dispatched_at DESC
    `, [buyerEmail]);

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
  try {
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
        s.item_description,
        s.sap_mat_id,
        s.open_qty,
        s.open_po_value_usd,
        s.delivery_date          AS original_delivery_date,
        s.delivery_code          AS sap_delivery_code
      FROM active_expediting ae
      JOIN sap_open_po_master s
        ON ae.po_number = s.po_number AND ae.po_line = s.po_line
      LEFT JOIN user_profiles up ON up.email = ae.dispatched_by
      WHERE s.supplier_name = $1
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
  try {
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
        s.supplier_name,
        s.item_description,
        s.sap_mat_id,
        s.open_qty,
        s.open_po_value_usd,
        s.delivery_date  AS original_delivery_date,
        s.delivery_code  AS sap_delivery_code
      FROM active_expediting ae
      JOIN sap_open_po_master s
        ON ae.po_number = s.po_number AND ae.po_line = s.po_line
      WHERE ae.session_ref = $1::uuid
      ORDER BY s.supplier_name, ae.po_number, ae.po_line
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
