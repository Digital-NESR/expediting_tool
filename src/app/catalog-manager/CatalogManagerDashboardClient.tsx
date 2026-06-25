'use client';

import Link from 'next/link';
import CatalogManagerShell, { type ScopeCountry } from './components/CatalogManagerShell';
import { Icon, Avatar, Chip, EmptyState } from './components/CatalogManagerUI';
import type { CatalogActor, CatalogManagerDashboardData } from '@/types/catalog-manager';
import { daysUntil, getPermissionProfile } from '@/lib/catalog-manager-utils';

function MetricCard({
  label, value, sub, icon, tone = 'green', href,
}: { label: string; value: string; sub: string; icon: string; tone?: 'green' | 'amber' | 'ink'; href: string }) {
  const accent = tone === 'amber' ? 'bg-amber-500' : tone === 'ink' ? 'bg-slate-800' : 'bg-[#307c4c]';
  const chip = tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'ink' ? 'bg-slate-100 text-slate-700' : 'bg-[#307c4c]/10 text-[#307c4c]';
  return (
    <Link href={href} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{label}</p>
        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${chip}`}><Icon name={icon} className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-slate-400">{sub}</p>
    </Link>
  );
}

export default function CatalogManagerDashboardClient({
  data, actor, scope, countries,
}: {
  data: CatalogManagerDashboardData;
  actor: CatalogActor;
  scope: string;
  countries: ScopeCountry[];
}) {
  const profile = getPermissionProfile(actor.role);
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.count));
  const catHref = (extra = '') => `/catalog-manager/catalog${scope !== 'ALL' ? `?country=${scope}${extra}` : extra ? `?${extra.replace(/^&/, '')}` : ''}`;

  return (
    <CatalogManagerShell
      title="Dashboard"
      roleLabel={profile.description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={data.pendingCount}
      scope={scope}
      countries={countries}
      headerAction={
        actor.canCreate ? (
          <Link href="/catalog-manager/catalog/add" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2b6f44]">
            <Icon name="plus" className="h-4 w-4" /> <span className="hidden sm:inline">Add entries</span>
          </Link>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* compact hero strip */}
        <section className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-4 py-3 text-white shadow-sm shadow-[#307c4c]/20">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icon name="catalog" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight">NESR Catalog Manager</h1>
            <p className="truncate text-[12px] text-white/75">Approved supplier rates for {data.scope}, segmented by country &amp; spend category.</p>
          </div>
        </section>

        {/* metric cards */}
        <section className="grid grid-cols-4 gap-2.5">
          <MetricCard label="Active rates" value={String(data.activeCount)} sub={`${data.supplierCount} suppliers · ${data.categoryCount} categories`} icon="catalog" href={catHref('&status=Active')} />
          <MetricCard label="Expiring ≤ 30 days" value={String(data.expiringCount)} sub={data.expiringCount ? 'Renew before they lapse' : 'Nothing lapsing soon'} icon="clock" tone="amber" href={catHref('&expiring=1')} />
          <MetricCard label="Pending approval" value={String(data.pendingCount)} sub={data.pendingCount ? 'Awaiting sign-off' : 'Queue is clear'} icon="approve" tone="ink" href={`/catalog-manager/approvals${scope !== 'ALL' ? `?country=${scope}` : ''}`} />
          <MetricCard label="Total active value" value={`$${(data.totalActiveUsd / 1000).toFixed(0)}k`} sub="USD equivalent, annualized" icon="money" href={catHref('&status=Active')} />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* category breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13.5px] font-bold text-slate-900">By spend category</h2>
              <Chip tone="green"><Icon name="layers" className="h-3 w-3" />{data.activeCount}</Chip>
            </div>
            {data.byCategory.length === 0 ? (
              <EmptyState icon="layers" title="No active rates yet" />
            ) : (
              <div className="space-y-2">
                {data.byCategory.slice(0, 5).map((c) => (
                  <Link key={c.name} href={catHref('&status=Active')} className="grid grid-cols-[110px_1fr_22px] items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-slate-600">{c.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-gradient-to-r from-[#6aaf8e] to-[#307c4c]" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                    </span>
                    <span className="text-right text-[12px] font-semibold tabular-nums text-slate-900">{c.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* expiring soon */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13.5px] font-bold text-slate-900">Expiring soon</h2>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">≤ 30 days</span>
            </div>
            {data.expiringSoon.length === 0 ? (
              <EmptyState icon="check" title="All current" />
            ) : (
              <div className="divide-y divide-slate-100">
                {data.expiringSoon.slice(0, 4).map((e) => {
                  const d = daysUntil(e.expiry_date) ?? 0;
                  return (
                    <Link key={e.id} href={`/catalog-manager/catalog/${e.id}`} className="flex items-center gap-2.5 rounded-lg py-2 transition-colors hover:bg-slate-50">
                      <span className={`flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg font-bold leading-none ${d <= 7 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                        <span className="text-[12px] tabular-nums">{d}</span>
                        <span className="text-[7px] font-semibold">days</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-slate-900">{e.supplier_name}</span>
                        <span className="block truncate text-[10.5px] text-slate-400">{e.country_flag} {e.code}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* recent activity */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13.5px] font-bold text-slate-900">Recent activity</h2>
              <Link href="/catalog-manager/audit" className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#1d4f31] hover:underline">Log <Icon name="chevRight" className="h-3 w-3" /></Link>
            </div>
            <div className="divide-y divide-slate-100">
              {data.recent.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 py-1.5">
                  <Avatar name={a.user_name} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-slate-700"><span className="font-semibold text-slate-900">{a.user_name}</span> · {a.detail}</p>
                    <p className="truncate text-[10.5px] text-slate-400">{a.action} · {a.target}</p>
                  </div>
                </div>
              ))}
              {data.recent.length === 0 && <p className="py-5 text-center text-[13px] text-slate-400">No activity yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </CatalogManagerShell>
  );
}
