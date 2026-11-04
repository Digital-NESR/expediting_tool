/**
 * Past-due analysis for open purchase orders.
 *
 * "Open" is the warehouse's own definition, reproduced against the base table — see
 * `OPEN_PO_SCOPE` in ./filters for why it is written out rather than selected from
 * `track.po_open`, and for the line-for-line reconciliation.
 *
 * ── WHICH DATE DECIDES "PAST DUE" ───────────────────────────────────────────────────────────
 * `delv_date`. On a line that has not been received it is the date delivery is scheduled for,
 * which is what a buyer chases against. Two neighbours were rejected:
 *
 *  - `supplier_promise_date` is a byte-for-byte copy of `delv_date` on every row in this
 *    extract, so it adds nothing.
 *  - `statistical_delv_date` is the original schedule before any rescheduling, and measuring
 *    against it reports 62% past due — it answers "did the first plan hold", not "is this
 *    late now".
 *
 * Measured this way, 5,317 of 15,194 open lines were past due on the 3 Nov 2026 load (35.0%).
 */

import { cache } from 'react';
import materialsPool from '@/lib/db-materials';
import {
  BASE_SCOPE,
  OPEN_PO_SCOPE,
  baseScope,
  buildFilterSql,
  openPoScope,
  type PoFilters,
} from './filters';

