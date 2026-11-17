'use server';

import pool from '@/lib/db';
import { currentActor } from '@/lib/require-access';
import {
  ensureExpeditingMatIdSnapshot,
  ensurePoExpeditingSchema,
} from '@/lib/po-expediting-schema';

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

export interface MyAnalyticsFilters {
  /** Inclusive, as the date input gives it: YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive of the whole day, not the midnight at its start. */
  dateTo?: string;
}

/** A timestamp or date column as an ISO string, or null. Shared: it was copied into three. */
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/* ─── Scope ───────────────────────────────────── */

/**
 * The buyer-and-date WHERE fragment every query on this screen shares.
 *
 * One parameter list for all of them: $1 is always the buyer, and the dates take $2 and $3 when
 * they are set. Postgres is happy for a placeholder to appear several times in one statement,
 * which is what lets the KPI block apply the same range in four subqueries without passing the
 * value four times.
 *
 * `dispatched_at` is the date everywhere, including on the session table, so the range always
 * means "work I sent out in this window" rather than something that shifts meaning per chart.
 *
 * It is a shared helper rather than a block inside each function because the export reads the
 * same numbers the page shows. A second copy of this that fell a day out of step would put a
 * workbook in someone's inbox that disagreed with the screen it was exported from, and the
 * spreadsheet is the half that gets forwarded.
 */
function buyerScope(
  userEmail: string,
  filters: MyAnalyticsFilters,
): { params: unknown[]; inRange: (alias: string) => string } {
  const params: unknown[] = [userEmail];
  const fromIdx = filters.dateFrom ? params.push(filters.dateFrom) : null;
  const toIdx = filters.dateTo ? params.push(filters.dateTo) : null;

  const inRange = (alias: string): string => {
    const conditions: string[] = [];
    if (fromIdx) conditions.push(`${alias}.dispatched_at >= $${fromIdx}`);
    /* +1 day, so a range ending on the 30th includes everything dispatched ON the 30th rather
       than stopping at its first second. */
    if (toIdx) conditions.push(`${alias}.dispatched_at <= $${toIdx}::date + interval '1 day'`);
    return conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  };

  return { params, inRange };
}

/* ─── getMyExpeditingAnalytics ───────────────────────────────── */

