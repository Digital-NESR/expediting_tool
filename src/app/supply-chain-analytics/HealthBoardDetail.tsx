/* One KPI's page (UX phase 2).

   Top to bottom: the KPI's title, description and source; the country picker; Baseline, Target
   and YTD with the status in words; a bar placing YTD against target and baseline; the monthly
   chart with last year behind this year and the target and baseline as reference lines; then a
   small chart for every country, each linking to that country's page.

   Every number comes from buildDetail(), which shares its arithmetic with the overview (RULES.md),
   so a KPI cannot show one YTD here and another there. */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { KpiDetail, Status } from '@/lib/health-board/calc';
import {
  COUNTRIES,
  activeIn,
  type Country,
  type KpiDefinition,
} from '@/lib/health-board/definitions';
import { formatKpiValue, formatWithUnit } from '@/lib/health-board/format';
import type { KpiPage } from '@/lib/health-board/pages';
import { scaleFor } from '@/lib/health-board/scale';
import CountryPicker from './CountryPicker';
import KpiChart, { type Series } from './KpiChart';
import { StatusDot, YearNav } from './HealthBoardOverview';
import {
  describeProvenance,
  explainYtd,
  provenanceKey,
  type ProvenanceInfo,
} from '@/lib/health-board/explain';
import type { Month } from '@/lib/health-board/definitions';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const STATUS: Record<Status, { fill: string; label: string }> = {
  green: { fill: '#2e9e5b', label: 'Meets target' },
  amber: { fill: '#e3a008', label: 'Within 10% of target' },
  red: { fill: '#d64545', label: 'Misses target by more than 10%' },
};

/** The detail's months as twelve values, January to December. */
function seriesOf(d: KpiDetail): Series {
  const values: (number | null)[] = Array(12).fill(null);
  for (const p of d.points) {
    const i = MONTHS.indexOf(p.label);
    if (i >= 0) values[i] = p.value;
  }
  return { year: d.year, values };
}

/** The detail's months as the calc's month record, for explaining the YTD. */
function seriesMonths(d: KpiDetail): Partial<Record<Month, number | null>> {
  const out: Partial<Record<Month, number | null>> = {};
  for (const p of d.points) if (p.label !== 'Baseline') out[p.label] = p.value;
  return out;
}

/** "2.99 pts" for percentages, otherwise the value with its unit. */
function gap(unit: KpiDefinition['unit'], v: number): string {
  return unit === '%' ? `${formatKpiValue('%', v)} pts` : formatWithUnit(unit, v);
}

function Stat({
  label,
  children,
  note,
  source,
}: {
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
  /** Where the value came from, shown on hover (UX phase 4). */
  source?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <div
        title={source}
        className={`mt-1 text-2xl font-semibold text-slate-900 ${source ? 'cursor-help' : ''}`}
      >
        {children}
      </div>
      {note && <div className="mt-0.5 text-[12px] text-slate-500">{note}</div>}
    </div>
  );
}

/** YTD as a bar from zero, with the target and the baseline as ticks on the same scale. */
function AgainstTarget({ detail }: { detail: KpiDetail }) {
  const { ytd, target, baseline, kpi, status } = detail;
  if (ytd === null) {
    return (
      <div className="flex items-center rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-400">
        No YTD to compare with the target.
      </div>
    );
  }
  const { lo, hi } = scaleFor([
    ytd,
    ...(target === null ? [] : [target]),
    ...(baseline === null ? [] : [baseline]),
  ]);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = pos(0);
  const fill = status ? STATUS[status].fill : '#307c4c';
  const diff = target === null ? null : ytd - target;
  const better =
    diff === null || diff === 0 ? null : kpi.direction === 'higher' ? diff > 0 : diff < 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[12px] font-medium text-slate-500">YTD against target</p>
      <div className="relative mt-4 h-3 rounded-full bg-slate-100" aria-hidden="true">
        <div
          className="absolute top-0 h-3 rounded-full"
          style={{
            left: `${Math.min(zero, pos(ytd))}%`,
            width: `${Math.abs(pos(ytd) - zero)}%`,
            background: fill,
          }}
        />
        {baseline !== null && (
          <div
            className="absolute -top-1 h-5 w-0.5 bg-slate-400"
            style={{ left: `${pos(baseline)}%` }}
          />
        )}
        {target !== null && (
          <div
            className="absolute -top-1.5 h-6 w-1 rounded bg-slate-900"
            style={{ left: `calc(${pos(target)}% - 2px)` }}
          />
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-slate-600">
        {diff === null
          ? 'No target set.'
          : diff === 0
            ? 'Exactly on target.'
            : `${gap(kpi.unit, Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} target — ${better ? 'better' : 'worse'} than target.`}
      </p>
      <p className="text-[11px] text-slate-400">
        Bar: YTD · black tick: target{baseline !== null ? ' · grey tick: baseline' : ''}
      </p>
    </div>
  );
}

/** A country's year in one small line, its own scale. */
function Spark({ values }: { values: (number | null)[] }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length === 0) return <div className="h-10" />;
  const last = pts[pts.length - 1].i;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const W = 160;
  const H = 40;
  const x = (i: number) => (last === 0 ? W / 2 : 4 + (i * (W - 8)) / Math.max(last, 1));
  const y = (v: number) => (max === min ? H / 2 : 4 + ((max - v) * (H - 8)) / (max - min));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'} ${x(p.i)} ${y(p.v)}`).join(' ');
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="#307c4c"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(end.i)} cy={y(end.v)} r={3.5} fill="#307c4c" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

