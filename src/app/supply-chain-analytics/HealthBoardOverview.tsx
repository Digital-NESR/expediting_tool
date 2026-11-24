/* The Health Board overview: the Power BI "KPI - Overview" page, redesigned (UX phase 1).

   What a reader needs first: how fresh the data is and how the selected country stands against
   its targets (the summary tiles), then the KPI table grouped by category. Every number still
   comes from buildOverview() unchanged; this file only lays it out (RULES.md).

   - Country: a searchable picker (CountryPicker, the one client component), Global pinned.
   - Table (md and up): units sit under each KPI name and beside Baseline and YTD; targets are
     chips; the latest month is tinted; the whole row opens the KPI's page.
   - Phones: one card per KPI instead of a 14-column table. */

import Link from 'next/link';
import { ArrowDown, ArrowUp, Info, Triangle } from 'lucide-react';
import type { Overview, OverviewRow, Status, Trend } from '@/lib/health-board/calc';
import {
  COUNTRIES,
  type Country,
  type KpiDefinition,
  type Month,
} from '@/lib/health-board/definitions';
import {
  describeProvenance,
  explainYtd,
  isGap,
  provenanceKey,
  type ProvenanceInfo,
} from '@/lib/health-board/explain';
import { KPI_PAGES } from '@/lib/health-board/pages';
import { README } from '@/lib/health-board/readme';
import { formatKpiValue, formatWithUnit } from '@/lib/health-board/format';
import BoardActions from './BoardActions';
import CountryPicker from './CountryPicker';

const STATUS_STYLE: Record<Status, { dot: string; label: string }> = {
  green: { dot: 'bg-[#2e9e5b]', label: 'Meets target' },
  amber: { dot: 'bg-[#e3a008]', label: 'Within 10% of target' },
  red: { dot: 'bg-[#d64545]', label: 'Misses target by more than 10%' },
};

const UNIT_WORD: Record<KpiDefinition['unit'], string> = {
  '%': '%',
  Days: 'days',
  $: 'US$',
  Suppliers: 'suppliers',
};

export function TrendIcon({ trend }: { trend: Trend | null }) {
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

export function StatusDot({ status }: { status: Status | null }) {
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

function TargetChip({ words }: { words: string | null }) {
  if (!words) return <span className="text-slate-300">–</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] font-medium text-slate-600">
      {words}
    </span>
  );
}

function KpiMeta({ kpi }: { kpi: KpiDefinition }) {
  return (
    <span className="block text-[11px] font-normal text-slate-400">
      {UNIT_WORD[kpi.unit]} · {kpi.direction === 'higher' ? 'higher' : 'lower'} is better
    </span>
  );
}

/** What a row needs to explain its numbers on hover (UX phase 4). */
export interface ExplainContext {
  year: number;
  country: Country;
  provenance: Record<string, ProvenanceInfo>;
  /** Per KPI, the last month any country has a value in (index 0–11). */
  frontiers: Record<string, number>;
  readMeHref: string;
}

/** A value with its source on hover. Sits above the row's link, so hovering it shows the source. */
export function Sourced({
  title,
  children,
}: {
  title: string | undefined;
  children: React.ReactNode;
}) {
  if (!title) return <>{children}</>;
  return (
    <span title={title} className="relative z-[1] cursor-help">
      {children}
    </span>
  );
}

/** The (i) beside a KPI name: its Read Me definition on hover, the Read Me entry on click. */
export function KpiInfo({ kpi, readMeHref }: { kpi: KpiDefinition; readMeHref: string }) {
  const entry = README[kpi.code];
  const page = KPI_PAGES[kpi.code];
  if (!entry || !page) return null;
  return (
    <Link
      href={`${readMeHref}#${page.slug}`}
      title={`${entry.text.join(' ')} Taken ${entry.cadence} from ${entry.source}.`}
      aria-label={`What ${kpi.name} measures`}
      className="relative z-[1] ml-1 inline-flex align-middle text-slate-300 hover:text-[#307c4c]"
    >
      <Info className="h-3.5 w-3.5" />
    </Link>
  );
}

