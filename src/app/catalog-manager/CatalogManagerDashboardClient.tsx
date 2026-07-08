'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from './components/CatalogManagerShell';
import { Icon, Avatar, Chip, EmptyState, StatCard, Card, CardHeader, Meter, Spinner, StatusPill } from './components/CatalogManagerUI';
import { globalCatalogSearch, type GlobalSearchResult } from '@/app/actions/catalog-manager';
import type { CatalogActor, CatalogManagerDashboardData } from '@/types/catalog-manager';
import { daysUntil, getPermissionProfile } from '@/lib/catalog-manager-utils';

const QUICK_SEARCHES = ['Drilling', 'Insurance', 'Cementing', 'Valves', 'Fuel', 'Inspection'];
const EMPTY_SEARCH: GlobalSearchResult = { entries: [], suppliers: [], pir: [] };
const pirSearchHref = (p: GlobalSearchResult['pir'][number]) =>
  `/catalog-manager/pir?q=${encodeURIComponent(p.product_number || p.info_record_number)}`;

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

function HeroLink({
  href, icon, children, primary = false,
}: { href: string; icon: string; children: React.ReactNode; primary?: boolean }) {
  const classes = primary
    ? 'bg-[#307c4c] text-white shadow-sm shadow-[#307c4c]/25 hover:bg-[#2b6f44] active:scale-[0.98]'
    : 'border border-slate-200 bg-white text-slate-700 hover:border-[#6aaf8e] hover:text-slate-900 active:scale-[0.98]';
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${classes}`}>
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
  const [res, setRes] = useState<GlobalSearchResult>(EMPTY_SEARCH);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const profile = getPermissionProfile(actor.role);
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.count));
  const countryTiles = (scope === 'ALL' ? countries : countries.filter((c) => c.code === scope)).slice(0, 8);
  const topCategories = data.byCategory.slice(0, 4);
  const hasResults = res.entries.length > 0 || res.suppliers.length > 0 || res.pir.length > 0;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function runSearch(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    const term = v.trim();
    if (term.length < 2) { setRes(EMPTY_SEARCH); setLoading(false); setOpen(false); return; }
    setLoading(true);
    setOpen(true);
    timer.current = setTimeout(async () => {
      const r = await globalCatalogSearch(term);
      setRes(r);
      setLoading(false);
    }, 200);
  }

  function go(href: string) { setOpen(false); router.push(href); }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    // Enter goes to the services catalog list (with the term); the dropdown covers PIR + direct hits.
    router.push(catalogHref(scope, term ? { q: term } : {}));
  }

  function openQuickSearch(term: string) {
    runSearch(term);
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
          <Link href="/catalog-manager/catalog/add" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98]">
            <Icon name="plus" className="h-4 w-4" /> <span className="hidden sm:inline">Add entries</span>
          </Link>
        ) : null
      }
    >
      <div className="cm-stagger space-y-6">
        {/* ── Hero: full-height, search-first landing (scroll down for insights) ── */}
        {/* NOTE: no overflow-hidden here — the live search dropdown must be free to overlay below. */}
        <section className="relative flex min-h-[calc(100dvh-7rem)] flex-col rounded-3xl border border-[#cfe4d8] bg-[linear-gradient(180deg,#eaf4ef_0%,#ffffff_72%)] shadow-sm">
          {/* decorations clipped to the rounded card, kept separate from the content layer */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
            <div
              className="absolute inset-0 text-[#307c4c] opacity-[0.04]"
              style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }}
            />
            <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-[#6aaf8e]/20 blur-3xl" />
          </div>
          <div className="relative grid w-full flex-1 items-center gap-8 px-5 py-8 sm:px-7 lg:grid-cols-[minmax(0,1fr)_410px] lg:px-8 lg:py-10">
            <div className="min-w-0">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#307c4c]/15 bg-white px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1d4f31] shadow-sm">
                <Icon name="catalog" className="h-3.5 w-3.5" />
                NESR Catalog Repo
              </div>
              <h1 className="max-w-[760px] text-[36px] font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-[44px]">
                Find approved supplier rates across countries{' '}
                <span className="bg-gradient-to-r from-[#307c4c] to-[#6aaf8e] bg-clip-text text-transparent">in seconds.</span>
              </h1>
              <p className="mt-4 max-w-[650px] text-[15px] leading-relaxed text-slate-600">
                Search active catalog entries, jump into country views, or load a spreadsheet-backed catalog migration for {data.scope}.
              </p>

              <div ref={searchBox} className="relative z-20 mt-7 max-w-[680px]">
                <form onSubmit={submitSearch} className="flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 shadow-lg shadow-[#307c4c]/10 ring-1 ring-slate-200 backdrop-blur-sm transition-shadow duration-300 focus-within:shadow-xl focus-within:shadow-[#307c4c]/15 focus-within:ring-2 focus-within:ring-[#307c4c]/25">
                  <Icon name="search" className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => runSearch(e.target.value)}
                    onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
                    placeholder="Search services catalog & PIR — supplier, item, material, ID..."
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
                  />
                  {loading && <Spinner className="h-4 w-4 shrink-0 text-slate-300" />}
                  <button type="submit" className="rounded-full bg-[#307c4c] px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.97]">
                    Search
                  </button>
                </form>

                {/* live combined results — services catalog, suppliers, PIR / inventory */}
                {open && query.trim().length >= 2 && (
                  <div className="cm-scale-in absolute left-0 right-0 top-full z-30 mt-2 max-h-[62vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 text-left shadow-2xl shadow-slate-950/15">
                    {loading && !hasResults ? (
                      <p className="px-4 py-6 text-center text-[13px] text-slate-400">Searching…</p>
                    ) : !hasResults ? (
                      <p className="px-4 py-6 text-center text-[13px] text-slate-400">No matches for “{query.trim()}”.</p>
                    ) : (
                      <>
                        {res.entries.length > 0 && (
                          <div className="px-2">
                            <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Services catalog</p>
                            {res.entries.map((e) => (
                              <button key={e.id} type="button" onClick={() => go(`/catalog-manager/catalog/${e.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#307c4c]/5">
                                <span className="font-mono text-[11px] text-slate-400">{e.code}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-slate-800">{e.label}</span>
                                  <span className="block truncate text-[11px] text-slate-400">{e.supplier_name} · {e.country_code}</span>
                                </span>
                                <StatusPill status={e.status} sm />
                              </button>
                            ))}
                          </div>
                        )}
                        {res.pir.length > 0 && (
                          <div className="px-2 pt-1">
                            <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">PIR / Inventory</p>
                            {res.pir.map((p, i) => (
                              <button key={`${p.info_record_number}-${p.product_number}-${i}`} type="button" onClick={() => go(pirSearchHref(p))} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#307c4c]/5">
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><Icon name="sheet" className="h-3.5 w-3.5" /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-slate-800">{p.material_description || p.product_number || '—'}</span>
                                  <span className="block truncate text-[11px] text-slate-400">{p.supplier_name}{p.country ? ` · ${p.country}` : ''}</span>
                                </span>
                                <span className="font-mono text-[11px] text-slate-400">{p.product_number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {res.suppliers.length > 0 && (
                          <div className="px-2 pt-1">
                            <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Suppliers</p>
                            {res.suppliers.map((s) => (
                              <button key={s.id} type="button" onClick={() => go(`/catalog-manager/suppliers/${s.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#307c4c]/5">
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eaf4ef] text-[#307c4c]"><Icon name="building" className="h-3.5 w-3.5" /></span>
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{s.name}</span>
                                <span className="font-mono text-[11px] text-slate-400">{s.vendor_code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 px-3 pt-2 text-[12px]">
                          <button type="button" onClick={() => go(catalogHref(scope, { q: query.trim() }))} className="inline-flex items-center gap-1 font-semibold text-[#1d4f31] hover:underline">
                            All in Services catalog <Icon name="arrowRight" className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => go(`/catalog-manager/pir?q=${encodeURIComponent(query.trim())}`)} className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:underline">
                            All in PIR / Inventory <Icon name="arrowRight" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[12.5px] text-slate-500">Popular:</span>
                {QUICK_SEARCHES.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => openQuickSearch(term)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition-all hover:-translate-y-px hover:border-[#6aaf8e] hover:text-slate-900 hover:shadow-sm"
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

            {/* live snapshot side panel */}
            <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-xl shadow-[#307c4c]/10 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#307c4c] opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#307c4c]" />
                    </span>
                    Live catalog
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{data.scope}</p>
                </div>
                <Chip tone={data.pendingCount ? 'amber' : 'green'}>
                  <Icon name={data.pendingCount ? 'clock' : 'check'} className="h-3 w-3" />
                  {data.pendingCount ? `${data.pendingCount} pending` : 'Clear queue'}
                </Chip>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#eaf4ef] p-3 transition-transform duration-200 hover:scale-[1.03]">
                  <p className="text-2xl font-bold leading-none text-[#1d4f31] tabular-nums">{data.activeCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-[#307c4c]">active rates</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 transition-transform duration-200 hover:scale-[1.03]">
                  <p className="text-2xl font-bold leading-none text-slate-900 tabular-nums">{data.supplierCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">suppliers</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-3 transition-transform duration-200 hover:scale-[1.03]">
                  <p className="text-2xl font-bold leading-none text-cyan-800 tabular-nums">{data.categoryCount.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-medium text-cyan-700">categories</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {topCategories.length === 0 ? (
                  <EmptyState icon="layers" title="No active rates yet" />
                ) : topCategories.map((cat) => (
                  <Link key={cat.name} href={catalogHref(scope, { status: 'Active', category: cat.name })} className="block rounded-xl border border-slate-100 px-3 py-2.5 transition-all hover:border-[#6aaf8e] hover:bg-[#f7fbf9]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[12.5px] font-semibold text-slate-700">{cat.name}</span>
                      <span className="font-mono text-[12px] font-semibold text-slate-900">{cat.count}</span>
                    </div>
                    <Meter pct={(cat.count / maxCat) * 100} className="mt-2 h-1.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* scroll cue — the rest of the dashboard lives below the fold */}
          <div className="pointer-events-none relative flex justify-center pb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#307c4c]/15 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#1d4f31] backdrop-blur-sm">
              Scroll for insights
              <Icon name="chevRight" className="h-3.5 w-3.5 rotate-90 animate-bounce" />
            </span>
          </div>
        </section>

        {/* ── Country tiles ── */}
        {countryTiles.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold tracking-tight text-slate-900">Jump to country catalog</h2>
              <Link href={catalogHref('ALL')} className="group inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1d4f31] hover:underline">
                All countries <Icon name="chevRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
              {countryTiles.map((country) => (
                <Link
                  key={country.code}
                  href={catalogHref('ALL', { country: country.code })}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6aaf8e] hover:shadow-md"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf4ef] text-[15px] transition-transform duration-200 group-hover:scale-110">{country.flag ?? country.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-800">{country.name}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{country.code}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── KPI cards ── */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active rates" value={data.activeCount.toLocaleString()} sub={`Across ${data.categoryCount} categories`} icon="catalog" href={catalogHref(scope, { status: 'Active' })} />
          <StatCard label="Suppliers" value={data.supplierCount.toLocaleString()} sub="With active rates" icon="building" tone="cyan" href="/catalog-manager/suppliers" />
          <StatCard label="Expiring <= 30 days" value={data.expiringCount.toLocaleString()} sub={data.expiringCount ? 'Renew before they lapse' : 'Nothing lapsing soon'} icon="clock" tone="amber" href={catalogHref(scope, { expiring: '1' })} />
          <StatCard label="Pending approval" value={data.pendingCount.toLocaleString()} sub={data.pendingCount ? 'Awaiting sign-off' : 'Queue is clear'} icon="approve" tone="ink" href={scope !== 'ALL' ? `/catalog-manager/approvals?country=${scope}` : '/catalog-manager/approvals'} />
        </section>

        {/* ── Detail panels ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)_minmax(320px,0.85fr)]">
          <Card className="p-5">
            <CardHeader
              className="mb-4"
              title="By spend category"
              sub="Active rates grouped by taxonomy."
              action={<Chip tone="green"><Icon name="layers" className="h-3 w-3" />{data.activeCount.toLocaleString()}</Chip>}
            />
            {data.byCategory.length === 0 ? (
              <EmptyState icon="layers" title="No active rates yet" />
            ) : (
              <div className="space-y-1.5">
                {data.byCategory.slice(0, 7).map((category) => (
                  <Link key={category.name} href={catalogHref(scope, { status: 'Active', category: category.name })} className="grid grid-cols-[minmax(110px,180px)_1fr_38px] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[#f7fbf9]">
                    <span className="truncate text-[12.5px] font-medium text-slate-600">{category.name}</span>
                    <Meter pct={(category.count / maxCat) * 100} className="h-2.5" />
                    <span className="text-right text-[12.5px] font-semibold tabular-nums text-slate-900">{category.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader
              className="mb-3"
              title="Expiring soon"
              sub="Rates needing renewal attention."
              action={<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">&lt;= 30 days</span>}
            />
            {data.expiringSoon.length === 0 ? (
              <EmptyState icon="check" title="All current" />
            ) : (
              <div className="divide-y divide-slate-100">
                {data.expiringSoon.slice(0, 5).map((entry) => {
                  const days = daysUntil(entry.expiry_date) ?? 0;
                  return (
                    <Link key={entry.id} href={`/catalog-manager/catalog/${entry.id}`} className="flex items-center gap-3 rounded-lg py-2.5 transition-colors hover:bg-slate-50">
                      <span className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl font-bold leading-none ring-1 ring-inset ${days <= 7 ? 'bg-red-50 text-red-600 ring-red-600/10' : 'bg-amber-50 text-amber-700 ring-amber-600/10'}`}>
                        <span className="text-[13px] tabular-nums">{days}</span>
                        <span className="text-[7px] font-semibold uppercase">days</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-slate-900">{entry.supplier_name}</span>
                        <span className="block truncate text-[11.5px] text-slate-400">{entry.country_flag} {entry.code} {entry.commodity ? `- ${entry.commodity}` : ''}</span>
                      </span>
                      <Icon name="chevRight" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader
              className="mb-3"
              title="Recent activity"
              sub="Latest catalog changes."
              action={
                <Link href="/catalog-manager/audit" className="group inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#1d4f31] hover:underline">
                  Log <Icon name="chevRight" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              }
            />
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
              {data.recent.length === 0 && <EmptyState icon="history" title="No activity yet" sub="Changes to the catalog will appear here." />}
            </div>
          </Card>
        </div>
      </div>
    </CatalogManagerShell>
  );
}
