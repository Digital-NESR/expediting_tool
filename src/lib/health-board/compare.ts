/*
 * Ordering and reading the country comparison (UX phase 3). Pure; the rows themselves still
 * come from buildComparison, unchanged.
 */

import type { ComparisonRow } from './calc';
import type { KpiDefinition } from './definitions';

export type ComparisonSort = 'country' | 'ytd' | 'gap';

export const SORTS: { id: ComparisonSort; label: string }[] = [
  { id: 'country', label: 'Country list' },
  { id: 'ytd', label: 'YTD, best first' },
  { id: 'gap', label: 'Furthest from target first' },
];

export function parseSort(raw: string | undefined): ComparisonSort {
  return raw === 'ytd' || raw === 'gap' ? raw : 'country';
}

/**
 * How far YTD is on the good side of the target, in the KPI's unit: positive is better than
 * target, negative worse, whatever the KPI's direction. Null without a YTD, a target or a
 * direction.
 */
export function betterBy(
  kpi: KpiDefinition,
  row: Pick<ComparisonRow, 'ytd' | 'target'>,
): number | null {
  if (row.ytd === null || row.target === null || kpi.direction === 'none') return null;
  return kpi.direction === 'higher' ? row.ytd - row.target : row.target - row.ytd;
}

/**
 * The rows in the chosen order. Rows that cannot be placed (no YTD, or no target for 'gap') go
 * last, in the country list's order, as do ties. Never mutates the input.
 */
export function sortRows(
  rows: readonly ComparisonRow[],
  kpi: KpiDefinition,
  sort: ComparisonSort,
): ComparisonRow[] {
  const indexed = rows.map((r, i) => ({ r, i }));
  if (sort === 'country') return indexed.map((x) => x.r);
  const key = (r: ComparisonRow): number | null => {
    if (sort === 'gap') return betterBy(kpi, r);
    if (r.ytd === null) return null;
    return kpi.direction === 'lower' ? -r.ytd : r.ytd;
  };
  return indexed
    .sort((a, b) => {
      const ka = key(a.r);
      const kb = key(b.r);
      if (ka === null || kb === null)
        return ka === null && kb === null ? a.i - b.i : ka === null ? 1 : -1;
      /* 'ytd': best first (largest key). 'gap': furthest below target first (smallest key). */
      const d = sort === 'ytd' ? kb - ka : ka - kb;
      return d || a.i - b.i;
    })
    .map((x) => x.r);
}
