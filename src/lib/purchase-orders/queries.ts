/**
 * The Purchase Orders overview on Supply Chain Analytics, read from the SAP extract warehouse.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and nothing in here resolves an actor. The caller — the page, or the server action
 * in `@/app/actions/purchase-orders` — has already decided the reader may look.
 *
 * ── WHAT THIS READS ─────────────────────────────────────────────────────────────────────────
 * `core.supplychain` — 747k PO lines across 235k purchase orders and 4.4k suppliers, spanning
 * July 2021 to date, refreshed daily. Plus `track.supplier_directory` (code → name) so the
 * supplier chart shows names rather than SAP numbers.
 *
 * ── THE TWO DATA TRAPS IN THIS TABLE ────────────────────────────────────────────────────────
 * Both were found by profiling before any chart was drawn, and both would have produced a
 * confident, wrong board:
 *
 *  1. `supplier_promise_date` is NOT an independent promise. It equals `delv_date` on all
 *     747,411 rows that have both — the same data under two names. An on-time-delivery metric
 *     built from that pair reports 100% on every row and is meaningless. The honest comparison
 *     is against `requested_delv_date`, which is a genuine, separately-sourced requirement date;
 *     measured that way adherence is ~33%. That is the figure `scheduleAdherence` returns.
 *
 *  2. `document_date` contains values out to the year 2202. `po_release_date` is clean and
 *     present on 98.4% of rows, so every time series here is built on it and rows without one
 *     are excluded rather than bucketed into a wrong period.
 *
 * ── WHY SQL, NOT JS ─────────────────────────────────────────────────────────────────────────
 * Unlike the travel board, which pulls rows and aggregates in JS so one definition of "which
 * bookings count" applies everywhere, this table is three orders of magnitude larger. Every
 * figure below is aggregated in Postgres and only the grouped result travels. The shared
 * definitions that matter — which rows are in scope, and what the filter bar selected — live in
 * `./filters` and every query here composes both.
 */

import { cache } from 'react';
import materialsPool from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import {
  BASE_SCOPE,
  EMPTY_FILTERS,
  baseScope,
  buildFilterSql,
  type PoFilters,
} from './filters';

const log = logger('purchase-orders');

/** How far back the time series runs. */
const TREND_MONTHS = 36;

export interface Totals {
  lines: number;
  orders: number;
  suppliers: number;
  valueUsd: number;
  openValueUsd: number;
  countries: number;
  firstRelease: string | null;
  lastRelease: string | null;
}

export interface TrendPoint {
  month: string;
  label: string;
  valueUsd: number;
  lines: number;
}

export interface DimensionSlice {
  name: string;
  valueUsd: number;
  lines: number;
}

export interface DeliverySlice {
  status: string;
  lines: number;
  valueUsd: number;
  openValueUsd: number;
}

export interface Adherence {
  measured: number;
  onTime: number;
  late: number;
  pctOnTime: number;
  medianLeadDays: number | null;
}

