/* One KPI's detail page: the Power BI KPI pages, drawn natively.

   Same arrangement as the report: the title with its description and data source, the country
   list down the left, the Baseline / Target / YTD cards and the gauge, and the area chart by
   month. Numbers come from buildDetail(), which shares its arithmetic with the overview, so a
   KPI cannot show one YTD here and another there (RULES.md, "Detail pages").

   Server-rendered SVG, no chart library and no client JavaScript. Scales start at zero and fit
   the data (the owner's choice over Power BI's fixed per-page ranges, which cut values off). */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { KpiDetail, Status } from '@/lib/health-board/calc';
import type { Country } from '@/lib/health-board/definitions';
import { formatKpiValue } from '@/lib/health-board/format';
import type { KpiPage } from '@/lib/health-board/pages';
import { scaleFor, ticksFor } from '@/lib/health-board/scale';
import { CountryNav, YearNav } from './HealthBoardOverview';

const GREEN = '#307c4c';
const STATUS_FILL: Record<Status, string> = { green: '#2e9e5b', amber: '#e3a008', red: '#d64545' };
const STATUS_LABEL: Record<Status, string> = {
  green: 'Meets target',
  amber: 'Within 10% of target',
  red: 'Misses target by more than 10%',
};

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{children}</div>
    </div>
  );
}

function Gauge({ detail }: { detail: KpiDetail }) {
  const { ytd, target, kpi, status } = detail;
  if (ytd === null) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-400">
        No YTD
      </div>
    );
  }
  const { lo, hi } = scaleFor([ytd, ...(target === null ? [] : [target])]);
  const W = 220;
  const cx = W / 2;
  const cy = 100;
  const r = 80;
  const at = (v: number) => {
    const t = Math.PI * (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo));
    return { x: cx + r * Math.cos(t), y: cy - r * Math.sin(t) };
  };
  const arc = (from: number, to: number) => {
    const a = at(Math.min(from, to));
    const b = at(Math.max(from, to));
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  };
  const fill = status ? STATUS_FILL[status] : GREEN;
  const zero = Math.min(Math.max(0, lo), hi);
  const t = target === null ? null : at(target);
  const tInner =
    target === null ? null : { x: cx + (t!.x - cx) * 0.78, y: cy + (t!.y - cy) * 0.78 };
  const tOuter =
    target === null ? null : { x: cx + (t!.x - cx) * 1.16, y: cy + (t!.y - cy) * 1.16 };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <svg
        viewBox={`0 0 ${W} 130`}
        className="h-auto w-full"
        role="img"
        aria-label={`YTD ${formatKpiValue(kpi.unit, ytd)} against target ${target === null ? 'none' : formatKpiValue(kpi.unit, target)}${status ? `: ${STATUS_LABEL[status].toLowerCase()}` : ''}`}
      >
        <path d={arc(lo, hi)} fill="none" stroke="#e5e7eb" strokeWidth={18} />
        <path d={arc(zero, ytd)} fill="none" stroke={fill} strokeWidth={18} />
        {tInner && tOuter && (
          <line
            x1={tInner.x}
            y1={tInner.y}
            x2={tOuter.x}
            y2={tOuter.y}
            stroke="#0f172a"
            strokeWidth={3}
          />
        )}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-slate-900 text-[20px] font-semibold"
        >
          {formatKpiValue(kpi.unit, ytd)}
        </text>
        <text x={cx - r} y={cy + 20} textAnchor="middle" className="fill-slate-400 text-[10px]">
          {COMPACT.format(lo)}
        </text>
        <text x={cx + r} y={cy + 20} textAnchor="middle" className="fill-slate-400 text-[10px]">
          {COMPACT.format(hi)}
        </text>
        {target !== null && (
          <text x={cx} y={cy + 20} textAnchor="middle" className="fill-slate-500 text-[10px]">
            Target {formatKpiValue(kpi.unit, target)}
          </text>
        )}
      </svg>
    </div>
  );
}

function AreaChart({ detail, title }: { detail: KpiDetail; title: string }) {
  const { points, kpi, country, year } = detail;
  if (!points.length) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
        No values for {country} in {year}.
      </div>
    );
  }
  const W = 1000;
  const H = 340;
  const pad = { l: 64, r: 24, t: 28, b: 40 };
  const { lo, hi } = scaleFor(points.map((p) => p.value));
  /* Points sit in from the axis so the first value label does not sit on the tick labels. */
  const inset = 36;
  const x = (i: number) =>
    points.length === 1
      ? (pad.l + W - pad.r) / 2
      : pad.l + inset + (i * (W - pad.l - pad.r - 2 * inset)) / (points.length - 1);
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / (hi - lo);
  const ticks = ticksFor(lo, hi);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.value)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${title}: ${points.map((p) => `${p.label} ${formatKpiValue(kpi.unit, p.value)}`).join(', ')}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[12px]">
            {COMPACT.format(t)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
      <path d={area} fill={GREEN} fillOpacity={0.15} />
      <path d={line} fill="none" stroke={GREEN} strokeWidth={2.5} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r={4} fill="#fff" stroke={GREEN} strokeWidth={2} />
          <text
            x={x(i)}
            y={y(p.value) - 10}
            textAnchor="middle"
            className="fill-slate-700 text-[12px] font-medium"
          >
            {formatKpiValue(kpi.unit, p.value)}
          </text>
          <text x={x(i)} y={H - 14} textAnchor="middle" className="fill-slate-500 text-[12px]">
            {p.label === 'Baseline' ? 'Baseline' : p.label.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function HealthBoardDetail({
  detail,
  page,
  years,
  hrefFor,
  overviewHref,
  compareHref,
}: {
  detail: KpiDetail;
  page: KpiPage;
  years: number[];
  /** This KPI's page for another year or country. */
  hrefFor: (year: number, country: Country) => string;
  overviewHref: string;
  /** This KPI across every country. */
  compareHref: string;
}) {
  const { year, country, kpi } = detail;
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
          <p className="text-sm text-white/85">{page.description}</p>
          {page.note && <p className="text-[13px] text-white/70">{page.note}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <CountryNav country={country} href={(c) => hrefFor(year, c)} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card label={`Baseline ${year - 1}`}>
              {detail.baseline === null ? '-' : formatKpiValue(kpi.unit, detail.baseline)}
            </Card>
            <Card label="Target">{detail.targetWords ?? '-'}</Card>
            <Card label={`YTD ${year}`}>
              {detail.ytd === null ? (
                '-'
              ) : (
                <span className="inline-flex items-center gap-2">
                  {detail.status && (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: STATUS_FILL[detail.status] }}
                      title={STATUS_LABEL[detail.status]}
                      aria-label={STATUS_LABEL[detail.status]}
                    />
                  )}
                  {formatKpiValue(kpi.unit, detail.ytd)}
                </span>
              )}
            </Card>
            <Gauge detail={detail} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              {page.chartTitle} · {country}
              <span className="ml-2 font-normal text-slate-400">({kpi.unit})</span>
            </h2>
            <AreaChart detail={detail} title={page.chartTitle} />
          </div>
        </div>
      </div>
    </div>
  );
}
