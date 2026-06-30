/* ============================================================
   SourceGuide — shared TypeScript interfaces
   ============================================================ */

export type Tier = 'Preferred' | 'Backup';

export interface SgCountry {
  code: string;
  name: string;
  champion: string;
  tone: string | null;
}

export interface SgCommodity {
  id: number;
  code: string;
  name: string;
  category: string;
  categoryId: string;
  subCategory: string | null;
  family: string | null;
  spendType: string;
  description: string;
  /** [category, subCategory, family, name] with blanks removed */
  path: string[];
}

export interface SgSupplier {
  /** vendor code from the Approved Vendor List (supplier_avl) — the unique key */
  code: string;
  name: string;
  countries: string[];
}

export interface SgMapping {
  id: number;
  commodityId: number;
  /** AVL vendor code; null for legacy rows not yet matched to the AVL */
  supplierCode: string | null;
  supplierName: string;
  /** AVL email(s); may be a comma/semicolon-separated list. Populated where surfaced. */
  supplierEmail?: string | null;
  country: string;
  tier: Tier;
  status: string;
}

export interface SgCategory {
  id: string;
  name: string;
  spendType: string;
  count: number;
  /** up to a handful of representative sub-categories */
  subs: string[];
}

export interface SgStats {
  commodities: number;
  suppliers: number;
  mappings: number;
  countries: number;
  categories: number;
}

/** A commodity row enriched with the preferred/backup summary for a country. */
export interface SgCommodityResult extends SgCommodity {
  countries: string[];
  preferred: { supplierCode: string | null; supplierName: string; country: string } | null;
  backupCount: number;
}

export interface SgSupplierProfile extends SgSupplier {
  email: string | null;
  totalCommodities: number;
  preferredCount: number;
  champions: string[];
  mappings: SgMapping[];
}

export interface SgCommodityDetail {
  commodity: SgCommodity;
  countries: string[];
  mappingsByCountry: Record<string, SgMapping[]>;
}

export interface SgGuide {
  country: string;
  name: string;
  champion: string;
  tone: string | null;
  version: string;
  status: string;
  updatedAt: string;
  updatedBy: string | null;
  mappings: number;
  commodities: number;
}

export interface SgActivityEntry {
  id: number;
  country: string | null;
  commodityId: number | null;
  action: string;
  details: string | null;
  performedBy: string | null;
  performedAt: string;
}

export interface SgSearchFilters {
  countries?: string[];
  categories?: string[];
  tiers?: Tier[];
  spendTypes?: string[];
}

export interface SgFacets {
  countries: { code: string; count: number }[];
  spendTypes: { type: string; count: number }[];
  tiers: { tier: Tier; count: number }[];
}
