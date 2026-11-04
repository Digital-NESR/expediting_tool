/**
 * The values the filter bar offers, read once per page load.
 *
 * Every list is drawn from the fact table itself rather than from a reference table, so a
 * filter can never offer a value that selects nothing. Each carries its line count, which is
 * what makes a 242-entry buyer list usable: the dropdown sorts by volume, so the people who
 * raise most of the POs are at the top instead of whoever is alphabetically first.
 */

import { cache } from 'react';
import materialsPool from '@/lib/db-materials';
import { BASE_SCOPE, type FilterOption, type PoFilterOptions } from './filters';

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
 * Loaded once per render pass. Not cached beyond the request: the warehouse reloads daily and
 * a new country or buyer should appear the next time the page is opened, not the next deploy.
 */
export const loadPoFilterOptions = cache(async (): Promise<PoFilterOptions> => {
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
});
