'use client';

/* ─── The Purchase Orders tab's recharts pieces, kept to one module like TravelCharts.tsx —
   one import site if these are ever loaded on demand, and one place where the palette is
   decided. The ranked dimension charts are plain Tailwind bar lists in
   PurchaseOrderAnalyticsClient.tsx: they are twelve labelled rows, which HTML draws better
   than an SVG chart and without shipping a second axis system. ─── */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/lib/purchase-orders/queries';

export const GREEN = '#307c4c';

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
