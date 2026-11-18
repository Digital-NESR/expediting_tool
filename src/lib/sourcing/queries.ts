/**
 * Candidate spend groups for the Sourcing Opportunities board.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and nothing in here resolves an actor. `@/app/actions/sourcing` has already decided
 * the reader may look.
 *
 * ── WHAT THIS DOES AND DOES NOT DECIDE ──────────────────────────────────────────────────────
 * SQL fetches groups and their supplier breakdowns. It makes no judgement: every guard,
 * threshold, classification and savings figure is applied in `./rules.ts`, which is pure and
 * unit-tested. The one exception is the hygiene filter below, which is cheap in SQL and would
 * otherwise drag hundreds of thousands of useless rows across the wire.
 *
 * ── THE SPEED CONSTRAINT THAT SHAPED THIS FILE ──────────────────────────────────────────────
 * `core.supplychain` has four indexes — material, plant, (purchase_doc, item), purchase_req —
 * and NONE of them helps any query here. Every aggregate is a full scan of 756k rows. Measured:
 * the material lane groups in ~2.5s, which is fine to run live. Description normalisation in
 * SQL is ~7.7s, which is not, so the service lane is cached by the caller rather than re-run on
 * every filter change.
 *
 * `materialsPool` allows 8 connections and is SHARED with the Purchase Orders board. The
 * comment in `src/lib/db-materials.ts` records what happens when a board fans out too wide: the
 * queries at the back of the queue fail with "timeout exceeded when trying to connect", which
 * reads like an unreachable database and is really a queue. So this file issues a small, fixed
 * number of queries — never one per project.
 */

import materialsPool from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import { baseScope, buildFilterSql, type PoFilters } from '@/lib/purchase-orders/filters';
import type { CandidateGroup } from './rules';
import type { CategoryFragment, ProjectSupplier } from './types';

const log = logger('sourcing-queries');

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/**
 * Hygiene applied in SQL, before anything is grouped.
 *
 * Deleted lines, unapproved lines and non-positive money or quantity cannot contribute to a
 * sourcing case under any threshold, and excluding them here avoids carrying ~1,250 junk lines
 * and a division-by-zero hazard into JS. Everything judgemental stays in `rules.ts`.
 */
function hygiene(alias = ''): string {
  const c = (name: string) => (alias ? `${alias}.${name}` : name);
  return (
    ` AND ${c('deletion_indicator')} IS NULL` +
    ` AND ${c('status')} = 'Approved'` +
    ` AND ${c('net_order_val_usd')} > 0` +
    ` AND ${c('order_qty')} > 0`
  );
}

/** ISO date of the start of the trailing window. */
function windowStart(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - Math.max(1, months));
  return d.toISOString().slice(0, 10);
}

interface LaneParams {
  filters: PoFilters;
  lookbackMonths: number;
}

/**
 * Builds the shared WHERE and parameter list.
 *
 * `$1` is always the window start, so the filter placeholders begin at `$2` — the same
 * `startIndex` convention `src/lib/purchase-orders/queries.ts` uses for its limit-first queries.
 */
function lane({ filters, lookbackMonths }: LaneParams, alias = '') {
  const { where, params } = buildFilterSql(filters, 2, alias);
  const col = (c: string) => (alias ? `${alias}.${c}` : c);
  const scope =
    baseScope(alias) +
    hygiene(alias) +
    ` AND ${col('po_release_date')} >= $1::date` +
    where;
  return { scope, params: [windowStart(lookbackMonths), ...params] };
}

/* ─── Material lane ───────────────────────────────────────────────────────── */

/**
 * Repeat purchases of the same SAP material in the same country.
 *
 * The primary engine. One query returns the group-level aggregates, a second returns the
 * per-supplier breakdown for the same grouping — two round trips rather than one per project.
 *
 * `minPurchaseOrders` is pushed into the HAVING clause purely as a volume guard: without it the
 * result is 77,958 rows of which 51,732 are one-PO singletons that no threshold could ever
 * accept. It is deliberately the loosest preset's value so the dial still lives in `rules.ts`.
 */
