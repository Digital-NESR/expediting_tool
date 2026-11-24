/*
 * The overview table, computed from stored values. Pure: no database, no clock, no locale.
 * Every rule here is written down in RULES.md; the tests in __tests__/health-board-calc.test.ts
 * pin each one.
 */

import {
  KPIS,
  MONTHS,
  QUARTER_MONTHS,
  isMonth,
  type Country,
  type Direction,
  type KpiDefinition,
  type Month,
  type Period,
} from './definitions';

/** One stored cell: a KPI's value for one year, period and country. */
export interface KpiValue {
  kpi: string;
  year: number;
  period: Period;
  country: Country;
  value: number | null;
  targetWords: string | null;
  category: string;
}

export type Move = 'up' | 'down' | 'flat';

export interface Trend {
  move: Move;
  /** Whether the move is an improvement; null when it is unchanged. */
  good: boolean | null;
}

export type Status = 'green' | 'amber' | 'red';

export interface OverviewRow {
  kpi: KpiDefinition;
  category: string;
  baseline: number | null;
  target: number | null;
  targetWords: string | null;
  months: Partial<Record<Month, { value: number | null; trend: Trend | null }>>;
  ytd: number | null;
  status: Status | null;
}

export interface OverviewGroup {
  category: string;
  rows: OverviewRow[];
}

export interface Overview {
  year: number;
  country: Country;
  /** January up to the latest month with any data in the year, across every country. */
  months: Month[];
  groups: OverviewGroup[];
}

const byNameDescending = (a: string, b: string) =>
  b.localeCompare(a, 'en', { sensitivity: 'base', numeric: true });

/** Months shown for a year: January to the latest month any overview KPI has a value in. */
export function monthsShown(values: readonly KpiValue[], year: number): Month[] {
  const onOverview = new Set(KPIS.filter((k) => k.overview).map((k) => k.code));
  let last = -1;
  for (const v of values) {
    if (v.year !== year || !onOverview.has(v.kpi) || !isMonth(v.period) || v.value === null)
      continue;
    last = Math.max(last, MONTHS.indexOf(v.period));
  }
  return MONTHS.slice(0, last + 1);
}

/** The previous period a month is compared with, for a monthly or a quarterly KPI. */
export function previousPeriod(kpi: KpiDefinition, month: Month): Period | null {
  if (kpi.frequency === 'quarterly') {
    const q = QUARTER_MONTHS.indexOf(month);
    if (q < 0) return null;
    return q === 0 ? 'Baseline' : QUARTER_MONTHS[q - 1];
  }
  const i = MONTHS.indexOf(month);
  return i <= 0 ? null : MONTHS[i - 1];
}

