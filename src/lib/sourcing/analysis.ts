/**
 * Assembles the Sourcing Opportunities board: fetch, judge, rank, summarise.
 *
 * The seam this file sits on matters. `./queries.ts` knows SQL and nothing about what makes an
 * opportunity; `./rules.ts` and `./normalise.ts` know what makes an opportunity and nothing
 * about SQL. This module is the only place the two meet, and it holds no judgement of its own —
 * every threshold, guard and figure comes from the pure modules so it stays testable there.
 *
 * ── THE SERVICE LANE IS CACHED, THE MATERIAL LANE IS NOT ────────────────────────────────────
 * Measured against the live warehouse: the material lane groups in ~2.5s, which is fine to run
 * on every filter change. Normalising 545k free-text descriptions in SQL costs ~7.7s, which is
 * not. So services sit behind `unstable_cache` with an hour's life, the same pattern and the
 * same fallback-to-fresh as `loadPoFilterOptions` in `src/lib/purchase-orders/options.ts`.
 * Because the cache key cannot carry the whole filter object sensibly, the service lane is
 * cached UNFILTERED and narrowed in JS afterwards — correct because the filters it supports are
 * all group-level attributes already present on the rows.
 */

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { logger } from '@/lib/logger';
import { EMPTY_FILTERS, type PoFilters } from '@/lib/purchase-orders/filters';
import { clusterKey, clusterLabel } from './normalise';
import { contractPriceFor, loadPirIndex, type PirIndex } from './pir';
import {
  loadCategoryFragments,
  loadMaterialGroups,
  loadServiceGroups,
  loadedAt,
  type ServiceGroupRow,
} from './queries';
import {
  EXCLUSION_LABEL,
  applyGuards,
  avgUnitPrice,
  cheapestSupplier,
  classify,
  consolidationSavings,
  leakageSavings,
  priceCv,
  qualifies,
  rankScore,
  rationale,
  type CandidateGroup,
  type ExclusionReason,
} from './rules';
import {
  PRESETS,
  type ProjectType,
  type SourcingAnalysis,
  type SourcingProject,
  type SourcingRequest,
  type SourcingSummary,
} from './types';

const log = logger('sourcing');

/** The loosest preset's PO floor, pushed into SQL purely to keep 51,732 singletons off the wire. */
const SQL_MIN_POS = PRESETS.all.minPurchaseOrders;

/* ─── Service lane cache ──────────────────────────────────────────────────── */

const cachedServiceGroups = unstable_cache(
  async (lookbackMonths: number): Promise<ServiceGroupRow[]> =>
    loadServiceGroups({ filters: EMPTY_FILTERS, lookbackMonths }, SQL_MIN_POS),
  ['sourcing', 'service-groups', 'v1'],
  { revalidate: 3600, tags: ['sourcing:service'] },
);

async function serviceGroups(lookbackMonths: number): Promise<ServiceGroupRow[]> {
  try {
    return await cachedServiceGroups(lookbackMonths);
  } catch (err) {
    /* `unstable_cache` throws outside a Next request context, and a cache is an optimisation,
       not the feature. Falling back keeps the lane callable from a plain script, which is how
       its SQL gets exercised against the warehouse. */
    log.warn('service.cache_unavailable', { reason: String(err) });
    return loadServiceGroups({ filters: EMPTY_FILTERS, lookbackMonths }, SQL_MIN_POS);
  }
}

/**
 * Filters the service lane can honour, and the ones it cannot.
 *
 * The cached service groups are computed unfiltered — the cache key cannot carry a whole filter
 * object — so narrowing happens here, in JS. Only two of the six filter dimensions survive the
 * grouping as row attributes: country, and purchasing group (the owner).
 *
 * Supplier, buyer, purchasing org and account classification are line-level and were collapsed
 * by the cluster. There is no honest way to narrow by them, so when any is active the service
 * lane is DROPPED rather than returned unnarrowed. Silently ignoring a filter would show a
 * reader service clusters that contradict the selection they just made, which is worse than
 * showing none — and the board says so where the lane is toggled.
 */
export function serviceLaneSupported(f: PoFilters): boolean {
  return (
    f.supplier.length === 0 &&
    f.buyer.length === 0 &&
    f.purchasingOrg.length === 0 &&
    f.accountClassification.length === 0
  );
}

function narrowServices(rows: ServiceGroupRow[], f: PoFilters): ServiceGroupRow[] {
  const has = (list: string[], v: string | null) => !list.length || (v !== null && list.includes(v));
  return rows.filter((r) => has(f.country, r.country) && has(f.segment, r.owner));
}

/* ─── Assembly ────────────────────────────────────────────────────────────── */