function Row({
  row,
  months,
  latest,
  href,
  ctx,
}: {
  row: OverviewRow;
  months: Overview['months'];
  latest: string | undefined;
  href: string | null;
  ctx: ExplainContext;
}) {
  const unit = row.kpi.unit;
  const src = (period: string) => {
    const p = ctx.provenance[provenanceKey(row.kpi.code, period, ctx.country)];
    return p ? describeProvenance(p, unit) : undefined;
  };
  const monthly: Partial<Record<Month, number | null>> = {};
  for (const m of months) monthly[m] = row.months[m]?.value ?? null;
  const ytdSource = row.kpi.ytd === 'entered' ? src('YTD') : undefined;
  const ytdTitle = explainYtd(row.kpi, monthly) + (ytdSource ? ` ${ytdSource}` : '');
  return (
    <tr className="group relative border-b border-slate-100 last:border-0 hover:bg-[#307c4c]/5">
      <td className="sticky left-0 z-10 min-w-[250px] bg-white py-2.5 pl-6 pr-4 text-left text-[13px] font-medium text-slate-800 group-hover:bg-[#f3f8f5]">
        {href ? (
          <Link href={href} className="hover:text-[#307c4c] hover:underline">
            {row.kpi.name}
          </Link>
        ) : (
          row.kpi.name
        )}
        <KpiInfo kpi={row.kpi} readMeHref={ctx.readMeHref} />
        <KpiMeta kpi={row.kpi} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">
        {/* The whole row opens the KPI's page. This copy of the link is for the mouse only: the
            KPI name above is the one keyboard and screen-reader users reach. Numbers sit above
            it so their source shows on hover. */}
        {href && (
          <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0 z-0" />
        )}
        <Sourced title={row.baseline === null ? undefined : src('Baseline')}>
          {row.baseline === null ? '–' : formatWithUnit(unit, row.baseline)}
        </Sourced>
      </td>
      <td className="px-3 py-2.5 text-center">
        <Sourced title={row.targetWords ? src('Target') : undefined}>
          <TargetChip words={row.targetWords} />
        </Sourced>
      </td>
      {months.map((m) => {
        const cell = row.months[m];
        const gap =
          (!cell || cell.value === null) && isGap(row.kpi, m, ctx.frontiers[row.kpi.code]);
        return (
          <td
            key={m}
            className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-800 ${
              m === latest ? 'bg-[#307c4c]/[0.05] font-semibold' : ''
            }`}
          >
            {cell && cell.value !== null ? (
              <Sourced title={src(m)}>
                <span className="inline-flex items-center justify-end gap-1.5">
                  <TrendIcon trend={cell.trend} />
                  {formatKpiValue(unit, cell.value)}
                </span>
              </Sourced>
            ) : gap ? (
              <Sourced
                title={`No value uploaded for ${ctx.country}, ${m} ${ctx.year}; other countries have one.`}
              >
                <span className="font-normal text-slate-300">—</span>
              </Sourced>
            ) : null}
          </td>
        );
      })}
      <td className="sticky right-0 z-10 whitespace-nowrap border-l border-slate-100 bg-white px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900 group-hover:bg-[#f3f8f5]">
        {/* Pinned cells are positioned, so they sit above the row's link; this one carries its own. */}
        {href && <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0" />}
        {row.ytd !== null ? (
          <Sourced title={ytdTitle}>
            <span className="inline-flex items-center justify-end gap-1.5">
              <StatusDot status={row.status} />
              {formatWithUnit(unit, row.ytd)}
            </span>
          </Sourced>
        ) : (
          <span className="font-normal text-slate-300">–</span>
        )}
      </td>
    </tr>
  );
}

function Card({
  row,
  latest,
  href,
}: {
  row: OverviewRow;
  latest: Overview['months'][number] | undefined;
  href: string | null;
}) {
  const unit = row.kpi.unit;
  const last = latest ? row.months[latest] : undefined;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-slate-900">{row.kpi.name}</p>
          <KpiMeta kpi={row.kpi} />
        </div>
        <TargetChip words={row.targetWords} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <p className="text-slate-400">YTD</p>
          <p className="inline-flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-slate-900">
            <StatusDot status={row.status} />
            {row.ytd === null ? '–' : formatWithUnit(unit, row.ytd)}
          </p>
        </div>
        <div>
          <p className="text-slate-400">{latest ?? 'Latest'}</p>
          <p className="inline-flex items-center gap-1 tabular-nums text-slate-800">
            {last && last.value !== null ? (
              <>
                <TrendIcon trend={last.trend} />
                {formatKpiValue(unit, last.value)}
              </>
            ) : (
              '–'
            )}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Baseline</p>
          <p className="tabular-nums text-slate-700">
            {row.baseline === null ? '–' : formatWithUnit(unit, row.baseline)}
          </p>
        </div>
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-[#307c4c]/40"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-white p-4">{body}</div>
  );
}

/** Power BI's year filter, as links. */
export function YearNav({
  years,
  year,
  href,
}: {
  years: number[];
  year: number;
  href: (y: number) => string;
}) {
  return (
    <nav aria-label="Year" className="flex gap-1 rounded-lg bg-white/10 p-1">
      {years.map((y) => (
        <Link
          key={y}
          href={href(y)}
          aria-current={y === year ? 'page' : undefined}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            y === year ? 'bg-white text-[#1d4f31]' : 'text-white/80 hover:bg-white/15'
          }`}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}

export interface Freshness {
  /** The newest load or upload into all_kpis. */
  lastLoad: { at: string; by: string } | null;
}

/** For the selected country: the latest month most KPIs have reached, and anything beyond it. */
function reach(rows: OverviewRow[], months: Overview['months']) {
  const filled = months.map((m) => rows.filter((r) => r.months[m]?.value != null).length);
  let most = -1;
  filled.forEach((n, i) => {
    if (rows.length && n >= rows.length / 2) most = i;
  });
  let last = -1;
  filled.forEach((n, i) => {
    if (n > 0) last = i;
  });
  return {
    most: most >= 0 ? months[most] : undefined,
    beyond: last > most && last >= 0 ? { month: months[last], kpis: filled[last] } : undefined,
  };
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dubai',
});

export default function HealthBoardOverview({
  overview,
  years,
  freshness,
  provenance,
  frontiers,
  hrefFor,
  detailHref,
  compareHref,
  readMeHref,
  exportHref,
}: {
  overview: Overview;
  years: number[];
  freshness: Freshness;
  /** Sources and per-KPI reach, for the hovers. */
  provenance: Record<string, ProvenanceInfo>;
  frontiers: Record<string, number>;
  /** Where a country or year link goes, so the dev preview can link to itself. */
  hrefFor: (year: number, country: Country) => string;
  /** Where a KPI's name links to: its detail page for the same year and country. */
  detailHref: (kpiCode: string, year: number, country: Country) => string | null;
  /** The country comparison page for this year. */
  compareHref: string;
  /** The Read Me / KPI index. */
  readMeHref: string;
  /** This view as an Excel file. */
  exportHref: string;
}) {
  const { year, country, months, groups } = overview;
  const rows = groups.flatMap((g) => g.rows);
  const { most, beyond } = reach(rows, months);
  /* The month highlighted in the table: the one most KPIs have reached, not a month that a
     single early KPI has opened. */
  const latest = most ?? months[months.length - 1];
  const count = (s: Status | null) => rows.filter((r) => r.status === s).length;
  const tiles: { label: string; n: number; dot: string | null }[] = [
    { label: 'On target', n: count('green'), dot: STATUS_STYLE.green.dot },
    { label: 'Within 10%', n: count('amber'), dot: STATUS_STYLE.amber.dot },
    { label: 'Off target', n: count('red'), dot: STATUS_STYLE.red.dot },
    { label: 'No target or YTD', n: count(null), dot: null },
  ];
  const columns = 4 + months.length;
  const ctx: ExplainContext = { year, country, provenance, frontiers, readMeHref };

  return (
    <div className="flex flex-col gap-4">
      {/* Title band */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#307c4c] px-5 py-3 text-white">
        <h1 className="text-lg font-semibold tracking-tight">
          Supply Chain <span className="font-normal text-white/70">|</span> Health Board (KPIs) -{' '}
          {year}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={readMeHref}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
          >
            Read Me
          </Link>
          <Link
            href={compareHref}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
          >
            Country comparison
          </Link>
          <BoardActions exportHref={exportHref} />
          <YearNav years={years} year={year} href={(y) => hrefFor(y, country)} />
        </div>
      </div>

      {/* Country and freshness */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CountryPicker
          current={country}
          links={COUNTRIES.map((c) => ({ country: c, href: hrefFor(year, c) }))}
        />
        <p className="text-[12.5px] text-slate-500">
          {most ? (
            <>
              Most KPIs up to{' '}
              <span className="font-semibold text-slate-700">
                {most} {year}
              </span>
              {beyond && (
                <>
                  {' '}
                  ({beyond.kpis} KPI{beyond.kpis === 1 ? '' : 's'} up to {beyond.month})
                </>
              )}
            </>
          ) : months.length ? (
            <>
              Few KPIs have monthly data for {country} in {year}
            </>
          ) : (
            <>No monthly data for {year} yet</>
          )}
          {freshness.lastLoad && (
            <>
              {' '}
              · last upload {WHEN.format(new Date(freshness.lastLoad.at))} by{' '}
              {freshness.lastLoad.by}
            </>
          )}
        </p>
      </div>

      {/* How the country stands: YTD against target */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
              {t.dot && <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dot}`} />}
              {t.label}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
              {t.n}
              <span className="ml-1 text-sm font-normal text-slate-400">of {rows.length} KPIs</span>
            </p>
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
          No KPI values for {country} in {year}.
        </div>
      ) : (
        <>
          {/* The KPI table, md and up */}
          <div className="hb-print-unclip hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600">
                  <th className="sticky left-0 z-20 bg-slate-50 py-2.5 pl-6 pr-4 text-left">KPI</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Baseline {year - 1}</th>
                  <th className="px-3 py-2.5 text-center">Target</th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className={`px-3 py-2.5 text-right ${
                        m === latest ? 'bg-[#307c4c]/[0.08] text-[#1d4f31]' : ''
                      }`}
                    >
                      {m.slice(0, 3)}
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 border-l border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
                    YTD
                  </th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.category}>
                  <tr className="border-b border-slate-200 bg-[#f4f9f6]">
                    <th
                      colSpan={columns}
                      scope="rowgroup"
                      className="sticky left-0 px-6 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-[#1d4f31]"
                    >
                      {g.category}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <Row
                      key={r.kpi.code}
                      row={r}
                      months={months}
                      latest={latest}
                      href={detailHref(r.kpi.code, year, country)}
                      ctx={ctx}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          {/* Phones: one card per KPI */}
          <div className="flex flex-col gap-5 md:hidden">
            {groups.map((g) => (
              <section key={g.category} className="flex flex-col gap-2">
                <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-[#1d4f31]">
                  {g.category}
                </h2>
                {g.rows.map((r) => (
                  <Card
                    key={r.kpi.code}
                    row={r}
                    latest={latest}
                    href={detailHref(r.kpi.code, year, country)}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}

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
        <span className="text-slate-300">|</span>
        <span>Click a KPI for its page; hover a number for where it came from.</span>
        <span className="inline-flex items-center gap-1">
          <span className="text-slate-300">—</span> not uploaded for this country (others have it)
        </span>
      </div>
    </div>
  );
}