export interface PurchaseOrderAnalytics {
  totals: Totals;
  trend: TrendPoint[];
  byCountry: DimensionSlice[];
  byMaterialGroup: DimensionSlice[];
  byPurchasingGroup: DimensionSlice[];
  byMaterialType: DimensionSlice[];
  bySupplier: DimensionSlice[];
  delivery: DeliverySlice[];
  adherence: Adherence;
  loadedAt: string | null;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-01` → `Oct 26`, for an axis that has to fit 36 of them. */
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** The scope and parameters every query below shares, for one set of selected filters. */
function scopeFor(filters: PoFilters) {
  const { where, params } = buildFilterSql(filters);
  return { scope: `${BASE_SCOPE}${where}`, params };
}

async function totals(filters: PoFilters): Promise<Totals> {
  const { scope, params } = scopeFor(filters);
  const { rows } = await materialsPool.query(
    `SELECT COUNT(*)::bigint                          AS lines,
            COUNT(DISTINCT purchase_doc)::bigint      AS orders,
            COUNT(DISTINCT supplier_num)::bigint      AS suppliers,
            COUNT(DISTINCT country)::int              AS countries,
            SUM(net_order_val_usd)::numeric           AS value_usd,
            SUM(COALESCE(still_delv_val_usd, 0))::numeric AS open_value_usd,
            MIN(po_release_date)::date                AS first_release,
            MAX(po_release_date)::date                AS last_release
       FROM core.supplychain
      WHERE ${scope}`,
    params,
  );
  const r = rows[0];
  const iso = (v: unknown) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v) : null;
  return {
    lines: num(r.lines),
    orders: num(r.orders),
    suppliers: num(r.suppliers),
    countries: num(r.countries),
    valueUsd: num(r.value_usd),
    openValueUsd: num(r.open_value_usd),
    firstRelease: iso(r.first_release),
    lastRelease: iso(r.last_release),
  };
}

async function trend(filters: PoFilters): Promise<TrendPoint[]> {
  /* `$1` is the window length, so the filter placeholders start at $2. */
  const { where, params } = buildFilterSql(filters, 2);
  const { rows } = await materialsPool.query(
    `SELECT to_char(date_trunc('month', po_release_date), 'YYYY-MM') AS month,
            SUM(net_order_val_usd)::numeric AS value_usd,
            COUNT(*)::bigint                AS lines
       FROM core.supplychain
      WHERE ${BASE_SCOPE}
        AND po_release_date >= date_trunc('month', CURRENT_DATE)
                             - make_interval(months => $1::int - 1)
        ${where}
      GROUP BY 1
      ORDER BY 1`,
    [TREND_MONTHS, ...params],
  );
  return rows.map((r) => ({
    month: String(r.month),
    label: monthLabel(String(r.month)),
    valueUsd: num(r.value_usd),
    lines: num(r.lines),
  }));
}

/**
 * The dimensions the ranked charts group by.
 *
 * Interpolated into SQL, never parameterised — Postgres cannot parameterise an identifier. Safe
 * because callers pass a literal from this object and nothing here is reachable from a request
 * parameter; the allow-list makes that structural rather than a promise.
 */
const DIMENSIONS = {
  country: 'country',
  materialGroup: 'mat_group_desc',
  purchasingGroup: 'pg_name',
  materialType: 'mat_type_desc',
} as const;

async function byDimension(
  column: (typeof DIMENSIONS)[keyof typeof DIMENSIONS],
  limit: number,
  filters: PoFilters,
): Promise<DimensionSlice[]> {
  const { where, params } = buildFilterSql(filters, 2);
  const { rows } = await materialsPool.query(
    `SELECT COALESCE(NULLIF(TRIM(${column}), ''), 'Unspecified') AS name,
            SUM(net_order_val_usd)::numeric AS value_usd,
            COUNT(*)::bigint                AS lines
       FROM core.supplychain
      WHERE ${BASE_SCOPE}${where}
      GROUP BY 1
      ORDER BY 2 DESC NULLS LAST
      LIMIT $1`,
    [limit, ...params],
  );
  return rows.map((r) => ({ name: String(r.name), valueUsd: num(r.value_usd), lines: num(r.lines) }));
}

/** Top suppliers by spend, named via the warehouse's own supplier directory. */
async function bySupplier(limit: number, filters: PoFilters): Promise<DimensionSlice[]> {
  const { where, params } = buildFilterSql(filters, 2, 's');
  const { rows } = await materialsPool.query(
    `SELECT COALESCE(NULLIF(TRIM(d.name), ''), s.supplier_num, 'Unknown') AS name,
            SUM(s.net_order_val_usd)::numeric AS value_usd,
            COUNT(*)::bigint                  AS lines
       FROM core.supplychain s
       LEFT JOIN track.supplier_directory d ON d.code = s.supplier_num
      WHERE ${baseScope('s')}${where}
      GROUP BY 1
      ORDER BY 2 DESC NULLS LAST
      LIMIT $1`,
    [limit, ...params],
  );
  return rows.map((r) => ({ name: String(r.name), valueUsd: num(r.value_usd), lines: num(r.lines) }));
}

async function delivery(filters: PoFilters): Promise<DeliverySlice[]> {
  const { scope, params } = scopeFor(filters);
  const { rows } = await materialsPool.query(
    `SELECT COALESCE(delv_status, 'Unknown')          AS status,
            COUNT(*)::bigint                          AS lines,
            SUM(net_order_val_usd)::numeric           AS value_usd,
            SUM(COALESCE(still_delv_val_usd, 0))::numeric AS open_value_usd
       FROM core.supplychain
      WHERE ${scope}
      GROUP BY 1
      ORDER BY 3 DESC NULLS LAST`,
    params,
  );
  return rows.map((r) => ({
    status: String(r.status),
    lines: num(r.lines),
    valueUsd: num(r.value_usd),
    openValueUsd: num(r.open_value_usd),
  }));
}

/**
 * Delivered-on-time against the date the business asked for.
 *
 * NOT against `supplier_promise_date` — see the header. `requested_delv_date` is text in
 * `YYYYMMDD` form; all 569k non-null values match that shape, but the regex guard stays so a
 * future load with a stray value fails the row rather than the query. Only fully-delivered
 * lines are measured: a partially-delivered line has no delivery date to judge.
 */
async function scheduleAdherence(filters: PoFilters): Promise<Adherence> {
  const { scope, params } = scopeFor(filters);
  const { rows } = await materialsPool.query(
    `WITH d AS (
       SELECT delv_date::date                          AS delivered,
              to_date(requested_delv_date, 'YYYYMMDD') AS requested,
              EXTRACT(EPOCH FROM (delv_date - po_release_date)) / 86400 AS lead_days
         FROM core.supplychain
        WHERE ${scope}
          AND delv_status = 'Fully Delivered'
          AND delv_date IS NOT NULL
          AND requested_delv_date ~ '^[0-9]{8}$'
     )
     SELECT COUNT(*)::bigint                                          AS measured,
            COUNT(*) FILTER (WHERE delivered <= requested)::bigint    AS on_time,
            COUNT(*) FILTER (WHERE delivered >  requested)::bigint    AS late,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY lead_days) FILTER (WHERE lead_days >= 0)       AS median_lead
       FROM d`,
    params,
  );
  const r = rows[0];
  const measured = num(r.measured);
  const onTime = num(r.on_time);
  return {
    measured,
    onTime,
    late: num(r.late),
    pctOnTime: measured ? (onTime / measured) * 100 : 0,
    medianLeadDays: r.median_lead === null ? null : Number(r.median_lead),
  };
}

/** When the pipeline last refreshed the warehouse, so the board can say how fresh it is. */
async function loadedAt(): Promise<string | null> {
  try {
    const { rows } = await materialsPool.query(
      `SELECT MAX(finished_at) AS at FROM core.load_log WHERE finished_at IS NOT NULL`,
    );
    const at = rows[0]?.at;
    return at instanceof Date ? at.toISOString() : at ? String(at) : null;
  } catch (err) {
    /* Freshness is a caption, not the board. A pipeline that renamed its log table should not
       take the charts down with it. */
    log.warn('warehouse.load_log_unavailable', { reason: String(err) });
    return null;
  }
}

/**
 * Everything the overview renders, in one round of parallel queries.
 *
 * `cache` dedupes within a single render pass — the page and any component that asks again get
 * one set of queries, not two, and the key includes the filters. It does NOT cache across
 * requests: this is a daily-refreshed warehouse and the page is `force-dynamic`.
 */
export const loadPurchaseOrderAnalytics = cache(
  async (filters: PoFilters = EMPTY_FILTERS): Promise<PurchaseOrderAnalytics> => {
    const [
      totalsRow,
      trendRows,
      country,
      materialGroup,
      purchasingGroup,
      materialType,
      supplier,
      deliveryRows,
      adherence,
      loaded,
    ] = await Promise.all([
      totals(filters),
      trend(filters),
      byDimension(DIMENSIONS.country, 12, filters),
      byDimension(DIMENSIONS.materialGroup, 10, filters),
      byDimension(DIMENSIONS.purchasingGroup, 10, filters),
      byDimension(DIMENSIONS.materialType, 8, filters),
      bySupplier(10, filters),
      delivery(filters),
      scheduleAdherence(filters),
      loadedAt(),
    ]);

    return {
      totals: totalsRow,
      trend: trendRows,
      byCountry: country,
      byMaterialGroup: materialGroup,
      byPurchasingGroup: purchasingGroup,
      byMaterialType: materialType,
      bySupplier: supplier,
      delivery: deliveryRows,
      adherence,
      loadedAt: loaded,
    };
  },
);
