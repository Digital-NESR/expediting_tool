'use client';

import { displayStatus, money, statusStyle } from '../lib/helpers';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { RegistryRecord } from '../lib/types';

const SHADES = [
  '#1D5B39',
  '#2A7E4F',
  '#3D8F60',
  '#4F9C70',
  '#6AAF8E',
  '#87C1A5',
  '#A6D2BC',
  '#C5E0D2',
];
const ALL_STATUSES = [
  'Draft',
  'Pending Level 1',
  'Pending Level 2',
  'Active',
  'Extended',
  'Expiring soon',
  'Expired',
  'Rejected',
] as const;

function aggregate(records: RegistryRecord[], keyFn: (r: RegistryRecord) => string[]) {
  const m: Record<string, number> = {};
  records.forEach((r) => {
    keyFn(r).forEach((k) => {
      m[k] = (m[k] || 0) + r.spend;
    });
  });
  const arr = Object.keys(m)
    .map((k) => ({ name: k, v: m[k] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);
  const max = arr.length ? arr[0].v : 1;
  return arr.map((x, i) => ({
    name: x.name,
    label: money(x.v),
    pct: Math.round((x.v / max) * 100) + '%',
    color: SHADES[i] || '#C5E0D2',
  }));
}

/** KPI accents. The bar and the figure share a colour. */
const ACCENT = {
  green: { bar: 'bg-[#307c4c]', text: 'text-[#307c4c]' },
  dark: { bar: 'bg-[#1d4f31]', text: 'text-[#1d4f31]' },
  mint: { bar: 'bg-[#6AAF8E]', text: 'text-[#3D8F60]' },
} as const;

export default function DashboardScreen({ app }: { app: RegistryApp }) {
  const all = app.records.map((r) => ({ r, s: displayStatus(r) }));
  const active = app.records.filter((r) =>
    ['Active', 'Extended', 'Expiring soon'].includes(displayStatus(r)),
  );
  const expiredRecs = app.records.filter((r) => displayStatus(r) === 'Expired');
  const expiredSpend = expiredRecs.reduce((a, r) => a + r.spend, 0);
  const totalSpend = active.reduce((a, r) => a + r.spend, 0);
  const sgl = active.filter((r) => r.cls === 'SGL');
  const sol = active.filter((r) => r.cls === 'SOL');

  const kpis = [
    {
      label: 'Valid IDs',
      value: active.length,
      sub: `across ${new Set(active.map((r) => r.country)).size} countries`,
      accent: ACCENT.green,
    },
    {
      label: 'Covered spend',
      value: money(totalSpend),
      sub: expiredRecs.length
        ? `excludes ${money(expiredSpend)} now expired`
        : 'annual, single + sole source',
      accent: ACCENT.green,
    },
    {
      label: 'Single-source',
      value: sgl.length,
      sub: money(sgl.reduce((a, r) => a + r.spend, 0)),
      accent: ACCENT.dark,
    },
    {
      label: 'Sole-source',
      value: sol.length,
      sub: money(sol.reduce((a, r) => a + r.spend, 0)),
      accent: ACCENT.mint,
    },
  ];

  const charts = [
    {
      title: 'Covered spend by country',
      note: 'top 8, annual USD',
      bars: aggregate(active, (r) => [r.country]),
    },
    {
      title: 'Covered spend by category',
      note: 'top 8, annual USD',
      bars: aggregate(active, (r) => Array.from(new Set(r.nodes.map((n) => n.cat)))),
    },
    {
      title: 'Covered spend by segment',
      note: 'top 8, annual USD',
      bars: aggregate(active, (r) => r.segments),
    },
    {
      title: 'Covered spend by reason code',
      note: 'all reason codes',
      bars: aggregate(active, (r) => [r.reason]),
    },
  ];

  const statusDist = ALL_STATUSES.map((s) => {
    const list = all.filter((x) => x.s === s);
    return {
      name: s,
      count: list.length,
      spend: money(list.reduce((a, x) => a + x.r.spend, 0)) + ' spend',
      color: statusStyle(s)[2],
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Leadership Dashboard</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
            Where NESR is structurally dependent on a single vendor, by country, category and
            segment.
          </p>
        </div>
        <button
          type="button"
          onClick={app.exportCsv}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
        >
          Export to Excel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className={`h-1 ${k.accent.bar}`} />
            <div className="px-4 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {k.label}
              </p>
              <p className={`mt-1 text-2xl font-bold leading-tight ${k.accent.text}`}>{k.value}</p>
              <p className="mt-1 text-[11.5px] text-slate-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {charts.map((c) => (
          <div
            key={c.title}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <span className="text-[13px] font-bold text-slate-800">{c.title}</span>
              <span className="text-[11px] text-slate-400">{c.note}</span>
            </div>
            <div className="space-y-2.5 px-4 py-3.5">
              {c.bars.map((b) => (
                <div key={b.name}>
                  <div className="mb-1 flex justify-between gap-3 text-[12px]">
                    <span className="truncate font-semibold text-slate-700">{b.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{b.label}</span>
                  </div>
                  {/* Bar colours come from the green ramp above, so they stay
                      inline rather than becoming eight Tailwind classes. */}
                  <div className="h-3 overflow-hidden rounded bg-slate-100">
                    <div className="h-full" style={{ width: b.pct, background: b.color }} />
                  </div>
                </div>
              ))}
              {c.bars.length === 0 && (
                <p className="py-4 text-center text-[12px] text-slate-400">Nothing to chart yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-[13px] font-bold text-slate-800">
          Status distribution
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
          {statusDist.map((s) => (
            <div key={s.name} className="border-b border-r border-slate-100 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate text-[11.5px] font-bold text-slate-500">{s.name}</span>
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">{s.count}</div>
              <div className="text-[11px] text-slate-400">{s.spend}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
