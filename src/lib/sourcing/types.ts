/**
 * What a sourcing opportunity is, and the shapes the board renders.
 *
 * Kept separate from both the SQL and the rules so the pure modules (`rules.ts`,
 * `normalise.ts`) can be unit-tested without importing a connection pool.
 */

import type { PoFilters } from '@/lib/purchase-orders/filters';

/**
 * Why a project was raised. Each type carries a different savings treatment, and the board
 * must never present one as if it were another.
 */
export type ProjectType =
  /** Repeat buying across several suppliers — savings vs the cheapest supplier's average. */
  | 'consolidation'
  /** Repeat buying from a single supplier — no benchmark exists, so no saving is claimed. */
  | 'tender'
  /** Paid above a live SAP info-record price — savings vs the contracted rate. */
  | 'leakage'
  /** Price variance despite a populated info record — a compliance problem, not a saving. */
  | 'maverick'
  /** Repeat service purchases clustered by description — spend signal only, no unit price. */
  | 'service';

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  consolidation: 'Consolidation',
  tender: 'Competitive tender',
  leakage: 'Contract leakage',
  maverick: 'Maverick buying',
  service: 'Service cluster',
};

/**
 * Whether a project's savings figure can be trusted, and how far.
 *
 * `none` is not zero — it means no defensible benchmark exists, and the board shows a dash
 * rather than a number. Conflating the two is how a tender project ends up reported as a
 * zero-value opportunity.
 */
export type SavingsConfidence = 'benchmarked' | 'indicative' | 'none';

/** One supplier's trading history within a project. */
export interface ProjectSupplier {
  supplierNum: string;
  name: string;
  lines: number;
  qty: number;
  spendUsd: number;
  /** Spend-weighted unit price, USD. The basis for the cheapest-supplier comparison. */
  avgUnitPriceUsd: number;
  /** True for the supplier whose average sets the benchmark. */
  isCheapest: boolean;
}

/** A candidate sourcing project. One row of the board. */
export interface SourcingProject {
  /** Stable within a run, derived from the grouping key — used for React keys and CSV. */
  id: string;
  type: ProjectType;
  country: string;
  /** SAP material number, or null for description-clustered service projects. */
  material: string | null;
  /**
   * What the rows were grouped on — the material number, or the normalised description key.
   *
   * Carried separately from `title` because a service cluster is LABELLED with the commonest
   * original spelling a buyer wrote, while it is GROUPED on the stripped key. Fetching the
   * lines behind a project needs the key, not the label.
   */
  groupKey: string;
  /** What a reader calls it — material description, or the normalised description cluster. */
  title: string;
  materialGroup: string | null;
  materialType: string | null;
  /** Purchasing group — who would own this project. */
  owner: string | null;

  purchaseOrders: number;
  lines: number;
  spendUsd: number;
  qty: number;
  orderUnit: string | null;

  firstPurchase: string | null;
  lastPurchase: string | null;

  suppliers: ProjectSupplier[];
  supplierCount: number;

  /** Spend-weighted mean unit price across every supplier, USD. */
  avgUnitPriceUsd: number | null;
  minUnitPriceUsd: number | null;
  maxUnitPriceUsd: number | null;
  /** Coefficient of variation of unit price. Null where a unit price is meaningless. */
  priceCv: number | null;

  /** Estimated annual-equivalent saving, USD. Null when no benchmark exists. */
  savingsUsd: number | null;
  savingsPct: number | null;
  savingsConfidence: SavingsConfidence;

  /** SAP info record number, when one exists. Drives the maverick/tender split. */
  infoRecord: string | null;
  /** Live contracted unit price from `pir_catalog`, converted to USD. */
  contractPriceUsd: number | null;
  contractExpired: boolean;

  /** How many suppliers serve this material group in this country — fragmentation context. */
  categorySupplierCount: number | null;

  /** One plain sentence explaining why this qualifies. Generated from the figures above. */
  rationale: string;
}

/** A country+material-group combination, for the fragmentation panel. */
export interface CategoryFragment {
  country: string;
  materialGroup: string;
  lines: number;
  purchaseOrders: number;
  supplierCount: number;
  spendUsd: number;
  /** Share of the category's spend held by its largest supplier, 0-100. */
  topSupplierSharePct: number;
}

