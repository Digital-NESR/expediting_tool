/* The Health Board overview: the Power BI "KPI - Overview" page, drawn natively.

   Same arrangement as the report: a title band, the country list down the left (one country at
   a time), and the KPI table grouped by category with Baseline, Target, the months, Units and
   YTD. Arrows on the month values and the coloured dot on YTD follow RULES.md in
   src/lib/health-board.

   No client JavaScript: the country and year pickers are links, so the numbers are computed once
   on the server for exactly the selection in the URL. */

import Link from 'next/link';
import { ArrowDown, ArrowUp, Triangle } from 'lucide-react';
import type { Overview, OverviewRow, Status, Trend } from '@/lib/health-board/calc';
import { COUNTRIES, type Country } from '@/lib/health-board/definitions';
import { formatKpiValue } from '@/lib/health-board/format';

const STATUS_STYLE: Record<Status, { dot: string; label: string }> = {
  green: { dot: 'bg-[#2e9e5b]', label: 'Meets target' },
  amber: { dot: 'bg-[#e3a008]', label: 'Within 10% of target' },
  red: { dot: 'bg-[#d64545]', label: 'Misses target by more than 10%' },
};

function TrendIcon({ trend }: { trend: Trend | null }) {
  if (!trend) return <span className="inline-block w-3.5" aria-hidden="true" />;
  if (trend.move === 'flat') {
    return (
      <Triangle
        className="h-3 w-3.5 fill-[#e3a008] text-[#e3a008]"
        aria-label="Unchanged from the previous period"
      />
    );
  }
  const Icon = trend.move === 'up' ? ArrowUp : ArrowDown;
  const colour = trend.good ? 'text-[#2e9e5b]' : 'text-[#d64545]';
  const label = `${trend.move === 'up' ? 'Up' : 'Down'} from the previous period (${trend.good ? 'better' : 'worse'})`;
  return <Icon className={`h-3.5 w-3.5 ${colour}`} strokeWidth={2.75} aria-label={label} />;
}

function StatusDot({ status }: { status: Status | null }) {
  if (!status) return <span className="inline-block h-2.5 w-2.5" aria-hidden="true" />;
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`}
      title={s.label}
      aria-label={s.label}
    />
  );
}

function Row({ row, months }: { row: OverviewRow; months: Overview['months'] }) {
  const unit = row.kpi.unit;
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
      <td className="sticky left-0 z-10 min-w-[240px] bg-white py-2 pl-8 pr-4 text-left text-[13px] text-slate-800">
        {row.kpi.name}
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-slate-700">
        {row.baseline === null ? '-' : formatKpiValue(unit, row.baseline)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-center text-slate-700">
        {row.targetWords ?? ''}
      </td>
      {months.map((m) => {
        const cell = row.months[m];
        return (
          <td
            key={m}
            className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800"
          >
            {cell && cell.value !== null ? (
              <span className="inline-flex items-center justify-end gap-1.5">
                <TrendIcon trend={cell.trend} />
                {formatKpiValue(unit, cell.value)}
              </span>
            ) : null}
          </td>
        );
      })}
      <td className="px-3 py-2 text-center text-slate-500">{unit}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
        {row.ytd !== null ? (
          <span className="inline-flex items-center justify-end gap-1.5">
            <StatusDot status={row.status} />
            {formatKpiValue(unit, row.ytd)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export default function HealthBoardOverview({
  overview,
  years,
  hrefFor,
}: {
  overview: Overview;
  years: number[];
  /** Where a country or year link goes, so the dev preview can link to itself. */
  hrefFor: (year: number, country: Country) => string;
}) {
  const { year, country, months, groups } = overview;
  const columns = 5 + months.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Title band */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#307c4c] px-5 py-3 text-white">
        <h1 className="text-lg font-semibold tracking-tight">
          Supply Chain <span className="font-normal text-white/70">|</span> Health Board (KPIs) -{' '}
          {year}
        </h1>
        <nav aria-label="Year" className="flex gap-1 rounded-lg bg-white/10 p-1">
          {years.map((y) => (
            <Link
              key={y}
              href={hrefFor(y, country)}
              aria-current={y === year ? 'page' : undefined}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                y === year ? 'bg-white text-[#1d4f31]' : 'text-white/80 hover:bg-white/15'
              }`}
            >
              {y}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Country list — Power BI's slicer, one country at a time */}
        <nav
          aria-label="Country"
          className="flex shrink-0 gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 lg:w-48 lg:flex-col lg:overflow-visible"
        >
          <p className="hidden px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">
            Country
          </p>
          {COUNTRIES.map((c) => (
            <Link
              key={c}
              href={hrefFor(year, c)}
              aria-current={c === country ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                c === country
                  ? 'bg-[#eaf4ef] font-semibold text-[#1d4f31]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {c}
            </Link>
          ))}
        </nav>

        {/* The KPI table */}
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left">KPI Name</th>
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
            {groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns} className="px-4 py-16 text-center text-sm text-slate-500">
                    No KPI values for {country} in {year}.
                  </td>
                </tr>
              </tbody>
            ) : (
              groups.map((g) => (
                <tbody key={g.category}>
                  <tr className="border-b border-slate-200 bg-[#f4f9f6]">
                    <th
                      colSpan={columns}
                      scope="rowgroup"
                      className="sticky left-0 px-4 py-2 text-left text-[13px] font-semibold text-[#1d4f31]"
                    >
                      {g.category}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <Row key={r.kpi.code} row={r} months={months} />
                  ))}
                </tbody>
              ))
            )}
          </table>
        </div>
      </div>

      {/* Key */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ArrowUp className="h-3.5 w-3.5 text-[#2e9e5b]" strokeWidth={2.75} />
          <ArrowDown className="h-3.5 w-3.5 text-[#2e9e5b]" strokeWidth={2.75} />
          better than the previous period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ArrowUp className="h-3.5 w-3.5 text-[#d64545]" strokeWidth={2.75} />
          <ArrowDown className="h-3.5 w-3.5 text-[#d64545]" strokeWidth={2.75} />
          worse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Triangle className="h-3 w-3.5 fill-[#e3a008] text-[#e3a008]" />
          unchanged
        </span>
        <span className="text-slate-300">|</span>
        <span>YTD:</span>
        {(Object.keys(STATUS_STYLE) as Status[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <StatusDot status={s} />
            {STATUS_STYLE[s].label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
