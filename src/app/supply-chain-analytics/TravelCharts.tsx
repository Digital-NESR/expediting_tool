'use client';

/* ─── The Travel Portal tab's recharts pieces, kept to one module like
   /admin/po-analytics/charts.tsx — one import site to reach for if these are ever loaded on
   demand, and one place where the palette is decided. Everything that reads better as a
   labelled bar list is plain Tailwind in TravelAnalyticsClient.tsx instead. ─── */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LeadTimeBar, MonthGroup, ViolationMonth } from '@/lib/travel-analytics/queries';

export const GREEN = '#307c4c';

/* Enough distinct hues for the three policy types with room for a fourth the feed has not
   produced yet. Amber and red are reserved for "this is a breach", so nothing neutral uses
   them. */
export const PALETTE = ['#307c4c', '#6AAF8E', '#0e7490', '#58595B', '#7c3aed', '#9CA3AF'];

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const axisTick = { fontSize: 11, fill: '#64748b' };

/* ─── Spend by month, with the booking count beside it ───────────────────────
   Two axes on purpose. Spend alone cannot be read without the volume underneath it: June is
   the busiest month of the feed and one of the cheapest, because 28 of its 47 bookings are
   priced at $0. The line is what makes that visible rather than puzzling. */

export function SpendByMonthChart({ data }: { data: MonthGroup[] }) {
  const chartData = data.map((m) => ({
    label: m.label,
    spend: Math.round(m.totalUsd),
    bookings: m.bookings,
    priced: m.priced,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={axisTick} />
        <YAxis yAxisId="left" tick={axisTick} tickFormatter={(v: number) => usd(v)} width={70} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={axisTick}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          formatter={(value: unknown, name: unknown) =>
            name === 'spend'
              ? [usd(Number(value)), 'Spend']
              : [Number(value).toLocaleString(), 'Bookings']
          }
        />
        <Legend formatter={(v) => (v === 'spend' ? 'Spend (USD)' : 'Bookings')} />
        <Bar yAxisId="left" dataKey="spend" fill={GREEN} radius={[4, 4, 0, 0]} name="spend" />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="bookings"
          stroke="#0e7490"
          strokeWidth={2}
          dot={{ r: 3, fill: '#0e7490' }}
          name="bookings"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ─── Lead-time histogram ────────────────────────────────────────────────────
   The first bar is the 44 bookings created after their flight had already left, and it is
   amber rather than red because it is a data defect, not a traveller breaking a rule. The two
   bars inside the seven-day window are red: those ARE the rule being broken, and the reference
   line marks where the Travel Portal starts flagging them. */

export function LeadTimeHistogram({
  data,
  thresholdDays,
}: {
  data: LeadTimeBar[];
  thresholdDays: number;
}) {
  const firstCompliant = data.find((b) => !b.breachesPolicy && b.id !== 'negative');

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 10, bottom: 40, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ ...axisTick, fontSize: 10 }}
          angle={-20}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis tick={axisTick} allowDecimals={false} width={40} />
        <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString(), 'Bookings']} />
        {firstCompliant && (
          <ReferenceLine
            x={firstCompliant.label}
            stroke="#b45309"
            strokeDasharray="4 4"
            label={{
              value: `${thresholdDays}-day policy`,
              position: 'top',
              fill: '#b45309',
              fontSize: 11,
              fontWeight: 600,
            }}
          />
        )}
        <Bar dataKey="bookings" radius={[4, 4, 0, 0]}>
          {data.map((b) => (
            <Cell
              key={b.id}
              fill={b.breachesPolicy ? '#dc2626' : b.id === 'negative' ? '#f59e0b' : GREEN}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Policy violations by type over time ────────────────────────────────────
   Stacked, because the question is "is compliance getting worse", and three separate lines on
   counts this small read as noise. */

export function ViolationsOverTimeChart({
  data,
  types,
}: {
  data: ViolationMonth[];
  types: string[];
}) {
  const chartData = data.map((m) => ({
    label: m.label,
    ...Object.fromEntries(types.map((t) => [t, m.counts[t] ?? 0])),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={axisTick} />
        <YAxis tick={axisTick} allowDecimals={false} width={40} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {types.map((t, i) => (
          <Bar
            key={t}
            dataKey={t}
            stackId="violations"
            fill={PALETTE[i % PALETTE.length]}
            radius={i === types.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Carrier mix ────────────────────────────────────────────────────────────
   A horizontal bar rather than a pie: "Carrier not recorded" is the largest slice in today's
   feed, and a pie would make that look like an airline. */

export function CarrierMixChart({ data }: { data: { label: string; segments: number }[] }) {
  const top = data.slice(0, 10);
  const height = Math.max(220, top.length * 32 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={axisTick} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={160} tick={{ ...axisTick, fontSize: 10 }} />
        <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString(), 'Segments']} />
        <Bar dataKey="segments" radius={[0, 4, 4, 0]}>
          {top.map((c) => (
            /* The unnamed carrier is grey: it is a gap in the data, not a competitor. */
            <Cell key={c.label} fill={c.label.startsWith('Carrier not') ? '#9CA3AF' : GREEN} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
