'use server';

import pool from '@/lib/db';

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
  avg_response_rate: number | null;
  sessions_count: number;
  total_lines: number;
}

export interface MyAnalytics {
  totalLinesExpedited: number;
  totalSuppliersContacted: number;
  totalEmailsSent: number;
  overallResponseRate: number | null;
  supplierBreakdown: MySupplierRow[];
  recentSessions: MyRecentSession[];
  weeklyRateData: MyWeeklyRateRow[];
}

/* ─── getMyExpeditingAnalytics ───────────────────────────────── */

export async function getMyExpeditingAnalytics(userEmail: string): Promise<MyAnalytics> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  try {
    const [kpiRes, supplierRes, sessionsRes, weeklyRes] = await Promise.all([

      /* ── KPI block ── */
      pool.query(`
        SELECT
          (SELECT COUNT(*)
             FROM active_expediting
             WHERE dispatched_by = $1
          ) AS total_lines,
          (SELECT COUNT(DISTINCT s.supplier_name)
             FROM active_expediting ae
             JOIN sap_open_po_master s
               ON ae.po_number = s.po_number AND ae.po_line = s.po_line
             WHERE ae.dispatched_by = $1
          ) AS total_suppliers,
          (SELECT COALESCE(SUM(total_emails_sent), 0)
             FROM expediting_sessions
             WHERE dispatched_by = $1
          ) AS total_emails,
          (SELECT ROUND(
             COUNT(CASE WHEN workflow_state = 'Submitted' THEN 1 END) * 100.0
               / NULLIF(COUNT(*), 0), 1
           ) FROM active_expediting WHERE dispatched_by = $1) AS response_rate
      `, [userEmail]),

      /* ── My supplier breakdown ── */
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
        WHERE ae.dispatched_by = $1
        GROUP BY s.supplier_name
        ORDER BY response_rate DESC NULLS LAST
      `, [userEmail]),

      /* ── My recent sessions ── */
      pool.query(`
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
        WHERE dispatched_by = $1
        ORDER BY dispatched_at DESC
        LIMIT 20
      `, [userEmail]),

      /* ── My weekly response rate trend ── */
      pool.query(`
        SELECT
          DATE_TRUNC('week', dispatched_at) AS week,
          ROUND(AVG(response_rate_pct), 1)  AS avg_response_rate,
          COUNT(*)                           AS sessions_count,
          SUM(total_po_lines)               AS total_lines
        FROM expediting_sessions
        WHERE dispatched_by = $1
          AND dispatched_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', dispatched_at)
        ORDER BY week ASC
      `, [userEmail]),
    ]);

    const kpi = kpiRes.rows[0] ?? {};

    return {
      totalLinesExpedited:     Number(kpi.total_lines ?? 0),
      totalSuppliersContacted: Number(kpi.total_suppliers ?? 0),
      totalEmailsSent:         Number(kpi.total_emails ?? 0),
      overallResponseRate:     kpi.response_rate != null ? Number(kpi.response_rate) : null,

      supplierBreakdown: supplierRes.rows.map(r => ({
        supplier_name:   String(r.supplier_name ?? ''),
        times_expedited: Number(r.times_expedited ?? 0),
        total_lines:     Number(r.total_lines ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        response_rate:   r.response_rate != null ? Number(r.response_rate) : null,
        last_response:   toStr(r.last_response),
      })),

      recentSessions: sessionsRes.rows.map(r => ({
        session_ref:         String(r.session_ref ?? ''),
        dispatched_at:       toStr(r.dispatched_at) ?? '',
        total_suppliers:     Number(r.total_suppliers ?? 0),
        total_po_lines:      Number(r.total_po_lines ?? 0),
        total_emails_sent:   Number(r.total_emails_sent ?? 0),
        suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
        response_rate_pct:   r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
        fully_closed:        r.fully_closed != null ? Boolean(r.fully_closed) : null,
      })),

      weeklyRateData: weeklyRes.rows.map(r => ({
        week:              toStr(r.week) ?? '',
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
        sessions_count:    Number(r.sessions_count ?? 0),
        total_lines:       Number(r.total_lines ?? 0),
      })),
    };
  } catch (err) {
    console.error('[getMyExpeditingAnalytics]', err);
    return {
      totalLinesExpedited: 0,
      totalSuppliersContacted: 0,
      totalEmailsSent: 0,
      overallResponseRate: null,
      supplierBreakdown: [],
      recentSessions: [],
      weeklyRateData: [],
    };
  }
}