export default function HealthBoardDetail({
  detail,
  previous,
  countries,
  page,
  years,
  hrefFor,
  overviewHref,
  compareHref,
  provenance,
}: {
  /** Where this country's values came from, for the hovers (UX phase 4). */
  provenance: Record<string, ProvenanceInfo>;
  detail: KpiDetail;
  /** The same KPI and country the year before, for the chart; null when there is no such year. */
  previous: KpiDetail | null;
  /** This KPI for every country this year, for the small multiples. */
  countries: KpiDetail[];
  page: KpiPage;
  years: number[];
  /** This KPI's page for another year or country. */
  hrefFor: (year: number, country: Country) => string;
  overviewHref: string;
  /** This KPI across every country. */
  compareHref: string;
}) {
  const { year, country, kpi } = detail;
  const others = countries.filter((d) => d.points.length > 0 || d.ytd !== null);
  const src = (period: string) => {
    const p = provenance[provenanceKey(kpi.code, period, country)];
    return p ? describeProvenance(p, kpi.unit) : undefined;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#307c4c] px-5 py-3 text-white">
        <div className="min-w-0">
          <Link
            href={overviewHref}
            className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-white/75 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Health Board overview
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{page.title}</h1>
          {!activeIn(kpi, year) && (
            <p className="mt-1 inline-block rounded bg-white/15 px-2 py-0.5 text-[12px] font-medium">
              Discontinued from {kpi.discontinuedFrom}: no longer reported. Earlier years remain.
            </p>
          )}
          <p className="text-sm text-white/85">{page.description}</p>
          {page.note && <p className="text-[13px] text-white/70">{page.note}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Link
              href={compareHref}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            >
              Compare countries
            </Link>
            <YearNav years={years} year={year} href={(y) => hrefFor(y, country)} />
          </div>
          <p className="text-right text-[12px] text-white/75">
            Data Source: {page.source}
            {page.sourceNote && <span className="block">{page.sourceNote}</span>}
          </p>
        </div>
      </div>

      <CountryPicker
        current={country}
        links={COUNTRIES.map((c) => ({ country: c, href: hrefFor(year, c) }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`Baseline ${year - 1}`}
          source={detail.baseline === null ? undefined : src('Baseline')}
        >
          {detail.baseline === null ? '–' : formatWithUnit(kpi.unit, detail.baseline)}
        </Stat>
        <Stat
          label="Target"
          note={kpi.direction === 'higher' ? 'Higher is better' : 'Lower is better'}
          source={detail.targetWords ? src('Target') : undefined}
        >
          {detail.targetWords ?? '–'}
        </Stat>
        <Stat
          label={`YTD ${year}`}
          source={kpi.ytd === 'entered' ? src('YTD') : undefined}
          note={
            <>
              {detail.status ? (
                <span className="inline-flex items-center gap-1.5">
                  <StatusDot status={detail.status} />
                  {STATUS[detail.status].label}
                </span>
              ) : detail.ytd !== null ? (
                'No target to compare with'
              ) : null}
              <span className="mt-1 block text-[11.5px] leading-snug text-slate-400">
                {explainYtd(kpi, seriesMonths(detail))}
              </span>
            </>
          }
        >
          {detail.ytd === null ? '–' : formatWithUnit(kpi.unit, detail.ytd)}
        </Stat>
        <AgainstTarget detail={detail} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          {page.chartTitle} · {country}
        </h2>
        <KpiChart
          unit={kpi.unit}
          title={`${page.chartTitle}, ${country}`}
          quarterly={kpi.frequency === 'quarterly'}
          thisYear={seriesOf(detail)}
          lastYear={previous ? seriesOf(previous) : null}
          target={detail.target}
          targetWords={detail.targetWords}
          baseline={detail.baseline}
        />
      </section>

      {others.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold text-slate-800">Every country · {year}</h2>
            <p className="text-[12px] text-slate-400">
              Each small chart has its own scale. Click one to open it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {others.map((d) => (
              <Link
                key={d.country}
                href={hrefFor(year, d.country)}
                aria-current={d.country === country ? 'page' : undefined}
                className={`rounded-xl border bg-white p-3 transition-colors hover:border-[#307c4c]/50 ${
                  d.country === country
                    ? 'border-[#307c4c] ring-2 ring-[#307c4c]/15'
                    : 'border-slate-200'
                }`}
              >
                <p className="truncate text-[12.5px] font-semibold text-slate-800">{d.country}</p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-slate-700">
                  <StatusDot status={d.status} />
                  <span>YTD {d.ytd === null ? '–' : formatWithUnit(kpi.unit, d.ytd)}</span>
                </p>
                <Spark values={seriesOf(d).values} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
