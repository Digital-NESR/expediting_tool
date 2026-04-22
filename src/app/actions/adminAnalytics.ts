'use server';

import pool from '@/lib/db';

/* ─── Types ──────────────────────────────────────────────────── */

export interface BuyerRow {
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
