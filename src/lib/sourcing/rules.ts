/**
 * Whether a spend pattern is a sourcing project, and what it is worth.
 *
 * Pure — imports no pool, touches no database, and is unit-tested against hand-built rows. The
 * SQL in `./queries.ts` fetches candidate groups; every judgement about them is made here.
 *
 * ── WHY THE GUARDS ARE THE FEATURE ──────────────────────────────────────────────────────────
 * Profiling the warehouse before any of this was written produced a theoretical saving of
 * $457.7M on a minimum-price basis. Almost all of it was rubbish, and the rubbish was
 * concentrated in a handful of recognisable shapes. Measured on 14,210 repeat-purchase groups:
 *
 *   - 34 groups whose description is freight, customs or handling generated 13% of the entire
 *     theoretical saving, at an average price variance of 1.48 against 0.25 for real items.
 *     They are not materials; they are charge containers with a material number.
 *   - 390 groups where EVERY line has quantity 1 produced a further 11.9%. Their "unit price"
 *     is whichever invoice total somebody keyed.
 *   - 148 groups mixing units of measure carried $233.8M of spend whose price spread compares
 *     litres against drums.
 *   - 179 groups with a max/min price ratio above 100x contributed $12.6M of pure data error.
 *
 * Excluding just the 148 unit-mixing groups moved the min-basis figure from $457.7M to $312.1M.
 * A board that skipped these guards would be confidently, expensively wrong, so they run first
 * and the spend they remove is REPORTED rather than silently dropped — a reader is entitled to
 * know how much apparent opportunity was discarded and on what grounds.
 *
 * ── THE SAVINGS BASIS ───────────────────────────────────────────────────────────────────────
 * The cheapest supplier's spend-weighted AVERAGE, never the cheapest single line. A minimum is
 * one lucky purchase — an odd lot, a year-old price, a keying error — and negotiating against it
 * is negotiating against noise. An average is a supplier's demonstrated performance over many
 * orders, which is a position you can defend in a room.
 */

import type {
  ProjectSupplier,
  ProjectType,
  SavingsConfidence,
  SourcingThresholds,
} from './types';

/* ─── Guards ──────────────────────────────────────────────────────────────── */

/** Why a candidate group was discarded. The board reports these in aggregate. */
export type ExclusionReason =
  | 'mixed-unit'
  | 'charge-container'
  | 'extreme-spread'
  | 'non-sourceable'
  | 'consignment'
  | 'no-usable-price';

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  'mixed-unit': 'Mixed units of measure',
  'charge-container': 'Charge container (every line quantity 1)',
  'extreme-spread': 'Implausible price spread',
  'non-sourceable': 'Freight, customs or handling',
  consignment: 'Consignment stock',
  'no-usable-price': 'No usable unit price',
};

/**
 * Beyond this max/min unit-price ratio a group is a keying error, not an opportunity.
 *
 * The 2–5x band is where real, negotiable variance lives. Above 100x there were 179 groups
 * manufacturing $12.6M of savings from nothing. 20 is comfortably past genuine commercial
 * spread while still catching the nonsense.
 */
export const MAX_PRICE_SPREAD_RATIO = 20;

/**
 * Descriptions that mean "this line is a charge, not a thing".
 *
 * Matched against the material or cluster description. Deliberately narrow — each term was
 * found at the top of the savings ranking during profiling, and a broader list would start
 * excluding real categories. `handling` is only excluded in combination, because "handling
 * equipment" is a genuine commodity.
 */
const NON_SOURCEABLE = [
  /\bfreight\b/i,
  /\bhandling charge/i,
  /\bcustoms?\b/i,
  /\bclearance\b/i,
  /\bcourier\b/i,
  /\bdemurrage\b/i,
  /\bduty\b/i,
  /\bdemurage\b/i,
];

export function isNonSourceable(description: string | null | undefined): boolean {
  const d = (description ?? '').trim();
  if (!d) return false;
  return NON_SOURCEABLE.some((re) => re.test(d));
}

