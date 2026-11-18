'use client';

/* ─── The Sourcing Opportunities tab's recharts pieces, kept to one module like
   PurchaseOrderCharts.tsx and TravelCharts.tsx — one import site if these are ever loaded on
   demand, and one place where the palette is decided. Everything that reads better as a
   labelled row is plain Tailwind in SourcingBoard.tsx instead. ─── */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProjectType, SourcingSummary } from '@/lib/sourcing/types';

export const GREEN = '#307c4c';

/**
 * One hue per project type.
 *
 * Five categorical slots drawn from the platform's existing accents. Green carries
 * consolidation because that is the type with a hard savings number; amber and red are kept for
 * the two findings that are problems rather than prizes — leakage is money already lost, and
 * maverick buying is a compliance breach. Every use is accompanied by the type's name, so
 * identity never rests on colour alone.
 */
export const TYPE_TONE: Record<ProjectType, string> = {
  consolidation: GREEN,
  tender: '#0e7490',
  leakage: '#B34141',
  maverick: '#E09A4E',
  service: '#6B5A16',
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

/* ─── Identified savings by country ──────────────────────────────────────────
   Horizontal because country names are words, and a vertical axis would clip or rotate them.
   One series, one hue, so identity never rests on colour: every bar is named and the tooltip
   carries project count and spend alongside the saving. Height grows with the row count rather
   than squeezing, which is what makes a sixteen-country selection still readable. */
export function SavingsByCountry({ rows }: { rows: SourcingSummary['byCountry'] }) {
  const data = rows.filter((r) => r.savingsUsd > 0).slice(0, 12);

  if (!data.length) {
    return (
      <p className="py-12 text-center text-[13px] text-slate-400">
        No benchmarkable savings in this selection — every qualifying project is single-source.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="24%">
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          tickFormatter={(v: number) => usdCompact(v)}
        />
        <YAxis
          type="category"
          dataKey="country"
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
          width={108}
        />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            fontSize: 12,
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          }}
          formatter={(value: unknown, _name: unknown, item: unknown) => {
            const row = (item as { payload?: SourcingSummary['byCountry'][number] })?.payload;
            return [
              `${usdCompact(Number(value))} · ${row?.projects ?? 0} projects · ${usdCompact(row?.spendUsd ?? 0)} spend`,
              'Identified savings',
            ];
          }}
        />
        <Bar dataKey="savingsUsd" fill={GREEN} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
