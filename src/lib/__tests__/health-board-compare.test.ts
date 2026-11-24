import { describe, expect, it } from 'vitest';
import type { ComparisonRow } from '@/lib/health-board/calc';
import { betterBy, parseSort, sortRows } from '@/lib/health-board/compare';
import { kpiByCode } from '@/lib/health-board/definitions';

const row = (country: string, ytd: number | null, target: number | null): ComparisonRow =>
  ({
    country,
    ytd,
    target,
    baseline: null,
    targetWords: null,
    months: {},
    status: null,
    kpi: null,
  }) as unknown as ComparisonRow;

const otd = kpiByCode('KPI - OTD')!; // higher is better
const dsoh = kpiByCode('KPI - DSOH')!; // lower is better

describe('better by', () => {
  it('is positive on the good side of the target, whatever the direction', () => {
    expect(betterBy(otd, { ytd: 65, target: 60 })).toBe(5);
    expect(betterBy(otd, { ytd: 55, target: 60 })).toBe(-5);
    expect(betterBy(dsoh, { ytd: 100, target: 115 })).toBe(15);
    expect(betterBy(dsoh, { ytd: 130, target: 115 })).toBe(-15);
    expect(betterBy(otd, { ytd: null, target: 60 })).toBeNull();
  });
});

describe('sorting the comparison', () => {
  const rows = [
    row('Global', 57, 60),
    row('Oman', 70, 60),
    row('Egypt', null, 60),
    row('UAE', 40, null),
  ];

  it('keeps the country list order by default and for anything unknown', () => {
    expect(parseSort('nonsense')).toBe('country');
    expect(sortRows(rows, otd, 'country').map((r) => r.country)).toEqual([
      'Global',
      'Oman',
      'Egypt',
      'UAE',
    ]);
  });

  it('YTD best first respects the direction; blanks go last', () => {
    expect(sortRows(rows, otd, 'ytd').map((r) => r.country)).toEqual([
      'Oman',
      'Global',
      'UAE',
      'Egypt',
    ]);
    expect(sortRows(rows, dsoh, 'ytd').map((r) => r.country)).toEqual([
      'UAE',
      'Global',
      'Oman',
      'Egypt',
    ]);
  });

  it('furthest from target first; rows without a target or YTD go last', () => {
    expect(sortRows(rows, otd, 'gap').map((r) => r.country)).toEqual([
      'Global',
      'Oman',
      'Egypt',
      'UAE',
    ]);
  });

  it('does not change the input', () => {
    const copy = [...rows];
    sortRows(rows, otd, 'ytd');
    expect(rows).toEqual(copy);
  });
});
