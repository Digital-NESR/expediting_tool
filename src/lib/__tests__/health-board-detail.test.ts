import { describe, expect, it } from 'vitest';
import { buildDetail, buildOverview, type KpiValue } from '@/lib/health-board/calc';
import { KPIS, kpiByCode } from '@/lib/health-board/definitions';
import { KPI_PAGES, kpiCodeForSlug } from '@/lib/health-board/pages';
import { niceCeil, scaleFor } from '@/lib/health-board/scale';

const v = (
  kpi: string,
  period: KpiValue['period'],
  value: number | null,
  extra: Partial<KpiValue> = {},
): KpiValue => ({
  kpi,
  year: 2026,
  period,
  country: 'Global',
  value,
  targetWords: null,
  category: 'Purchasing',
  ...extra,
});

describe('detail pages', () => {
  it('every KPI with data has a page except Supplier QBR, and slugs are unique', () => {
    const withPage = KPIS.filter((k) => KPI_PAGES[k.code]).map((k) => k.code);
    expect(withPage).toHaveLength(28);
    expect(KPIS.filter((k) => !KPI_PAGES[k.code]).map((k) => k.code)).toEqual(['KPI - QBR']);
    const slugs = Object.values(KPI_PAGES).map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [code, p] of Object.entries(KPI_PAGES)) expect(kpiCodeForSlug(p.slug)).toBe(code);
  });

  it('shows the same baseline, target and YTD as the overview row', () => {
    const values = [
      v('KPI - DSOH', 'Baseline', 147),
      v('KPI - DSOH', 'Target', 115, { targetWords: '<= 115' }),
      v('KPI - DSOH', 'January', 151),
      v('KPI - DSOH', 'July', 133),
    ];
    const row = buildOverview(values, 2026, 'Global').groups[0].rows[0];
    const d = buildDetail(values, 2026, 'Global', kpiByCode('KPI - DSOH')!);
    expect([d.baseline, d.target, d.targetWords, d.ytd, d.status]).toEqual([
      row.baseline,
      row.target,
      row.targetWords,
      row.ytd,
      row.status,
    ]);
  });

  it('charts Baseline then each month with a value, as Power BI did', () => {
    const d = buildDetail(
      [
        v('KPI - InvRecon Acc', 'Baseline', 99.49),
        v('KPI - InvRecon Acc', 'March', 99.81),
        v('KPI - InvRecon Acc', 'June', 99.59),
        v('KPI - InvRecon Acc', 'September', null),
      ],
      2026,
      'Global',
      kpiByCode('KPI - InvRecon Acc')!,
    );
    expect(d.points).toEqual([
      { label: 'Baseline', value: 99.49 },
      { label: 'March', value: 99.81 },
      { label: 'June', value: 99.59 },
    ]);
  });

  it('is empty, not an error, for a country with no rows', () => {
    const d = buildDetail([v('KPI - OTD', 'January', 1)], 2026, 'Oman', kpiByCode('KPI - OTD')!);
    expect(d.points).toEqual([]);
    expect(d.ytd).toBeNull();
  });
});

describe('chart scales', () => {
  it('rounds up to 1, 2, 2.5 or 5 × 10^n', () => {
    expect(niceCeil(57)).toBe(100);
    expect(niceCeil(13)).toBe(20);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(100)).toBe(100);
  });

  it('always includes zero and every value, and never ends at -0', () => {
    expect(scaleFor([57, 60])).toEqual({ lo: 0, hi: 100 });
    expect(scaleFor([-7_767_399, -4_000_000])).toEqual({ lo: -10_000_000, hi: 0 });
    expect(Object.is(scaleFor([5]).lo, -0)).toBe(false);
    expect(scaleFor([0])).toEqual({ lo: 0, hi: 1 });
  });
});

describe('chart gridlines', () => {
  it('steps by round numbers', async () => {
    const { ticksFor } = await import('@/lib/health-board/scale');
    expect(ticksFor(0, 250)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(ticksFor(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(ticksFor(-10_000_000, 0)).toEqual([-10_000_000, -7_500_000, -5_000_000, -2_500_000, 0]);
  });
});
