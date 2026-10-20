'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayGroup } from '@/lib/travel-analytics/queries';

const GREEN = '#307c4c';
const BLUE = '#0e7490';
const axisTick = { fontSize: 11, fill: '#64748b' };

const usdFull = (n: number) => `$${Math.round(n).toLocaleString()}`;
const usdShort = (n: number) => {
  const v = Math.round(n);
  if (v === 0) return '';
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`;
  return `$${v}`;
};

export type Grain = 'day' | 'month' | 'quarter' | 'year';

const GRAINS: { id: Grain; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];

/** Range buttons, in days back from the newest bucket. `null` is everything. */
const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: '30', label: '30D', days: 30 },
  { id: '90', label: '90D', days: 90 },
  { id: '180', label: '6M', days: 180 },
  { id: '365', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Which bucket a date falls in, and what that bucket is called.
 *
 * Both derived from the same ISO date so a key and its label can never disagree, and the key
 * always sorts lexically — `2026-Q2` after `2026-Q1`, `2026-06` after `2026-05`.
 */
function bucketOf(iso: string, grain: Grain): { key: string; label: string } {
  const [y, m, d] = iso.split('-');
  const mi = Number(m) - 1;
  switch (grain) {
    case 'day':
      return { key: iso, label: `${d} ${MONTHS[mi] ?? m}` };
    case 'month':
      return { key: `${y}-${m}`, label: `${MONTHS[mi] ?? m} ${y.slice(2)}` };
    case 'quarter': {
      const q = Math.floor(mi / 3) + 1;
      return { key: `${y}-Q${q}`, label: `Q${q} ${y.slice(2)}` };
    }
    case 'year':
      return { key: y, label: y };
  }
}

/**
 * Spend over time, at whichever grain the question needs.
 *
 * Folded in the browser from daily buckets rather than asked of the server per grain. One
 * source means day, month, quarter and year can never disagree with each other, and switching
 * is instant — which matters, because the point of the control is to try the other grain and
 * see whether the shape holds.
 *
 * The brush under the chart is what makes `day` usable: 200-odd days do not fit on an axis,
 * and a chart that silently shows only the last thirty is worse than one you can drag.
 */
export default function SpendOverTime({ days, note }: { days: DayGroup[]; note: string }) {
  const [grain, setGrain] = useState<Grain>('month');
  const [range, setRange] = useState<string>('all');

  const windowed = useMemo(() => {
    const spec = RANGES.find((r) => r.id === range);
    if (!spec?.days || days.length === 0) return days;
    /* Counted back from the newest bucket IN THE DATA, not from today. This feed stops in
       October; "30D" measured from today would be empty and read as "no travel". */
    const newest = days[days.length - 1].date;
    const cutoff = new Date(`${newest}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - spec.days);
    const iso = cutoff.toISOString().slice(0, 10);
    return days.filter((d) => d.date >= iso);
  }, [days, range]);

  const rows = useMemo(() => {
    const buckets = new Map<
      string,
      { key: string; label: string; spend: number; bookings: number; priced: number }
    >();
    for (const d of windowed) {
      const { key, label } = bucketOf(d.date, grain);
      const row = buckets.get(key) ?? { key, label, spend: 0, bookings: 0, priced: 0 };
      row.spend += d.totalUsd;
      row.bookings += d.bookings;
      row.priced += d.priced;
      buckets.set(key, row);
    }
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [windowed, grain]);

  /* Labels on every bar stop being readable long before the bars do. Past this many buckets
     they are dropped rather than overlapped into a smear. */
  const showLabels = rows.length <= 16;
  const needsBrush = rows.length > 16;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Spend over time</h3>
          <p className="mt-0.5 text-xs text-slate-500">{note}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  range === r.id ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {GRAINS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGrain(g.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  grain === g.id ? 'text-white' : 'bg-white text-slate-500'
                }`}
                style={grain === g.id ? { background: GREEN } : undefined}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Nothing in this range. Try a wider one.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={needsBrush ? 330 : 300}>
          <ComposedChart
            data={rows}
            margin={{ top: 22, right: 10, bottom: needsBrush ? 0 : 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" />
            <YAxis
              yAxisId="left"
              tick={axisTick}
              tickFormatter={(v: number) => usdShort(v) || '$0'}
              width={62}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisTick}
              allowDecimals={false}
              width={38}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) =>
                name === 'spend'
                  ? [usdFull(Number(value)), 'Spend']
                  : [Number(value).toLocaleString(), 'Bookings']
              }
            />
            <Legend formatter={(v) => (v === 'spend' ? 'Spend (USD)' : 'Bookings')} />
            <Bar yAxisId="left" dataKey="spend" fill={GREEN} radius={[4, 4, 0, 0]} name="spend">
              {showLabels && (
                <LabelList
                  dataKey="spend"
                  position="insideTop"
                  offset={6}
                  fontSize={10}
                  fill="#ffffff"
                  formatter={(v: unknown) => usdShort(Number(v))}
                />
              )}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="bookings"
              stroke={BLUE}
              strokeWidth={2}
              dot={{ r: 3, fill: BLUE }}
              name="bookings"
            >
              {showLabels && (
                <LabelList
                  dataKey="bookings"
                  position="top"
                  offset={8}
                  fontSize={10}
                  fill={BLUE}
                  fontWeight={600}
                />
              )}
            </Line>
            {needsBrush && (
              <Brush
                dataKey="label"
                height={22}
                stroke={GREEN}
                fill="#f8fafc"
                travellerWidth={8}
                /* Opens on the most recent stretch rather than the whole span: the first
                   question of a long series is almost always "what happened lately". */
                startIndex={Math.max(0, rows.length - 30)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {!showLabels && rows.length > 0 && (
        <p className="mt-1 text-[10px] text-slate-400">
          Values are hidden at this many buckets; hover a bar, or switch to a coarser grain to read
          them.
        </p>
      )}
    </section>
  );
}