/** Headline figures for the strip above the table, and the honesty caveats beneath it. */
export interface SourcingSummary {
  projects: number;
  addressableSpendUsd: number;
  identifiedSavingsUsd: number;
  byType: Record<ProjectType, { projects: number; spendUsd: number; savingsUsd: number }>;
  byCountry: { country: string; projects: number; spendUsd: number; savingsUsd: number }[];
  /** Spend examined before any guard or threshold removed it. The denominator. */
  examinedSpendUsd: number;
  /**
   * Spend dropped by the data-quality guards, and why. Reported, not hidden: the guards remove
   * a measurable slice of apparent opportunity and a reader is entitled to know how much.
   */
  excluded: { reason: string; groups: number; spendUsd: number }[];
  /** Share of material spend a live info record could be found for, 0-100. */
  pirCoveragePct: number | null;
}

/** One PO line behind a project — the evidence a reader checks the rationale against. */
export interface EvidenceLine {
  purchaseDoc: string;
  item: string | null;
  releaseDate: string | null;
  deliveryDate: string | null;
  supplierNum: string;
  supplierName: string;
  description: string | null;
  qty: number;
  orderUnit: string | null;
  unitPriceUsd: number | null;
  lineValueUsd: number;
  currency: string | null;
  nativeValue: number | null;
  plant: string | null;
  buyer: string | null;
  docType: string | null;
  infoRecord: string | null;
  incoterms: string | null;
}

export interface ProjectEvidence {
  lines: EvidenceLine[];
  /** True when the line list was capped — the workbook says so rather than implying it is whole. */
  truncated: boolean;
}

export interface SourcingAnalysis {
  summary: SourcingSummary;
  projects: SourcingProject[];
  fragments: CategoryFragment[];
  loadedAt: string | null;
}

/* ─── Request shape ─────────────────────────────────────────────────────── */

/** The qualification dial, exposed as presets on the board. */
export type Preset = 'all' | 'balanced' | 'high' | 'strict';

/**
 * Thresholds a project must clear. Presets set these; the board also exposes spend and window
 * directly, because a bar that suits Saudi Arabia does not suit Yemen.
 */
export interface SourcingThresholds {
  minPurchaseOrders: number;
  minSpendUsd: number;
  minPriceCv: number;
  minSuppliers: number;
  minSavingsUsd: number;
}

/**
 * Calibrated against the live warehouse. The gradient matters more than any single row:
 * tightening from `all` to `strict` drops ~95% of projects but keeps ~68% of the savings, so
 * the loose end is padding and the tight end is where the money is.
 */
export const PRESETS: Record<Preset, SourcingThresholds> = {
  all: { minPurchaseOrders: 3, minSpendUsd: 25_000, minPriceCv: 0.15, minSuppliers: 1, minSavingsUsd: 0 },
  balanced: { minPurchaseOrders: 4, minSpendUsd: 50_000, minPriceCv: 0.2, minSuppliers: 1, minSavingsUsd: 0 },
  high: { minPurchaseOrders: 5, minSpendUsd: 100_000, minPriceCv: 0.25, minSuppliers: 2, minSavingsUsd: 0 },
  strict: { minPurchaseOrders: 5, minSpendUsd: 250_000, minPriceCv: 0.25, minSuppliers: 2, minSavingsUsd: 25_000 },
};

export interface SourcingRequest {
  /** The shared Purchase Orders filter bar — country, segment, supplier, buyer, dates. */
  filters: PoFilters;
  preset: Preset;
  /** Overrides the preset's spend floor when set. */
  minSpendUsd: number | null;
  /** Trailing window in months, counted back from today. */
  lookbackMonths: number;
  /** Which project types to include. Empty means all. */
  types: ProjectType[];
  /** Include description-clustered service projects — the slower, lower-confidence lane. */
  includeServices: boolean;
}

export const DEFAULT_REQUEST: SourcingRequest = {
  filters: {
    accountClassification: [],
    segment: [],
    country: [],
    purchasingOrg: [],
    supplier: [],
    buyer: [],
    releasedFrom: null,
    releasedTo: null,
    firstReleasedFrom: null,
    firstReleasedTo: null,
  },
  preset: 'balanced',
  minSpendUsd: null,
  lookbackMonths: 24,
  types: [],
  includeServices: false,
};
