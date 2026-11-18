import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE_SPREAD_RATIO,
  applyGuards,
  avgUnitPrice,
  cheapestSupplier,
  classify,
  consolidationSavings,
  isNonSourceable,
  leakageSavings,
  priceCv,
  qualifies,
  rankScore,
  rationale,
  type CandidateGroup,
} from '@/lib/sourcing/rules';
import { PRESETS, type ProjectSupplier } from '@/lib/sourcing/types';

/** A supplier with sensible defaults, so each test states only what it is about. */
function supplier(o: Partial<ProjectSupplier> = {}): ProjectSupplier {
  return {
    supplierNum: '0001100001',
    name: 'Acme',
    lines: 5,
    qty: 100,
    spendUsd: 1000,
    avgUnitPriceUsd: 10,
    isCheapest: false,
    ...o,
  };
}

/** A clean, qualifying group — every guard passes unless a test breaks one. */
function group(o: Partial<CandidateGroup> = {}): CandidateGroup {
  return {
    country: 'Kuwait',
    material: '000001100000031272',
    title: 'CALCIUM CHLORIDE 97%',
    materialGroup: 'Chemicals',
    materialType: 'Products',
    owner: 'Cementing',
    purchaseOrders: 10,
    lines: 12,
    qty: 30_000,
    spendUsd: 360_000,
    distinctUnits: 1,
    orderUnit: 'TON',
    unitQtyLines: 2,
    minUnitPriceUsd: 8,
    maxUnitPriceUsd: 16,
    stddevUnitPriceUsd: 3,
    firstPurchase: '2025-01-10',
    lastPurchase: '2026-07-10',
    suppliers: [
      supplier({ supplierNum: 'A', name: 'Cheap Co', avgUnitPriceUsd: 8, qty: 10_000, spendUsd: 80_000, lines: 5 }),
      supplier({ supplierNum: 'B', name: 'Dear Co', avgUnitPriceUsd: 14, qty: 20_000, spendUsd: 280_000, lines: 7 }),
    ],
    infoRecord: null,
    docTypes: ['DRIS'],
    ...o,
  };
}

describe('guards', () => {
  it('passes a clean group', () => {
    expect(applyGuards(group())).toEqual({ ok: true });
  });

  it('rejects mixed units of measure', () => {
    // 148 such groups carried $233.8M of spend whose price spread compares unlike things.
    expect(applyGuards(group({ distinctUnits: 2 }))).toEqual({ ok: false, reason: 'mixed-unit' });
  });

  it('rejects a charge container — every line quantity 1', () => {
    expect(applyGuards(group({ lines: 9, unitQtyLines: 9 }))).toEqual({
      ok: false,
      reason: 'charge-container',
    });
  });

  it('allows a group where only some lines are quantity 1', () => {
    expect(applyGuards(group({ lines: 9, unitQtyLines: 8 })).ok).toBe(true);
  });

  it('rejects an implausible price spread', () => {
    const over = group({ minUnitPriceUsd: 1, maxUnitPriceUsd: MAX_PRICE_SPREAD_RATIO + 1 });
    expect(applyGuards(over)).toEqual({ ok: false, reason: 'extreme-spread' });
  });

  it('allows a spread exactly at the cap', () => {
    const at = group({ minUnitPriceUsd: 1, maxUnitPriceUsd: MAX_PRICE_SPREAD_RATIO });
    expect(applyGuards(at).ok).toBe(true);
  });

  it('rejects freight and customs pseudo-materials', () => {
    // 34 such groups produced 13% of the entire theoretical saving.
    for (const title of [
      'Air Freight & Handling charges- Saudi',
      'Sea Freight & Handling - Algeria',
      'CUSTOMS DUTY',
      'Clearance charges',
    ]) {
      expect(applyGuards(group({ title })).reason).toBe('non-sourceable');
    }
  });

  it('does not reject a genuine item that merely mentions handling equipment', () => {
    expect(isNonSourceable('MATERIAL HANDLING EQUIPMENT SPARE')).toBe(false);
  });

  it('rejects consignment stock, whose pricing is not comparable', () => {
    expect(applyGuards(group({ docTypes: ['CONS', 'CONG'] })).reason).toBe('consignment');
  });

  it('keeps a group that is only partly consignment', () => {
    expect(applyGuards(group({ docTypes: ['CONS', 'DRIS'] })).ok).toBe(true);
  });

  it('rejects a group with no usable price', () => {
    expect(applyGuards(group({ minUnitPriceUsd: 0 })).reason).toBe('no-usable-price');
    expect(applyGuards(group({ minUnitPriceUsd: null })).reason).toBe('no-usable-price');
  });
});

