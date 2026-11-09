/**
 * A stable fingerprint of the reference data Catalog Repo seeds from TypeScript constants.
 *
 * WHY IT EXISTS. `ensureCatalogSeedData` runs inside `loadCatalogActor`, which every Catalog
 * Repo page and every server action awaits, and it re-upserted the whole master-data set --
 * currencies, countries, units, the spend taxonomy, service activities, the default threshold --
 * on every cold instance. Seven round trips to write rows that were already exactly right, and
 * the bill landed on whoever loaded the first page on a new instance.
 *
 * A count-based check ("does `country` have rows?") would skip the work but would also stop a
 * changed constant from ever reaching the database: counts do not move when a country is renamed
 * or a rate corrected. Hashing the values themselves skips the work when nothing has changed and
 * re-runs it the moment anything does, which is the property the old always-seed code had.
 *
 * Lives here rather than in `actions/catalog-manager.ts` because every export of a `'use server'`
 * file is a public POST endpoint and a non-function export does not compile there at all -- so a
 * pure helper cannot be exported from it, and therefore cannot be tested.
 */

import {
  SEED_COUNTRIES,
  SEED_CURRENCIES,
  SEED_UOMS,
  APPROVAL_THRESHOLD_USD,
} from './catalog-manager-utils';
import { SERVICE_ACTIVITIES } from './catalog-service-activities';
import type { TaxCategory } from './catalog-taxonomy-types';

/**
 * Only the values that reach the database, each list sorted, so the hash tracks what the seed
 * would write and ignores how the constants happen to be ordered or formatted in source.
 */
export function masterDataFingerprint(taxonomy: readonly TaxCategory[]): string {
  const parts = [
    SEED_CURRENCIES.map((c) => `${c.code}:${c.decimals}:${c.usd_rate}`).sort(),
    SEED_COUNTRIES.map((c) => `${c.code}:${c.name}:${c.ccy}:${c.flag}`).sort(),
    [...SEED_UOMS].sort(),
    /* Category name and type, and subcategory names: exactly the fields the seed writes.
       Commodities are deliberately out -- `seedMasterData` does not write them, so including
       them would re-run the seed over a change it cannot carry. */
    taxonomy
      .map(
        (cat) =>
          `${cat.name}:${cat.type}:${cat.subs
            .map((s) => s.name)
            .sort()
            .join('|')}`,
      )
      .sort(),
    SERVICE_ACTIVITIES.map((s) => `${s.no}:${s.text}:${s.uom}`).sort(),
    [`threshold:${APPROVAL_THRESHOLD_USD}`],
  ];
  return hash(parts.map((p) => p.join(',')).join(';;'));
}

/**
 * FNV-1a, 32 bits, with the input length appended.
 *
 * Not cryptographic and does not need to be. The question is "are these the same constants as
 * last time", asked by the process that wrote the answer; the cost of a collision is one skipped
 * upsert of rows that are already identical. Hand-rolled so this module stays importable
 * anywhere, including from a plain Node script.
 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${text.length}`;
}