/** The raw shape `queries.ts` produces, before any judgement is applied. */
export interface CandidateGroup {
  country: string;
  material: string | null;
  title: string;
  materialGroup: string | null;
  materialType: string | null;
  owner: string | null;
  purchaseOrders: number;
  lines: number;
  qty: number;
  spendUsd: number;
  /** Distinct `order_unit` values seen. More than one makes the price spread meaningless. */
  distinctUnits: number;
  orderUnit: string | null;
  /** Lines whose `order_qty` is exactly 1. All of them means a charge container. */
  unitQtyLines: number;
  minUnitPriceUsd: number | null;
  maxUnitPriceUsd: number | null;
  /** Population standard deviation of unit price, from SQL. */
  stddevUnitPriceUsd: number | null;
  firstPurchase: string | null;
  lastPurchase: string | null;
  suppliers: ProjectSupplier[];
  infoRecord: string | null;
  docTypes: string[];
}

export interface GuardResult {
  ok: boolean;
  reason?: ExclusionReason;
}

/**
 * Runs the data-quality guards in order of how much nonsense each removes.
 *
 * Order matters only for which reason gets reported; a group failing two guards is counted
 * once, against the first that caught it.
 */
export function applyGuards(g: CandidateGroup): GuardResult {
  if (isNonSourceable(g.title)) return { ok: false, reason: 'non-sourceable' };

  /* Consignment pricing works differently — stock is held and billed on consumption — so its
     unit prices are not comparable with ordinary purchases. */
  if (g.docTypes.length > 0 && g.docTypes.every((t) => t.toUpperCase().startsWith('CON'))) {
    return { ok: false, reason: 'consignment' };
  }

  if (g.distinctUnits > 1) return { ok: false, reason: 'mixed-unit' };

  /* Every line quantity 1 means the "unit price" is just whatever the invoice total was. */
  if (g.lines > 0 && g.unitQtyLines === g.lines) return { ok: false, reason: 'charge-container' };

  const min = g.minUnitPriceUsd;
  const max = g.maxUnitPriceUsd;
  if (min === null || max === null || min <= 0) return { ok: false, reason: 'no-usable-price' };
  if (max / min > MAX_PRICE_SPREAD_RATIO) return { ok: false, reason: 'extreme-spread' };

  return { ok: true };
}

/* ─── Derived figures ─────────────────────────────────────────────────────── */

/** Spend-weighted mean unit price across the whole group. */
export function avgUnitPrice(g: CandidateGroup): number | null {
  if (!g.qty) return null;
  return g.spendUsd / g.qty;
}

/**
 * Coefficient of variation — the spread signal, normalised so a $0.30 proppant and a $600
 * glycol are comparable.
 */
export function priceCv(g: CandidateGroup): number | null {
  const mean = avgUnitPrice(g);
  if (mean === null || mean <= 0 || g.stddevUnitPriceUsd === null) return null;
  return g.stddevUnitPriceUsd / mean;
}

/** The supplier whose spend-weighted average sets the benchmark. */
export function cheapestSupplier(suppliers: ProjectSupplier[]): ProjectSupplier | null {
  const usable = suppliers.filter((s) => s.avgUnitPriceUsd > 0 && s.qty > 0);
  if (!usable.length) return null;
  return usable.reduce((best, s) => (s.avgUnitPriceUsd < best.avgUnitPriceUsd ? s : best));
}

export interface Savings {
  usd: number | null;
  pct: number | null;
  confidence: SavingsConfidence;
}

/**
 * What consolidating onto the cheapest supplier would have saved.
 *
 * Returns `null`, not zero, when no benchmark exists. A single-supplier project genuinely has
 * no comparator, and reporting it as a zero-value opportunity would rank the best tender
 * candidates at the bottom of the board.
 *
 * Clamped at zero: a group whose cheapest supplier's average exceeds the blended average can
 * only happen through rounding on tiny quantities, and a negative "saving" is not a finding.
 */
export function consolidationSavings(g: CandidateGroup): Savings {
  if (g.suppliers.length < 2) return { usd: null, pct: null, confidence: 'none' };
  const cheapest = cheapestSupplier(g.suppliers);
  if (!cheapest || !g.qty) return { usd: null, pct: null, confidence: 'none' };

  const atCheapest = cheapest.avgUnitPriceUsd * g.qty;
  const usd = Math.max(0, g.spendUsd - atCheapest);
  return {
    usd,
    pct: g.spendUsd > 0 ? (usd / g.spendUsd) * 100 : null,
    /* One supplier's average over few orders is a weaker benchmark than several suppliers
       trading regularly, so the board can show the difference rather than implying equal
       footing. */
    confidence: cheapest.lines >= 3 ? 'benchmarked' : 'indicative',
  };
}

