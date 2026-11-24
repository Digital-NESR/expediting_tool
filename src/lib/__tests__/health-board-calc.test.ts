import { describe, expect, it } from 'vitest';
import {
  buildOverview,
  monthsShown,
  previousPeriod,
  status,
  trend,
  ytd,
  type KpiValue,
} from '@/lib/health-board/calc';
import { KPIS, kpiByCode, type KpiDefinition } from '@/lib/health-board/definitions';

/**
 * The Health Board's numbers. Each block pins one rule from src/lib/health-board/RULES.md, and
 * the "fix" tests pin a place where the native board deliberately differs from Power BI.
 */

const kpi = (code: string): KpiDefinition => {
  const k = kpiByCode(code);
  if (!k) throw new Error(`no KPI ${code}`);
  return k;
};

const v = (
  code: string,
  period: KpiValue['period'],
  value: number | null,
  extra: Partial<KpiValue> = {},
): KpiValue => ({
  kpi: code,
  year: 2026,
  period,
  country: 'Global',
  value,
  targetWords: null,
  category: 'Purchasing',
  ...extra,
});

describe('KPI definitions', () => {
  it('has the 29 KPIs of the source list, 25 of them on the overview', () => {
    expect(KPIS).toHaveLength(29);
    expect(KPIS.filter((k) => k.overview)).toHaveLength(25);
    expect(
      KPIS.filter((k) => !k.overview)
        .map((k) => k.code)
        .sort(),
    ).toEqual([
      'KPI - FMT - ICPO Transfer out',
      'KPI - Past Due',
      'KPI - Past Due > 30 Days',
      'KPI - QBR',
    ]);
  });

  it('uses the agreed YTD method for each KPI', () => {
    const by = (m: string) =>
      KPIS.filter((k) => k.ytd === m)
        .map((k) => k.code)
        .sort();
    expect(by('latest')).toEqual([
      'KPI - DSOH',
      'KPI - Inventory Reduction',
      'KPI - Slow Moving',
      'KPI - Supplier No.',
    ]);
    expect(by('sum')).toEqual(['KPI - FMT - ICPO Transfer out']);
    expect(by('entered')).toEqual([
      'KPI - P&L (M&S)',
      'KPI - P&L (O&C)',
      'KPI - P&L (O&R)',
      'KPI - P&L (PC/PR)',
      'KPI - P&L (T&E)',
      'KPI - P&L (T&M)',
    ]);
    expect(by('quarterly_average')).toEqual([
      'KPI - InvRecon Acc',
      'KPI - InvRecon Aging',
      'KPI - SOA Consolidation',
      'KPI - SourceGuide Coverage',
    ]);
    expect(by('none')).toEqual(['KPI - QBR']);
    expect(by('average')).toHaveLength(13);
  });

  it('gives every overview KPI a direction (fix 7: Power BI left four without one)', () => {
    for (const k of KPIS.filter((x) => x.overview)) expect(k.direction).not.toBe('none');
  });
});

describe('YTD', () => {
  it('latest: the last month with a value, not a month typed into a formula (fix 3)', () => {
    expect(ytd(kpi('KPI - DSOH'), { January: 151, May: 144, July: 133 }, null)).toBe(133);
    expect(ytd(kpi('KPI - DSOH'), { January: 151, July: null }, null)).toBe(151);
    expect(ytd(kpi('KPI - DSOH'), {}, null)).toBeNull();
  });

  it('sum: adds the months', () => {
    expect(ytd(kpi('KPI - FMT - ICPO Transfer out'), { January: -100, February: -50 }, null)).toBe(
      -150,
    );
  });

  it('entered: only the uploaded YTD row, never a fallback average (fix 5)', () => {
    expect(ytd(kpi('KPI - P&L (M&S)'), { January: 11, February: 12 }, 12.89162)).toBe(12.89162);
    expect(ytd(kpi('KPI - P&L (M&S)'), { January: 11, February: 12 }, null)).toBeNull();
  });

  it('quarterly average: the quarter-end values only', () => {
    expect(ytd(kpi('KPI - InvRecon Acc'), { March: 99.81, June: 99.59 }, null)).toBeCloseTo(
      99.7,
      10,
    );
    expect(ytd(kpi('KPI - InvRecon Acc'), { March: 99, April: 1 }, null)).toBe(99);
  });

  it('average: every month entered, blanks skipped (fix 4: not just Jan–Jul)', () => {
    expect(ytd(kpi('KPI - OTD'), { January: 50, February: null, August: 70 }, null)).toBe(60);
  });

  it('none: QBR has no YTD', () => {
    expect(ytd(kpi('KPI - QBR'), { January: 5 }, 5)).toBeNull();
  });
});

