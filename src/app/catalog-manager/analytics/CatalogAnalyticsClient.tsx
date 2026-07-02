'use client';

import Link from 'next/link';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon, EmptyState, StatCard, Card, CardHeader } from '../components/CatalogManagerUI';
import type { CatalogAnalyticsData } from '@/types/catalog-manager';

const GREEN = '#307c4c';
const GREEN_LIGHT = '#6aaf8e';
const GREEN_PALE = '#c5e0d2';

const STATUS_COLORS: Record<string, string> = {
  Active: GREEN,
  'Pending Approval': '#f59e0b',
  Draft: '#94a3b8',
  Expired: '#cbd5e1',
  Rejected: '#ef4444',
};

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
  fontSize: 12.5,
  padding: '8px 12px',
} as const;

function truncateLabel(v: string, n = 20) {
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}

export default function CatalogAnalyticsClient({
  data, scope, countries, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  data: CatalogAnalyticsData;
  scope: string;
  countries: ScopeCountry[];
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const catData = data.byCategory.slice(0, 8).map((c) => ({ name: c.name, type: c.type ?? '', count: c.activeCount }));
  const ctyData = data.byCountry.map((c) => ({ name: `${c.flag ?? ''} ${c.code}`.trim(), fullName: c.name, count: c.activeCount }));
  const statusData = data.statusCounts.map((s) => ({ name: s.status, value: s.count, fill: STATUS_COLORS[s.status] ?? '#94a3b8' }));
  const totalStatus = data.statusCounts.reduce((s, x) => s + x.count, 0);

  return (
    <CatalogManagerShell
      title="Analytics"
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      scope={scope}
      countries={countries}
    >
      <div className="cm-stagger space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Catalog analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Rate coverage and price trends across {scope === 'ALL' ? 'all operating countries' : countries.find((c) => c.code === scope)?.name ?? scope}.</p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active rates" value={String(data.activeCount)} sub={`${data.supplierCount} suppliers`} icon="catalog" />
          <StatCard
            label="Avg rate change"
            value={data.avgRateChangePct == null ? '—' : `${data.avgRateChangePct >= 0 ? '+' : ''}${data.avgRateChangePct.toFixed(1)}%`}
            sub="across re-priced entries"
            icon="trend"
            tone={data.avgRateChangePct != null && data.avgRateChangePct > 0 ? 'amber' : 'green'}
          />
          <StatCard label="Pending approval" value={String(data.pendingCount)} sub={data.pendingCount ? 'awaiting sign-off' : 'queue clear'} icon="approve" tone="ink" />
          <StatCard label="Expiring ≤ 30 days" value={String(data.expiringCount)} sub={data.expiringCount ? 'renew before they lapse' : 'nothing lapsing soon'} icon="clock" tone="amber" />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* active rates by category — horizontal bars */}
          <Card className="p-5">
            <CardHeader className="mb-4" title="Active rates by category" sub="Top categories by active rate count." />
            {catData.length === 0 ? <EmptyState icon="layers" title="No active rates" /> : (
              <div style={{ height: Math.max(220, catData.length * 42) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ fontSize: 11.5, fill: '#475569' }}
                      tickFormatter={(v: string) => truncateLabel(v)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(48,124,76,0.05)' }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${value} active rates`, '']}
                      labelFormatter={(label) => String(label)}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                      {catData.map((_, i) => <Cell key={i} fill={i === 0 ? GREEN : i < 3 ? GREEN_LIGHT : GREEN_PALE} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* active rates by country — vertical bars */}
          <Card className="p-5">
            <CardHeader className="mb-4" title="Active rates by country" sub="Coverage of the catalog per operating country." />
            {ctyData.length === 0 ? <EmptyState icon="globe" title="No active rates" /> : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ctyData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(48,124,76,0.05)' }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${value} active rates`, '']}
                      labelFormatter={(_, payload) => (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ''}
                    />
                    <Bar dataKey="count" fill={GREEN} radius={[6, 6, 0, 0]} barSize={34}>
                      {ctyData.map((_, i) => <Cell key={i} fill={i % 2 ? GREEN_LIGHT : GREEN} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        {/* status mix — donut + legend */}
        <Card className="p-5">
          <CardHeader className="mb-2" title="Catalog status mix" sub={`${totalStatus.toLocaleString()} entries across all statuses.`} />
          {statusData.length === 0 ? <EmptyState icon="chart" title="No entries yet" /> : (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="relative h-[190px] w-[190px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={2}
                      strokeWidth={2}
                      stroke="#ffffff"
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value} entries`, String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{totalStatus.toLocaleString()}</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">entries</span>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.fill }} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">{s.name}</span>
                    <span className="text-[13px] font-bold tabular-nums text-slate-900">{s.value}</span>
                    <span className="w-11 text-right text-[11px] tabular-nums text-slate-400">{totalStatus ? Math.round((s.value / totalStatus) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* rate movers */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-[15px] font-bold text-slate-900">Biggest rate movers</h2>
            <span className="text-[11px] text-slate-400">first vs. current price · re-priced entries</span>
          </div>
          {data.topMovers.length === 0 ? (
            <EmptyState icon="trend" title="No re-priced entries yet" sub="Entries with more than one rate version will show their price trend here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Supplier / item</th>
                    <th className="px-4 py-3 text-right">First</th>
                    <th className="px-4 py-3 text-right">Current</th>
                    <th className="px-4 py-3 text-right">Change</th>
                    <th className="px-4 py-3 text-center">Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMovers.map((m) => {
                    const up = m.changePct >= 0;
                    return (
                      <tr key={m.id} className="border-b border-slate-100 transition-colors hover:bg-[#307c4c]/5">
                        <td className="px-4 py-3"><Link href={`/catalog-manager/catalog/${m.id}`} className="font-mono text-[12px] text-[#1d4f31] hover:underline">{m.code}</Link></td>
                        <td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium text-slate-800">{m.supplier_name}</div><div className="truncate text-[11px] text-slate-400">{m.commodity || m.item_name} · {m.country_code}</div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-500">{m.firstPrice.toLocaleString()} {m.currency_code}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-slate-900">{m.currentPrice.toLocaleString()} {m.currency_code}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${up ? 'bg-amber-50 text-amber-600' : 'bg-[#307c4c]/10 text-[#307c4c]'}`}>
                            <Icon name="trend" className={`h-3.5 w-3.5 ${up ? '' : '-scale-y-100'}`} />
                            {up ? '+' : ''}{m.changePct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-slate-500">{m.versions}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CatalogManagerShell>
  );
}
