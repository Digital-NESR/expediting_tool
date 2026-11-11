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
  /** SAP has the vendor centrally blocked for purchasing. Populated where surfaced. */
  supplierBlocked?: boolean;
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
  preferred: {
    supplierCode: string | null;
    supplierName: string;
    country: string;
    blocked: boolean;
  } | null;
  backupCount: number;
}

export interface SgSupplierProfile extends SgSupplier {
  email: string | null;
  /** SAP has the vendor centrally blocked for purchasing. */
  blocked: boolean;
  totalCommodities: number;
  preferredCount: number;
  champions: string[];
  mappings: SgMapping[];
}

/** A supplier mapped elsewhere in this sub-category, carrying the commodity it is mapped to. */
export interface SgRelatedMapping extends SgMapping {
  commodityName: string;
}

export interface SgCommodityDetail {
  commodity: SgCommodity;
  countries: string[];
  mappingsByCountry: Record<string, SgMapping[]>;
  /**
   * Suppliers mapped to OTHER commodities in the same sub-category, for the catch-all nodes
   * whose name repeats their sub-category — `Specialty Chemicals` inside `Specialty Chemicals`.
   *
   * Those nodes read like a parent and behave like a leaf: they carry their own mappings and
   * roll up nothing, so a reader on `Specialty Chemicals` saw 5 Abu Dhabi suppliers where the
   * sub-category holds 15, and never met the one mapped to `Anti gas migration additives`.
   *
   * Kept SEPARATE from `mappingsByCountry` rather than merged into it, because the two say
   * different things. A supplier on the catch-all is approved for the sub-category generally;
   * one here is approved for a particular commodity within it. Merging them would put a name
   * under `Preferred for Specialty Chemicals` that nobody ever approved for that, which is the
   * kind of wrong a buyer acts on.
   *
   * Empty for every node that is not a catch-all.
   */
  relatedByCountry: Record<string, SgRelatedMapping[]>;
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
