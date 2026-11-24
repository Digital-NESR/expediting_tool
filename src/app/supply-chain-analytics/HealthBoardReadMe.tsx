/* The Health Board's Read Me, which is also its Deep Dive menu (the owner's choice to merge
   Power BI's two pages): every KPI grouped by area, what it measures and where it comes from,
   each linking to its own page. Then a plain-language account of how the board calculates, built
   from definitions.ts so it cannot drift from what the board actually does. */

import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Triangle } from 'lucide-react';
import { KPIS, activeIn, type KpiDefinition } from '@/lib/health-board/definitions';
import { KPI_PAGES } from '@/lib/health-board/pages';
import { README, YTD_EXPLAINED } from '@/lib/health-board/readme';

const byNameDescending = (a: string, b: string) =>
  b.localeCompare(a, 'en', { sensitivity: 'base', numeric: true });

function Entry({ kpi, href }: { kpi: KpiDefinition; href: string | null }) {
  const r = README[kpi.code];
  if (!r) return null;
  return (
    <div
      id={KPI_PAGES[kpi.code]?.slug}
      className="-mx-2 scroll-mt-6 rounded-lg border-t border-slate-100 px-2 py-3 first:border-0 first:pt-0 target:bg-[#307c4c]/[0.07] target:ring-1 target:ring-[#307c4c]/30"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {href ? (
          <Link href={href} className="text-[14px] font-semibold text-[#1d4f31] hover:underline">
            {kpi.name}
          </Link>
        ) : (
          <span className="text-[14px] font-semibold text-slate-900">{kpi.name}</span>
        )}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          {r.better ?? (kpi.direction === 'higher' ? 'Higher is better' : 'Lower is better')} ·{' '}
          {kpi.unit}
        </span>
      </div>
      {r.text.map((t) => (
        <p key={t} className="mt-1 text-[13px] leading-relaxed text-slate-700">
          {t}
        </p>
      ))}
      <p className="mt-0.5 text-[12.5px] text-slate-500">
        Taken {r.cadence} from {r.source}.{r.global ? ` ${r.global}` : ''}
      </p>
      {kpi.ytd !== 'none' && (
        <p className="mt-0.5 text-[12.5px] text-slate-500">YTD: {YTD_EXPLAINED[kpi.ytd]}.</p>
      )}
    </div>
  );
}

export default function HealthBoardReadMe({
  categories,
  year,
  overviewHref,
  detailHref,
}: {
  /** Each KPI's area, from the latest year's data, so the grouping matches the overview. */
  categories: Map<string, string>;
  year: number;
  overviewHref: string;
  detailHref: (kpiCode: string) => string | null;
}) {
  const groups = new Map<string, KpiDefinition[]>();
  for (const k of KPIS) {
    const cat = categories.get(k.code);
    if (!cat || !README[k.code] || !activeIn(k, year)) continue;
    groups.set(cat, [...(groups.get(cat) ?? []), k]);
  }
  const areas = [...groups.entries()]
    .sort((a, b) => byNameDescending(a[0], b[0]))
    .map(([cat, ks]) => [cat, ks.sort((a, b) => byNameDescending(a.name, b.name))] as const);
  const byYtd = (m: KpiDefinition['ytd']) =>
    KPIS.filter((k) => k.ytd === m && README[k.code] && activeIn(k, year)).map((k) => k.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-[#307c4c] px-5 py-3 text-white">
        <Link
          href={overviewHref}
          className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-white/75 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Health Board overview
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">
          Supply Chain <span className="font-normal text-white/70">|</span> Health Board (KPIs) -
          Read Me
        </h1>
        <p className="text-[13px] text-white/80">
          What each KPI measures and where it comes from. Click a KPI to open its page. Areas as
          filed in {year}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {areas.map(([area, ks]) => (
          <section key={area} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#1d4f31]">
              {area}
            </h2>
            {ks.map((k) => (
              <Entry key={k.code} kpi={k} href={detailHref(k.code)} />
            ))}
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-[13px] leading-relaxed text-slate-700">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#1d4f31]">
          How the board calculates
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p>
              <span className="font-semibold">One country at a time.</span> Every figure is the
              selected country&apos;s own. Global is its own row, as reported; it is not added up
              from the countries.
            </p>
            <p>
              <span className="font-semibold">Baseline and Target</span> are shown as uploaded: the
              baseline is the previous year&apos;s figure, the target is this year&apos;s.
            </p>
            <p>
              <span className="font-semibold">Months</span> run from January to the latest month
              with any data that year. Quarterly KPIs have values in March, June, September and
              December only.
            </p>
            <p>
              <span className="font-semibold">Numbers are never changed by the board.</span> They
              are shown exactly as uploaded by the administrator; every change keeps the previous
              value in a history.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">YTD</p>
            <ul className="space-y-1.5">
              {(['latest', 'sum', 'entered', 'quarterly_average', 'average'] as const).map((m) => (
                <li key={m}>
                  <span className="text-slate-500">{YTD_EXPLAINED[m]}:</span> {byYtd(m).join(', ')}.
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Arrows on the months</p>
            <p>
              Each month is compared with the month before (a quarterly KPI with the quarter before;
              March with the baseline).
            </p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <ArrowUp className="h-3.5 w-3.5 text-[#2e9e5b]" strokeWidth={2.75} />
                <ArrowDown className="h-3.5 w-3.5 text-[#2e9e5b]" strokeWidth={2.75} />
                better
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowUp className="h-3.5 w-3.5 text-[#d64545]" strokeWidth={2.75} />
                <ArrowDown className="h-3.5 w-3.5 text-[#d64545]" strokeWidth={2.75} />
                worse
              </span>
              <span className="inline-flex items-center gap-1">
                <Triangle className="h-3 w-3.5 fill-[#e3a008] text-[#e3a008]" />
                unchanged
              </span>
            </p>
            <p>No arrow on January, or when either month is blank.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">The YTD dot</p>
            <ul className="space-y-1">
              <li>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#2e9e5b]" />
                meets the target
              </li>
              <li>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#e3a008]" />
                misses it by no more than 10% of the target
              </li>
              <li>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#d64545]" />
                misses it by more than 10%
              </li>
            </ul>
            <p>No dot when there is no target or no YTD.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
