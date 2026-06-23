'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Check, Layers, ChevronRight } from 'lucide-react';
import { SG_BRAND } from '../constants';
import { CountryFlag, SupAvatar } from '../ui';
import { searchCommodities, searchSuppliers } from '@/app/actions/sourceguide';
import type {
  SgCountry, SgCategory, SgFacets, SgCommodityResult, SgSupplier, SgSearchFilters, Tier,
} from '@/types/sourceguide';

interface Filters { countries: string[]; categories: string[]; tiers: Tier[]; spendTypes: string[]; }

export default function SearchClient({
  countries, categories, facets, initialQuery, initialFilters,
}: {
  countries: SgCountry[];
  categories: SgCategory[];
  facets: SgFacets;
  initialQuery: string;
  initialFilters: Filters;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [results, setResults] = useState<SgCommodityResult[]>([]);
  const [supHits, setSupHits] = useState<SgSupplier[]>([]);
  const [limit, setLimit] = useState(40);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const spendTypes = useMemo(() => facets.spendTypes.map(s => s.type), [facets]);

  useEffect(() => { setLimit(40); }, [query, filters]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const [com, sup] = await Promise.all([
        searchCommodities(query, filters as SgSearchFilters, 1000),
        searchSuppliers(query, 5),
      ]);
      if (id === seq.current) { setResults(com); setSupHits(sup); setLoading(false); }
    }, 150);
    return () => clearTimeout(t);
  }, [query, filters]);

  function toggle<K extends keyof Filters>(key: K, val: string) {
    setFilters(f => {
      const cur = f[key] as string[];
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      return { ...f, [key]: next };
    });
  }

  const activeCount = filters.countries.length + filters.categories.length + filters.tiers.length + filters.spendTypes.length;
  const countryByCode = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);

  function countFor(key: keyof Filters, val: string): number {
    if (key === 'categories') return categories.find(c => c.id === val)?.count ?? 0;
    if (key === 'spendTypes') return facets.spendTypes.find(s => s.type === val)?.count ?? 0;
    if (key === 'countries') return facets.countries.find(c => c.code === val)?.count ?? 0;
    if (key === 'tiers') return facets.tiers.find(t => t.tier === val)?.count ?? 0;
    return 0;
  }

  const Row = ({ k, val, label, swatch }: { k: keyof Filters; val: string; label: string; swatch?: string | null }) => {
    const on = (filters[k] as string[]).includes(val);
    return (
      <div
        onClick={() => toggle(k, val)}
        className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[13.5px] text-slate-600 hover:text-slate-900"
      >
        <span
          className="grid h-[17px] w-[17px] place-items-center rounded-[5px] border"
          style={on ? { background: SG_BRAND, borderColor: SG_BRAND } : { borderColor: '#D1D3D4', background: '#fff' }}
        >
          {on && <Check className="h-3 w-3 text-white" />}
        </span>
        {swatch && <span className="h-[11px] w-[14px] rounded-sm" style={{ background: swatch }} />}
        <span className="flex-1">{label}</span>
        <span className="font-mono text-[11.5px] text-slate-400">{countFor(k, val)}</span>
      </div>
    );
  };

  const shown = results.slice(0, limit);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[260px_1fr]">
        {/* Filter sidebar */}
        <aside className="sticky top-[88px] hidden md:block">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 pb-4 pt-3">
            <div className="flex items-center justify-between pt-2">
              <span className="text-[14px] font-bold">Filters</span>
              {activeCount > 0 && (
                <button
                  onClick={() => setFilters({ countries: [], categories: [], tiers: [], spendTypes: [] })}
                  className="rounded-md px-2 py-1 text-[12px] font-medium"
                  style={{ color: SG_BRAND }}
                >
                  Clear ({activeCount})
                </button>
              )}
            </div>

            <FilterGroup title="Country">
              {countries.map(c => <Row key={c.code} k="countries" val={c.code} label={c.name} swatch={c.tone} />)}
            </FilterGroup>
            <FilterGroup title="Supplier Tier">
              <Row k="tiers" val="Preferred" label="Preferred" />
              <Row k="tiers" val="Backup" label="Backup" />
            </FilterGroup>
            <FilterGroup title="Spend Type">
              {spendTypes.map(s => <Row key={s} k="spendTypes" val={s} label={s} />)}
            </FilterGroup>
            <FilterGroup title="Category">
              {categories.map(c => <Row key={c.id} k="categories" val={c.id} label={c.name} />)}
            </FilterGroup>
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0">
          <form
            onSubmit={e => { e.preventDefault(); setQuery(local); }}
            className="mb-5 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#6AAF8E]"
          >
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus value={local} onChange={e => setLocal(e.target.value)}
              placeholder="Search commodities, categories or suppliers…"
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-400"
            />
            {local && (
              <button type="button" onClick={() => { setLocal(''); setQuery(''); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          <div className="mb-4 flex items-center justify-between">
            <div className="text-[13.5px] text-slate-500">
              <b className="text-slate-900">{results.length.toLocaleString()}</b> commodit{results.length === 1 ? 'y' : 'ies'}
              {query && <> for “<b className="text-slate-900">{query}</b>”</>}
            </div>
            <button
              onClick={() => router.push('/sourceguide/browse')}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:border-[#6AAF8E]"
            >
              <Layers className="h-3.5 w-3.5" /> Browse by category
            </button>
          </div>

          {supHits.length > 0 && (
            <div className="mb-6">
              <div className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>
                Matching suppliers
              </div>
              <div className="flex flex-wrap gap-3">
                {supHits.map(s => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/sourceguide/suppliers/${s.id}`)}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-[#6AAF8E]"
                  >
                    <SupAvatar name={s.name} size={36} />
                    <div className="min-w-0">
                      <div className="max-w-[240px] truncate text-[13.5px] font-semibold">{s.name}</div>
                      <div className="text-[12px] text-slate-500">
                        {s.countries.map(c => countryByCode.get(c)?.name).filter(Boolean).join(', ') || '—'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {shown.map(com => {
              const pref = com.preferred;
              return (
                <button
                  key={com.id}
                  onClick={() => router.push(`/sourceguide/commodity/${com.id}`)}
                  className="grid grid-cols-1 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-px hover:border-[#6AAF8E] hover:shadow-sm sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400">
                      {com.path.slice(0, 3).map((p, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                          <span className={i === Math.min(2, com.path.length - 1) ? 'font-semibold text-slate-600' : ''}>{p}</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-[16px] font-semibold tracking-tight">
                      {com.name}
                      {com.code && <span className="ml-2 font-mono text-[11.5px] font-semibold" style={{ color: SG_BRAND }}>{com.code}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {com.countries.map(c => { const cc = countryByCode.get(c); return cc ? <CountryFlag key={c} country={cc} /> : null; })}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {pref && (
                      <div className="text-right">
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Preferred · {pref.country}</div>
                        <div className="mt-0.5 text-[13.5px] font-semibold">{pref.supplierName}</div>
                      </div>
                    )}
                    {com.backupCount > 0 && (
                      <span className="rounded-full bg-[#ececed] px-2.5 py-1 text-[11px] font-semibold text-slate-500">+{com.backupCount} backup</span>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
              );
            })}

            {!loading && results.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <div className="mt-3 text-[16px] font-semibold text-slate-900">No commodities match</div>
                <div className="mt-1.5 text-[13.5px] text-slate-500">Try a broader term or clear your filters.</div>
              </div>
            )}
            {loading && results.length === 0 && (
              <div className="py-16 text-center text-[13.5px] text-slate-400">Searching…</div>
            )}
          </div>

          {results.length > limit && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setLimit(l => l + 40)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#6AAF8E]"
              >
                Show more · {(results.length - limit).toLocaleString()} remaining
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-4 last:border-b-0">
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-900">{title}</h4>
      {children}
    </div>
  );
}
