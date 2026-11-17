/**
 * The values the filter bar offers, read once per page load.
 *
 * Every list is drawn from the fact table itself rather than from a reference table, so a
 * filter can never offer a value that selects nothing. Each carries its line count, which is
 * what makes a 242-entry buyer list usable: the dropdown sorts by volume, so the people who
 * raise most of the POs are at the top instead of whoever is alphabetically first.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import materialsPool from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import { BASE_SCOPE, type FilterOption, type PoFilterOptions } from './filters';

const log = logger('purchase-orders-options');

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Distinct non-blank values of one column, most-used first. */
async function optionsFor(column: string, limit: number): Promise<FilterOption[]> {
  const { rows } = await materialsPool.query(
    `SELECT TRIM(${column}) AS value, COUNT(*)::bigint AS lines
       FROM core.supplychain
      WHERE ${BASE_SCOPE}
        AND ${column} IS NOT NULL
        AND TRIM(${column}) <> ''
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ value: String(r.value), label: String(r.value), lines: num(r.lines) }));
}

/**
 * Account assignment categories, labelled from the warehouse's mapping table.
 *
 * The codes alone ('K9', 'A0') mean nothing to a reader. Several codes share a description —
 * '9', 'F9' and 'K9' are all "Services" — so the code stays in the label to keep the options
 * distinct and to match what SAP shows.
 */
async function accountClassificationOptions(): Promise<FilterOption[]> {
  const { rows } = await materialsPool.query(
    `SELECT TRIM(s.account_classification) AS value,
            MAX(m.account_classification_description)  AS description,
            COUNT(*)::bigint                           AS lines
       FROM core.supplychain s
       LEFT JOIN core.account_classification_mapping m
              ON TRIM(m.account_classification) = TRIM(s.account_classification)
      WHERE ${BASE_SCOPE}
        AND s.account_classification IS NOT NULL
        AND TRIM(s.account_classification) <> ''
      GROUP BY 1
      ORDER BY 3 DESC`,
  );
  return rows.map((r) => ({
    value: String(r.value),
    label: r.description ? `${r.value} · ${r.description}` : String(r.value),
    lines: num(r.lines),
  }));
}

/** Suppliers that actually appear on a PO line, named from the warehouse directory. */
async function supplierOptions(limit: number): Promise<FilterOption[]> {
  const { rows } = await materialsPool.query(
    `SELECT s.supplier_num AS value,
            COALESCE(NULLIF(TRIM(d.name), ''), s.supplier_num) AS label,
            COUNT(*)::bigint AS lines
       FROM core.supplychain s
       LEFT JOIN track.supplier_directory d ON d.code = s.supplier_num
      WHERE ${BASE_SCOPE}
        AND s.supplier_num IS NOT NULL
        AND TRIM(s.supplier_num) <> ''
      GROUP BY 1, 2
      ORDER BY 3 DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ value: String(r.value), label: String(r.label), lines: num(r.lines) }));
}

/**
 * The option lists, cached for an hour across requests.
 *
 * These are the distinct values of six columns over a 735k-row table — seven queries and about
 * six seconds, and they are the same six seconds on every page load. The warehouse behind them
 * reloads once a day (`core.load_log`), so the lists can only change daily; recomputing them
 * per request bought nothing and was a third of a load that was running close to the page's
 * duration limit.
 *
 * An hour rather than a day so a newly-seen country or buyer appears the same morning, and
 * because a stale option list is a filter that selects nothing — mildly confusing — not a wrong
 * number. The figures the filters produce are never cached; only the vocabulary is.
 *
 * Still on `unstable_cache`, matching `catalog-manager.ts` and `procure-guard/activity.ts`;
 * the bundled Next 16 docs say `use cache` replaces it, and all three should move together.
 */
const cachedOptions = unstable_cache(
  async (): Promise<PoFilterOptions> => loadFreshOptions(),
  ['purchase-orders', 'filter-options', 'v1'],
  { revalidate: 3600, tags: ['purchase-orders:options'] },
);

/**
 * Deduped within a render pass, and served from the hourly cache across requests.
 *
 * Falls back to a fresh read if the cache is unusable. `unstable_cache` throws
 * "Invariant: incrementalCache missing" when called outside a Next request context, and the
 * cache here is an optimisation, not the feature — a board that fails to render because its
 * option lists could not be *cached* would be a self-inflicted outage. This also keeps the
 * loader callable from a plain script, which is how its SQL gets exercised against the
 * warehouse outside the app.
 */
export const loadPoFilterOptions = cache(async (): Promise<PoFilterOptions> => {
  try {
    return await cachedOptions();
  } catch (err) {
    log.warn('options.cache_unavailable', { reason: String(err) });
    return loadFreshOptions();
  }
});

async function loadFreshOptions(): Promise<PoFilterOptions> {
  const [accountClassification, segment, country, purchasingOrg, supplier, buyer, range] =
    await Promise.all([
      accountClassificationOptions(),
      optionsFor('pg_name', 100),
      optionsFor('country', 50),
      optionsFor('purchasing_org', 60),
      /* 4,387 suppliers exist; the long tail is single-line orders nobody filters by. The
         dropdown searches within what it is given, so the cut is on volume, not alphabet. */
      supplierOptions(400),
      optionsFor('created_by', 300),
      materialsPool.query(
        `SELECT MIN(po_release_date)::date AS min, MAX(po_release_date)::date AS max
           FROM core.supplychain WHERE ${BASE_SCOPE}`,
      ),
    ]);

  const iso = (v: unknown) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null;

  return {
    accountClassification,
    segment,
    country,
    purchasingOrg,
    supplier,
    buyer,
    releaseRange: { min: iso(range.rows[0]?.min), max: iso(range.rows[0]?.max) },
  };
}
