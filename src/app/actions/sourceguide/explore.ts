'use server';

/* ─── The one payload the Explorer folds for itself. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { readUser } from '@/lib/sourceguide/access';
import { canManage } from '@/lib/sourceguide/can-manage';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { getCommodityIndex, getCountriesLite, getMappingFacts } from '@/lib/sourceguide/indexes';
import { readFailed } from '@/lib/sourceguide/internals';
import type { RollupCommodity, RollupSupplier } from '@/lib/sourceguide/rollup';

/**
 * One mapping, packed: `[commodityId, countryCode, supplierCode, preferredAsBit]`.
 *
 * The same rows as `RollupFact`, without the key names. At 10,976 rows those four keys repeat
 * 43,904 times and cost roughly 550 KB of the payload on their own — more than everything else
 * here put together. Expanded once in the browser, which is a single pass over an array that
 * the Explorer then folds dozens of times anyway.
 */
export type PackedFact = [number, string, string, 0 | 1];

/**
 * Everything the Explorer needs, loaded once and unfiltered.
 *
 * WHY IT ALL TRAVELS. The alternative is a query per expanded node, and the tree has about
 * 1,700 nodes across five levels. The whole relation is 10,976 mappings -- 283 KB as compact
 * arrays -- so sending it once and folding in the browser is both smaller than the round trips
 * it replaces and the only version where ticking a country filter is instant. The same reasoning,
 * and the same measurements, as the travel board's `client-bands.ts`.
 *
 * WHAT IS DELIBERATELY ABSENT. `description` and `keywords` are the bulk of a stored commodity
 * row and the tree reads neither, so they are dropped here rather than shipped and ignored.
 * Dropping them is most of the difference between a 300 KB payload and a 1.5 MB one.
 */
export interface SgExplorerDataset {
  commodities: RollupCommodity[];
  facts: PackedFact[];
  suppliers: RollupSupplier[];
  countries: { code: string; name: string; tone: string | null }[];
  /** Whether this reader can edit mappings anywhere — drives the "fix this gap" link only. */
  canManage: boolean;
}

const EMPTY: SgExplorerDataset = {
  commodities: [],
  facts: [],
  suppliers: [],
  countries: [],
  canManage: false,
};

export async function getExplorerDataset(): Promise<SgExplorerDataset> {
  const user = await readUser();
  if (!user) return EMPTY;

  try {
    /* The commodity index and the facts are both cached for 60 s and shared with search, so a
       second reader on the same lambda pays for neither. Only the supplier names are fetched
       here, because the shared index does not carry the central block status and the Explorer
       has to show it: ten blocked vendors are still mapped. */
    const [commodityRows, facts, countries, supplierRows] = await Promise.all([
      getCommodityIndex(),
      getMappingFacts(),
      getCountriesLite(),
      sourceGuidePool.query(
        `SELECT a.supplier_code, a.name, a.central_block_status
           FROM supplier_avl a
          WHERE EXISTS (SELECT 1 FROM sg_mappings m
                         WHERE m.supplier_code = a.supplier_code AND m.status = 'Active')`,
      ),
    ]);

    return {
      commodities: commodityRows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        category: r.category,
        subCategory: r.sub_category,
        family: r.family,
        spendType: r.spend_type,
      })),
      facts: facts.map((f) => [f.commodityId, f.country, f.supplier, f.preferred ? 1 : 0]),
      suppliers: supplierRows.rows.map((r) => ({
        code: r.supplier_code,
        name: r.name,
        blocked: isCentrallyBlocked(r.central_block_status),
      })),
      countries,
      canManage: canManage(user),
    };
  } catch (err) {
    readFailed('getExplorerDataset', err);
  }
}