interface Built {
  project: SourcingProject | null;
  excluded: ExclusionReason | null;
  examinedSpendUsd: number;
}

function buildProject(
  g: CandidateGroup,
  pir: PirIndex,
  req: SourcingRequest,
  isServiceCluster: boolean,
  categorySuppliers: Map<string, number>,
): Built {
  const examinedSpendUsd = g.spendUsd;

  /* Services are judged on spend and supplier count, never on unit price, so the price-shape
     guards would reject them for having a meaningless price rather than a bad one. Only the
     non-sourceable screen applies, and that is enforced by `clusterKey` upstream. */
  if (!isServiceCluster) {
    const guard = applyGuards(g);
    if (!guard.ok) return { project: null, excluded: guard.reason ?? null, examinedSpendUsd };
  }

  const contract = contractPriceFor(pir, g.material, g.suppliers.map((s) => s.supplierNum));
  const type = classify({
    group: g,
    contractPriceUsd: contract.priceUsd,
    contractExpired: contract.expired,
    isServiceCluster,
  });

  const savings =
    type === 'leakage' && contract.priceUsd !== null
      ? leakageSavings(g, contract.priceUsd)
      : type === 'consolidation'
        ? consolidationSavings(g)
        : { usd: null, pct: null, confidence: 'none' as const };

  /* A leakage figure resting on a floating-currency contract price carries real FX uncertainty;
     saying so is cheaper than being wrong about it later. */
  const confidence =
    type === 'leakage' && contract.indicative && savings.confidence === 'benchmarked'
      ? ('indicative' as const)
      : savings.confidence;

  const thresholds = {
    ...PRESETS[req.preset],
    ...(req.minSpendUsd !== null ? { minSpendUsd: req.minSpendUsd } : {}),
  };
  if (!qualifies(g, type, savings, thresholds)) {
    return { project: null, excluded: null, examinedSpendUsd };
  }
  if (req.types.length && !req.types.includes(type)) {
    return { project: null, excluded: null, examinedSpendUsd };
  }

  const cheapest = cheapestSupplier(g.suppliers);
  const suppliers = g.suppliers
    .map((s) => ({ ...s, isCheapest: cheapest?.supplierNum === s.supplierNum }))
    .sort((a, b) => b.spendUsd - a.spendUsd);

  const categorySupplierCount =
    g.materialGroup !== null
      ? (categorySuppliers.get(`${g.country}\u0000${g.materialGroup}`) ?? null)
      : null;

  const avg = avgUnitPrice(g);

  const project: SourcingProject = {
    id: `${type}:${g.country}:${g.material ?? g.title}`,
    type,
    country: g.country,
    material: g.material,
    title: g.title,
    materialGroup: g.materialGroup,
    materialType: g.materialType,
    owner: g.owner,
    purchaseOrders: g.purchaseOrders,
    lines: g.lines,
    spendUsd: g.spendUsd,
    qty: g.qty,
    orderUnit: g.orderUnit,
    firstPurchase: g.firstPurchase,
    lastPurchase: g.lastPurchase,
    suppliers,
    supplierCount: g.suppliers.length,
    avgUnitPriceUsd: isServiceCluster ? null : avg,
    minUnitPriceUsd: isServiceCluster ? null : g.minUnitPriceUsd,
    maxUnitPriceUsd: isServiceCluster ? null : g.maxUnitPriceUsd,
    priceCv: isServiceCluster ? null : priceCv(g),
    savingsUsd: savings.usd,
    savingsPct: savings.pct,
    savingsConfidence: confidence,
    infoRecord: g.infoRecord ?? contract.infoRecordNumber,
    contractPriceUsd: contract.priceUsd,
    contractExpired: contract.expired,
    categorySupplierCount,
    rationale: rationale({
      type,
      country: g.country,
      purchaseOrders: g.purchaseOrders,
      supplierCount: g.suppliers.length,
      spendUsd: g.spendUsd,
      minUnitPriceUsd: isServiceCluster ? null : g.minUnitPriceUsd,
      maxUnitPriceUsd: isServiceCluster ? null : g.maxUnitPriceUsd,
      savingsUsd: savings.usd,
      firstPurchase: g.firstPurchase,
      lastPurchase: g.lastPurchase,
      contractPriceUsd: contract.priceUsd,
      avgUnitPriceUsd: avg,
      categorySupplierCount,
    }),
  };

  return { project, excluded: null, examinedSpendUsd };
}