describe('derived figures', () => {
  it('computes a spend-weighted average unit price', () => {
    expect(avgUnitPrice(group({ spendUsd: 3600, qty: 300 }))).toBe(12);
  });

  it('returns null rather than dividing by zero quantity', () => {
    expect(avgUnitPrice(group({ qty: 0 }))).toBeNull();
    expect(priceCv(group({ qty: 0 }))).toBeNull();
  });

  it('computes coefficient of variation against the mean', () => {
    expect(priceCv(group({ spendUsd: 3600, qty: 300, stddevUnitPriceUsd: 3 }))).toBeCloseTo(0.25);
  });

  it('returns null CV when the standard deviation is missing', () => {
    expect(priceCv(group({ stddevUnitPriceUsd: null }))).toBeNull();
  });

  it('picks the cheapest supplier by average, ignoring those with no quantity', () => {
    const s = [
      supplier({ supplierNum: 'A', avgUnitPriceUsd: 9 }),
      supplier({ supplierNum: 'B', avgUnitPriceUsd: 2, qty: 0 }),
      supplier({ supplierNum: 'C', avgUnitPriceUsd: 5 }),
    ];
    expect(cheapestSupplier(s)?.supplierNum).toBe('C');
  });
});

describe('savings', () => {
  it('values consolidation against the cheapest supplier average', () => {
    // 30,000 units at $8 = $240k against $360k actually spent.
    const s = consolidationSavings(group());
    expect(s.usd).toBe(120_000);
    expect(s.pct).toBeCloseTo(33.33, 1);
    expect(s.confidence).toBe('benchmarked');
  });

  it('marks a thin benchmark as indicative rather than benchmarked', () => {
    const g = group({
      suppliers: [
        supplier({ supplierNum: 'A', avgUnitPriceUsd: 8, lines: 1 }),
        supplier({ supplierNum: 'B', avgUnitPriceUsd: 14, lines: 7 }),
      ],
    });
    expect(consolidationSavings(g).confidence).toBe('indicative');
  });

  it('returns null, NOT zero, for a single-supplier group', () => {
    // The distinction matters: zero would rank the best tender candidates last.
    const s = consolidationSavings(group({ suppliers: [supplier()] }));
    expect(s.usd).toBeNull();
    expect(s.confidence).toBe('none');
  });

  it('never reports a negative saving', () => {
    const g = group({
      spendUsd: 800,
      qty: 100,
      suppliers: [
        supplier({ supplierNum: 'A', avgUnitPriceUsd: 10 }),
        supplier({ supplierNum: 'B', avgUnitPriceUsd: 12 }),
      ],
    });
    expect(consolidationSavings(g).usd).toBe(0);
  });

  it('values leakage against the contracted rate', () => {
    expect(leakageSavings(group({ spendUsd: 3600, qty: 300 }), 10).usd).toBe(600);
  });

  it('declines to value leakage against a nonsense contract price', () => {
    expect(leakageSavings(group(), 0).usd).toBeNull();
  });
});