export async function loadMaterialGroups(
  p: LaneParams,
  minPurchaseOrders: number,
): Promise<CandidateGroup[]> {
  const { scope, params } = lane(p);

  const groups = await materialsPool.query(
    `SELECT country,
            material,
            COALESCE(NULLIF(TRIM(MAX(material_desc)), ''), NULLIF(TRIM(MAX(short_text)), ''), material) AS title,
            MAX(mat_group_desc)                        AS material_group,
            MAX(mat_type_desc)                         AS material_type,
            MAX(pg_name)                               AS owner,
            COUNT(DISTINCT purchase_doc)::bigint       AS purchase_orders,
            COUNT(*)::bigint                           AS lines,
            SUM(order_qty)::numeric                    AS qty,
            SUM(net_order_val_usd)::numeric            AS spend_usd,
            COUNT(DISTINCT order_unit)::int            AS distinct_units,
            MAX(order_unit)                            AS order_unit,
            COUNT(*) FILTER (WHERE order_qty = 1)::bigint AS unit_qty_lines,
            MIN(net_order_val_usd / order_qty)::numeric   AS min_unit_price,
            MAX(net_order_val_usd / order_qty)::numeric   AS max_unit_price,
            STDDEV_POP(net_order_val_usd / order_qty)::numeric AS stddev_unit_price,
            MIN(po_release_date)::date                 AS first_purchase,
            MAX(po_release_date)::date                 AS last_purchase,
            MAX(purchasing_info_rec)                   AS info_record,
            ARRAY_AGG(DISTINCT pu_doc_type) FILTER (WHERE pu_doc_type IS NOT NULL) AS doc_types
       FROM core.supplychain
      WHERE ${scope}
        AND material IS NOT NULL AND TRIM(material) <> ''
      GROUP BY country, material
     HAVING COUNT(DISTINCT purchase_doc) >= $${params.length + 1}`,
    [...params, minPurchaseOrders],
  );

  const aliased = lane(p, 's');
  const suppliers = await materialsPool.query(
    `SELECT s.country,
            s.material,
            s.supplier_num,
            COALESCE(NULLIF(TRIM(d.name), ''), s.supplier_num) AS name,
            COUNT(*)::bigint                AS lines,
            SUM(s.order_qty)::numeric       AS qty,
            SUM(s.net_order_val_usd)::numeric AS spend_usd
       FROM core.supplychain s
       LEFT JOIN track.supplier_directory d ON d.code = s.supplier_num
      WHERE ${aliased.scope}
        AND s.material IS NOT NULL AND TRIM(s.material) <> ''
      GROUP BY s.country, s.material, s.supplier_num, d.name`,
    aliased.params,
  );

  return assemble(groups.rows, suppliers.rows, (r) => `${r.country}\u0000${r.material}`);
}

/* ─── Service lane ────────────────────────────────────────────────────────── */

/**
 * Repeat purchases of the same *described* service, grouped per country.
 *
 * Lines with no material number — 545,469 of them, $3,518.3M. `material_desc` is
 * material-master-derived and blank on every one, so `short_text` is the only description there
 * is.
 *
 * NORMALISATION HAPPENS IN SQL HERE, not in `normalise.ts`, because pulling 545k rows into JS
 * to group them would cost far more than the 7.7s the regex costs in Postgres. The two must
 * agree: this expression is the SQL twin of `normaliseDescription`, and the month list is the
 * same one. `normalise.ts` still owns the decision about whether a key is *usable* — that runs
 * on the few thousand groups that come back, not on every line.
 */
const SQL_NORMALISE = `
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(UPPER(short_text), '[^A-Z[:space:]]', ' ', 'g'),
      '\\m(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE)\\M',
      ' ', 'g'),
    '[[:space:]]+', ' ', 'g'))`;

export interface ServiceGroupRow extends CandidateGroup {
  /** Original spellings seen, so the board can label the cluster as a buyer wrote it. */
  originals: string[];
}

