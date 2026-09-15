'use server';

import pool from '@/lib/db';
import { getCachedSession } from '@/lib/session';
import { isPlatformAdminEmail, normalizeEmail } from '@/lib/require-access';
import { ensureActiveExpeditingColumns } from '@/lib/po-expediting-schema';
import type {
  BuyerRow,
  SupplierRow,
  RecentSession,
  WeeklyRateRow,
  SupplierResponseTimeRow,
} from './adminAnalytics';

/* ─── Access ─────────────────────────────────────────────────── */

/**
 * Cross-buyer PO reads: platform admins, plus users with approved
 * `po_expediting` access. `/po-expediting/team-analytics` ("All Analytics") is
 * linked in the PO sidebar for every approved buyer, so `requireAdmin()` alone
 * would break that page; this still shuts out signed-in users of other tools,
 * who could previously dump every buyer's activity through these actions.
 * Reads degrade to an empty shape so panels render an empty state.
 */
async function hasPoTeamAccess(): Promise<boolean> {
  const session = await getCachedSession();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return false;
  if (isPlatformAdminEmail(email) || session?.user?.isAdmin) return true;
  return session?.user?.toolAccess?.po_expediting?.status === 'approved';
}

/* ─── Re-export shared types ────────────────────────────────── */

export type {
  BuyerRow,
  SupplierRow,
  RecentSession,
  WeeklyRateRow,
  SupplierResponseTimeRow,
} from './adminAnalytics';

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

/* ─── Filter-condition builders ─────────────────────────────── */

/** `WHERE ` + the conditions, or '' when there are none. */
function whereOf(conditions: string[]): string {
  return conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
}

/**
 * Conditions for line-level queries over `active_expediting`.
 *
 * Every filter now reads the dispatch-time SNAPSHOT on `ae` — country, p_group
 * and supplier_name included. They used to reference the `s` alias of
 * `sap_open_po_master`, which n8n truncates and reloads nightly with only
 * currently-open POs, so a line whose PO had since closed could not match any
 * filter and disappeared from every total. Returning `conditions` rather than a
 * pre-joined `WHERE ...` string lets each call site splice them into whatever
 * clause it needs (a WHERE, or a LEFT JOIN's ON) without string-patching.
 */
function buildLineConditions(filters: TeamAnalyticsFilters, paramOffset = 0, alias = 'ae') {
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
  if (filters.countries?.length) {
    conditions.push(`${alias}.country = ANY($${idx})`);
    params.push(filters.countries);
    idx++;
  }
  if (filters.segments?.length) {
    conditions.push(`${alias}.p_group = ANY($${idx})`);
    params.push(filters.segments);
    idx++;
  }
  if (filters.supplierNames?.length) {
    conditions.push(`${alias}.supplier_name = ANY($${idx})`);
    params.push(filters.supplierNames);
    idx++;
  }

  return { conditions, params, nextIdx: idx };
}

/**
 * Conditions for session-level queries (`expediting_sessions`). Only dateFrom,
 * dateTo and buyerEmails apply: a session row carries no line attributes.
 */
function buildSessionConditions(filters: TeamAnalyticsFilters, paramOffset = 0, alias = 'es') {
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

  return { conditions, params, nextIdx: idx };
}

/* ─── getTeamAnalyticsData ──────────────────────────────────── */

/**
 * The single cross-buyer analytics query set. `adminAnalytics.getExpeditingAnalytics`
 * was a filter-less clone of this and has been deleted; the admin panel now calls
 * this with `{}`.
 *
 * That merge does NOT widen what the admin panel exposes: the panel already called
 * this action directly for every filtered refresh, so `hasPoTeamAccess` was already
 * the effective gate on this data for admin-panel users. What it does change is that
 * the unfiltered admin view is now reachable by an approved PO user too — which is
 * exactly the gate `/po-expediting/team-analytics` needs, since that page is offered
 * to every approved buyer and would break under an admin-only guard.
 */
