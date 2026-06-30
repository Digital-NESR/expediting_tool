'use client';

import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Box, Building2, Layers, MapPin, CornerDownLeft } from 'lucide-react';
import { SG_BRAND } from './constants';
import { globalSearch } from '@/app/actions/sourceguide';
import type { SgGlobalResults } from '@/app/actions/sourceguide';

type Flat = { kind: 'commodity' | 'supplier' | 'category' | 'country'; label: string; sub?: string; href: string; tone?: string | null };

const EMPTY: SgGlobalResults = { commodities: [], suppliers: [], categories: [], countries: [] };

export default function SourceGuideCommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SgGlobalResults>(EMPTY);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // reset + focus on open
  useEffect(() => {
    if (isOpen) {
      setQ(''); setRes(EMPTY); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const term = q.trim();
    if (!term) { setRes(EMPTY); setLoading(false); return; }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await globalSearch(term);
      if (id === seq.current) { setRes(r); setActive(0); setLoading(false); }
    }, 130);
    return () => clearTimeout(t);
  }, [q, isOpen]);

  const flat: Flat[] = useMemo(() => {
    const f: Flat[] = [];
    res.commodities.forEach(c => f.push({ kind: 'commodity', label: c.name, sub: [c.category, c.subCategory].filter(Boolean).join(' · '), href: `/sourceguide/commodity/${c.id}` }));
    res.suppliers.forEach(s => f.push({ kind: 'supplier', label: s.name, sub: `Vendor ${s.code}`, href: `/sourceguide/suppliers/${encodeURIComponent(s.code)}` }));
    res.categories.forEach(c => f.push({ kind: 'category', label: c.name, sub: 'Category', href: `/sourceguide/search?cat=${encodeURIComponent(c.id)}` }));
    res.countries.forEach(c => f.push({ kind: 'country', label: c.name, sub: 'Country guide', href: `/sourceguide/country/${c.code}`, tone: c.tone }));
    return f;
  }, [res]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.max(flat.length - 1, 0))); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[active];
        if (item) go(item.href);
        else if (q.trim()) go(`/sourceguide/search?q=${encodeURIComponent(q.trim())}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, flat, active, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(href: string) { onClose(); router.push(href); }

  if (!isOpen) return null;

  const icon = (k: Flat['kind'], tone?: string | null) =>
    k === 'commodity' ? <Box className="h-4 w-4" style={{ color: SG_BRAND }} />
    : k === 'supplier' ? <Building2 className="h-4 w-4 text-slate-500" />
    : k === 'category' ? <Layers className="h-4 w-4 text-slate-500" />
    : <span className="h-3.5 w-3.5 rounded-sm" style={{ background: tone ?? '#999' }} />;

  const titleFor = (k: Flat['kind']) =>
    k === 'commodity' ? 'Commodities' : k === 'supplier' ? 'Suppliers' : k === 'category' ? 'Categories' : 'Country guides';

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search commodities, suppliers, categories, countries…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {!q.trim() && (
            <div className="px-4 py-8 text-center text-[13px] text-slate-400">Start typing to search across SourceGuide.</div>
          )}
          {q.trim() && flat.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-[13px] text-slate-400">No matches for “{q}”.</div>
          )}
          {flat.map((item, i) => {
            const showHeader = i === 0 || flat[i - 1].kind !== item.kind;
            const isActive = i === active;
            return (
              <Fragment key={i}>
                {showHeader && (
                  <div className="px-4 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{titleFor(item.kind)}</div>
                )}
                <button
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item.href)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  style={isActive ? { background: '#eaf4ef' } : undefined}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-50">{icon(item.kind, item.tone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-slate-800">{item.label}</span>
                    {item.sub && <span className="block truncate text-[12px] text-slate-400">{item.sub}</span>}
                  </span>
                  {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