export async function loadServiceGroups(
  p: LaneParams,
  minPurchaseOrders: number,
): Promise<ServiceGroupRow[]> {
  const { scope, params } = lane(p);

  const groups = await materialsPool.query(
    `WITH n AS (
       SELECT country,
              ${SQL_NORMALISE} AS key,
              short_text, purchase_doc, order_qty, net_order_val_usd, order_unit,
              mat_group_desc, pg_name, po_release_date, pu_doc_type, supplier_num
         FROM core.supplychain
        WHERE ${scope}
          AND (material IS NULL OR TRIM(material) = '')
     )
     SELECT country,
            key,
            (ARRAY_AGG(short_text ORDER BY LENGTH(short_text) DESC))[1:5] AS originals,
            COUNT(DISTINCT purchase_doc)::bigint       AS purchase_orders,
            COUNT(*)::bigint                           AS lines,
            SUM(order_qty)::numeric                    AS qty,
            SUM(net_order_val_usd)::numeric            AS spend_usd,
            COUNT(DISTINCT order_unit)::int            AS distinct_units,
            MAX(order_unit)                            AS order_unit,
            COUNT(*) FILTER (WHERE order_qty = 1)::bigint AS unit_qty_lines,
            MIN(net_order_val_usd / order_qty)::numeric   AS min_unit_price,
            MAX(net_order_val_usd / order_qty)::numeric   AS max_unit_price,
            STDDEV_POP(net_order_val_usd / order_qty)::numeric AS stddev_unit_price,
            MIN(po_release_date)::date                 AS first_purchase,
            MAX(po_release_date)::date                 AS last_purchase,
            MAX(mat_group_desc)                        AS material_group,
            MAX(pg_name)                               AS owner,
            ARRAY_AGG(DISTINCT pu_doc_type) FILTER (WHERE pu_doc_type IS NOT NULL) AS doc_types,
            ARRAY_AGG(DISTINCT supplier_num) FILTER (WHERE supplier_num IS NOT NULL) AS supplier_nums
       FROM n
      WHERE key <> '' AND LENGTH(key) >= 8
      GROUP BY country, key
     HAVING COUNT(DISTINCT purchase_doc) >= $${params.length + 1}
        AND COUNT(DISTINCT supplier_num) >= 2`,
    [...params, minPurchaseOrders],
  );

  /* The per-supplier breakdown is built from the same grouping, but a second full scan to get
     it would double the lane's cost for a lane that is already the slow one. The supplier list
     is carried on the group row instead, and spend is apportioned below — enough for the
     supplier COUNT, which is all the service lane is judged on. No unit-price benchmark is
     computed for services, so no per-supplier average is needed. */
  return groups.rows.map((r) => {
    const supplierNums: string[] = r.supplier_nums ?? [];
    const suppliers: ProjectSupplier[] = supplierNums.map((sn) => ({
      supplierNum: sn,
      name: sn,
      lines: 0,
      qty: 0,
      spendUsd: 0,
      avgUnitPriceUsd: 0,
      isCheapest: false,
    }));
    return {
      country: String(r.country),
      material: null,
      title: String(r.key),
      originals: (r.originals ?? []).filter(Boolean).map(String),
      materialGroup: str(r.material_group),
      materialType: null,
      owner: str(r.owner),
      purchaseOrders: num(r.purchase_orders),
      lines: num(r.lines),
      qty: num(r.qty),
      spendUsd: num(r.spend_usd),
      distinctUnits: num(r.distinct_units),
      orderUnit: str(r.order_unit),
      unitQtyLines: num(r.unit_qty_lines),
      minUnitPriceUsd: r.min_unit_price === null ? null : Number(r.min_unit_price),
      maxUnitPriceUsd: r.max_unit_price === null ? null : Number(r.max_unit_price),
      stddevUnitPriceUsd: r.stddev_unit_price === null ? null : Number(r.stddev_unit_price),
      firstPurchase: iso(r.first_purchase),
      lastPurchase: iso(r.last_purchase),
      suppliers,
      infoRecord: null,
      docTypes: (r.doc_types ?? []).filter(Boolean).map(String),
    };
  });
}

/* ─── Category fragmentation ──────────────────────────────────────────────── */

/**
 * Country × material group, with supplier concentration.
 *
 * Not a project generator — profiling found a median top-supplier share of 70%, and the
 * fragmented combinations that remain are too heterogeneous to action: "Equipment Maintenance,
 * Saudi Arabia, 426 suppliers" needs a human to decompose before anyone can negotiate. It is
 * here for two narrower jobs: prioritising which categories a manager opens, and giving a
 * material-level project the context that its category is already fragmented.
 */
