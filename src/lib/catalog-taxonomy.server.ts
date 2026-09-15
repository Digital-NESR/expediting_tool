// NESR spend taxonomy — server-side accessor.
//
// Sourced from the authoritative NESR/SourceGuide taxonomy workbook
// (SourceGuide-Taxonomy.xlsx, "Taxonomy" tab: Spend Type / Category / Sub-Category / Family /
// Commodity). Drives the cascading Category → Sub-category → Commodity selects on the entry
// forms, the bulk-import template, and seeds the spend_category / spend_subcategory
// master-data tables. `type` classifies each category as Direct or Indirect spend.
//
// Regenerate with:  node scripts/generate-catalog-taxonomy.mjs --in <SourceGuide-Taxonomy.xlsx>
//
// *** DO NOT IMPORT THIS MODULE FROM A CLIENT COMPONENT. ***
// It carries ~100 KB of data. Client components get the taxonomy either as a prop from their
// server page, or (when the call site is already async) by fetching /api/catalog-manager/taxonomy.
// Types live in '@/lib/catalog-taxonomy-types' and are safe to import anywhere.

import taxonomy from '@/data/catalog-taxonomy.json';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';

export type {
  SpendTypeName,
  TaxCommodity,
  TaxSubcategory,
  TaxCategory,
} from '@/lib/catalog-taxonomy-types';

export const SPEND_TAXONOMY: TaxCategory[] = taxonomy as TaxCategory[];
