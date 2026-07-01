'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from './components/CatalogManagerShell';
import { Icon, Avatar, Chip, EmptyState } from './components/CatalogManagerUI';
import type { CatalogActor, CatalogManagerDashboardData } from '@/types/catalog-manager';
import { daysUntil, getPermissionProfile } from '@/lib/catalog-manager-utils';

const QUICK_SEARCHES = ['Drilling', 'Insurance', 'Cementing', 'Valves', 'Fuel', 'Inspection'];

type CatalogParams = Record<string, string | undefined>;

function catalogHref(scope: string, params: CatalogParams = {}) {
  const sp = new URLSearchParams();
  const country = params.country ?? (scope !== 'ALL' ? scope : undefined);
  if (country) sp.set('country', country);
  Object.entries(params).forEach(([key, value]) => {
    if (key !== 'country' && value) sp.set(key, value);
  });
  const query = sp.toString();
  return `/catalog-manager/catalog${query ? `?${query}` : ''}`;
}

function metricTone(tone: 'green' | 'amber' | 'ink' | 'cyan') {
  const tones = {
    green: {
      bar: 'from-[#6aaf8e] to-[#307c4c]',
      icon: 'bg-[#eaf4ef] text-[#1d4f31]',
      hover: 'hover:border-[#6aaf8e]',
    },
    amber: {
      bar: 'from-amber-400 to-amber-600',
      icon: 'bg-amber-50 text-amber-700',
      hover: 'hover:border-amber-300',
    },
    ink: {
      bar: 'from-slate-500 to-slate-900',
      icon: 'bg-slate-100 text-slate-700',
      hover: 'hover:border-slate-300',
    },
    cyan: {
      bar: 'from-cyan-400 to-sky-700',
      icon: 'bg-cyan-50 text-cyan-700',
      hover: 'hover:border-cyan-300',
    },
  };
  return tones[tone];
}

function MetricCard({
  label, value, sub, icon, tone = 'green', href,
}: { label: string; value: string; sub: string; icon: string; tone?: 'green' | 'amber' | 'ink' | 'cyan'; href: string }) {
  const t = metricTone(tone);
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${t.hover}`}>
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-400">{label}</p>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.icon}`}><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <p className="mt-4 text-3xl font-bold leading-none tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 truncate text-[12px] text-slate-500">{sub}</p>
    </Link>
  );
}