/** What buying at the contracted rate would have saved. Only for lines with a live info record. */
export function leakageSavings(g: CandidateGroup, contractPriceUsd: number): Savings {
  if (!g.qty || contractPriceUsd <= 0) return { usd: null, pct: null, confidence: 'none' };
  const atContract = contractPriceUsd * g.qty;
  const usd = Math.max(0, g.spendUsd - atContract);
  return {
    usd,
    pct: g.spendUsd > 0 ? (usd / g.spendUsd) * 100 : null,
    confidence: 'benchmarked',
  };
}

/* ─── Classification ──────────────────────────────────────────────────────── */

export interface ClassifyInput {
  group: CandidateGroup;
  /** Live contracted price in USD, if `pir.ts` resolved one. */
  contractPriceUsd: number | null;
  /** True when the only info record found has expired. */
  contractExpired: boolean;
  /** Description-clustered service lines take a different lane entirely. */
  isServiceCluster: boolean;
}

/**
 * Which kind of project this is.
 *
 * The order encodes precedence, and it is ordered by WHAT CAN BE QUANTIFIED, not by what sounds
 * most serious.
 *
 * Paying above a live contract comes first: it is the most actionable finding there is and it
 * carries a hard number.
 *
 * Consolidation comes next, and deliberately OUTRANKS maverick buying. An earlier draft put
 * maverick first, on the reasoning that ignoring a contract is the graver sin — and against the
 * live warehouse that swallowed $180.5M of spend into a type that reports no savings at all,
 * because any multi-supplier group that happened to carry an info record was reclassified away
 * from the one framing that could price it. A group with several suppliers and a price spread
 * is a negotiation with a number attached; that it also holds an info record is a badge on the
 * row (`infoRecord`), not a reason to discard the number.
 *
 * Maverick is therefore what is left: a contract exists, prices still move, and there is no
 * second supplier to benchmark against. That is a compliance conversation, and it genuinely has
 * no savings figure.
 */
export function classify(input: ClassifyInput): ProjectType {
  const { group, contractPriceUsd, contractExpired } = input;
  if (input.isServiceCluster) return 'service';

  const overContract =
    contractPriceUsd !== null &&
    contractPriceUsd > 0 &&
    !contractExpired &&
    group.qty > 0 &&
    group.spendUsd / group.qty > contractPriceUsd;
  if (overContract) return 'leakage';

  if (group.suppliers.length >= 2) return 'consolidation';

  if (group.infoRecord) {
    const cv = priceCv(group);
    if (cv !== null && cv >= 0.2) return 'maverick';
  }

  return 'tender';
}

/** Does a classified project clear the dial? */
export function qualifies(
  g: CandidateGroup,
  type: ProjectType,
  savings: Savings,
  t: SourcingThresholds,
): boolean {
  if (g.purchaseOrders < t.minPurchaseOrders) return false;
  if (g.spendUsd < t.minSpendUsd) return false;

  /* The supplier floor exists to drop thin consolidation cases — two suppliers barely trading
     is not a market. It must NOT reach the types that are single-supplier by definition. A
     tender project has exactly one supplier; that is the entire finding. Applying a
     `minSuppliers: 2` preset to it would have quietly deleted every competitive-tender
     opportunity from the tighter presets, which is the opposite of what the dial is for. */
  const supplierFloorApplies = type === 'consolidation' || type === 'service';
  if (supplierFloorApplies && g.suppliers.length < t.minSuppliers) return false;

  /* A service cluster has no meaningful unit price — a service "unit" is whatever the buyer
     typed into the quantity box — so it is judged on spend and supplier count alone. Applying
     a variance threshold to it would filter on noise. */
  if (type !== 'service') {
    const cv = priceCv(g);
    if (cv === null || cv < t.minPriceCv) return false;
  }

  /* A tender project has no savings figure by definition, so a savings floor cannot apply to
     it without silently excluding the whole type. */
  if (t.minSavingsUsd > 0 && type !== 'tender' && type !== 'service') {
    if (savings.usd === null || savings.usd < t.minSavingsUsd) return false;
  }

  return true;
}

/* ─── Ranking ─────────────────────────────────────────────────────────────── */

