import { describe, expect, it } from 'vitest';
import type { KpiValue } from '@/lib/health-board/calc';
import { checklist, expectedCells, templateCsv } from '@/lib/health-board/template';
import { parseKpiGrid } from '@/lib/health-board/parse';
import { parseCsv } from '@/lib/spreadsheet-import';

const v = (
  kpi: string,
  year: number,
  period: KpiValue['period'],
  country: KpiValue['country'],
  value: number | null,
): KpiValue => ({
  kpi,
  year,
  period,
  country,
  value,
  targetWords: null,
  category: kpi.includes('InvRecon') ? 'Materials Management' : 'Purchasing',
});

const values: KpiValue[] = [
  v('KPI - OTD', 2026, 'January', 'Global', 57.78),
  v('KPI - OTD', 2026, 'February', 'Global', 61.22),
  v('KPI - OTD', 2025, 'December', 'Oman', 70),
  v('KPI - OTD', 2026, 'Target', 'Egypt', 60), // a target alone does not make Egypt a reporter
  v('KPI - InvRecon Acc', 2026, 'March', 'Kuwait', 99.99),
  v('KPI - Past Due', 2025, 'March', 'Global', 10), // discontinued from 2026
  v('KPI - P&L (M&S)', 2026, 'January', 'Global', 11.33),
];

describe('what is expected for a period', () => {
  it('every reporting country for every KPI still reported, with what is stored', () => {
    const cells = expectedCells(values, 2026, 'February');
    expect(cells.map((c) => `${c.kpi.code}|${c.country}|${c.current}`)).toEqual([
      'KPI - OTD|Global|61.22',
      'KPI - OTD|Oman|null',
      'KPI - P&L (M&S)|Global|null',
    ]);
  });

  it('quarterly KPIs only in quarter-end months; YTD only for P&L', () => {
    expect(
      expectedCells(values, 2026, 'April').some((c) => c.kpi.code === 'KPI - InvRecon Acc'),
    ).toBe(false);
    expect(
      expectedCells(values, 2026, 'June').some((c) => c.kpi.code === 'KPI - InvRecon Acc'),
    ).toBe(true);
    expect(expectedCells(values, 2026, 'YTD').map((c) => c.kpi.code)).toEqual(['KPI - P&L (M&S)']);
  });

  it('never expects a discontinued KPI', () => {
    expect(expectedCells(values, 2026, 'March').some((c) => c.kpi.code === 'KPI - Past Due')).toBe(
      false,
    );
  });
});

describe('the prefilled template', () => {
  it('parses back as an upload: filled lines are rows, blank lines are ignored', () => {
    const csv = templateCsv(expectedCells(values, 2026, 'February'), 2026, 'February');
    const r = parseKpiGrid(parseCsv(csv));
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => `${x.kpi}|${x.country}|${x.valueText}`)).toEqual([
      'KPI - OTD|Global|61.22',
    ]);
    expect(r.blank).toHaveLength(2);
  });
});

describe('the checklist', () => {
  it('counts what has arrived per country and names what is missing', () => {
    expect(checklist(expectedCells(values, 2026, 'February'))).toEqual([
      { country: 'Global', expected: 2, received: 1, missing: ['Profit & Loss (MS)'] },
      { country: 'Oman', expected: 1, received: 0, missing: ['On-Time Delivery (OTD)'] },
    ]);
  });
});
