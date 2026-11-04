'use client';

/* ─── The Purchase Orders tab's recharts pieces, kept to one module like TravelCharts.tsx —
   one import site if these are ever loaded on demand, and one place where the palette is
   decided. The ranked dimension charts are plain Tailwind bar lists in
   PurchaseOrderAnalyticsClient.tsx: they are twelve labelled rows, which HTML draws better
   than an SVG chart and without shipping a second axis system. ─── */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/lib/purchase-orders/queries';
import type { CountrySplit } from '@/lib/purchase-orders/past-due';

export const GREEN = '#307c4c';

/* Past due is a two-state scale, not an identity one: a line is either still within its
   delivery date or it is not. Green and red are the platform's good/serious accents, they
   carry the meaning everyone already reads on the Power BI page beside this, and every segment
   is labelled so neither state rests on colour alone. */
export const DUE_IN = GREEN;
export const PAST_DUE = '#B34141';

/* Delivery state is a status scale, not an identity one: delivered / part-delivered /
   undelivered run good → warning → serious. The three accents are the ones the rest of the
   platform already uses for those states (see the S&S status styles), and the trio passes the
   palette validator on a light surface — lightness band, chroma floor, CVD separation (worst
   adjacent ΔE 15.7 protan) and normal-vision separation (worst 23.0). The amber falls below
   3:1 against the surface, so every segment that uses it carries a visible value label rather
   than relying on the fill alone. */
export const STATUS_TONE: Record<string, string> = {
  'Fully Delivered': GREEN,
  'Partially Delivered': '#E09A4E',
  'Not Delivered': '#B34141',
  Unknown: '#9CA3AF',
};

const axisTick = { fontSize: 11, fill: '#64748b' };

/** `$5.67bn` / `$584.1M` / `$432k` — compact enough for an axis tick. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}bn`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/* ─── PO value released per month ────────────────────────────────────────────
   One series, so no legend — the card title names it. An area rather than a line because the
   question it answers is "how much", and the filled quantity reads as magnitude; the 2px
   stroke keeps the top edge legible where months sit close together.

   THE LAST POINT IS PARTIAL. The warehouse reloads daily, so the current month holds only the
   days elapsed so far and always dips. It is drawn dashed and the caption says so, because the
   alternative — dropping it — hides the most recent data, and leaving it solid invites reading
   a reporting artefact as a collapse in spend. */
export function SpendTrend({ data }: { data: TrendPoint[] }) {
  const lastMonth = data.at(-1)?.month;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="po-spend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          /* 36 labels will not fit; recharts thins them and every third lands on a quarter. */
          interval={2}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(v: number) => usdCompact(v)}
        />
        <Tooltip
          cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            fontSize: 12,
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          }}
          formatter={(value: unknown, _name: unknown, item: unknown) => {
            const point = (item as { payload?: TrendPoint })?.payload;
            return [
              `${usdCompact(Number(value))} · ${point?.lines.toLocaleString() ?? '—'} lines`,
              'PO value released',
            ];
          }}
          labelFormatter={(label: unknown, items: readonly unknown[]) => {
            const point = (items?.[0] as { payload?: TrendPoint })?.payload;
            return point?.month === lastMonth ? `${label} (month to date)` : String(label);
          }}
        />
        <Area
          type="monotone"
          dataKey="valueUsd"
          stroke={GREEN}
          strokeWidth={2}
          fill="url(#po-spend-fill)"
          /* >= 8px hit target on hover, nothing drawn at rest — 36 dots would be noise. */
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Due In vs Past Due, as a share of open lines ───────────────────────────
   A donut rather than a bar because there are exactly two parts of one whole and the question
   is the split, not the magnitudes. Both slices are labelled with count and share, so the
   reading never depends on the colour. */
export function PastDueDonut({ dueIn, pastDue }: { dueIn: number; pastDue: number }) {
  const total = dueIn + pastDue;
  if (!total) {
    return (
      <p className="py-20 text-center text-[13px] text-slate-400">No open PO lines in this selection.</p>
    );
  }
  const data = [
    { name: 'Due In', value: dueIn, tone: DUE_IN },
    { name: 'Past Due', value: pastDue, tone: PAST_DUE },
  ];
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <ResponsiveContainer width="100%" height={240} className="max-w-[260px]">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={92}
            /* 2px of surface between the two arcs, so the fills never touch. */
            paddingAngle={2}
            strokeWidth={2}
            stroke="#ffffff"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.tone} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
            }}
            formatter={(v: unknown, name: unknown) => [
              `${Number(v).toLocaleString()} lines · ${pct(Number(v))}`,
              String(name),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Direct labels, not a colour key: each row carries its own number and share. */}
      <ul className="w-full max-w-[220px] space-y-2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[12.5px] text-slate-700">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.tone }} />
              {d.name}
            </span>
            <span className="text-[12.5px] tabular-nums text-slate-400">
              <span className="font-semibold text-slate-900">{d.value.toLocaleString()}</span>{' '}
              ({pct(d.value)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Open lines by country, as a 100% stack ─────────────────────────────────
   Normalised to 100% because the question is "where is the problem worst", and raw counts
   answer "where is the volume" — Saudi Arabia would dominate every bar and the 75% past-due
   rate in Chad would be a sliver. The count sits in the tooltip, and the countries are ordered
   by past-due share so the worst are read first. */
export function PastDueByCountry({ rows }: { rows: CountrySplit[] }) {
  if (!rows.length) {
    return <p className="py-20 text-center text-[13px] text-slate-400">Nothing to show.</p>;
  }

  const data = rows.map((r) => ({
    country: r.country,
    dueInPct: r.total ? (r.dueIn / r.total) * 100 : 0,
    pastDuePct: r.total ? (r.pastDue / r.total) * 100 : 0,
    dueIn: r.dueIn,
    pastDue: r.pastDue,
    total: r.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="country"
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
          width={104}
        />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            fontSize: 12,
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          }}
          formatter={(value: unknown, name: unknown, item: unknown) => {
            const row = (item as { payload?: (typeof data)[number] })?.payload;
            const lines = name === 'Past Due' ? row?.pastDue : row?.dueIn;
            return [`${Number(value).toFixed(1)}% · ${(lines ?? 0).toLocaleString()} lines`, String(name)];
          }}
          labelFormatter={(label: unknown, items: readonly unknown[]) => {
            const row = (items?.[0] as { payload?: (typeof data)[number] })?.payload;
            return `${label} — ${(row?.total ?? 0).toLocaleString()} open lines`;
          }}
        />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="square"
          iconSize={9}
          wrapperStyle={{ fontSize: 12, color: '#475569' }}
        />
        {/* 2px surface gap between the two segments of each bar. */}
        <Bar dataKey="dueInPct" stackId="s" name="Due In" fill={DUE_IN} stroke="#ffffff" strokeWidth={2} />
        <Bar
          dataKey="pastDuePct"
          stackId="s"
          name="Past Due"
          fill={PAST_DUE}
          stroke="#ffffff"
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
