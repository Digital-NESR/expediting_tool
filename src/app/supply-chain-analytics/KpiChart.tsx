'use client';

/* One KPI by month for one country: this year (NESR green, the series the page is about) against
   last year (slate, de-emphasised), with the target and the baseline as labelled reference lines.

   Following the dataviz rules used across the app: 2px lines, a 10% wash under this year, dots
   with a 2px surface ring, hairline solid gridlines, the last value labelled directly and every
   other value in the crosshair tooltip and in the table below the chart (tooltips never gate).
   The crosshair follows the pointer and the arrow keys. Scale from zero, fitted to every value
   shown (RULES.md). Palette checked with the dataviz validator: #307c4c vs #7b8798 passes CVD,
   normal-vision and contrast; the slate is intentionally low-chroma (de-emphasis). */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatKpiValue, formatWithUnit } from '@/lib/health-board/format';
import { scaleFor, ticksFor } from '@/lib/health-board/scale';
import type { KpiDefinition } from '@/lib/health-board/definitions';

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
const THIS = '#307c4c';
const LAST = '#7b8798';
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export interface Series {
  year: number;
  /** Twelve values, January to December; null where there is none. */
  values: (number | null)[];
}

export default function KpiChart({
  unit,
  title,
  thisYear,
  lastYear,
  target,
  targetWords,
  baseline,
  quarterly,
}: {
  /** Quarterly KPIs join their quarter-end points; monthly ones break at a missing month. */
  quarterly: boolean;
  unit: KpiDefinition['unit'];
  title: string;
  thisYear: Series;
  lastYear: Series | null;
  target: number | null;
  targetWords: string | null;
  baseline: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tableId = useId();
  /* Draw at the container's real width, so text stays 12px on a phone instead of being scaled
     down from a desktop-sized canvas. 1000 until measured (server render). */
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(300, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Months on the axis: January up to the last month either year has a value in. */
  const count = useMemo(() => {
    let last = -1;
    for (const s of [thisYear, lastYear]) {
      s?.values.forEach((v, i) => {
        if (v !== null) last = Math.max(last, i);
      });
    }
    return last + 1;
  }, [thisYear, lastYear]);

  if (count === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-slate-500">
        No monthly values for {thisYear.year}
        {lastYear ? ` or ${lastYear.year}` : ''}.
      </p>
    );
  }

  const W = width;
  const narrow = W < 560;
  const H = narrow ? 260 : 340;
  const pad = { l: narrow ? 44 : 64, r: narrow ? 64 : 120, t: 20, b: 36 };
  const all = [
    ...thisYear.values.slice(0, count),
    ...(lastYear?.values.slice(0, count) ?? []),
    target,
    baseline,
  ].filter((v): v is number => v !== null);
  const { lo, hi } = scaleFor(all);
  const step = count > 1 ? (W - pad.l - pad.r) / (count - 1) : 0;
  const x = (i: number) => (count > 1 ? pad.l + i * step : (pad.l + W - pad.r) / 2);
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / (hi - lo);

  /* A line through the months that have values; a gap breaks it (a missing month is not zero). */
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.slice(0, count).forEach((v, i) => {
      if (v === null) {
        if (!quarterly) pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'} ${x(i)} ${y(v)} `;
      pen = true;
    });
    return d.trim();
  };
  /* The wash under this year, per unbroken run. */
  const washes: string[] = [];
  let run: number[] = [];
  thisYear.values.slice(0, count).forEach((v, i) => {
    if (v !== null) run.push(i);
    if (((v === null && !quarterly) || i === count - 1) && run.length) {
      if (run.length > 1) {
        washes.push(
          `M ${x(run[0])} ${y(0)} ` +
            run.map((j) => `L ${x(j)} ${y(thisYear.values[j]!)}`).join(' ') +
            ` L ${x(run[run.length - 1])} ${y(0)} Z`,
        );
      }
      run = [];
    }
  });
  const lastIdx = thisYear.values
    .slice(0, count)
    .reduce<number>((a, v, i) => (v !== null ? i : a), -1);

  function pick(clientX: number) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((clientX - box.left) / box.width) * W;
    const i = count > 1 ? Math.round((vx - pad.l) / step) : 0;
    setHover(Math.max(0, Math.min(count - 1, i)));
  }

  const fmt = (v: number | null) => (v === null ? '–' : formatWithUnit(unit, v));

  /* Reference-line labels at the right edge, pushed apart when the lines are close. */
  let targetLabelY = target === null ? 0 : y(target) + 4;
  let baselineLabelY = baseline === null ? 0 : y(baseline) + 4;
  if (target !== null && baseline !== null && Math.abs(targetLabelY - baselineLabelY) < 15) {
    const mid = (targetLabelY + baselineLabelY) / 2;
    const targetAbove = y(target) <= y(baseline);
    targetLabelY = mid + (targetAbove ? -8 : 8);
    baselineLabelY = mid + (targetAbove ? 8 : -8);
  }
  const halo = {
    paintOrder: 'stroke' as const,
    stroke: '#fff',
    strokeWidth: 4,
    strokeLinejoin: 'round' as const,
  };
  const tipLeft = hover === null ? 0 : (x(hover) / W) * 100;

  return (
    <div>
      {/* Legend: always present with two series; reference lines keyed the way they are drawn */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: THIS }} />
          {thisYear.year}
        </span>
        {lastYear && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: LAST }} />
            {lastYear.year}
          </span>
        )}
        {target !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-slate-800" />
            Target {targetWords ?? fmt(target)}
          </span>
        )}
        {baseline !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dotted border-slate-400" />
            Baseline {fmt(baseline)}
          </span>
        )}
      </div>

      <div ref={frame} className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#307c4c]/40"
          role="img"
          aria-label={`${title}. The values are in the table below the chart.`}
          aria-describedby={tableId}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(count - 1, (h ?? -1) + 1));
            else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? count) - 1));
            else if (e.key === 'Escape') setHover(null);
          }}
        >
          {ticksFor(lo, hi).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
              <text
                x={pad.l - 10}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-slate-400 text-[12px] tabular-nums"
              >
                {Math.abs(hi - lo) >= 10_000 ? COMPACT.format(t) : t.toLocaleString('en-US')}
              </text>
            </g>
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />

          {/* Reference lines, labelled at the right edge */}
          {baseline !== null && (
            <g>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(baseline)}
                y2={y(baseline)}
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="2 4"
              />
              <text x={W - pad.r + 8} y={baselineLabelY} className="fill-slate-500 text-[12px]">
                Baseline
              </text>
            </g>
          )}
          {target !== null && (
            <g>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(target)}
                y2={y(target)}
                stroke="#1e293b"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={W - pad.r + 8}
                y={targetLabelY}
                className="fill-slate-800 text-[12px] font-semibold"
              >
                Target
              </text>
            </g>
          )}

          {/* Last year, behind */}
          {lastYear && (
            <>
              <path
                d={path(lastYear.values)}
                fill="none"
                stroke={LAST}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {lastYear.values
                .slice(0, count)
                .map((v, i) =>
                  v === null ? null : (
                    <circle
                      key={`l${i}`}
                      cx={x(i)}
                      cy={y(v)}
                      r={4}
                      fill={LAST}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ),
                )}
            </>
          )}

          {/* This year */}
          {washes.map((d, i) => (
            <path key={i} d={d} fill={THIS} fillOpacity={0.1} />
          ))}
          <path
            d={path(thisYear.values)}
            fill="none"
            stroke={THIS}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {thisYear.values
            .slice(0, count)
            .map((v, i) =>
              v === null ? null : (
                <circle
                  key={`t${i}`}
                  cx={x(i)}
                  cy={y(v)}
                  r={hover === i ? 5.5 : 4}
                  fill={THIS}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ),
            )}
          {/* The one direct value label: this year's latest month */}
          {lastIdx >= 0 && hover === null && (
            <text
              x={x(lastIdx)}
              y={y(thisYear.values[lastIdx]!) - 12}
              textAnchor="middle"
              className="fill-slate-800 text-[13px] font-semibold"
              style={halo}
            >
              {formatKpiValue(unit, thisYear.values[lastIdx]!)}
            </text>
          )}

          {/* Month axis */}
          {Array.from({ length: count }, (_, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 12}
              textAnchor="middle"
              className={`text-[12px] ${hover === i ? 'fill-slate-900 font-semibold' : 'fill-slate-500'}`}
            >
              {narrow && count > 6 && i % 2 === 1 && hover !== i ? '' : MONTHS[i].slice(0, 3)}
            </text>
          ))}

          {/* Crosshair */}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[170px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur"
            style={{ left: `${Math.min(Math.max(tipLeft, 12), 80)}%` }}
            role="status"
          >
            <p className="mb-1 font-semibold text-slate-500">{MONTHS[hover]}</p>
            <p className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-0.5 w-3 rounded" style={{ background: THIS }} />
                {thisYear.year}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {fmt(thisYear.values[hover])}
              </span>
            </p>
            {lastYear && (
              <p className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <span className="h-0.5 w-3 rounded" style={{ background: LAST }} />
                  {lastYear.year}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {fmt(lastYear.values[hover])}
                </span>
              </p>
            )}
            {target !== null && (
              <p className="mt-1 flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
                <span className="text-slate-500">Target</span>
                <span className="tabular-nums text-slate-700">{targetWords ?? fmt(target)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* The table twin: every value, without hovering */}
      <details className="mt-2 text-[12.5px]">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-800">
          Show the numbers
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table id={tableId} className="w-full border-collapse">
            <caption className="sr-only">{title}, by month</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1.5 pr-3 text-left font-medium">Year</th>
                {Array.from({ length: count }, (_, i) => (
                  <th key={i} className="px-2 py-1.5 text-right font-medium">
                    {MONTHS[i].slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[thisYear, ...(lastYear ? [lastYear] : [])].map((s) => (
                <tr key={s.year} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-slate-700">
                    {s.year}
                  </th>
                  {s.values.slice(0, count).map((v, i) => (
                    <td key={i} className="px-2 py-1.5 text-right tabular-nums text-slate-800">
                      {v === null ? '–' : formatKpiValue(unit, v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
