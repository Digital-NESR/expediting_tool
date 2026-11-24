/* The Health Board's country comparison: Power BI's "KPIs Country Comparison" page, drawn
   natively. One KPI, every country with data that year, one row each.

   As in Power BI: a "Select KPI" menu grouped by category, the KPI's name as the heading, and a
   table with Baseline, Target, the months, Units and YTD. Different on purpose (RULES.md, "Country
   comparison"): all 28 KPIs are in the menu, the months run to the latest with data instead of
   stopping at May, rows follow the country list, and the cells carry the overview's arrows and
   YTD dot. Each row is built by the same code as the overview row, so a country reads the same
   on both pages.

   No client JavaScript: the menu is a <details> and every choice is a link. */

import Link from 'next/link';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import type { Comparison } from '@/lib/health-board/calc';
import { KPIS, type Country } from '@/lib/health-board/definitions';
import { formatKpiValue } from '@/lib/health-board/format';
import { KPI_PAGES } from '@/lib/health-board/pages';
import { StatusDot, TrendIcon, YearNav } from './HealthBoardOverview';

const byNameDescending = (a: string, b: string) =>
  b.localeCompare(a, 'en', { sensitivity: 'base', numeric: true });

export default function HealthBoardComparison({
  comparison,
  years,
  categories,
  hrefFor,
  overviewHref,
  detailHref,
}: {
  comparison: Comparison;
  years: number[];
  /** Each KPI's category for the year, for grouping the menu. */
  categories: Map<string, string>;
  /** The comparison for another KPI or year. */
  hrefFor: (kpiCode: string, year: number) => string;
  overviewHref: string;
  /** A country's detail page for this KPI. */
  detailHref: (kpiCode: string, year: number, country: Country) => string | null;
}) {
  const { year, kpi, months, rows } = comparison;
  const columns = 5 + months.length;

  /* The menu: KPIs with a page, grouped by this year's category, sorted Z→A like the overview. */
  const groups = new Map<string, typeof KPIS>();
  for (const k of KPIS) {
    if (!KPI_PAGES[k.code]) continue;
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
        <YearNav years={years} year={year} href={(y) => hrefFor(kpi.code, y)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#307c4c]/50">
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
                        href={hrefFor(k.code, year)}
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
        <h2 className="text-lg font-semibold text-slate-900">{kpi.name}</h2>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left">Country</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-center">Baseline {year - 1}</th>
              <th className="px-3 py-2.5 text-center">Target</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2.5 text-right">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center">Units</th>
              <th className="px-3 py-2.5 text-right">YTD</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns} className="px-4 py-16 text-center text-sm text-slate-500">
                  No country has values for {kpi.name} in {year}.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const href = detailHref(kpi.code, year, r.country);
                return (
                  <tr
                    key={r.country}
                    className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${
                      r.country === 'Global' ? 'bg-[#f4f9f6] font-medium' : ''
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 min-w-[140px] px-4 py-2 text-left text-[13px] text-slate-800 ${
                        r.country === 'Global' ? 'bg-[#f4f9f6]' : 'bg-white'
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
                    <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                      {r.baseline === null ? '-' : formatKpiValue(kpi.unit, r.baseline)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-slate-700">
                      {r.targetWords ?? ''}
                    </td>
                    {months.map((m) => {
                      const cell = r.months[m];
                      return (
                        <td
                          key={m}
                          className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800"
                        >
                          {cell && cell.value !== null ? (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <TrendIcon trend={cell.trend} />
                              {formatKpiValue(kpi.unit, cell.value)}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-slate-500">{kpi.unit}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {r.ytd !== null ? (
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <StatusDot status={r.status} />
                          {formatKpiValue(kpi.unit, r.ytd)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
