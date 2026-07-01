'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Box, Shield, Layers, MapPin, Grid3x3, Zap, FileSpreadsheet,
  Users, Clock, ArrowRight, Building2, Star,
} from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from './constants';
import { StatTile } from './ui';
import { usePins } from './pins';
import type { PinItem } from './pins';
import { searchCommodities } from '@/app/actions/sourceguide';
import type { SgStats, SgCategory, SgCommodityResult } from '@/types/sourceguide';

const POPULAR = ['Insurance', 'Catering', 'Inspection', 'Crane', 'Drilling', 'Cementing', 'Valves', 'Fuel'];
const CAT_ICONS = [Box, Zap, Shield, Layers, Grid3x3, MapPin, FileSpreadsheet, Users, Clock];

interface CountryTile { code: string; name: string; tone: string | null; commodities: number }

export default function DashboardClient({
  stats, categories, countries,
}: {
  stats: SgStats;
  categories: SgCategory[];
  countries: CountryTile[];
}) {
  const router = useRouter();
  const { recent, bookmarks } = usePins();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [suggestions, setSuggestions] = useState<SgCommodityResult[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setSuggestions([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchCommodities(term, {}, 6);
      if (id === seq.current) setSuggestions(res);
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  function goSearch(term: string) {
    router.push(`/sourceguide/search?q=${encodeURIComponent(term.trim())}`);
  }
  function goCategory(catId: string) {
    router.push(`/sourceguide/search?cat=${encodeURIComponent(catId)}`);
  }
  function goCountry(code: string) {
    router.push(`/sourceguide/country/${encodeURIComponent(code)}`);
  }

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-slate-200" style={{ background: `linear-gradient(180deg, ${SG_BRAND_SOFT}, #f5f6f5)` }}>
        <div className="mx-auto max-w-[1200px] px-6 pb-14 pt-16 text-center lg:px-8">
          <div className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>
            Sourcing Intelligence · {stats.countries} Country Guides
          </div>
          <h1 className="mx-auto max-w-[760px] text-[44px] font-bold leading-[1.08] tracking-tight">
            Find the right supplier, in any country, in seconds.
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[16px] leading-relaxed text-slate-500">
            Search NESR&apos;s preferred and backup suppliers across the full commodity taxonomy, no spreadsheet required.
          </p>

          {/* Big search */}
          <div className="relative mx-auto mt-8 max-w-[620px]">
            <form
              onSubmit={e => { e.preventDefault(); goSearch(q); }}
              className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 transition-shadow"
              style={{ boxShadow: focus ? '0 10px 40px rgba(31,31,29,.14)' : '0 1px 3px rgba(31,31,29,.08)' }}
            >
              <Search className="h-5 w-5 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                onFocus={() => setFocus(true)}
                onBlur={() => setTimeout(() => setFocus(false), 150)}
                placeholder="Search a commodity, category or supplier…"
                className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
              />
              <button type="submit" className="rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: SG_BRAND }}>
                Search
              </button>
            </form>

            {focus && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-2xl">
                {suggestions.map(com => (
                  <div
                    key={com.id}
                    onMouseDown={() => router.push(`/sourceguide/commodity/${com.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#eaf4ef]"
                  >
                    <Box className="h-4 w-4" style={{ color: SG_BRAND }} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[14px] font-semibold">{com.name}</div>
                      <div className="truncate text-[12px] text-slate-500">{com.category}{com.subCategory ? ` · ${com.subCategory}` : ''}</div>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">{com.countries.join(' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={() => router.push('/sourceguide/taxonomy')}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:border-[#6AAF8E] hover:text-slate-900"
            >
              <Grid3x3 className="h-4 w-4" style={{ color: SG_BRAND }} /> View full taxonomy <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 self-center text-[12.5px] text-slate-500">Popular:</span>
            {POPULAR.map(p => (
              <button
                key={p}
                onClick={() => goSearch(p)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition-colors hover:border-[#6AAF8E] hover:text-slate-900"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Country filter tiles */}
          {countries.length > 0 && (
            <div className="mx-auto mt-8 max-w-[940px]">
              <div className="mb-3 text-[12.5px] font-semibold text-slate-500">Or jump straight to a country guide</div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {countries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => goCountry(c.code)}
                    className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#6AAF8E] hover:shadow-sm"
                  >
                    <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: c.tone ?? '#999' }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{c.name}</span>
                      <span className="block text-[11px] text-slate-400">{c.commodities.toLocaleString()} commodities</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat band */}
      <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-8">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-4">
          <StatTile value={stats.commodities} label="Commodities mapped" icon={<Box className="h-4 w-4" />} />
          <StatTile value={stats.suppliers} label="Vetted suppliers" icon={<Shield className="h-4 w-4" />} />
          <StatTile value={stats.mappings} label="Supplier mappings" icon={<Layers className="h-4 w-4" />} />
          <StatTile value={stats.countries} label="Country guides" icon={<MapPin className="h-4 w-4" />} />
        </div>
      </div>

      {/* Jump back in: bookmarks + recently viewed */}
      {(bookmarks.length > 0 || recent.length > 0) && (
        <div className="mx-auto max-w-[1200px] px-6 pb-2 pt-2 lg:px-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {bookmarks.length > 0 && (
              <PinStrip title="Bookmarked" icon={<Star className="h-3.5 w-3.5" />} items={bookmarks.slice(0, 6)} onOpen={h => router.push(h)} />
            )}
            {recent.length > 0 && (
              <PinStrip title="Recently viewed" icon={<Clock className="h-3.5 w-3.5" />} items={recent.slice(0, 6)} onOpen={h => router.push(h)} />
            )}
          </div>
        </div>
      )}

      {/* Category grid */}
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[21px] font-bold tracking-tight">Browse by category</h2>
          <button
            onClick={() => router.push('/sourceguide/browse')}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:border-[#6AAF8E]"
          >
            Full taxonomy <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, i) => {
            const Icon = CAT_ICONS[i % CAT_ICONS.length];
            return (
              <button
                key={cat.id}
                onClick={() => goCategory(cat.id)}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-[#6AAF8E] hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-[42px] w-[42px] place-items-center rounded-[11px]" style={{ background: SG_BRAND_SOFT, color: SG_BRAND }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[12px] text-slate-400">{cat.count} items</span>
                </div>
                <div className="mt-4 text-[16px] font-semibold tracking-tight">{cat.name}</div>
                <div className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{cat.subs.join(' · ')}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PinStrip({ title, icon, items, onOpen }: { title: string; icon: React.ReactNode; items: PinItem[]; onOpen: (href: string) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        <span style={{ color: SG_BRAND }}>{icon}</span> {title}
      </div>
      <div className="flex flex-col">
        {items.map(it => (
          <button key={`${it.kind}:${it.key}`} onClick={() => onOpen(it.href)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[#eaf4ef]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-50">
              {it.kind === 'commodity' ? <Box className="h-4 w-4" style={{ color: SG_BRAND }} /> : <Building2 className="h-4 w-4 text-slate-500" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-slate-800">{it.name}</span>
              {it.sub && <span className="block truncate text-[11.5px] text-slate-400">{it.sub}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
