/* The Health Board's country comparison (UX phase 3): one KPI, every country with data that year.

   From Power BI's "KPIs Country Comparison" page: the "Select KPI" menu and a table of Baseline,
   Target, the months and YTD per country. Added in phase 3:
   - a sort (country list / YTD best first / furthest from target first), as links;
   - a bar chart of every country's YTD with that country's own target as a tick;
   - month cells shaded against the country's target, with the meaning in a key and in each
     cell's tooltip, and a "vs target" column that says it in words.
   Each row is still built by the same code as the overview row (RULES.md), so a country reads
   the same on every page. No client JavaScript: the menu is a <details>, every choice a link. */

import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { status, type Comparison, type ComparisonRow, type Status } from '@/lib/health-board/calc';
import { KPIS, activeIn, type Country, type KpiDefinition } from '@/lib/health-board/definitions';
import { formatKpiValue, formatWithUnit } from '@/lib/health-board/format';
import { KPI_PAGES } from '@/lib/health-board/pages';
import { scaleFor } from '@/lib/health-board/scale';
import { SORTS, betterBy, sortRows, type ComparisonSort } from '@/lib/health-board/compare';
import BoardActions from './BoardActions';
import { KpiInfo, StatusDot, TrendIcon, YearNav } from './HealthBoardOverview';
import {
  describeProvenance,
  explainYtd,
  isGap,
  provenanceKey,
  type ProvenanceInfo,
} from '@/lib/health-board/explain';
import type { Month } from '@/lib/health-board/definitions';

const byNameDescending = (a: string, b: string) =>
  b.localeCompare(a, 'en', { sensitivity: 'base', numeric: true });

const STATUS_FILL: Record<Status, string> = { green: '#2e9e5b', amber: '#e3a008', red: '#d64545' };
const STATUS_LABEL: Record<Status, string> = {
  green: 'meets target',
  amber: 'within 10% of target',
  red: 'misses target by more than 10%',
};
/* Cell shading: a pale wash of the status colour, so the number on top keeps full contrast. */
const CELL_WASH: Record<Status, string> = {
  green: 'bg-[#2e9e5b]/[0.10]',
  amber: 'bg-[#e3a008]/[0.14]',
  red: 'bg-[#d64545]/[0.10]',
};

/** "2.99 pts" for percentages, otherwise the value with its unit. */
function amount(unit: KpiDefinition['unit'], v: number): string {
  return unit === '%' ? `${formatKpiValue('%', v)} pts` : formatWithUnit(unit, v);
}

function VsTarget({ kpi, row }: { kpi: KpiDefinition; row: ComparisonRow }) {
  const b = betterBy(kpi, row);
  if (b === null) return <span className="text-slate-300">–</span>;
  if (b === 0) return <span className="text-slate-600">on target</span>;
  return (
    <span className="text-slate-700">
      {amount(kpi.unit, Math.abs(b))}{' '}
      <span className="text-slate-500">{b > 0 ? 'better' : 'worse'}</span>
    </span>
  );
}

