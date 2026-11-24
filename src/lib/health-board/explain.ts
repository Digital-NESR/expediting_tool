/*
 * Saying where a number came from and how it was worked out (UX phase 4). Pure, so the server
 * pages and the tests share it. The wording is what readers see on hover.
 */

import type { KpiValue } from './calc';
import { MONTHS, QUARTER_MONTHS, isMonth, type KpiDefinition, type Month } from './definitions';
import { formatWithUnit } from './format';

export function provenanceKey(kpi: string, period: string, country: string): string {
  return `${kpi}|${period}|${country}`;
}

export interface ProvenanceInfo {
  file: string;
  kind: 'initial-load' | 'upload';
  by: string;
  at: string;
  sharepointModified: string | null;
  previous: { value: string | null; changedAt: string } | null;
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dubai',
});
const day = (iso: string) => DAY.format(new Date(iso));

/** One line for a hover: where the value came from, and what it replaced. */
export function describeProvenance(p: ProvenanceInfo, unit: KpiDefinition['unit']): string {
  const parts = [
    p.kind === 'initial-load'
      ? `From the initial load (${p.file}), ${day(p.at)}.`
      : `Uploaded ${day(p.at)} by ${p.by} (${p.file}).`,
  ];
  if (p.sharepointModified) parts.push(`Last edited in SharePoint ${day(p.sharepointModified)}.`);
  if (p.previous) {
    const before =
      p.previous.value === null ? 'blank' : formatWithUnit(unit, Number(p.previous.value));
    parts.push(`Replaced ${before} on ${day(p.previous.changedAt)}.`);
  }
  return parts.join(' ');
}

function span(months: Month[]): string {
  if (!months.length) return '';
  const short = months.map((m) => m.slice(0, 3));
  const first = MONTHS.indexOf(months[0]);
  const last = MONTHS.indexOf(months[months.length - 1]);
  return last - first + 1 === months.length && months.length > 2
    ? `${short[0]}–${short[short.length - 1]}`
    : short.join(', ');
}

/** How a YTD was arrived at, in words, from the same months the calculation used. */
export function explainYtd(
  kpi: KpiDefinition,
  monthly: Partial<Record<Month, number | null>>,
): string {
  const present = MONTHS.filter((m) => monthly[m] != null);
  switch (kpi.ytd) {
    case 'latest':
      return present.length
        ? `YTD is the latest month with a value: ${present[present.length - 1]}.`
        : 'No month has a value yet.';
    case 'sum':
      return present.length
        ? `YTD is the sum of ${present.length} month${present.length === 1 ? '' : 's'} (${span(present)}).`
        : 'No month has a value yet.';
    case 'average':
      return present.length
        ? `YTD is the average of ${present.length} month${present.length === 1 ? '' : 's'} entered (${span(present)}).`
        : 'No month has a value yet.';
    case 'quarterly_average': {
      const q = present.filter((m) => QUARTER_MONTHS.includes(m));
      return q.length
        ? `YTD is the average of ${q.length} quarter${q.length === 1 ? '' : 's'} entered (${span(q)}).`
        : 'No quarter has a value yet.';
    }
    case 'entered':
      return "YTD is Finance's year-to-date figure as uploaded; it is not calculated from the months.";
    case 'none':
      return 'This KPI has no YTD.';
  }
}

/**
 * For each KPI, the last month any country has a value in that year. A blank month at or before
 * it is a gap (not uploaded for this country); a blank month after it simply has not been
 * reached yet.
 */
export function kpiFrontiers(values: readonly KpiValue[], year: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    if (v.year !== year || v.value === null || !isMonth(v.period)) continue;
    const i = MONTHS.indexOf(v.period);
    if (out[v.kpi] === undefined || i > out[v.kpi]) out[v.kpi] = i;
  }
  return out;
}

/** Whether a blank month for this KPI is a gap (true) or simply not reached yet (false). */
export function isGap(kpi: KpiDefinition, month: Month, frontier: number | undefined): boolean {
  if (frontier === undefined) return false;
  if (kpi.frequency === 'quarterly' && !QUARTER_MONTHS.includes(month)) return false;
  return MONTHS.indexOf(month) <= frontier;
}