function HeroLink({
  href, icon, children, primary = false,
}: { href: string; icon: string; children: React.ReactNode; primary?: boolean }) {
  const classes = primary
    ? 'bg-[#307c4c] text-white shadow-sm shadow-[#307c4c]/25 hover:bg-[#2b6f44]'
    : 'border border-slate-200 bg-white text-slate-700 hover:border-[#6aaf8e] hover:text-slate-900';
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${classes}`}>
      <Icon name={icon} className="h-4 w-4" />
      {children}
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
  const router = useRouter();
  const [query, setQuery] = useState('');
  const profile = getPermissionProfile(actor.role);
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.count));
  const countryTiles = (scope === 'ALL' ? countries : countries.filter((c) => c.code === scope)).slice(0, 8);
  const topCategories = data.byCategory.slice(0, 4);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    router.push(catalogHref(scope, term ? { q: term } : {}));
  }

  function openQuickSearch(term: string) {
    router.push(catalogHref(scope, { q: term }));
  }

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
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-[#cfe4d8] bg-[linear-gradient(180deg,#eaf4ef_0%,#ffffff_72%)] shadow-sm">
          <div className="grid gap-8 px-5 py-8 sm:px-7 lg:grid-cols-[minmax(0,1fr)_410px] lg:px-8 lg:py-10">
            <div className="min-w-0">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#307c4c]/15 bg-white px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1d4f31]">
                <Icon name="catalog" className="h-3.5 w-3.5" />
                NESR Catalog Repo
              </div>
              <h1 className="max-w-[760px] text-[36px] font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-[44px]">
                Find approved supplier rates across countries in seconds.
              </h1>
              <p className="mt-4 max-w-[650px] text-[15px] leading-relaxed text-slate-600">
                Search active catalog entries, jump into country views, or load a spreadsheet-backed catalog migration for {data.scope}.
              </p>

              <form onSubmit={submitSearch} className="mt-7 flex max-w-[680px] items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg shadow-[#307c4c]/10 ring-1 ring-slate-200">
                <Icon name="search" className="h-5 w-5 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search supplier, catalog ID, item, category..."
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
                />
                <button type="submit" className="rounded-full bg-[#307c4c] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b6f44]">
                  Search
                </button>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[12.5px] text-slate-500">Popular:</span>
                {QUICK_SEARCHES.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => openQuickSearch(term)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition-colors hover:border-[#6aaf8e] hover:text-slate-900"
                  >
                    {term}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <HeroLink href={catalogHref(scope, { status: 'Active' })} icon="catalog" primary>Browse catalog</HeroLink>
                {actor.canCreate && <HeroLink href="/catalog-manager/catalog/import" icon="upload">Excel new entries</HeroLink>}
                {actor.canAdmin && <HeroLink href="/catalog-manager/admin" icon="admin">Catalog migration</HeroLink>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-[#307c4c]/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Live catalog</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{data.scope}</p>
                </div>
                <Chip tone={data.pendingCount ? 'amber' : 'green'}>
                  <Icon name={data.pendingCount ? 'clock' : 'check'} className="h-3 w-3" />
                  {data.pendingCount ? `${data.pendingCount} pending` : 'Clear queue'}
                </Chip>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#eaf4ef] p-3">
                  <p className="text-2xl font-bold leading-none text-[#1d4f31]">{data.activeCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-[#307c4c]">active rates</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3">
                  <p className="text-2xl font-bold leading-none text-slate-900">{data.supplierCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">suppliers</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-3">
                  <p className="text-2xl font-bold leading-none text-cyan-800">{data.categoryCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-cyan-700">categories</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {topCategories.length === 0 ? (
                  <EmptyState icon="layers" title="No active rates yet" />
                ) : topCategories.map((cat) => (
                  <Link key={cat.name} href={catalogHref(scope, { status: 'Active', category: cat.name })} className="block rounded-xl border border-slate-100 px-3 py-2.5 transition-colors hover:border-[#6aaf8e] hover:bg-[#f7fbf9]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[12.5px] font-semibold text-slate-700">{cat.name}</span>
                      <span className="font-mono text-[12px] font-semibold text-slate-900">{cat.count}</span>
                    </div>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-gradient-to-r from-[#6aaf8e] to-[#307c4c]" style={{ width: `${(cat.count / maxCat) * 100}%` }} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {countryTiles.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold tracking-tight text-slate-900">Jump to country catalog</h2>
              <Link href={catalogHref('ALL')} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1d4f31] hover:underline">
                All countries <Icon name="chevRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              {countryTiles.map((country) => (
                <Link
                  key={country.code}
                  href={catalogHref('ALL', { country: country.code })}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#6aaf8e] hover:shadow-md"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf4ef] text-[15px]">{country.flag ?? country.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-800">{country.name}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{country.code}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active rates" value={data.activeCount.toLocaleString()} sub={`Across ${data.categoryCount} categories`} icon="catalog" href={catalogHref(scope, { status: 'Active' })} />
          <MetricCard label="Suppliers" value={data.supplierCount.toLocaleString()} sub="With active rates" icon="building" tone="cyan" href="/catalog-manager/suppliers" />
          <MetricCard label="Expiring <= 30 days" value={data.expiringCount.toLocaleString()} sub={data.expiringCount ? 'Renew before they lapse' : 'Nothing lapsing soon'} icon="clock" tone="amber" href={catalogHref(scope, { expiring: '1' })} />
          <MetricCard label="Pending approval" value={data.pendingCount.toLocaleString()} sub={data.pendingCount ? 'Awaiting sign-off' : 'Queue is clear'} icon="approve" tone="ink" href={scope !== 'ALL' ? `/catalog-manager/approvals?country=${scope}` : '/catalog-manager/approvals'} />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)_minmax(320px,0.85fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-slate-900">By spend category</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">Active rates grouped by taxonomy.</p>
              </div>
              <Chip tone="green"><Icon name="layers" className="h-3 w-3" />{data.activeCount.toLocaleString()}</Chip>
            </div>
            {data.byCategory.length === 0 ? (
              <EmptyState icon="layers" title="No active rates yet" />
            ) : (
              <div className="space-y-3">
                {data.byCategory.slice(0, 7).map((category) => (
                  <Link key={category.name} href={catalogHref(scope, { status: 'Active', category: category.name })} className="grid grid-cols-[minmax(110px,180px)_1fr_38px] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#f7fbf9]">
                    <span className="truncate text-[12.5px] font-medium text-slate-600">{category.name}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-gradient-to-r from-[#6aaf8e] to-[#307c4c]" style={{ width: `${(category.count / maxCat) * 100}%` }} />
                    </span>
                    <span className="text-right text-[12.5px] font-semibold tabular-nums text-slate-900">{category.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-slate-900">Expiring soon</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">Rates needing renewal attention.</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">&lt;= 30 days</span>
            </div>
            {data.expiringSoon.length === 0 ? (
              <EmptyState icon="check" title="All current" />
            ) : (
              <div className="divide-y divide-slate-100">
                {data.expiringSoon.slice(0, 5).map((entry) => {
                  const days = daysUntil(entry.expiry_date) ?? 0;
                  return (
                    <Link key={entry.id} href={`/catalog-manager/catalog/${entry.id}`} className="flex items-center gap-3 rounded-lg py-2.5 transition-colors hover:bg-slate-50">
                      <span className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl font-bold leading-none ${days <= 7 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                        <span className="text-[13px] tabular-nums">{days}</span>
                        <span className="text-[7px] font-semibold uppercase">days</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-900">{entry.supplier_name}</span>
                        <span className="block truncate text-[11.5px] text-slate-400">{entry.country_flag} {entry.code} {entry.commodity ? `- ${entry.commodity}` : ''}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-slate-900">Recent activity</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">Latest catalog changes.</p>
              </div>
              <Link href="/catalog-manager/audit" className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#1d4f31] hover:underline">Log <Icon name="chevRight" className="h-3 w-3" /></Link>
            </div>
            <div className="divide-y divide-slate-100">
              {data.recent.slice(0, 6).map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 py-2">
                  <Avatar name={activity.user_name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-slate-700"><span className="font-semibold text-slate-900">{activity.user_name}</span> - {activity.detail}</p>
                    <p className="truncate text-[11px] text-slate-400">{activity.action} - {activity.target}</p>
                  </div>
                </div>
              ))}
              {data.recent.length === 0 && <p className="py-5 text-center text-[13px] text-slate-400">No activity yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </CatalogManagerShell>
  );
}