export async function loadCategoryFragments(p: LaneParams): Promise<CategoryFragment[]> {
  const { scope, params } = lane(p);
  const { rows } = await materialsPool.query(
    `WITH per_supplier AS (
       SELECT country, mat_group_desc AS grp, supplier_num,
              SUM(net_order_val_usd) AS spend
         FROM core.supplychain
        WHERE ${scope} AND mat_group_desc IS NOT NULL AND TRIM(mat_group_desc) <> ''
        GROUP BY 1, 2, 3
     ), rolled AS (
       SELECT country, grp,
              SUM(spend)                    AS spend,
              COUNT(*)::bigint              AS supplier_count,
              MAX(spend)                    AS top_supplier_spend
         FROM per_supplier
        GROUP BY 1, 2
     )
     SELECT r.country, r.grp, r.spend, r.supplier_count, r.top_supplier_spend,
            t.lines, t.purchase_orders
       FROM rolled r
       JOIN (
         SELECT country, mat_group_desc AS grp,
                COUNT(*)::bigint AS lines,
                COUNT(DISTINCT purchase_doc)::bigint AS purchase_orders
           FROM core.supplychain
          WHERE ${scope} AND mat_group_desc IS NOT NULL AND TRIM(mat_group_desc) <> ''
          GROUP BY 1, 2
       ) t ON t.country = r.country AND t.grp = r.grp
      WHERE r.spend > 1000000
      ORDER BY r.spend DESC
      LIMIT 200`,
    /* `scope` appears twice in the statement but references the SAME placeholders — Postgres
       resolves `$1` wherever it occurs, so the parameter list is passed once, not doubled. */
    params,
  );

  return rows.map((r) => ({
    country: String(r.country),
    materialGroup: String(r.grp),
    lines: num(r.lines),
    purchaseOrders: num(r.purchase_orders),
    supplierCount: num(r.supplier_count),
    spendUsd: num(r.spend),
    topSupplierSharePct: num(r.spend) > 0 ? (num(r.top_supplier_spend) / num(r.spend)) * 100 : 0,
  }));
}

/* ─── Shared ──────────────────────────────────────────────────────────────── */

function iso(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/** Stitches the group rows to their supplier rows on a composite key. */
function assemble(
  groupRows: Record<string, unknown>[],
  supplierRows: Record<string, unknown>[],
  keyOf: (r: Record<string, unknown>) => string,
): CandidateGroup[] {
  const byKey = new Map<string, ProjectSupplier[]>();
  for (const s of supplierRows) {
    const key = keyOf(s);
    const qty = num(s.qty);
    const spend = num(s.spend_usd);
    const list = byKey.get(key) ?? [];
    list.push({
      supplierNum: String(s.supplier_num),
      name: String(s.name),
      lines: num(s.lines),
      qty,
      spendUsd: spend,
      avgUnitPriceUsd: qty > 0 ? spend / qty : 0,
      isCheapest: false,
    });
    byKey.set(key, list);
  }

  return groupRows.map((r) => ({
    country: String(r.country),
    material: str(r.material),
    title: String(r.title ?? r.material ?? ''),
    materialGroup: str(r.material_group),
    materialType: str(r.material_type),
    owner: str(r.owner),
    purchaseOrders: num(r.purchase_orders),
    lines: num(r.lines),
    qty: num(r.qty),
    spendUsd: num(r.spend_usd),
    distinctUnits: num(r.distinct_units),
    orderUnit: str(r.order_unit),
    unitQtyLines: num(r.unit_qty_lines),
    minUnitPriceUsd: r.min_unit_price === null ? null : Number(r.min_unit_price),
    maxUnitPriceUsd: r.max_unit_price === null ? null : Number(r.max_unit_price),
    stddevUnitPriceUsd: r.stddev_unit_price === null ? null : Number(r.stddev_unit_price),
    firstPurchase: iso(r.first_purchase),
    lastPurchase: iso(r.last_purchase),
    suppliers: byKey.get(keyOf(r)) ?? [],
    infoRecord: str(r.info_record),
    docTypes: ((r.doc_types as unknown[]) ?? []).filter(Boolean).map(String),
  }));
}

/** When the pipeline last refreshed the warehouse. Freshness is a caption, not the board. */
export async function loadedAt(): Promise<string | null> {
  try {
    const { rows } = await materialsPool.query(
      `SELECT MAX(finished_at) AS at FROM core.load_log WHERE finished_at IS NOT NULL`,
    );
    const at = rows[0]?.at;
    return at instanceof Date ? at.toISOString() : at ? String(at) : null;
  } catch (err) {
    log.warn('warehouse.load_log_unavailable', { reason: String(err) });
    return null;
  }
}
