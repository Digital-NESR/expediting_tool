import { describe, expect, it } from 'vitest';
import {
  analysisRows,
  asDate,
  lineColumns,
  priceByMonth,
  projectFilename,
  round2,
  supplierSpread,
} from '@/lib/sourcing/export';
import type { EvidenceLine, SourcingProject } from '@/lib/sourcing/types';

function line(o: Partial<EvidenceLine> = {}): EvidenceLine {
  return {
    purchaseDoc: '4500123456',
    item: '10',
    releaseDate: '2026-03-15',
    deliveryDate: '2026-04-20',
    supplierNum: 'A',
    supplierName: 'Cheap Co',
    description: 'CALCIUM CHLORIDE 97%',
    qty: 10,
    orderUnit: 'TON',
    unitPriceUsd: 100,
    lineValueUsd: 1000,
    currency: 'USD',
    nativeValue: 1000,
    plant: 'Kuwait Base',
    buyer: 'A Buyer',
    docType: 'DRIS',
    infoRecord: null,
    incoterms: 'DDP',
    ...o,
  };
}

function project(o: Partial<SourcingProject> = {}): SourcingProject {
  return {
    id: 'consolidation:Kuwait:X',
    type: 'consolidation',
    country: 'Kuwait',
    material: '000001100000031272',
    groupKey: '000001100000031272',
    title: 'CALCIUM CHLORIDE 97%',
    materialGroup: 'Chemicals',
    materialType: 'Products',
    owner: 'Cementing',
    purchaseOrders: 56,
    lines: 70,
    spendUsd: 2_500_000,
    qty: 10_000,
    orderUnit: 'TON',
    firstPurchase: '2025-01-05',
    lastPurchase: '2026-10-30',
    suppliers: [],
    supplierCount: 11,
    avgUnitPriceUsd: 250,
    minUnitPriceUsd: 217,
    maxUnitPriceUsd: 647,
    priceCv: 0.31,
    savingsUsd: 605_000,
    savingsPct: 24.2,
    savingsConfidence: 'benchmarked',
    infoRecord: null,
    contractPriceUsd: null,
    contractExpired: false,
    categorySupplierCount: 65,
    rationale: 'Bought 56 times across 11 suppliers in Kuwait.',
    ...o,
  };
}

describe('cell helpers', () => {
  it('turns an ISO string into a real Date so Excel sorts it as one', () => {
    expect(asDate('2026-03-15')).toBeInstanceOf(Date);
  });

  it('returns null for missing or unparseable dates rather than Invalid Date', () => {
    expect(asDate(null)).toBeNull();
    expect(asDate('')).toBeNull();
    expect(asDate('not a date')).toBeNull();
  });

  it('rounds money to the cent so a pivot total has no float tail', () => {
    expect(round2(118409052.1800001)).toBe(118409052.18);
  });
});

