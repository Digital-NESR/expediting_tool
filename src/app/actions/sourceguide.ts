/**
 * TEMPORARY BARREL — the old 2,128-line `'use server'` SourceGuide module.
 *
 * Everything that used to live here now lives in:
 *   - `src/lib/sourceguide/*` — plain modules (access decisions, row shaping, the search
 *     indexes, the audit trail, and the shapes the screens read). Nothing there is an endpoint.
 *   - `src/app/actions/sourceguide/*` — the `'use server'` files, split by concern. Only those
 *     exports are public POST endpoints.
 *
 * Same shape as the ProcureGuard and Laptop Procurement splits, for the same reason: every
 * export in a 'use server' file is a public POST endpoint, so the access predicates and the
 * cache invalidation were one keyword away from being callable over the network. The type
 * exports were a second problem — a client importing `SgAnalytics` was importing the endpoint
 * module to get it.
 *
 * This file exists so the 19 import sites keep working in this commit. It is NOT `'use server'`
 * itself: re-exporting the action modules is enough for Next.js, and a plain module can also
 * carry the type re-exports, which a `'use server'` file may not.
 *
 * To retire it: repoint those imports at the split modules and delete this file.
 */
export * from './sourceguide/reference';
export * from './sourceguide/search';
export * from './sourceguide/mapping';
export * from './sourceguide/admin';
export * from './sourceguide/champions';
export * from './sourceguide/access-requests';

export type {
  GapMode,
  SgAccessRequest,
  SgAnalytics,
  SgAuditEntry,
  SgCatalogRow,
  SgChampion,
  SgCountryChampions,
  SgCountryDashboard,
  SgCoverageGap,
  SgGlobalResults,
  SgGuideRow,
  SgInsights,
  SgTaxonomyCategory,
  SgTaxonomyFamily,
  SgTaxonomyLeaf,
  SgTaxonomyRow,
  SgTaxonomySub,
  SgUserActivity,
} from '@/lib/sourceguide/types';
export type { SgUser } from '@/lib/sourceguide/access';
