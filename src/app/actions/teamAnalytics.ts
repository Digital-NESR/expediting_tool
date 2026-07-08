'use server';

import pool from '@/lib/db';
import type { BuyerRow, SupplierRow, RecentSession, WeeklyRateRow, SupplierResponseTimeRow } from './adminAnalytics';

/* ─── Re-export shared types ────────────────────────────────── */

export type { BuyerRow, SupplierRow, RecentSession, WeeklyRateRow, SupplierResponseTimeRow } from './adminAnalytics';

/* ─── Team-specific types ───────────────────────────────────── */

export interface TeamAnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  buyerEmails?: string[];
  countries?: string[];
  segments?: string[];
  supplierNames?: string[];
}

export interface TeamAnalyticsData {
  totalBatches: number;
  totalLinesExpedited: number;
  totalSuppliersContacted: number;
  totalActiveBuyers: number;
  totalEmailsSent: number;
  overallResponseRate: number | null;
  buyerBreakdown: BuyerRow[];
  supplierBreakdown: SupplierRow[];
  recentSessions: RecentSession[];
  weeklyRateData: WeeklyRateRow[];
  supplierResponseTime: SupplierResponseTimeRow[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptions {
  buyers: FilterOption[];
  countries: string[];
  segments: string[];
  suppliers: string[];
}

/* ─── WHERE-clause builder ──────────────────────────────────── */

function buildWhereClause(
  filters: TeamAnalyticsFilters,
  paramOffset = 0,
  tableAliases: { ae?: string; es?: string; s?: string } = {},
) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = paramOffset + 1;

  const ae = tableAliases.ae || 'ae';
  const es = tableAliases.es || 'es';
  const s  = tableAliases.s  || 's';

  if (filters.dateFrom) {
    conditions.push(`${ae}.dispatched_at >= $${idx}`);
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    conditions.push(`${ae}.dispatched_at <= $${idx}::date + interval '1 day'`);
    params.push(filters.dateTo);
    idx++;
  }
  if (filters.buyerEmails?.length) {
    conditions.push(`${ae}.dispatched_by = ANY($${idx})`);
    params.push(filters.buyerEmails);
    idx++;
  }
  if (filters.countries?.length) {
    conditions.push(`${s}.country = ANY($${idx})`);
    params.push(filters.countries);
    idx++;
  }
  if (filters.segments?.length) {
    conditions.push(`${s}.p_group = ANY($${idx})`);
    params.push(filters.segments);
    idx++;
  }
  if (filters.supplierNames?.length) {
    conditions.push(`${s}.supplier_name = ANY($${idx})`);
    params.push(filters.supplierNames);
    idx++;
  }

  return {
    where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
    nextIdx: idx,
  };
}

/**
 * Build a WHERE clause for session-only queries (expediting_sessions).
 * Only dateFrom, dateTo, and buyerEmails apply here since sessions
 * don't join to sap_open_po_master.
 */
function buildSessionWhereClause(
  filters: TeamAnalyticsFilters,
  paramOffset = 0,
  alias = 'es',
) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = paramOffset + 1;

  if (filters.dateFrom) {
    conditions.push(`${alias}.dispatched_at >= $${idx}`);
    params.push(filters.dateFrom);
    idx++;
  }
  if (filters.dateTo) {
    conditions.push(`${alias}.dispatched_at <= $${idx}::date + interval '1 day'`);
    params.push(filters.dateTo);
    idx++;
  }
  if (filters.buyerEmails?.length) {
    conditions.push(`${alias}.dispatched_by = ANY($${idx})`);
    params.push(filters.buyerEmails);
    idx++;
  }

  return {
    where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
    nextIdx: idx,
  };
}

/* ─── getTeamAnalyticsData ──────────────────────────────────── */