export async function getMyExpeditingAnalytics(
  filters: MyAnalyticsFilters = {},
): Promise<MyAnalytics> {
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

  const { params, inRange } = buyerScope(userEmail, filters);

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
             FROM active_expediting ae
             WHERE LOWER(ae.dispatched_by) = $1${inRange('ae')}
          ) AS total_lines,
          (SELECT COUNT(DISTINCT ae.supplier_name)
             FROM active_expediting ae
             WHERE LOWER(ae.dispatched_by) = $1${inRange('ae')}
          ) AS total_suppliers,
          (SELECT COALESCE(SUM(es.total_emails_sent), 0)
             FROM expediting_sessions es
             WHERE LOWER(es.dispatched_by) = $1${inRange('es')}
          ) AS total_emails,
          (SELECT ROUND(
             COUNT(CASE WHEN ae.workflow_state = 'Submitted' THEN 1 END) * 100.0
               / NULLIF(COUNT(*), 0), 1
           ) FROM active_expediting ae
            WHERE LOWER(ae.dispatched_by) = $1${inRange('ae')}) AS response_rate
      `,
        params,
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
        WHERE LOWER(ae.dispatched_by) = $1${inRange('ae')}
        GROUP BY ae.supplier_name
        ORDER BY response_rate DESC NULLS LAST
      `,
        params,
      ),

      /* ── My recent sessions ── */
      pool.query(
        `
        SELECT
          es.session_ref,
          es.dispatched_at,
          es.total_suppliers,
          es.total_po_lines,
          es.total_emails_sent,
          es.suppliers_responded,
          es.response_rate_pct,
          es.fully_closed
        FROM expediting_sessions es
        WHERE LOWER(es.dispatched_by) = $1${inRange('es')}
        ORDER BY es.dispatched_at DESC
        LIMIT 20
      `,
        params,
      ),

      /* ── Weekly expediting vs responses trend ──
         Counted from the lines, like the KPI card above it. Read off the session table it
         disagreed with that card on the same screen: for one buyer the card showed 270 lines
         while the chart beside it summed 1,263, because a session's totals are frozen at
         dispatch and lines are closed out of the line table afterwards.

         The rate changes with it, from an average of per-session rates to the pooled rate: a
         session of 2 lines used to weigh as heavily in a week as one of 469. */
      pool.query(
        `
        SELECT
          DATE_TRUNC('week', ae.dispatched_at)                     AS week,
          COUNT(ae.id)                                             AS lines_expedited,
          COUNT(*) FILTER (WHERE ae.workflow_state = 'Submitted')  AS lines_responded,
          ROUND(
            COUNT(*) FILTER (WHERE ae.workflow_state = 'Submitted') * 100.0
              / NULLIF(COUNT(ae.id), 0), 1
          )                                                        AS avg_response_rate,
          COUNT(DISTINCT ae.session_ref)                           AS sessions_count
        FROM active_expediting ae
        WHERE LOWER(ae.dispatched_by) = $1
          AND ae.dispatched_at IS NOT NULL${inRange('ae')}
        GROUP BY DATE_TRUNC('week', ae.dispatched_at)
        ORDER BY week ASC
      `,
        params,
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
          AND ae.responded_at IS NOT NULL${inRange('ae')}
        GROUP BY ae.supplier_name
        ORDER BY avg_days_to_respond ASC
      `,
        params,
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
  /**
   * False once the PO has left `sap_open_po_master` -- goods-received, cancelled or
   * otherwise closed since we expedited it. Lines dispatched before the snapshot landed
   * (14 Sep 2026) then have nothing left to show, and the screens say so rather than
   * rendering a row of dashes that reads as a fault.
   */
  in_sap: boolean;
}

export async function getSupplierDetail(supplierName: string): Promise<SupplierDetailLine[]> {
  // Scope to the signed-in buyer; never to a caller-supplied email.
  const actor = await currentActor();
  if (!actor) return [];
  const userEmail = actor.email;
  try {
    await ensurePoExpeditingSchema();
    await ensureExpeditingMatIdSnapshot();
    /* Matched and read off the snapshot; the master is LEFT JOINed for the live
       SAP delivery code and to tell whether the PO is still open at all.
       sap_mat_id joined the snapshot in 005 -- before that it came from the
       master alone and went blank as soon as a PO closed. The old INNER JOIN on
       s.supplier_name hid every line whose PO had since closed, so this
       drill-down showed fewer lines than the supplier row that opened it. */
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
        COALESCE(ae.sap_mat_id,        s.sap_mat_id)        AS sap_mat_id,
        COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
        COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
        COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
        s.delivery_code  AS sap_delivery_code,
        /* The master holds only POs that are still open, so this is "the PO was
           goods-received, cancelled or otherwise closed since we expedited it".
           The screens need it to tell a closed PO apart from a rendering fault. */
        (s.po_number IS NOT NULL) AS in_sap
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
      in_sap: r.in_sap === true,
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
  /**
   * False once the PO has left `sap_open_po_master` -- goods-received, cancelled or
   * otherwise closed since we expedited it. Lines dispatched before the snapshot landed
   * (14 Sep 2026) then have nothing left to show, and the screens say so rather than
   * rendering a row of dashes that reads as a fault.
   */
  in_sap: boolean;
}

export async function getSessionDetail(sessionRef: string): Promise<SessionDetailLine[]> {
  // Scope to the signed-in buyer; never to a caller-supplied email.
  const actor = await currentActor();
  if (!actor) return [];
  const userEmail = actor.email;
  try {
    await ensurePoExpeditingSchema();
    await ensureExpeditingMatIdSnapshot();
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
        COALESCE(ae.sap_mat_id,        s.sap_mat_id)        AS sap_mat_id,
        COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
        COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
        COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
        s.delivery_code  AS sap_delivery_code,
        /* The master holds only POs that are still open, so this is "the PO was
           goods-received, cancelled or otherwise closed since we expedited it".
           The screens need it to tell a closed PO apart from a rendering fault. */
        (s.po_number IS NOT NULL) AS in_sap
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
      in_sap: r.in_sap === true,
    }));
  } catch (err) {
    console.error('[getSessionDetail]', err);
    return [];
  }
}

/* ─── Workbook export ─────────────────────────── */

/** One dispatched PO line, with the supplier's answer to it. */
export interface MyExportLine {
  session_ref: string;
  dispatched_at: string;
  responded_at: string | null;
  po_number: string;
  po_line: string;
  supplier_name: string;
  supplier_id: string | null;
  country: string | null;
  p_group: string | null;
  sap_mat_id: string | null;
  item_description: string | null;
  open_qty: number | null;
  open_po_value_usd: number | null;
  original_delivery_date: string | null;
  workflow_state: string;
  current_status: string | null;
  new_delivery_date: string | null;
  supplier_comments: string | null;
  buyer_comments: string | null;
}

/** Like {@link MyRecentSession}, plus the two columns the screen's list does not show. */
export interface MyExportSession extends MyRecentSession {
  lines_responded: number | null;
  closed_at: string | null;
}

export interface MyAnalyticsExport {
  buyer: { name: string; email: string };
  generatedAt: string;
  filters: { dateFrom: string | null; dateTo: string | null };
  kpis: {
    totalLinesExpedited: number;
    totalSuppliersContacted: number;
    totalEmailsSent: number;
    overallResponseRate: number | null;
  };
  supplierBreakdown: MySupplierRow[];
  supplierResponseTime: MySupplierResponseTimeRow[];
  weeklyRateData: MyWeeklyRateRow[];
  lines: MyExportLine[];
  sessions: MyExportSession[];
}

/**
 * Everything the My Analytics workbook puts on its sheets, for the signed-in buyer only.
 *
 * Two things are deliberate here.
 *
 * The aggregates come from `getMyExpeditingAnalytics` rather than from queries of their own, so
 * the Summary and vendor sheets cannot disagree with the cards the person was looking at when
 * they pressed Export. Only what the screen does not hold is queried afresh: the line-level
 * rows, which live behind a per-supplier modal, and the sessions, which the page caps at 20
 * because it is a list and not a report.
 *
 * And the buyer is the session's, never an argument. Every export in a `'use server'` file is a
 * public POST endpoint, so a buyer-email parameter here would hand anyone who can sign in a full
 * line-level dump of any colleague's expediting -- the same reasoning as
 * `getMyExpeditingAnalytics`, and it matters more here because this one leaves as a file.
 */
export async function getMyAnalyticsExport(
  filters: MyAnalyticsFilters = {},
): Promise<MyAnalyticsExport | null> {
  const actor = await currentActor();
  if (!actor) return null;
  const userEmail = actor.email;

  try {
    await ensurePoExpeditingSchema();
    await ensureExpeditingMatIdSnapshot();
    const { params, inRange } = buyerScope(userEmail, filters);

    const [analytics, linesRes, sessionsRes] = await Promise.all([
      getMyExpeditingAnalytics(filters),

      /* -- Every line I dispatched --
         The master is LEFT JOINed for the two fields the snapshot does not carry, exactly as the
         drill-down modals do it. An INNER JOIN would drop every line whose PO has since closed,
         which is most of the finished work and the part a performance review is about. */
      pool.query(
        `
        SELECT
          ae.session_ref,
          ae.dispatched_at,
          ae.responded_at,
          ae.po_number,
          ae.po_line,
          COALESCE(NULLIF(ae.supplier_name, ''), s.supplier_name, 'Unknown Supplier') AS supplier_name,
          ae.supplier_id,
          ae.country,
          ae.p_group,
          COALESCE(ae.sap_mat_id,        s.sap_mat_id)        AS sap_mat_id,
          COALESCE(ae.item_description,  s.item_description)  AS item_description,
          COALESCE(ae.open_qty,          s.open_qty)          AS open_qty,
          COALESCE(ae.open_po_value_usd, s.open_po_value_usd) AS open_po_value_usd,
          COALESCE(ae.delivery_date,     s.delivery_date)     AS original_delivery_date,
          ae.workflow_state,
          ae.current_status,
          ae.new_delivery_date,
          ae.supplier_comments,
          ae.buyer_comments
        FROM active_expediting ae
        LEFT JOIN sap_open_po_master s
          ON ae.po_number = s.po_number AND ae.po_line = s.po_line
        WHERE LOWER(ae.dispatched_by) = $1${inRange('ae')}
        ORDER BY ae.dispatched_at DESC, supplier_name, ae.po_number, ae.po_line
      `,
        params,
      ),

      /* -- Every session, uncapped --
         The screen's list stops at 20 because it is a list. A workbook that silently did the
         same would be read as the whole period. */
      pool.query(
        `
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
          es.closed_at
        FROM expediting_sessions es
        WHERE LOWER(es.dispatched_by) = $1${inRange('es')}
        ORDER BY es.dispatched_at DESC
      `,
        params,
      ),
    ]);

    return {
      buyer: { name: actor.name, email: actor.email },
      generatedAt: new Date().toISOString(),
      filters: { dateFrom: filters.dateFrom ?? null, dateTo: filters.dateTo ?? null },
      kpis: {
        totalLinesExpedited: analytics.totalLinesExpedited,
        totalSuppliersContacted: analytics.totalSuppliersContacted,
        totalEmailsSent: analytics.totalEmailsSent,
        overallResponseRate: analytics.overallResponseRate,
      },
      supplierBreakdown: analytics.supplierBreakdown,
      supplierResponseTime: analytics.supplierResponseTime,
      weeklyRateData: analytics.weeklyRateData,

      lines: linesRes.rows.map((r) => ({
        session_ref: String(r.session_ref ?? ''),
        dispatched_at: toStr(r.dispatched_at) ?? '',
        responded_at: toStr(r.responded_at),
        po_number: String(r.po_number ?? ''),
        po_line: String(r.po_line ?? ''),
        supplier_name: String(r.supplier_name ?? ''),
        supplier_id: toStr(r.supplier_id),
        country: toStr(r.country),
        p_group: toStr(r.p_group),
        sap_mat_id: toStr(r.sap_mat_id),
        item_description: toStr(r.item_description),
        open_qty: r.open_qty != null ? Number(r.open_qty) : null,
        open_po_value_usd: r.open_po_value_usd != null ? Number(r.open_po_value_usd) : null,
        original_delivery_date: toStr(r.original_delivery_date),
        workflow_state: String(r.workflow_state ?? ''),
        current_status: toStr(r.current_status),
        new_delivery_date: toStr(r.new_delivery_date),
        supplier_comments: toStr(r.supplier_comments),
        buyer_comments: toStr(r.buyer_comments),
      })),

      sessions: sessionsRes.rows.map((r) => ({
        session_ref: String(r.session_ref ?? ''),
        dispatched_at: toStr(r.dispatched_at) ?? '',
        total_suppliers: Number(r.total_suppliers ?? 0),
        total_po_lines: Number(r.total_po_lines ?? 0),
        total_emails_sent: Number(r.total_emails_sent ?? 0),
        suppliers_responded: r.suppliers_responded != null ? Number(r.suppliers_responded) : null,
        lines_responded: r.lines_responded != null ? Number(r.lines_responded) : null,
        response_rate_pct: r.response_rate_pct != null ? Number(r.response_rate_pct) : null,
        fully_closed: r.fully_closed != null ? Boolean(r.fully_closed) : null,
        closed_at: toStr(r.closed_at),
      })),
    };
  } catch (err) {
    console.error('[getMyAnalyticsExport]', err);
    return null;
  }
}