export function trend(
  direction: Direction,
  current: number | null,
  previous: number | null,
): Trend | null {
  if (current === null || previous === null || direction === 'none') return null;
  if (current === previous) return { move: 'flat', good: null };
  const move: Move = current > previous ? 'up' : 'down';
  return { move, good: (move === 'up') === (direction === 'higher') };
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/**
 * YTD for one KPI, year and country.
 * @param monthly the month values, any order; blanks are skipped
 * @param entered the uploaded YTD row's value, used only by `entered` KPIs
 */
export function ytd(
  kpi: KpiDefinition,
  monthly: Partial<Record<Month, number | null>>,
  entered: number | null,
): number | null {
  const present = MONTHS.filter((m) => monthly[m] != null).map((m) => ({
    month: m,
    value: monthly[m] as number,
  }));
  switch (kpi.ytd) {
    case 'latest':
      return present.length ? present[present.length - 1].value : null;
    case 'sum':
      return present.length ? present.reduce((s, p) => s + p.value, 0) : null;
    case 'entered':
      return entered;
    case 'quarterly_average':
      return mean(present.filter((p) => QUARTER_MONTHS.includes(p.month)).map((p) => p.value));
    case 'average':
      return mean(present.map((p) => p.value));
    case 'none':
      return null;
  }
}

/** Green when the target is met, amber when missed by at most 10 % of the target's size. */
export function status(
  direction: Direction,
  value: number | null,
  target: number | null,
): Status | null {
  if (value === null || target === null || direction === 'none') return null;
  const band = Math.abs(target) * 0.1;
  if (direction === 'higher') {
    if (value >= target) return 'green';
    return value >= target - band ? 'amber' : 'red';
  }
  if (value <= target) return 'green';
  return value <= target + band ? 'amber' : 'red';
}

/** One country's cells for a year, by KPI and period. */
function cellsFor(
  values: readonly KpiValue[],
  year: number,
  country: Country,
): Map<string, Map<Period, KpiValue>> {
  const out = new Map<string, Map<Period, KpiValue>>();
  for (const v of values) {
    if (v.year !== year || v.country !== country) continue;
    const cells = out.get(v.kpi) ?? new Map<Period, KpiValue>();
    cells.set(v.period, v);
    out.set(v.kpi, cells);
  }
  return out;
}

/** The numbers one KPI shows for one country and year. The overview and the detail page both
 *  come from here, so they cannot disagree. */
function summarise(kpi: KpiDefinition, cells: Map<Period, KpiValue>) {
  const val = (p: Period) => cells.get(p)?.value ?? null;
  const monthly: Partial<Record<Month, number | null>> = {};
  for (const m of MONTHS) monthly[m] = val(m);
  const target = val('Target');
  const y = ytd(kpi, monthly, val('YTD'));
  return {
    val,
    monthly,
    baseline: val('Baseline'),
    target,
    targetWords: cells.get('Target')?.targetWords ?? null,
    ytd: y,
    status: status(kpi.direction, y, target),
  };
}

export interface KpiDetail {
  kpi: KpiDefinition;
  year: number;
  country: Country;
  baseline: number | null;
  target: number | null;
  targetWords: string | null;
  ytd: number | null;
  status: Status | null;
  /** The chart: Baseline, then each month with a value, as Power BI's area chart drew it. */
  points: { label: 'Baseline' | Month; value: number }[];
}

/** One KPI's detail page for one year and one country (RULES.md, "Detail pages"). */
export function buildDetail(
  values: readonly KpiValue[],
  year: number,
  country: Country,
  kpi: KpiDefinition,
): KpiDetail {
  const cells = cellsFor(values, year, country).get(kpi.code) ?? new Map<Period, KpiValue>();
  const s = summarise(kpi, cells);
  const points: KpiDetail['points'] = [];
  if (s.baseline !== null) points.push({ label: 'Baseline', value: s.baseline });
  for (const m of MONTHS) {
    const v = s.monthly[m];
    if (v != null) points.push({ label: m, value: v });
  }
  return {
    kpi,
    year,
    country,
    baseline: s.baseline,
    target: s.target,
    targetWords: s.targetWords,
    ytd: s.ytd,
    status: s.status,
    points,
  };
}

/** The overview table for one year and one country. */
export function buildOverview(
  values: readonly KpiValue[],
  year: number,
  country: Country,
): Overview {
  const months = monthsShown(values, year);
  const inYear = values.filter((v) => v.year === year);

  /* Category per KPI for the year, from every country's rows (a KPI is filed under one category
     a year; if an upload ever disagrees, the most common wins and the upload preview says so). */
  const categoryVotes = new Map<string, Map<string, number>>();
  for (const v of inYear) {
    const votes = categoryVotes.get(v.kpi) ?? new Map<string, number>();
    votes.set(v.category, (votes.get(v.category) ?? 0) + 1);
    categoryVotes.set(v.kpi, votes);
  }
  const categoryOf = (code: string) => {
    const votes = categoryVotes.get(code);
    if (!votes) return null;
    return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  const mine = cellsFor(values, year, country);

  const rows: OverviewRow[] = [];
  for (const kpi of KPIS) {
    if (!kpi.overview) continue;
    const cells = mine.get(kpi.code);
    /* As in Power BI, a KPI with no rows at all for this country and year is not listed. */
    if (!cells) continue;
    const category = categoryOf(kpi.code);
    if (!category) continue;

    const s = summarise(kpi, cells);
    const rowMonths: OverviewRow['months'] = {};
    for (const m of months) {
      const prev = previousPeriod(kpi, m);
      rowMonths[m] = {
        value: s.monthly[m] ?? null,
        trend: prev ? trend(kpi.direction, s.monthly[m] ?? null, s.val(prev)) : null,
      };
    }

    rows.push({
      kpi,
      category,
      baseline: s.baseline,
      target: s.target,
      targetWords: s.targetWords,
      months: rowMonths,
      ytd: s.ytd,
      status: s.status,
    });
  }

  const groups = new Map<string, OverviewRow[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  return {
    year,
    country,
    months,
    groups: [...groups.entries()]
      .sort((a, b) => byNameDescending(a[0], b[0]))
      .map(([category, rs]) => ({
        category,
        rows: rs.sort((a, b) => byNameDescending(a.kpi.name, b.kpi.name)),
      })),
  };
}
