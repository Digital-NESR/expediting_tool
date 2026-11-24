/*
 * What the admin is expected to upload for a period, and how much of it has arrived (UX phase 5).
 * Pure: the server action loads the values and the admin panel shows the result.
 *
 * "Expected" is: every KPI still reported that year (not discontinued; quarterly KPIs only in
 * quarter-end months; YTD rows only for the P&L KPIs), for every country that has ever reported
 * that KPI with a value. A country that has never reported a KPI is not expected to start.
 */

import { categoriesFor, type KpiValue } from './calc';
import {
  COUNTRIES,
  KPIS,
  QUARTER_MONTHS,
  activeIn,
  isMonth,
  type Country,
  type KpiDefinition,
  type Period,
} from './definitions';
import { UPLOAD_COLUMNS } from './parse';

export interface ExpectedCell {
  kpi: KpiDefinition;
  country: Country;
  category: string;
  /** What is stored already, if anything. */
  current: number | null;
  targetWords: string | null;
}

function kpiExpectedIn(kpi: KpiDefinition, year: number, period: Period): boolean {
  if (!activeIn(kpi, year)) return false;
  if (period === 'YTD') return kpi.ytd === 'entered';
  if (isMonth(period) && kpi.frequency === 'quarterly') return QUARTER_MONTHS.includes(period);
  return true;
}

/** Every KPI × country expected for a year and period, in KPI then country-list order. */
export function expectedCells(
  values: readonly KpiValue[],
  year: number,
  period: Period,
): ExpectedCell[] {
  const reporters = new Map<string, Set<string>>();
  for (const v of values) {
    if (v.value === null || v.period === 'Target') continue;
    const set = reporters.get(v.kpi) ?? new Set<string>();
    set.add(v.country);
    reporters.set(v.kpi, set);
  }
  const catThis = categoriesFor(values, year);
  const catLast = categoriesFor(values, year - 1);
  const stored = new Map<string, KpiValue>();
  for (const v of values) if (v.year === year) stored.set(`${v.kpi}|${v.period}|${v.country}`, v);

  const out: ExpectedCell[] = [];
  for (const kpi of KPIS) {
    if (!kpiExpectedIn(kpi, year, period)) continue;
    const who = reporters.get(kpi.code);
    if (!who) continue;
    const category = catThis.get(kpi.code) ?? catLast.get(kpi.code);
    if (!category) continue;
    for (const country of COUNTRIES) {
      if (!who.has(country)) continue;
      const s = stored.get(`${kpi.code}|${period}|${country}`);
      out.push({
        kpi,
        country,
        category,
        current: s?.value ?? null,
        targetWords: s?.targetWords ?? null,
      });
    }
  }
  return out;
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * The upload file for a period, prefilled: one line per expected cell, with the stored value
 * where there is one. Lines left blank are ignored on upload, so the admin fills in what they
 * have and sends the file back as it is.
 */
export function templateCsv(cells: readonly ExpectedCell[], year: number, period: Period): string {
  const lines = [UPLOAD_COLUMNS.join(',')];
  for (const c of cells) {
    lines.push(
      [
        c.country,
        c.current === null ? '' : String(c.current),
        period,
        String(year),
        c.kpi.code,
        c.category,
        c.kpi.unit,
        c.targetWords ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export interface ChecklistRow {
  country: Country;
  expected: number;
  received: number;
  /** KPI names still missing for this country. */
  missing: string[];
}

/** Per country: how many of the expected KPIs have a value for the period. */
export function checklist(cells: readonly ExpectedCell[]): ChecklistRow[] {
  const by = new Map<Country, ChecklistRow>();
  for (const c of cells) {
    const row = by.get(c.country) ?? { country: c.country, expected: 0, received: 0, missing: [] };
    row.expected++;
    if (c.current !== null) row.received++;
    else row.missing.push(c.kpi.name);
    by.set(c.country, row);
  }
  return COUNTRIES.filter((c) => by.has(c)).map((c) => by.get(c)!);
}