describe('classification', () => {
  const base = { contractPriceUsd: null, contractExpired: false, isServiceCluster: false };

  it('calls a multi-supplier group consolidation', () => {
    expect(classify({ group: group(), ...base })).toBe('consolidation');
  });

  it('calls a single-supplier group a tender', () => {
    expect(classify({ group: group({ suppliers: [supplier()] }), ...base })).toBe('tender');
  });

  it('calls paying above a live contract leakage', () => {
    // Average paid is $12; the live contract says $10.
    expect(classify({ group: group(), ...base, contractPriceUsd: 10 })).toBe('leakage');
  });

  it('does not call it leakage when the contract has expired', () => {
    const t = classify({ group: group(), ...base, contractPriceUsd: 10, contractExpired: true });
    expect(t).not.toBe('leakage');
  });

  it('calls single-source variance despite an info record maverick buying', () => {
    const g = group({ infoRecord: '5300058001', stddevUnitPriceUsd: 3, suppliers: [supplier()] });
    expect(classify({ group: g, ...base })).toBe('maverick');
  });

  it('does NOT let an info record steal the savings figure from a multi-supplier group', () => {
    // Ranking maverick above consolidation swallowed $180.5M of real, priceable spend into a
    // type that reports no savings. The info record is a badge on the row, not a reclassification.
    const g = group({ infoRecord: '5300058001', stddevUnitPriceUsd: 3 });
    expect(classify({ group: g, ...base })).toBe('consolidation');
    expect(consolidationSavings(g).usd).toBeGreaterThan(0);
  });

  it('leaves a well-behaved single-supplier info-record group as a tender', () => {
    const g = group({ infoRecord: '5300058001', stddevUnitPriceUsd: 0.1, suppliers: [supplier()] });
    expect(classify({ group: g, ...base })).toBe('tender');
  });

  it('routes a service cluster to its own lane regardless of everything else', () => {
    const t = classify({ group: group(), ...base, isServiceCluster: true, contractPriceUsd: 10 });
    expect(t).toBe('service');
  });
});

describe('qualification', () => {
  const t = PRESETS.balanced;

  /** A large single-supplier group. Quantity scales with spend so the unit price stays real. */
  const bigTender = () =>
    group({ spendUsd: 4_000_000, qty: 333_333, stddevUnitPriceUsd: 4, suppliers: [supplier()] });

  it('accepts a group that clears every threshold', () => {
    expect(qualifies(group(), 'consolidation', consolidationSavings(group()), t)).toBe(true);
  });

  it('rejects too few purchase orders', () => {
    const g = group({ purchaseOrders: 2 });
    expect(qualifies(g, 'consolidation', consolidationSavings(g), t)).toBe(false);
  });

  it('rejects spend below the floor', () => {
    const g = group({ spendUsd: 100 });
    expect(qualifies(g, 'consolidation', consolidationSavings(g), t)).toBe(false);
  });

  it('rejects a flat price under the variance threshold', () => {
    const g = group({ stddevUnitPriceUsd: 0 });
    expect(qualifies(g, 'consolidation', consolidationSavings(g), t)).toBe(false);
  });

  it('does not apply the variance threshold to service clusters', () => {
    // A service "unit" is whatever the buyer typed, so CV there is noise.
    const g = group({ stddevUnitPriceUsd: null, qty: 0 });
    expect(qualifies(g, 'service', { usd: null, pct: null, confidence: 'none' }, t)).toBe(true);
  });

  it('does not let a savings floor silently exclude every tender', () => {
    expect(
      qualifies(bigTender(), 'tender', { usd: null, pct: null, confidence: 'none' }, PRESETS.strict),
    ).toBe(true);
  });

  it('does not let the supplier floor erase the whole tender type', () => {
    // A tender has one supplier by definition. `high` and `strict` both ask for two, and
    // applying that here would delete the type from every tightened view.
    const none = { usd: null, pct: null, confidence: 'none' as const };
    expect(qualifies(bigTender(), 'tender', none, PRESETS.high)).toBe(true);
    expect(qualifies(bigTender(), 'tender', none, PRESETS.strict)).toBe(true);
  });

  it('still applies the supplier floor to consolidation', () => {
    const g = bigTender();
    expect(qualifies(g, 'consolidation', consolidationSavings(g), PRESETS.high)).toBe(false);
  });

  it('applies the savings floor to consolidation', () => {
    const g = group({ spendUsd: 400_000 });
    const tiny = { usd: 10, pct: 0.1, confidence: 'benchmarked' as const };
    expect(qualifies(g, 'consolidation', tiny, PRESETS.strict)).toBe(false);
  });
});