describe('YTD status dot', () => {
  it('higher is better: green at or above, amber within 10 %, red below', () => {
    expect(status('higher', 60, 60)).toBe('green');
    expect(status('higher', 54, 60)).toBe('amber');
    expect(status('higher', 53.99, 60)).toBe('red');
  });

  it('lower is better: green at or below, amber within 10 %, red above', () => {
    expect(status('lower', 5, 5)).toBe('green');
    expect(status('lower', 5.5, 5)).toBe('amber');
    expect(status('lower', 5.51, 5)).toBe('red');
  });

  it('negative targets still get an amber band (fix 6)', () => {
    expect(status('lower', -3_700_000, -4_000_000)).toBe('amber');
    expect(status('lower', -3_500_000, -4_000_000)).toBe('red');
    expect(status('lower', -4_100_000, -4_000_000)).toBe('green');
  });

  it('nothing without a value, a target or a direction', () => {
    expect(status('lower', null, 5)).toBeNull();
    expect(status('lower', 5, null)).toBeNull();
    expect(status('none', 5, 5)).toBeNull();
  });
});

describe('trend arrows', () => {
  it('marks the move good or bad by the KPI direction', () => {
    expect(trend('higher', 61, 57)).toEqual({ move: 'up', good: true });
    expect(trend('lower', 61, 57)).toEqual({ move: 'up', good: false });
    expect(trend('lower', 5, 6)).toEqual({ move: 'down', good: true });
    expect(trend('higher', 5, 5)).toEqual({ move: 'flat', good: null });
  });

  it('no arrow without both values (fix 7: Power BI treated a blank as zero)', () => {
    expect(trend('higher', 61, null)).toBeNull();
    expect(trend('higher', null, 61)).toBeNull();
  });

  it('compares a month with the month before, and a quarter with the quarter before', () => {
    expect(previousPeriod(kpi('KPI - OTD'), 'January')).toBeNull();
    expect(previousPeriod(kpi('KPI - OTD'), 'July')).toBe('June');
    expect(previousPeriod(kpi('KPI - InvRecon Acc'), 'March')).toBe('Baseline');
    expect(previousPeriod(kpi('KPI - InvRecon Acc'), 'June')).toBe('March');
    expect(previousPeriod(kpi('KPI - InvRecon Acc'), 'May')).toBeNull();
  });

  it('July uses the same rule as every other month (fix 2)', () => {
    const o = buildOverview(
      [v('KPI - DSOH', 'June', 130), v('KPI - DSOH', 'July', 120)],
      2026,
      'Global',
    );
    expect(o.groups[0].rows[0].months.July?.trend).toEqual({ move: 'down', good: true });
  });
});

describe('the overview table', () => {
  it('shows months up to the latest with any data, across all countries', () => {
    const values = [
      v('KPI - OTD', 'January', 1),
      v('KPI - OTD', 'August', 1, { country: 'Oman' }),
      v('KPI - OTD', 'December', 1, { year: 2025 }),
      v('KPI - QBR', 'October', 1), // not on the overview, so it does not extend the columns
    ];
    expect(monthsShown(values, 2026)).toHaveLength(8);
  });

  it('shows only the selected country, one row per KPI, no adding of duplicates (fix 1)', () => {
    const o = buildOverview(
      [
        v('KPI - OTD', 'January', 57.78),
        v('KPI - OTD', 'Target', 60, { targetWords: '>= 60' }),
        v('KPI - OTD', 'January', 99, { country: 'Oman' }),
      ],
      2026,
      'Global',
    );
    const row = o.groups[0].rows[0];
    expect(row.months.January?.value).toBe(57.78);
    expect(row.target).toBe(60);
    expect(row.targetWords).toBe('>= 60');
    expect(row.ytd).toBe(57.78);
    expect(row.status).toBe('amber');
  });

  it('lists a KPI only when the country has rows for it that year', () => {
    const o = buildOverview([v('KPI - OTD', 'January', 1, { country: 'Oman' })], 2026, 'Global');
    expect(o.groups).toHaveLength(0);
  });

  it('sorts categories and KPI names Z→A, as Power BI did', () => {
    const o = buildOverview(
      [
        v('KPI - OTD', 'January', 1, { category: 'Purchasing' }),
        v('KPI - PO Approval', 'January', 1, { category: 'Purchasing' }),
        v('KPI - DSOH', 'January', 1, { category: 'Materials Management' }),
        v('KPI - PIR Coverage', 'January', 1, { category: 'Sourcing & Supplier Management' }),
        v('KPI - Cycle Time for FAT approvals', 'January', 1, { category: 'Logistics' }),
      ],
      2026,
      'Global',
    );
    expect(o.groups.map((g) => g.category)).toEqual([
      'Sourcing & Supplier Management',
      'Purchasing',
      'Materials Management',
      'Logistics',
    ]);
    expect(o.groups[1].rows.map((r) => r.kpi.name)).toEqual([
      'PO Approval Days',
      'On-Time Delivery (OTD)',
    ]);
  });

  it('keeps the two EOS entities apart (fix 8)', () => {
    const values = [
      v('KPI - PO Approval', 'April', 0, { country: 'EOS DMCC' }),
      v('KPI - PO Approval', 'April', 0.77, { country: 'EOS JAFZA' }),
    ];
    expect(buildOverview(values, 2026, 'EOS DMCC').groups[0].rows[0].months.April?.value).toBe(0);
    expect(buildOverview(values, 2026, 'EOS JAFZA').groups[0].rows[0].months.April?.value).toBe(
      0.77,
    );
    expect(buildOverview(values, 2026, 'EOS').groups).toHaveLength(0);
  });
});