/** How long past the delivery date a line has been sitting. Order matters: the UI reads it as given. */
export const AGEING_BUCKETS = ['1-30 days', '31-90 days', '91-180 days', '180+ days'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export interface PastDueTotals {
  lines: number;
  orders: number;
  suppliers: number;
  /** Net order value of the open lines, USD. */
  netValueUsd: number;
  /** The not-yet-received portion of that value. */
  openValueUsd: number;
  pastDueLines: number;
  pastDueValueUsd: number;
  dueInLines: number;
  dueInValueUsd: number;
}

export interface CountrySplit {
  country: string;
  dueIn: number;
  pastDue: number;
  total: number;
  pastDuePct: number;
  pastDueValueUsd: number;
}

export interface AgeingSlice {
  bucket: AgeingBucket;
  lines: number;
  valueUsd: number;
}

export interface PastDueSupplier {
  name: string;
  pastDue: number;
  total: number;
  valueUsd: number;
  worstDays: number;
}

export interface PastDueAnalysis {
  totals: PastDueTotals;
  byCountry: CountrySplit[];
  ageing: AgeingSlice[];
  worstSuppliers: PastDueSupplier[];
  loadedAt: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/* `delv_date` may be null on a handful of lines; a line with no date cannot be judged late, so
   it counts as Due In rather than silently inflating the past-due share. */
const pastDue = (alias = '') => {
  const c = alias ? `${alias}.delv_date` : 'delv_date';
  return `${c} IS NOT NULL AND ${c}::date < CURRENT_DATE`;
};

const IS_PAST_DUE = pastDue();
/** The same predicate for the one query that aliases the table in order to join. */
const PAST_DUE_S = pastDue('s');

export const loadPastDueAnalysis = cache(
  async (filters: PoFilters): Promise<PastDueAnalysis> => {
    const { where, params } = buildFilterSql(filters);
    const scope = `${BASE_SCOPE} AND ${OPEN_PO_SCOPE}${where}`;

    /* The supplier breakdown joins the directory for names, so every column it names has to
       carry the alias — scope and filters alike. */
    const aliased = buildFilterSql(filters, 1, 's');
    const aliasedScope = `${baseScope('s')} AND ${openPoScope('s')}${aliased.where}`;
    const aliasedParams = aliased.params;

    const [totalsRes, countryRes, ageingRes, supplierRes, loadRes] = await Promise.all([
      materialsPool.query(
        `SELECT COUNT(*)::bigint                                   AS lines,
                COUNT(DISTINCT purchase_doc)::bigint               AS orders,
                COUNT(DISTINCT supplier_num)::bigint               AS suppliers,
                SUM(net_order_val_usd)::numeric                    AS net_value,
                SUM(COALESCE(still_delv_val_usd, 0))::numeric      AS open_value,
                COUNT(*) FILTER (WHERE ${IS_PAST_DUE})::bigint     AS past_due_lines,
                SUM(net_order_val_usd) FILTER (WHERE ${IS_PAST_DUE})::numeric AS past_due_value,
                COUNT(*) FILTER (WHERE NOT (${IS_PAST_DUE}))::bigint AS due_in_lines,
                SUM(net_order_val_usd) FILTER (WHERE NOT (${IS_PAST_DUE}))::numeric AS due_in_value
           FROM core.supplychain
          WHERE ${scope}`,
        params,
      ),
      materialsPool.query(
        `SELECT COALESCE(NULLIF(TRIM(country), ''), 'Unspecified')  AS country,
                COUNT(*) FILTER (WHERE NOT (${IS_PAST_DUE}))::bigint AS due_in,
                COUNT(*) FILTER (WHERE ${IS_PAST_DUE})::bigint       AS past_due,
                COUNT(*)::bigint                                     AS total,
                SUM(net_order_val_usd) FILTER (WHERE ${IS_PAST_DUE})::numeric AS past_due_value
           FROM core.supplychain
          WHERE ${scope}
          GROUP BY 1
          ORDER BY 4 DESC`,
        params,
      ),
      materialsPool.query(
        `SELECT CASE
                  WHEN CURRENT_DATE - delv_date::date > 180 THEN '180+ days'
                  WHEN CURRENT_DATE - delv_date::date >  90 THEN '91-180 days'
                  WHEN CURRENT_DATE - delv_date::date >  30 THEN '31-90 days'
                  ELSE '1-30 days'
                END                             AS bucket,
                COUNT(*)::bigint                AS lines,
                SUM(net_order_val_usd)::numeric AS value_usd
           FROM core.supplychain
          WHERE ${scope} AND ${IS_PAST_DUE}
          GROUP BY 1`,
        params,
      ),
      materialsPool.query(
        `SELECT COALESCE(NULLIF(TRIM(d.name), ''), s.supplier_num, 'Unknown') AS name,
                COUNT(*) FILTER (WHERE ${PAST_DUE_S})::bigint    AS past_due,
                COUNT(*)::bigint                                  AS total,
                SUM(s.net_order_val_usd) FILTER (WHERE ${PAST_DUE_S})::numeric AS value_usd,
                MAX(CURRENT_DATE - s.delv_date::date) FILTER (WHERE ${PAST_DUE_S})::int AS worst_days
           FROM core.supplychain s
           LEFT JOIN track.supplier_directory d ON d.code = s.supplier_num
          WHERE ${aliasedScope}
          GROUP BY 1
         HAVING COUNT(*) FILTER (WHERE ${PAST_DUE_S}) > 0
          ORDER BY 4 DESC NULLS LAST
          LIMIT 10`,
        aliasedParams,
      ),
      materialsPool.query(
        `SELECT MAX(finished_at) AS at FROM core.load_log WHERE finished_at IS NOT NULL`,
      ),
    ]);

    const t = totalsRes.rows[0];
    const at = loadRes.rows[0]?.at;

    const ageingBy = new Map<string, { lines: number; valueUsd: number }>();
    for (const r of ageingRes.rows) {
      ageingBy.set(String(r.bucket), { lines: num(r.lines), valueUsd: num(r.value_usd) });
    }

    return {
      totals: {
        lines: num(t.lines),
        orders: num(t.orders),
        suppliers: num(t.suppliers),
        netValueUsd: num(t.net_value),
        openValueUsd: num(t.open_value),
        pastDueLines: num(t.past_due_lines),
        pastDueValueUsd: num(t.past_due_value),
        dueInLines: num(t.due_in_lines),
        dueInValueUsd: num(t.due_in_value),
      },
      byCountry: countryRes.rows.map((r) => {
        const total = num(r.total);
        return {
          country: String(r.country),
          dueIn: num(r.due_in),
          pastDue: num(r.past_due),
          total,
          pastDuePct: total ? (num(r.past_due) / total) * 100 : 0,
          pastDueValueUsd: num(r.past_due_value),
        };
      }),
      /* Every bucket is present even at zero, so the chart keeps a stable shape as filters
         narrow — a bucket vanishing reads as a scale change rather than an empty category. */
      ageing: AGEING_BUCKETS.map((bucket) => ({
        bucket,
        lines: ageingBy.get(bucket)?.lines ?? 0,
        valueUsd: ageingBy.get(bucket)?.valueUsd ?? 0,
      })),
      worstSuppliers: supplierRes.rows.map((r) => ({
        name: String(r.name),
        pastDue: num(r.past_due),
        total: num(r.total),
        valueUsd: num(r.value_usd),
        worstDays: num(r.worst_days),
      })),
      loadedAt: at instanceof Date ? at.toISOString() : at ? String(at) : null,
    };
  },
);