/** Every country's YTD as a bar from zero, with its own target as a black tick. */
function YtdBars({
  kpi,
  rows,
  href,
  current,
}: {
  kpi: KpiDefinition;
  rows: ComparisonRow[];
  href: (c: Country) => string | null;
  current?: Country;
}) {
  const plotted = rows.filter((r) => r.ytd !== null);
  if (!plotted.length) return null;
  const { lo, hi } = scaleFor(
    plotted.flatMap((r) => [r.ytd!, ...(r.target === null ? [] : [r.target])]),
  );
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = pos(0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">YTD by country</h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-slate-300" /> YTD, coloured by status
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-1 rounded bg-slate-900" /> that country&apos;s target
          </span>
        </p>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const link = href(r.country);
          const label = `${r.country}: YTD ${r.ytd === null ? 'none' : formatWithUnit(kpi.unit, r.ytd)}${
            r.target === null
              ? ''
              : `, target ${r.targetWords ?? formatWithUnit(kpi.unit, r.target)}`
          }${r.status ? `, ${STATUS_LABEL[r.status]}` : ''}`;
          const body = (
            <>
              <span
                className={`w-20 shrink-0 truncate text-[12px] sm:w-28 sm:text-[12.5px] ${
                  r.country === 'Global' || r.country === current
                    ? 'font-semibold text-slate-900'
                    : 'text-slate-700'
                }`}
              >
                {r.country}
              </span>
              <span className="relative h-5 flex-1">
                <span
                  className="absolute inset-y-0 w-px bg-slate-300"
                  style={{ left: `${zero}%` }}
                />
                {r.ytd !== null && (
                  <span
                    className={`absolute top-0.5 h-4 ${r.ytd >= 0 ? 'rounded-r' : 'rounded-l'} transition-opacity group-hover:opacity-80`}
                    style={{
                      left: `${Math.min(zero, pos(r.ytd))}%`,
                      width: `${Math.max(Math.abs(pos(r.ytd) - zero), 0.4)}%`,
                      background: r.status ? STATUS_FILL[r.status] : '#94a3b8',
                    }}
                  />
                )}
                {r.target !== null && (
                  <span
                    className="absolute -top-0.5 h-6 w-1 rounded bg-slate-900"
                    style={{ left: `calc(${pos(r.target)}% - 2px)` }}
                  />
                )}
              </span>
              <span className="w-[5.5rem] shrink-0 text-right text-[12px] tabular-nums text-slate-800 sm:w-32 sm:text-[12.5px]">
                {r.ytd === null ? (
                  <span className="text-slate-400">no YTD</span>
                ) : (
                  formatWithUnit(kpi.unit, r.ytd)
                )}
              </span>
            </>
          );
          return (
            <li key={r.country}>
              {link ? (
                <Link
                  href={link}
                  title={label}
                  aria-label={label}
                  className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-slate-50 sm:gap-3"
                >
                  {body}
                </Link>
              ) : (
                <div title={label} className="flex items-center gap-3 px-1 py-0.5">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HealthBoardComparison({
  comparison,
  years,
  categories,
  sort,
  provenance,
  frontiers,
  readMeHref,
  exportHref,
  hrefFor,
  overviewHref,
  detailHref,
}: {
  comparison: Comparison;
  years: number[];
  /** Each KPI's category for the year, for grouping the menu. */
  categories: Map<string, string>;
  sort: ComparisonSort;
  /** Where each value came from, and how far each KPI reaches, for the hovers (phase 4). */
  provenance: Record<string, ProvenanceInfo>;
  frontiers: Record<string, number>;
  readMeHref: string;
  /** This view as an Excel file. */
  exportHref: string;
  /** The comparison for another KPI, year or order. */
  hrefFor: (kpiCode: string, year: number, sort: ComparisonSort) => string;
  overviewHref: string;
  /** A country's detail page for this KPI. */
  detailHref: (kpiCode: string, year: number, country: Country) => string | null;
}) {
  const { year, kpi, months } = comparison;
  const rows = sortRows(comparison.rows, kpi, sort);

  /* The menu: KPIs with a page, grouped by this year's category, sorted Z→A like the overview. */
  const groups = new Map<string, typeof KPIS>();
  for (const k of KPIS) {
    if (!KPI_PAGES[k.code] || !activeIn(k, year)) continue;
    const cat = categories.get(k.code);
    if (!cat) continue;
    groups.set(cat, [...(groups.get(cat) ?? []), k]);
  }
  const menu = [...groups.entries()]
    .sort((a, b) => byNameDescending(a[0], b[0]))
    .map(([cat, ks]) => [cat, [...ks].sort((a, b) => byNameDescending(a.name, b.name))] as const);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#307c4c] px-5 py-3 text-white">
        <div>
          <Link
            href={overviewHref}
            className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-white/75 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Health Board overview
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            Supply Chain <span className="font-normal text-white/70">|</span> Health Board (KPIs) -{' '}
            {year} <span className="font-normal text-white/70">·</span> Country comparison
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BoardActions exportHref={exportHref} />
          <YearNav years={years} year={year} href={(y) => hrefFor(kpi.code, y, sort)} />
        </div>
      </div>

      {/* KPI and order */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <details className="group relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-[#307c4c]/50">
              Select KPI
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 grid w-[min(92vw,760px)] grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:grid-cols-2">
              {menu.map(([cat, ks]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#1d4f31]">
                    {cat}
                  </p>
                  <ul className="space-y-0.5">
                    {ks.map((k) => (
                      <li key={k.code}>
                        <Link
                          href={hrefFor(k.code, year, sort)}
                          aria-current={k.code === kpi.code ? 'page' : undefined}
                          className={`block rounded-md px-2 py-1 text-[13px] ${
                            k.code === kpi.code
                              ? 'bg-[#eaf4ef] font-semibold text-[#1d4f31]'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {k.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {kpi.name}
              <KpiInfo kpi={kpi} readMeHref={readMeHref} />
            </h2>
            <p className="text-[12px] text-slate-500">
              {kpi.unit === '$'
                ? 'US$'
                : kpi.unit === 'Days'
                  ? 'days'
                  : kpi.unit === '%'
                    ? '%'
                    : 'suppliers'}{' '}
              · {kpi.direction === 'higher' ? 'higher' : 'lower'} is better
            </p>
          </div>
        </div>
        <nav
          aria-label="Order"
          className="hb-print-hide flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-[13px]"
        >
          <span className="px-2 py-1 text-slate-400">Order</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={hrefFor(kpi.code, year, s.id)}
              aria-current={s.id === sort ? 'true' : undefined}
              className={`rounded-md px-2.5 py-1 font-medium ${
                s.id === sort ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
          No country has values for {kpi.name} in {year}.
        </div>
      ) : (
        <>
          <YtdBars kpi={kpi} rows={rows} href={(c) => detailHref(kpi.code, year, c)} />

          <div className="hb-print-unclip overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600">
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-2.5 text-left">Country</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Baseline {year - 1}</th>
                  <th className="px-3 py-2.5 text-center">Target</th>
                  {months.map((m) => (
                    <th key={m} className="px-3 py-2.5 text-right">
                      {m.slice(0, 3)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right">YTD</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">vs target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = detailHref(kpi.code, year, r.country);
                  const global = r.country === 'Global';
                  const src = (period: string) => {
                    const p = provenance[provenanceKey(kpi.code, period, r.country)];
                    return p ? describeProvenance(p, kpi.unit) : undefined;
                  };
                  const monthly: Partial<Record<Month, number | null>> = {};
                  for (const m of months) monthly[m] = r.months[m]?.value ?? null;
                  const ytdSource = kpi.ytd === 'entered' ? src('YTD') : undefined;
                  const ytdTitle = explainYtd(kpi, monthly) + (ytdSource ? ` ${ytdSource}` : '');
                  return (
                    <tr
                      key={r.country}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                    >
                      <td
                        className={`sticky left-0 z-10 min-w-[140px] px-4 py-2 text-left text-[13px] text-slate-800 ${
                          global ? 'bg-[#f4f9f6] font-semibold' : 'bg-white'
                        }`}
                      >
                        {href ? (
                          <Link href={href} className="hover:text-[#307c4c] hover:underline">
                            {r.country}
                          </Link>
                        ) : (
                          r.country
                        )}
                      </td>
                      <td
                        title={r.baseline === null ? undefined : src('Baseline')}
                        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600"
                      >
                        {r.baseline === null ? '–' : formatWithUnit(kpi.unit, r.baseline)}
                      </td>
                      <td
                        title={r.targetWords ? src('Target') : undefined}
                        className="whitespace-nowrap px-3 py-2 text-center text-slate-600"
                      >
                        {r.targetWords ?? <span className="text-slate-300">–</span>}
                      </td>
                      {months.map((m) => {
                        const cell = r.months[m];
                        const s =
                          cell && cell.value !== null
                            ? status(kpi.direction, cell.value, r.target)
                            : null;
                        return (
                          <td
                            key={m}
                            title={
                              cell && cell.value !== null
                                ? [s ? `${m}: ${STATUS_LABEL[s]}.` : '', src(m) ?? '']
                                    .filter(Boolean)
                                    .join(' ')
                                : isGap(kpi, m, frontiers[kpi.code])
                                  ? `No value uploaded for ${r.country}, ${m} ${year}; other countries have one.`
                                  : undefined
                            }
                            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800 ${s ? CELL_WASH[s] : ''}`}
                          >
                            {cell && cell.value !== null ? (
                              <span className="inline-flex items-center justify-end gap-1.5">
                                <TrendIcon trend={cell.trend} />
                                {formatKpiValue(kpi.unit, cell.value)}
                              </span>
                            ) : isGap(kpi, m, frontiers[kpi.code]) ? (
                              <span className="text-slate-300">—</span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td
                        title={r.ytd !== null ? ytdTitle : undefined}
                        className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900"
                      >
                        {r.ytd !== null ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <StatusDot status={r.status} />
                            {formatWithUnit(kpi.unit, r.ytd)}
                          </span>
                        ) : (
                          <span className="font-normal text-slate-300">–</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-[12.5px] tabular-nums">
                        <VsTarget kpi={kpi} row={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-slate-500">
            <span>Month shading, against that country&apos;s target:</span>
            {(['green', 'amber', 'red'] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block h-3 w-5 rounded-sm ${CELL_WASH[s]} ring-1 ring-slate-200`}
                />
                {STATUS_LABEL[s]}
              </span>
            ))}
            <span>· unshaded: no target</span>
            <span>· — not uploaded for that country</span>
            <span>· hover a number for where it came from</span>
            <span>· click a country for its page</span>
          </p>
        </>
      )}
    </div>
  );
}
