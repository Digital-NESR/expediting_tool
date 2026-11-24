import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildComparison,
  buildDetail,
  buildOverview,
  type KpiValue,
} from '@/lib/health-board/calc';
import { kpiByCode } from '@/lib/health-board/definitions';
import { comparisonWorkbook, detailWorkbook, overviewWorkbook } from '@/lib/health-board/export';

const v = (
  kpi: string,
  period: KpiValue['period'],
  value: number,
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

const values: KpiValue[] = [
  v('KPI - OTD', 'Baseline', 57.9647717),
  v('KPI - OTD', 'Target', 60, { targetWords: '>= 60' }),
  v('KPI - OTD', 'January', 57.78231227),
  v('KPI - OTD', 'February', 61.22010088),
  v('KPI - OTD', 'January', 40.5, { country: 'Oman' }),
];

async function read(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

/** Every number in a sheet, as written. */
function numbers(ws: ExcelJS.Worksheet): number[] {
  const out: number[] = [];
  ws.eachRow((row) => row.eachCell((c) => typeof c.value === 'number' && out.push(c.value)));
  return out;
}

describe('the Excel export', () => {
  it('overview: the exact values, unrounded, with the board’s decimals as the format', async () => {
    const wb = await read(await overviewWorkbook(buildOverview(values, 2026, 'Global')));
    const ws = wb.worksheets[0];
    const nums = numbers(ws);
    expect(nums).toContain(57.9647717);
    expect(nums).toContain(57.78231227);
    expect(nums).toContain((57.78231227 + 61.22010088) / 2);
    let fmt = '';
    ws.eachRow((row) => row.eachCell((c) => c.value === 57.78231227 && (fmt = c.numFmt)));
    expect(fmt).toBe('0.00');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Global 2026', 'How it is calculated']);
  });

  it('comparison: one row per country, with the better/worse gap', async () => {
    const c = buildComparison(values, 2026, kpiByCode('KPI - OTD')!);
    const ws = (await read(await comparisonWorkbook(c))).worksheets[0];
    const countries: string[] = [];
    ws.eachRow((row) => {
      const first = row.getCell(1).value;
      if (first === 'Global' || first === 'Oman') countries.push(first);
    });
    expect(countries).toEqual(['Global', 'Oman']);
    expect(numbers(ws)).toContain((57.78231227 + 61.22010088) / 2 - 60);
  });

  it('KPI page: this year and last year by month', async () => {
    const d = buildDetail(values, 2026, 'Global', kpiByCode('KPI - OTD')!);
    const ws = (await read(await detailWorkbook(d, null))).worksheets[0];
    expect(numbers(ws)).toEqual(expect.arrayContaining([2026, 57.78231227, 61.22010088]));
  });
});