/**
 * How projects sort by default.
 *
 * Savings first, because that is what a reader is looking for. Projects without a savings
 * figure — tenders and service clusters — cannot simply sort last: a $4M single-source category
 * is a better opportunity than a $60k consolidation with $8k of saving. They are ranked by
 * spend scaled by price volatility, which is the same question asked with the evidence
 * available, and kept comparable by scoring them against spend rather than against zero.
 */
export function rankScore(p: {
  savingsUsd: number | null;
  spendUsd: number;
  priceCv: number | null;
}): number {
  if (p.savingsUsd !== null) return p.savingsUsd;
  const volatility = Math.min(p.priceCv ?? 0.2, 1);
  return p.spendUsd * volatility * 0.1;
}

/* ─── Rationale ───────────────────────────────────────────────────────────── */

const money = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};

const price = (n: number): string => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`);

/** Months between two ISO dates, at least 1. */
function monthsBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (30 * 86400000)));
}

/**
 * One plain sentence saying why this qualifies.
 *
 * Built from the figures, never from a model: a rationale that cannot be recomputed from the
 * row beside it is a rationale nobody can check. Each type gets its own sentence because the
 * cases are genuinely different arguments, not one argument with different numbers.
 */
export function rationale(p: {
  type: ProjectType;
  country: string;
  purchaseOrders: number;
  supplierCount: number;
  spendUsd: number;
  minUnitPriceUsd: number | null;
  maxUnitPriceUsd: number | null;
  savingsUsd: number | null;
  firstPurchase: string | null;
  lastPurchase: string | null;
  contractPriceUsd: number | null;
  avgUnitPriceUsd: number | null;
  categorySupplierCount: number | null;
}): string {
  const months = monthsBetween(p.firstPurchase, p.lastPurchase);
  const over = months ? ` over ${months} month${months === 1 ? '' : 's'}` : '';
  const spread =
    p.minUnitPriceUsd !== null && p.maxUnitPriceUsd !== null
      ? `${price(p.minUnitPriceUsd)}–${price(p.maxUnitPriceUsd)}`
      : null;

  switch (p.type) {
    case 'consolidation':
      return (
        `Bought ${p.purchaseOrders} times across ${p.supplierCount} suppliers in ${p.country}${over}, ` +
        `worth ${money(p.spendUsd)}.` +
        (spread ? ` Unit price ranged ${spread}.` : '') +
        (p.savingsUsd !== null
          ? ` Consolidating at the cheapest supplier's average would have saved about ${money(p.savingsUsd)}.`
          : '')
      );

    case 'tender':
      return (
        `Bought ${p.purchaseOrders} times in ${p.country}${over} from a single supplier, ` +
        `worth ${money(p.spendUsd)}.` +
        (spread ? ` Unit price still ranged ${spread}.` : '') +
        ` No second supplier means no benchmark — and no competition.` +
        (p.categorySupplierCount && p.categorySupplierCount > 1
          ? ` ${p.categorySupplierCount} suppliers already serve this category in-country.`
          : '')
      );

    case 'leakage': {
      const paid = p.avgUnitPriceUsd !== null ? price(p.avgUnitPriceUsd) : 'the paid price';
      const contract = p.contractPriceUsd !== null ? price(p.contractPriceUsd) : 'the contracted rate';
      return (
        `Paid an average of ${paid} against a live info-record price of ${contract} in ${p.country}, ` +
        `across ${p.purchaseOrders} orders worth ${money(p.spendUsd)}.` +
        (p.savingsUsd !== null ? ` Buying at the contracted rate would have saved ${money(p.savingsUsd)}.` : '')
      );
    }

    case 'maverick':
      return (
        `An info record exists, yet price still varied${spread ? ` from ${spread}` : ''} across ` +
        `${p.purchaseOrders} orders in ${p.country}${over}, worth ${money(p.spendUsd)}. ` +
        `This is a buying-compliance issue rather than a price negotiation.`
      );

    case 'service':
      return (
        `${p.purchaseOrders} repeat purchases of the same described service across ` +
        `${p.supplierCount} suppliers in ${p.country}${over}, worth ${money(p.spendUsd)}. ` +
        `Grouped by description, so treat the scope as indicative — service lines carry no comparable unit price.`
      );
  }
}