describe('priceByMonth', () => {
  it('weights the average by quantity, not by line', () => {
    // 100 units at $10 and 1 unit at $90 is $10.79 of money actually spent, not $50.
    const rows = priceByMonth([
      line({ qty: 100, lineValueUsd: 1000, unitPriceUsd: 10 }),
      line({ qty: 1, lineValueUsd: 90, unitPriceUsd: 90 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].avgUnitPriceUsd).toBeCloseTo(10.79, 2);
  });

  it('still reports the true min and max alongside the weighted average', () => {
    const rows = priceByMonth([
      line({ qty: 100, lineValueUsd: 1000, unitPriceUsd: 10 }),
      line({ qty: 1, lineValueUsd: 90, unitPriceUsd: 90 }),
    ]);
    expect(rows[0].minUnitPriceUsd).toBe(10);
    expect(rows[0].maxUnitPriceUsd).toBe(90);
  });

  it('buckets by month and returns them in order', () => {
    const rows = priceByMonth([
      line({ releaseDate: '2026-05-02' }),
      line({ releaseDate: '2026-03-15' }),
      line({ releaseDate: '2026-03-28' }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-03', '2026-05']);
    expect(rows[0].lines).toBe(2);
  });

  it('skips lines with no release date rather than bucketing them wrongly', () => {
    expect(priceByMonth([line({ releaseDate: null })])).toHaveLength(0);
  });

  it('does not divide by zero on a zero-quantity line', () => {
    const rows = priceByMonth([line({ qty: 0, lineValueUsd: 0, unitPriceUsd: null })]);
    expect(rows[0].avgUnitPriceUsd).toBeNull();
  });
});

describe('supplierSpread', () => {
  const lines = [
    line({ supplierNum: 'A', supplierName: 'Cheap Co', qty: 100, lineValueUsd: 1000, unitPriceUsd: 10, releaseDate: '2026-01-10' }),
    line({ supplierNum: 'A', supplierName: 'Cheap Co', qty: 100, lineValueUsd: 1200, unitPriceUsd: 12, releaseDate: '2026-06-10' }),
    line({ supplierNum: 'B', supplierName: 'Dear Co', qty: 50, lineValueUsd: 1500, unitPriceUsd: 30, releaseDate: '2026-03-01' }),
  ];

  it('groups by supplier and sorts cheapest first', () => {
    const rows = supplierSpread(lines);
    expect(rows.map((r) => r.supplierNum)).toEqual(['A', 'B']);
  });

  it('weights each supplier average by quantity', () => {
    const [a] = supplierSpread(lines);
    expect(a.avgUnitPriceUsd).toBe(11); // 2200 / 200
  });

  it('expresses every supplier as a multiple of the cheapest', () => {
    const [a, b] = supplierSpread(lines);
    expect(a.vsCheapest).toBe(1);
    expect(b.vsCheapest).toBeCloseTo(2.73, 2); // 30 / 11
  });

  it('reports each supplier’s own first and last purchase', () => {
    const [a] = supplierSpread(lines);
    expect(a.firstPurchase).toBe('2026-01-10');
    expect(a.lastPurchase).toBe('2026-06-10');
  });

  it('survives a supplier whose lines carry no usable price', () => {
    const rows = supplierSpread([line({ supplierNum: 'C', qty: 0, lineValueUsd: 0, unitPriceUsd: null })]);
    expect(rows[0].avgUnitPriceUsd).toBeNull();
    expect(rows[0].vsCheapest).toBeNull();
  });
});

describe('analysisRows', () => {
  const evidence = { lines: [line(), line()], truncated: false };

  it('carries the rationale onto the sheet', () => {
    const rows = analysisRows(project(), evidence);
    expect(rows.find(([k]) => k === 'Why this is a sourcing project')?.[1]).toContain('Bought 56 times');
  });

  it('states the savings basis so the number can be argued with', () => {
    const basis = analysisRows(project(), evidence).find(([k]) => k === 'Savings basis')?.[1];
    expect(String(basis)).toContain("cheapest supplier's spend-weighted average");
    expect(String(basis)).toContain('Not the lowest single price');
  });

  it('explains the absence of a figure for a tender instead of writing zero', () => {
    const rows = analysisRows(project({ type: 'tender', savingsUsd: null, savingsPct: null }), evidence);
    const labels = rows.map(([k]) => k);
    expect(labels).toContain('Why no figure');
    expect(labels).not.toContain('Estimated saving (USD)');
    expect(rows.find(([k]) => k === 'Estimated saving')?.[1]).toContain('No benchmark');
  });

  it('switches the basis wording for contract leakage', () => {
    const rows = analysisRows(project({ type: 'leakage', contractPriceUsd: 200 }), evidence);
    expect(String(rows.find(([k]) => k === 'Savings basis')?.[1])).toContain('info-record rate');
  });

  it('qualifies an indicative figure', () => {
    const rows = analysisRows(project({ savingsConfidence: 'indicative' }), evidence);
    expect(rows.map(([k]) => k)).toContain('Why indicative');
  });

  it('writes the saving percentage as an Excel fraction, not a number out of 100', () => {
    const rows = analysisRows(project(), evidence);
    expect(rows.find(([k]) => k === 'Saving as % of spend')?.[1]).toBeCloseTo(0.242, 3);
  });

  it('says so when the line list was capped, rather than implying it is whole', () => {
    const rows = analysisRows(project(), { lines: [line()], truncated: true });
    expect(String(rows.find(([k]) => k === 'NOTE')?.[1])).toContain('capped');
  });

  it('flags an expired contract', () => {
    const rows = analysisRows(project({ contractPriceUsd: 200, contractExpired: true }), evidence);
    expect(rows.find(([k]) => k === 'Contract status')?.[1]).toBe('EXPIRED');
  });

  it('explains a missing material number for a service cluster', () => {
    const rows = analysisRows(project({ type: 'service', material: null }), evidence);
    expect(String(rows.find(([k]) => k === 'SAP material')?.[1])).toContain('grouped by description');
  });
});

describe('columns', () => {
  it('writes dates as Dates and money as numbers, never strings', () => {
    const cols = lineColumns();
    const row = line();
    const released = cols.find((c) => c.name === 'PO released')!.of(row);
    const value = cols.find((c) => c.name === 'Line value USD')!.of(row);
    expect(released).toBeInstanceOf(Date);
    expect(typeof value).toBe('number');
  });

  it('leaves a missing unit price empty rather than writing zero', () => {
    const cell = lineColumns().find((c) => c.name === 'Unit price USD')!.of(line({ unitPriceUsd: null }));
    expect(cell).toBeNull();
  });
});

describe('projectFilename', () => {
  it('names the country and item so several downloads stay distinguishable', () => {
    const name = projectFilename(project(), new Date('2026-11-18T00:00:00Z'));
    expect(name).toBe('Sourcing_Kuwait_CALCIUM-CHLORIDE-97_2026-11-18.xlsx');
  });

  it('strips characters a filesystem would reject', () => {
    const name = projectFilename(project({ title: '2-3/4" OTL *TUNGSTEN*' }), new Date('2026-11-18T00:00:00Z'));
    expect(name).not.toMatch(/[/*"]/);
    expect(name.endsWith('.xlsx')).toBe(true);
  });

  it('falls back rather than producing a nameless file', () => {
    const name = projectFilename(project({ title: '///' }), new Date('2026-11-18T00:00:00Z'));
    expect(name).toContain('project');
  });
});