export async function getTeamAnalyticsData(
  filters: TeamAnalyticsFilters,
): Promise<TeamAnalyticsData> {
  const toStr = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };

  const empty: TeamAnalyticsData = {
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

  if (!(await hasPoTeamAccess())) return empty;

  try {
    await ensureActiveExpeditingColumns();

    /* One line-level condition set and one session-level set, reused by every
       query below. The six queries used to rebuild these independently. */
    const line = buildLineConditions(filters);
    const session = buildSessionConditions(filters);

    /* Response-time query: the shared filters plus its own guards, appended as
       conditions rather than patched into a finished WHERE string. Note the
       guard is on responded_at — a line can be 'Submitted' with a NULL
       responded_at only if it predates that column (see the backfill). */
    const responseTimeConditions = [
      ...line.conditions,
      "ae.workflow_state = 'Submitted'",
      'ae.dispatched_at IS NOT NULL',
      'ae.responded_at IS NOT NULL',
    ];

    const [kpiRes, buyerRes, supplierRes, sessionsRes, weeklyRes, responseTimeRes, emailsRes] =
      await Promise.all([
        /* ── KPI block ──
           No join to sap_open_po_master at all: the supplier name is snapshotted
           on active_expediting at dispatch, so lines whose PO has since closed
           still count toward the totals and the response-rate denominator. */
        pool.query(
          `SELECT
             COUNT(DISTINCT ae.expedite_token)                                    AS total_batches,
             COUNT(ae.id)                                                         AS total_lines_expedited,
             COUNT(DISTINCT ae.supplier_name)                                     AS total_suppliers_contacted,
             COUNT(DISTINCT ae.dispatched_by)                                     AS total_active_buyers,
             ROUND(
               COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
                 / NULLIF(COUNT(ae.id), 0), 1
             )                                                                    AS overall_response_rate
           FROM active_expediting ae
           ${whereOf(line.conditions)}`,
          line.params,
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
             ${session.conditions.length ? 'AND ' + session.conditions.join(' AND ') : ''}
           GROUP BY up.email, up.display_name, up.job_title, up.last_active_at
           HAVING COUNT(es.id) > 0
           ORDER BY total_lines DESC`,
          session.params,
        ),

        /* ── Supplier breakdown ── */
        pool.query(
          `SELECT
             ae.supplier_name,
             COUNT(DISTINCT ae.expedite_token)                                    AS times_expedited,
             COUNT(ae.id)                                                         AS total_lines,
             COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END)          AS lines_responded,
             ROUND(
               COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
                 / NULLIF(COUNT(ae.id), 0), 1
             )                                                                    AS response_rate,
             MAX(ae.responded_at)                                                 AS last_response
           FROM active_expediting ae
           ${whereOf(line.conditions)}
           GROUP BY ae.supplier_name
           ORDER BY response_rate DESC NULLS LAST`,
          line.params,
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
           ${whereOf(session.conditions)}
           ORDER BY es.dispatched_at DESC
           LIMIT 20`,
          session.params,
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
           ${whereOf(session.conditions)}
           GROUP BY DATE_TRUNC('week', es.dispatched_at)
           ORDER BY week ASC`,
          session.params,
        ),

        /* ── Avg response time by supplier ──
           responded_at, not updated_at: saveBuyerComment bumps updated_at, so
           every buyer note used to shorten the supplier's apparent turnaround. */
        pool.query(
          `SELECT
             ae.supplier_name,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (ae.responded_at - ae.dispatched_at)) / 86400
             ), 1) AS avg_days_to_respond,
             COUNT(*) AS responses_count
           FROM active_expediting ae
           ${whereOf(responseTimeConditions)}
           GROUP BY ae.supplier_name
           ORDER BY avg_days_to_respond ASC`,
          line.params,
        ),

        /* ── Total emails ── folded into the parallel batch; it used to run
           serially after all six others for no reason. */
        pool.query(
          `SELECT COALESCE(SUM(es.total_emails_sent), 0) AS total_emails
           FROM expediting_sessions es
           ${whereOf(session.conditions)}`,
          session.params,
        ),
      ]);

    const kpi = kpiRes.rows[0] ?? {};

    return {
      totalBatches: Number(kpi.total_batches ?? 0),
      totalLinesExpedited: Number(kpi.total_lines_expedited ?? 0),
      totalSuppliersContacted: Number(kpi.total_suppliers_contacted ?? 0),
      totalActiveBuyers: Number(kpi.total_active_buyers ?? 0),
      totalEmailsSent: Number(emailsRes.rows[0]?.total_emails ?? 0),
      overallResponseRate:
        kpi.overall_response_rate != null ? Number(kpi.overall_response_rate) : null,

      buyerBreakdown: buyerRes.rows.map((r: Record<string, unknown>) => ({
        email: String(r.email ?? ''),
        display_name: toStr(r.display_name),
        job_title: toStr(r.job_title),
        last_active_at: toStr(r.last_active_at),
        total_sessions: Number(r.total_sessions ?? 0),
        total_lines: Number(r.total_lines ?? 0),
        total_suppliers: Number(r.total_suppliers ?? 0),
        total_emails: Number(r.total_emails ?? 0),
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
      })),

      supplierBreakdown: supplierRes.rows.map((r: Record<string, unknown>) => ({
        supplier_name: String(r.supplier_name ?? ''),
        times_expedited: Number(r.times_expedited ?? 0),
        total_lines: Number(r.total_lines ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        response_rate: r.response_rate != null ? Number(r.response_rate) : null,
        last_response: toStr(r.last_response),
      })),

      recentSessions: sessionsRes.rows.map((r: Record<string, unknown>) => ({
        session_ref: String(r.session_ref ?? ''),
        dispatched_at: toStr(r.dispatched_at) ?? '',
        dispatched_by: String(r.dispatched_by ?? ''),
        display_name: toStr(r.display_name),
        total_suppliers: Number(r.total_suppliers ?? 0),
        total_po_lines: Number(r.total_po_lines ?? 0),
        total_emails_sent: Number(r.total_emails_sent ?? 0),
        suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
        response_rate_pct: r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
        fully_closed: r.fully_closed != null ? Boolean(r.fully_closed) : null,
      })),

      weeklyRateData: weeklyRes.rows.map((r: Record<string, unknown>) => ({
        week: toStr(r.week) ?? '',
        lines_expedited: Number(r.lines_expedited ?? 0),
        lines_responded: Number(r.lines_responded ?? 0),
        avg_response_rate: r.avg_response_rate != null ? Number(r.avg_response_rate) : null,
        sessions_count: Number(r.sessions_count ?? 0),
      })),

      supplierResponseTime: responseTimeRes.rows.map((r: Record<string, unknown>) => ({
        supplier_name: String(r.supplier_name ?? ''),
        avg_days_to_respond: Number(r.avg_days_to_respond ?? 0),
        responses_count: Number(r.responses_count ?? 0),
      })),
    };
  } catch (err) {
    console.error('[getTeamAnalyticsData]', err);
    return empty;
  }
}

/* ─── getFilterOptions ──────────────────────────────────────── */

export async function getFilterOptions(): Promise<FilterOptions> {
  const empty: FilterOptions = { buyers: [], countries: [], segments: [], suppliers: [] };

  // The buyer list is a roster of colleagues' names and emails — same gate as the data.
  if (!(await hasPoTeamAccess())) return empty;

  try {
    await ensureActiveExpeditingColumns();

    /* Every dropdown is drawn from the SAME snapshot columns the filters now match
       on. Reading country/segment from sap_open_po_master instead would offer
       values no expedited line carries, and — because that table is reloaded
       nightly with only still-open POs — would omit values that only closed lines
       carry, making them unfilterable. */
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
        SELECT DISTINCT ae.country
        FROM active_expediting ae
        WHERE ae.country IS NOT NULL AND ae.country <> ''
        ORDER BY ae.country ASC
      `),

      pool.query(`
        SELECT DISTINCT ae.p_group
        FROM active_expediting ae
        WHERE ae.p_group IS NOT NULL AND ae.p_group <> ''
        ORDER BY ae.p_group ASC
      `),

      pool.query(`
        SELECT DISTINCT ae.supplier_name
        FROM active_expediting ae
        WHERE ae.supplier_name IS NOT NULL AND ae.supplier_name <> ''
        ORDER BY ae.supplier_name ASC
      `),
    ]);

    return {
      buyers: buyersRes.rows.map((r: Record<string, unknown>) => ({
        value: String(r.value ?? ''),
        label: String(r.label ?? ''),
      })),
      countries: countriesRes.rows.map((r: Record<string, unknown>) => String(r.country ?? '')),
      segments: segmentsRes.rows.map((r: Record<string, unknown>) => String(r.p_group ?? '')),
      suppliers: suppliersRes.rows.map((r: Record<string, unknown>) =>
        String(r.supplier_name ?? ''),
      ),
    };
  } catch (err) {
    console.error('[getFilterOptions]', err);
    return empty;
  }
}