export async function getTeamAnalyticsData(
  filters: TeamAnalyticsFilters,
): Promise<TeamAnalyticsData> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  try {
    /* Build filter clauses for the different query shapes */
    const kpiWhere = buildWhereClause(filters, 0, { ae: 'ae', s: 's' });
    const buyerSessionWhere = buildSessionWhereClause(filters, 0, 'es');
    const supplierWhere = buildWhereClause(filters, 0, { ae: 'ae', s: 's' });
    const sessionsWhere = buildSessionWhereClause(filters, 0, 'es');
    const weeklyWhere = buildSessionWhereClause(filters, 0, 'es');
    const responseTimeWhere = buildWhereClause(filters, 0, { ae: 'ae', s: 's' });

    const [kpiRes, buyerRes, supplierRes, sessionsRes, weeklyRes, responseTimeRes] =
      await Promise.all([

        /* ── KPI block ── */
        pool.query(
          `SELECT
             COUNT(DISTINCT ae.expedite_token)                                    AS total_batches,
             COUNT(ae.id)                                                         AS total_lines_expedited,
             COUNT(DISTINCT s.supplier_name)                                      AS total_suppliers_contacted,
             COUNT(DISTINCT ae.dispatched_by)                                     AS total_active_buyers,
             ROUND(
               COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
                 / NULLIF(COUNT(ae.id), 0), 1
             )                                                                    AS overall_response_rate
           FROM active_expediting ae
           JOIN sap_open_po_master s
             ON ae.po_number = s.po_number AND ae.po_line = s.po_line
           ${kpiWhere.where}`,
          kpiWhere.params,
        ),

        /* ── Buyer breakdown ── */
        pool.query(
          `SELECT
             up.email,
             up.display_name,
             up.job_title,
             up.last_active_at,
             COUNT(DISTINCT es.id)                    AS total_sessions,
             COALESCE(SUM(es.total_po_lines), 0)      AS total_lines,
             COALESCE(SUM(es.total_suppliers), 0)     AS total_suppliers,
             COALESCE(SUM(es.total_emails_sent), 0)   AS total_emails,
             ROUND(AVG(es.response_rate_pct), 1)      AS avg_response_rate
           FROM user_profiles up
           LEFT JOIN expediting_sessions es ON es.dispatched_by = up.email
             ${buyerSessionWhere.where ? 'AND ' + buyerSessionWhere.where.replace(/^WHERE /, '') : ''}
           GROUP BY up.email, up.display_name, up.job_title, up.last_active_at
           HAVING COUNT(es.id) > 0
           ORDER BY total_lines DESC`,
          buyerSessionWhere.params,
        ),

        /* ── Supplier breakdown ── */
        pool.query(
          `SELECT
             s.supplier_name,
             COUNT(DISTINCT ae.expedite_token)                                    AS times_expedited,
             COUNT(ae.id)                                                         AS total_lines,
             COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END)          AS lines_responded,
             ROUND(
               COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
                 / NULLIF(COUNT(ae.id), 0), 1
             )                                                                    AS response_rate,
             MAX(CASE WHEN ae.workflow_state = 'Submitted' THEN ae.updated_at END) AS last_response
           FROM active_expediting ae
           JOIN sap_open_po_master s
             ON ae.po_number = s.po_number AND ae.po_line = s.po_line
           ${supplierWhere.where}
           GROUP BY s.supplier_name
           ORDER BY response_rate DESC NULLS LAST`,
          supplierWhere.params,
        ),

        /* ── Recent sessions ── */
        pool.query(
          `SELECT
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
           ${sessionsWhere.where}
           ORDER BY es.dispatched_at DESC
           LIMIT 20`,
          sessionsWhere.params,
        ),

        /* ── Weekly expediting vs responses trend ── */
        pool.query(
          `SELECT
             DATE_TRUNC('week', es.dispatched_at)   AS week,
             SUM(es.total_po_lines)                 AS lines_expedited,
             SUM(es.lines_responded)                AS lines_responded,
             ROUND(AVG(es.response_rate_pct), 1)    AS avg_response_rate,
             COUNT(*)                               AS sessions_count
           FROM expediting_sessions es
           ${weeklyWhere.where}
           GROUP BY DATE_TRUNC('week', es.dispatched_at)
           ORDER BY week ASC`,
          weeklyWhere.params,
        ),

        /* ── Avg response time by supplier ── */
        (() => {
          const base = buildWhereClause(filters, 0, { ae: 'ae', s: 's' });
          const extraConditions = [
            "ae.workflow_state = 'Submitted'",
            'ae.dispatched_at IS NOT NULL',
            'ae.updated_at IS NOT NULL',
          ];
          const combined = base.where
            ? base.where + ' AND ' + extraConditions.join(' AND ')
            : 'WHERE ' + extraConditions.join(' AND ');

          return pool.query(
            `SELECT
               s.supplier_name,
               ROUND(AVG(
                 EXTRACT(EPOCH FROM (ae.updated_at - ae.dispatched_at)) / 86400
               ), 1) AS avg_days_to_respond,
               COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) AS responses_count
             FROM active_expediting ae
             JOIN sap_open_po_master s
               ON ae.po_number = s.po_number AND ae.po_line = s.po_line
             ${combined}
             GROUP BY s.supplier_name
             HAVING COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) > 0
             ORDER BY avg_days_to_respond ASC`,
            base.params,
          );
        })(),
      ]);

    /* ── Compute total emails from a separate session-based query ── */
    const emailsWhere = buildSessionWhereClause(filters, 0, 'es');
    const emailsRes = await pool.query(
      `SELECT COALESCE(SUM(es.total_emails_sent), 0) AS total_emails
       FROM expediting_sessions es
       ${emailsWhere.where}`,
      emailsWhere.params,
    );

    const kpi = kpiRes.rows[0] ?? {};

    return {
      totalBatches:           Number(kpi.total_batches ?? 0),
      totalLinesExpedited:    Number(kpi.total_lines_expedited ?? 0),
      totalSuppliersContacted: Number(kpi.total_suppliers_contacted ?? 0),
      totalActiveBuyers:      Number(kpi.total_active_buyers ?? 0),
      totalEmailsSent:        Number(emailsRes.rows[0]?.total_emails ?? 0),
      overallResponseRate:    kpi.overall_response_rate != null
        ? Number(kpi.overall_response_rate)
        : null,

      buyerBreakdown: buyerRes.rows.map((r: Record<string, unknown>) => ({
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

      supplierBreakdown: supplierRes.rows.map((r: Record<string, unknown>) => ({
        supplier_name:   String(r.supplier_name ?? ''),
        times_expedited: Number(r.times_expedited ?? 0),
        total_lines:     Number(r.total_lines ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        response_rate:   r.response_rate != null ? Number(r.response_rate) : null,
        last_response:   toStr(r.last_response),
      })),

      recentSessions: sessionsRes.rows.map((r: Record<string, unknown>) => ({
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

      weeklyRateData: weeklyRes.rows.map((r: Record<string, unknown>) => ({
        week:              toStr(r.week) ?? '',
        lines_expedited:   Number(r.lines_expedited ?? 0),
        lines_responded:   Number(r.lines_responded ?? 0),
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
        sessions_count:    Number(r.sessions_count ?? 0),
      })),

      supplierResponseTime: responseTimeRes.rows.map((r: Record<string, unknown>) => ({
        supplier_name:       String(r.supplier_name ?? ''),
        avg_days_to_respond: Number(r.avg_days_to_respond ?? 0),
        responses_count:     Number(r.responses_count ?? 0),
      })),
    };
  } catch (err) {
    console.error('[getTeamAnalyticsData]', err);
    return {
      totalBatches: 0,
      totalLinesExpedited: 0,
      totalSuppliersContacted: 0,
      totalActiveBuyers: 0,
      totalEmailsSent: 0,
      overallResponseRate: null,
      buyerBreakdown: [],
      supplierBreakdown: [],
      recentSessions: [],
      weeklyRateData: [],
      supplierResponseTime: [],
    };
  }
}

/* ─── getFilterOptions ──────────────────────────────────────── */

export async function getFilterOptions(): Promise<FilterOptions> {
  try {
    const [buyersRes, countriesRes, segmentsRes, suppliersRes] = await Promise.all([
      pool.query(`
        SELECT up.email AS value, COALESCE(up.display_name, up.email) AS label
        FROM user_profiles up
        WHERE EXISTS (
          SELECT 1 FROM expediting_sessions es WHERE es.dispatched_by = up.email
        )
        ORDER BY label ASC
      `),

      pool.query(`
        SELECT DISTINCT s.country
        FROM sap_open_po_master s
        WHERE s.country IS NOT NULL AND s.country <> ''
        ORDER BY s.country ASC
      `),

      pool.query(`
        SELECT DISTINCT s.p_group
        FROM sap_open_po_master s
        WHERE s.p_group IS NOT NULL AND s.p_group <> ''
        ORDER BY s.p_group ASC
      `),

      pool.query(`
        SELECT DISTINCT s.supplier_name
        FROM sap_open_po_master s
        JOIN active_expediting ae
          ON ae.po_number = s.po_number AND ae.po_line = s.po_line
        WHERE s.supplier_name IS NOT NULL AND s.supplier_name <> ''
        ORDER BY s.supplier_name ASC
      `),
    ]);

    return {
      buyers: buyersRes.rows.map((r: Record<string, unknown>) => ({
        value: String(r.value ?? ''),
        label: String(r.label ?? ''),
      })),
      countries: countriesRes.rows.map((r: Record<string, unknown>) => String(r.country ?? '')),
      segments: segmentsRes.rows.map((r: Record<string, unknown>) => String(r.p_group ?? '')),
      suppliers: suppliersRes.rows.map((r: Record<string, unknown>) => String(r.supplier_name ?? '')),
    };
  } catch (err) {
    console.error('[getFilterOptions]', err);
    return {
      buyers: [],
      countries: [],
      segments: [],
      suppliers: [],
    };
  }
}
