// Shape of the NESR spend taxonomy. Types only — no data — so client components can stay
// type-safe without pulling the ~100 KB taxonomy payload into their bundle. The data itself
// lives in src/data/catalog-taxonomy.json and is only reachable through
// `@/lib/catalog-taxonomy.server` (server) or the `/api/catalog-manager/taxonomy` route.

export type SpendTypeName = 'Direct' | 'Indirect';

/**
 * `n` = commodity name, `f` = family.
 * `code` (UNSPSC) and `desc` are empty for every row in the current workbook export, but they
 * ARE read by AddEntriesClient / CatalogEntryFormClient (to prefill UNSPSC and item name), so
 * they stay in the shape rather than being stripped like the old always-empty `kw` field.
 */
export interface TaxCommodity { n: string; f: string; code: string; desc: string }
export interface TaxSubcategory { name: string; commodities: TaxCommodity[] }
export interface TaxCategory { type: SpendTypeName; name: string; subs: TaxSubcategory[] }
