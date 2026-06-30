'use client';

import Link from 'next/link';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon, EmptyState } from '../components/CatalogManagerUI';
import type { CatalogAnalyticsData, CatalogStatus } from '@/types/catalog-manager';
import { getStatusBadge } from '@/lib/catalog-manager-utils';

function Metric({ label, value, sub, icon, tone = 'green' }: { label: string; value: string; sub: string; icon: string; tone?: 'green' | 'amber' | 'ink' }) {
  const accent = tone === 'amber' ? 'bg-amber-500' : tone === 'ink' ? 'bg-slate-800' : 'bg-[#307c4c]';
  const chip = tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'ink' ? 'bg-slate-100 text-slate-700' : 'bg-[#307c4c]/10 text-[#307c4c]';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${chip}`}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function BarRow({ label, sub, value, max }: { label: string; sub?: string; value: number; max: number }) {
  return (
    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-slate-700">{label}</div>
        {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
      </div>
      <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-gradient-to-r from-[#6aaf8e] to-[#307c4c]" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="text-right text-[12.5px] font-semibold tabular-nums text-slate-900">{value}<span className="ml-1 font-normal text-slate-400">{value === 1 ? 'rate' : 'rates'}</span></span>
    </div>
  );
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
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.activeCount));
  const maxCty = Math.max(1, ...data.byCountry.map((c) => c.activeCount));
  const totalStatus = data.statusCounts.reduce((s, x) => s + x.count, 0) || 1;

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
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Catalog analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Rate coverage and price trends across {scope === 'ALL' ? 'all operating countries' : countries.find((c) => c.code === scope)?.name ?? scope}.</p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active rates" value={String(data.activeCount)} sub={`${data.supplierCount} suppliers`} icon="catalog" />
          <Metric label="Avg rate change" value={data.avgRateChangePct == null ? '—' : `${data.avgRateChangePct >= 0 ? '+' : ''}${data.avgRateChangePct.toFixed(1)}%`} sub="across re-priced entries" icon="trend" tone={data.avgRateChangePct != null && data.avgRateChangePct > 0 ? 'amber' : 'green'} />
          <Metric label="Pending approval" value={String(data.pendingCount)} sub={data.pendingCount ? 'awaiting sign-off' : 'queue clear'} icon="approve" tone="ink" />
          <Metric label="Expiring ≤ 30 days" value={String(data.expiringCount)} sub={data.expiringCount ? 'renew before they lapse' : 'nothing lapsing soon'} icon="clock" tone="amber" />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* spend by category */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-[15px] font-bold text-slate-900">Active rates by category</h2>
            {data.byCategory.length === 0 ? <EmptyState icon="layers" title="No active rates" /> : (
              <div className="space-y-3">
                {data.byCategory.slice(0, 8).map((c) => <BarRow key={c.name} label={c.name} sub={c.type ?? undefined} value={c.activeCount} max={maxCat} />)}
              </div>
            )}
          </div>

          {/* rates by country */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-[15px] font-bold text-slate-900">Active rates by country</h2>
            {data.byCountry.length === 0 ? <EmptyState icon="globe" title="No active rates" /> : (
              <div className="space-y-3">
                {data.byCountry.map((c) => <BarRow key={c.code} label={`${c.flag ?? ''} ${c.name}`.trim()} value={c.activeCount} max={maxCty} />)}
              </div>
            )}
          </div>
        </div>

        {/* status mix */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-[15px] font-bold text-slate-900">Catalog status mix</h2>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {data.statusCounts.map((s) => (
              <span key={s.status} className={getStatusBadge(s.status as CatalogStatus).dot} style={{ width: `${(s.count / totalStatus) * 100}%` }} title={`${s.status}: ${s.count}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {data.statusCounts.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-2 text-[12.5px] text-slate-600">
                <span className={`h-2 w-2 rounded-full ${getStatusBadge(s.status as CatalogStatus).dot}`} />
                {s.status} <span className="font-semibold tabular-nums text-slate-900">{s.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* rate movers */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                      <tr key={m.id} className="border-b border-slate-100 hover:bg-[#307c4c]/5">
                        <td className="px-4 py-3"><Link href={`/catalog-manager/catalog/${m.id}`} className="font-mono text-[12px] text-[#1d4f31] hover:underline">{m.code}</Link></td>
                        <td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium text-slate-800">{m.supplier_name}</div><div className="truncate text-[11px] text-slate-400">{m.commodity || m.item_name} · {m.country_code}</div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-500">{m.firstPrice.toLocaleString()} {m.currency_code}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-slate-900">{m.currentPrice.toLocaleString()} {m.currency_code}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-amber-600' : 'text-[#307c4c]'}`}>
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
