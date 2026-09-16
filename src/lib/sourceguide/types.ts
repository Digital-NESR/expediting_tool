/* ─── Shapes the SourceGuide screens read. Declared here rather than in the actions file so a
   client can import a type without importing an endpoint. ─── */

import type { StoredAccessStatus } from '@/types/access';
import type { SgStats, Tier } from '@/types/sourceguide';

/* ─── global command-palette search ─────────────────────────── */

export interface SgGlobalResults {
  commodities: { id: number; name: string; category: string; subCategory: string | null }[];
  suppliers: { code: string; name: string }[];
  categories: { id: string; name: string }[];
  countries: { code: string; name: string; tone: string | null }[];
}

/* ─── full catalogue (for the cascading taxonomy explorer) ───── */

export interface SgCatalogRow {
  id: number;
  name: string;
  code: string;
  spendType: string;
  category: string;
  categoryId: string;
  subCategory: string | null;
  family: string | null;
  suppliers: number; // active supplier mappings
  countries: number; // distinct countries mapped
}

/* ─── taxonomy decomposition fact table ──────────────────────── */
// One row per commodity (the base taxonomy — no supplier/country/mapping data):
// [spendType, category, subCategory, family, commodity]
export type SgTaxonomyRow = [string, string, string, string, string];

/* ─── browse taxonomy ────────────────────────────────────────── */

export interface SgTaxonomyLeaf {
  id: number;
  name: string;
  code: string;
  countries: number;
}

export interface SgTaxonomyFamily {
  name: string;
  items: SgTaxonomyLeaf[];
}

export interface SgTaxonomySub {
  name: string;
  count: number;
  families: SgTaxonomyFamily[];
}

export interface SgTaxonomyCategory {
  id: string;
  name: string;
  count: number;
  subs: SgTaxonomySub[];
}

export type GapMode = 'mapped' | 'no-preferred' | 'missing';

/* ─── coverage gaps ──────────────────────────────────────────── */

export interface SgCoverageGap {
  country: string;
  name: string;
  tone: string | null;
  catalogueTotal: number; // all commodities in the taxonomy
  covered: number; // of those, mapped in this country
  missing: number; // catalogue commodities not mapped here
  noPreferred: number; // mapped here with a backup but no preferred
  noBackup: number; // mapped here with a preferred but no backup (no fallback)
  coverage: number; // covered / catalogueTotal (0..1)
}

/* ─── export: full country guide rows ────────────────────────── */

export interface SgGuideRow {
  country: string;
  spendType: string;
  category: string;
  subCategory: string;
  family: string;
  commodity: string;
  unspsc: string;
  tier: Tier;
  supplierCode: string;
  supplierName: string;
  supplierEmail: string;
}

/* ─── per-country dashboard ──────────────────────────────────── */

export interface SgCountryDashboard {
  code: string;
  name: string;
  tone: string | null;
  champions: string[];
  version: string;
  status: string;
  updatedAt: string;
  stats: { mappings: number; commodities: number; preferred: number; suppliers: number };
  categories: { id: string; name: string; commodities: number }[];
  topSuppliers: { code: string; name: string; mappings: number }[];
}

export interface SgAnalytics {
  stats: SgStats;
  perCountry: {
    country: string;
    name: string;
    tone: string | null;
    mappings: number;
    commodities: number;
    preferred: number;
  }[];
  topSuppliers: { code: string; name: string; mappings: number; countries: number }[];
  spendTypeBreakdown: { spendType: string; count: number }[];
}

/* ─── admin: deeper insights ─────────────────────────────────── */

export interface SgInsights {
  tier: { preferred: number; backup: number };
  avl: { total: number; mapped: number };
  coverageOverall: { catalogue: number; coveredAnywhere: number };
  multiCountrySuppliers: number;
  singleSourcePairs: number;
  noPreferredPairs: number;
  champions: { countriesTotal: number; withChampion: number; withEmail: number };
  categoryCoverage: { category: string; catalogue: number; covered: number }[];
  topMultiCountry: { code: string; name: string; countries: number; mappings: number }[];
  activity30d: number;
}

/* ─── admin: audit feed (who did what) ───────────────────────── */

export interface SgAuditEntry {
  id: number;
  action: string;
  details: string | null;
  country: string | null;
  countryName: string | null;
  tone: string | null;
  commodityId: number | null;
  commodityName: string | null;
  performedBy: string | null;
  performedAt: string;
}

/* ─── admin: per-user activity ───────────────────────────────── */

export interface SgUserActivity {
  user: string;
  views: number;
  searches: number;
  edits: number; // recorded change-log entries
  mappings: number;
  champions: number;
  access: number;
  countries: number;
  lastActive: string;
}

/* ─── champions (admin-managed, per country) ─────────────────── */

export interface SgChampion {
  id: number;
  countryCode: string;
  name: string;
  email: string | null;
}

export interface SgCountryChampions {
  country: string;
  name: string;
  tone: string | null;
  champions: SgChampion[];
}

/* ─── access requests (mirror TI-TE) ─────────────────────────── */

export interface SgAccessRequest {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  // Reads tolerate the legacy 'Denied' until the one-off migration has run everywhere.
  status: StoredAccessStatus;
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
}

export const EMPTY_ANALYTICS: SgAnalytics = {
  stats: { commodities: 0, suppliers: 0, mappings: 0, countries: 0, categories: 0 },
  perCountry: [],
  topSuppliers: [],
  spendTypeBreakdown: [],
};

export const EMPTY_INSIGHTS: SgInsights = {
  tier: { preferred: 0, backup: 0 },
  avl: { total: 0, mapped: 0 },
  coverageOverall: { catalogue: 0, coveredAnywhere: 0 },
  multiCountrySuppliers: 0,
  singleSourcePairs: 0,
  noPreferredPairs: 0,
  champions: { countriesTotal: 0, withChampion: 0, withEmail: 0 },
  categoryCoverage: [],
  topMultiCountry: [],
  activity30d: 0,
};