describe('ranking', () => {
  it('ranks by savings when a figure exists', () => {
    expect(rankScore({ savingsUsd: 5000, spendUsd: 10_000, priceCv: 0.5 })).toBe(5000);
  });

  it('scores an unbenchmarked project on spend and volatility', () => {
    const score = rankScore({ savingsUsd: null, spendUsd: 4_000_000, priceCv: 0.5 });
    expect(score).toBe(200_000);
  });

  it('ranks a large single-source category above a small benchmarked saving', () => {
    const tender = rankScore({ savingsUsd: null, spendUsd: 4_000_000, priceCv: 0.5 });
    const small = rankScore({ savingsUsd: 8_000, spendUsd: 60_000, priceCv: 0.3 });
    expect(tender).toBeGreaterThan(small);
  });

  it('caps the volatility multiplier so one wild group cannot dominate', () => {
    const wild = rankScore({ savingsUsd: null, spendUsd: 100_000, priceCv: 50 });
    const sane = rankScore({ savingsUsd: null, spendUsd: 100_000, priceCv: 1 });
    expect(wild).toBe(sane);
  });
});

describe('rationale', () => {
  const base = {
    country: 'Kuwait',
    purchaseOrders: 47,
    supplierCount: 4,
    spendUsd: 840_000,
    minUnitPriceUsd: 120,
    maxUnitPriceUsd: 310,
    savingsUsd: 84_000,
    firstPurchase: '2025-01-01',
    lastPurchase: '2026-07-01',
    contractPriceUsd: null,
    avgUnitPriceUsd: 200,
    categorySupplierCount: null,
  };

  it('states the evidence for consolidation', () => {
    const s = rationale({ ...base, type: 'consolidation' });
    expect(s).toContain('47 times across 4 suppliers in Kuwait');
    expect(s).toContain('$120–$310');
    expect(s).toContain('$84k');
  });

  it('says plainly that a tender has no benchmark', () => {
    const s = rationale({ ...base, type: 'tender', savingsUsd: null, supplierCount: 1 });
    expect(s).toContain('single supplier');
    expect(s).toMatch(/no benchmark/i);
    expect(s).not.toContain('$84k');
  });

  it('mentions existing category suppliers on a tender when there are some', () => {
    const s = rationale({ ...base, type: 'tender', savingsUsd: null, categorySupplierCount: 12 });
    expect(s).toContain('12 suppliers already serve');
  });

  it('contrasts paid against contracted price for leakage', () => {
    const s = rationale({ ...base, type: 'leakage', contractPriceUsd: 150 });
    expect(s).toContain('$200');
    expect(s).toContain('$150');
  });

  it('frames maverick buying as compliance, not negotiation', () => {
    const s = rationale({ ...base, type: 'maverick' });
    expect(s).toMatch(/compliance/i);
  });

  it('warns that a service cluster is description-grouped', () => {
    const s = rationale({ ...base, type: 'service' });
    expect(s).toMatch(/description/i);
  });

  it('omits the period when dates are missing rather than printing nonsense', () => {
    const s = rationale({ ...base, type: 'consolidation', firstPurchase: null, lastPurchase: null });
    expect(s).not.toContain('over 0 months');
    expect(s).not.toContain('NaN');
  });
});