function summarise(
  projects: SourcingProject[],
  excluded: Map<ExclusionReason, { groups: number; spendUsd: number }>,
  examinedSpendUsd: number,
  pirCoveragePct: number | null,
): SourcingSummary {
  const blank = () => ({ projects: 0, spendUsd: 0, savingsUsd: 0 });
  const byType: Record<ProjectType, { projects: number; spendUsd: number; savingsUsd: number }> = {
    consolidation: blank(),
    tender: blank(),
    leakage: blank(),
    maverick: blank(),
    service: blank(),
  };
  const byCountryMap = new Map<string, { projects: number; spendUsd: number; savingsUsd: number }>();

  for (const p of projects) {
    const t = byType[p.type];
    t.projects += 1;
    t.spendUsd += p.spendUsd;
    t.savingsUsd += p.savingsUsd ?? 0;

    const c = byCountryMap.get(p.country) ?? blank();
    c.projects += 1;
    c.spendUsd += p.spendUsd;
    c.savingsUsd += p.savingsUsd ?? 0;
    byCountryMap.set(p.country, c);
  }

  return {
    projects: projects.length,
    addressableSpendUsd: projects.reduce((s, p) => s + p.spendUsd, 0),
    identifiedSavingsUsd: projects.reduce((s, p) => s + (p.savingsUsd ?? 0), 0),
    byType,
    byCountry: [...byCountryMap.entries()]
      .map(([country, v]) => ({ country, ...v }))
      .sort((a, b) => b.savingsUsd - a.savingsUsd || b.spendUsd - a.spendUsd),
    examinedSpendUsd,
    excluded: [...excluded.entries()]
      .map(([reason, v]) => ({ reason: EXCLUSION_LABEL[reason], ...v }))
      .sort((a, b) => b.spendUsd - a.spendUsd),
    pirCoveragePct,
  };
}

export const loadSourcingAnalysis = cache(
  async (req: SourcingRequest): Promise<SourcingAnalysis> => {
    const laneParams = { filters: req.filters, lookbackMonths: req.lookbackMonths };

    /* Three concurrent reads, not twenty: `materialsPool` allows 8 connections and shares them
       with the Purchase Orders board. */
    const [materialGroups, fragments, pir, loaded] = await Promise.all([
      loadMaterialGroups(laneParams, SQL_MIN_POS),
      loadCategoryFragments(laneParams),
      loadPirIndex(),
      loadedAt(),
    ]);

    const categorySuppliers = new Map(
      fragments.map((f) => [`${f.country}\u0000${f.materialGroup}`, f.supplierCount]),
    );

    const projects: SourcingProject[] = [];
    const excluded = new Map<ExclusionReason, { groups: number; spendUsd: number }>();
    let examinedSpendUsd = 0;

    const consider = (g: CandidateGroup, isService: boolean) => {
      const built = buildProject(g, pir, req, isService, categorySuppliers);
      examinedSpendUsd += built.examinedSpendUsd;
      if (built.excluded) {
        const e = excluded.get(built.excluded) ?? { groups: 0, spendUsd: 0 };
        e.groups += 1;
        e.spendUsd += g.spendUsd;
        excluded.set(built.excluded, e);
      }
      if (built.project) projects.push(built.project);
    };

    for (const g of materialGroups) consider(g, false);

    if (req.includeServices && serviceLaneSupported(req.filters)) {
      const raw = await serviceGroups(req.lookbackMonths);
      for (const row of narrowServices(raw, req.filters)) {
        /* `clusterKey` is the arbiter of whether a description is usable — it rejects
           placeholders, codes and the non-addressable spend (payroll, tax, rent, permits) that
           profiling found ranking at the very top by value. */
        const decision = clusterKey(row.title);
        if (!decision.usable) continue;
        consider({ ...row, title: clusterLabel(row.originals) || row.title }, true);
      }
    }

    projects.sort(
      (a, b) =>
        rankScore({ savingsUsd: b.savingsUsd, spendUsd: b.spendUsd, priceCv: b.priceCv }) -
        rankScore({ savingsUsd: a.savingsUsd, spendUsd: a.spendUsd, priceCv: a.priceCv }),
    );

    /* Share of examined material spend for which a live contract price could be found. The
       board shows this because the PIR lane covers roughly a tenth of material spend, and a
       leakage total without its denominator reads as the whole picture. */
    const withContract = projects
      .filter((p) => p.contractPriceUsd !== null && !p.contractExpired)
      .reduce((s, p) => s + p.spendUsd, 0);
    const materialSpend = projects
      .filter((p) => p.material !== null)
      .reduce((s, p) => s + p.spendUsd, 0);

    return {
      summary: summarise(
        projects,
        excluded,
        examinedSpendUsd,
        materialSpend > 0 ? (withContract / materialSpend) * 100 : null,
      ),
      projects,
      fragments,
      loadedAt: loaded,
    };
  },
);
