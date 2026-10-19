'use client';

import { useMemo, useState } from 'react';
import type { SpendGroup } from '@/lib/travel-analytics/queries';

const GREEN = '#307c4c';

/**
 * One chart for the four ways spend splits, instead of four charts.
 *
 * They were separate blocks that all answered "where did the money go" from a different angle,
 * which made the page long and the comparison impossible: a reader wanting to know whether the
 * KSA spend was one cost centre or spread across ten had to scroll between two charts and hold
 * the numbers in their head.
 *
 * TWO MODES. One dimension at a time reads like the chart it replaced. Comparing several puts
 * them side by side, grouped by rank rather than by value, which answers a different question:
 * how concentrated is each dimension. If the top country is 53% of spend and the top cost centre
 * is 9%, the money is spread thin inside a concentrated place, and that shows at a glance.
 */

export type Dimension = 'country' | 'costCentre' | 'segment' | 'company';

const LABELS: Record<Dimension, string> = {
  country: 'Country',
  costCentre: 'Cost centre',
  segment: 'Segment',
  company: 'Company',
};

/* One colour per dimension, used only in compare mode. Each is distinguishable from the others
   in greyscale as well as in colour, because a screenshot of this ends up in a deck. */
const TONES: Record<Dimension, string> = {
  country: GREEN,
  costCentre: '#1F5D9C',
  segment: '#8A6D2F',
  company: '#8E4585',
};

const usd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

export default function SpendByDimension({
  byCountry,
  byCostCentre,
  bySegment,
  byCompany,
  costCentresBeyondTop,
  note,
}: {
  byCountry: SpendGroup[];
  byCostCentre: SpendGroup[];
  bySegment: SpendGroup[];
  byCompany: SpendGroup[];
  costCentresBeyondTop: number;
  note: string;
}) {
  const [selected, setSelected] = useState<Dimension[]>(['country']);

  const series = useMemo(
    () =>
      ({
        country: byCountry,
        costCentre: byCostCentre,
        segment: bySegment,
        company: byCompany,
      }) as Record<Dimension, SpendGroup[]>,
    [byCountry, byCostCentre, bySegment, byCompany],
  );

  const compare = selected.length > 1;

  /* Every bar is drawn against the largest value ON SCREEN, not against each dimension's own
     maximum. Scaling each series to itself would make the top bar full width in all of them and
     silently claim four different totals were the same size. */
  const ceiling = useMemo(
    () => Math.max(1, ...selected.flatMap((d) => series[d].map((g) => g.totalUsd))),
    [selected, series],
  );

  const toggle = (d: Dimension) => {
    setSelected((prev) => {
      if (prev.includes(d)) {
        /* Never empty. An empty chart is not a view anybody chose, so the last one stays. */
        return prev.length === 1 ? prev : prev.filter((x) => x !== d);
      }
      return [...prev, d];
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Where the spend goes</h3>
          <p className="mt-0.5 text-xs text-slate-500">{note}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LABELS) as Dimension[]).map((d) => {
            const on = selected.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  on
                    ? 'border-transparent text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
                style={on ? { background: TONES[d] } : undefined}
              >
                {LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-3 text-[11px] text-slate-400">
        {compare
          ? 'Comparing by rank: the first bar of each dimension is its largest, and all bars share one scale.'
          : 'Click another dimension to compare them side by side.'}
      </p>

      <div className={compare ? 'grid gap-4 sm:grid-cols-2' : ''}>
        {selected.map((d) => {
          const rows = series[d];
          return (
            <div key={d}>
              {compare && (
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: TONES[d] }}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {LABELS[d]}
                  </span>
                </div>
              )}
              {rows.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Nothing to show for {LABELS[d].toLowerCase()}.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((g) => (
                    <li key={`${d}-${g.label}`} className="flex items-center gap-2">
                      <span
                        className="w-[38%] shrink-0 truncate text-[11px] text-slate-600"
                        title={g.sublabel ? `${g.label} · ${g.sublabel}` : g.label}
                      >
                        {g.label}
                      </span>
                      <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                        <span
                          className="absolute inset-y-0 left-0 rounded"
                          style={{
                            width: `${Math.max(1, (g.totalUsd / ceiling) * 100)}%`,
                            background: TONES[d],
                          }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-700">
                        {usd(g.totalUsd)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                        {g.bookings}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {d === 'costCentre' && costCentresBeyondTop > 0 && (
                <p className="mt-1.5 text-[10px] text-slate-400">
                  {costCentresBeyondTop} further cost{' '}
                  {costCentresBeyondTop === 1 ? 'centre' : 'centres'} below the top 15.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Bar is spend; the grey figure on the right is bookings.
      </p>
    </section>
  );
}
