'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Kbd, Spinner, StatusPill } from './CatalogManagerUI';
import { globalCatalogSearch, type GlobalSearchResult } from '@/app/actions/catalog-manager';

const EMPTY: GlobalSearchResult = { entries: [], suppliers: [], pir: [] };

/** Deep-link a PIR match to the PIR page with its filter pre-applied. */
const pirHref = (p: GlobalSearchResult['pir'][number]) =>
  `/catalog-manager/pir?q=${encodeURIComponent(p.product_number || p.info_record_number)}`;

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<GlobalSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flat list of navigable rows, in render order, for arrow-key navigation.
  const rows = useMemo(() => [
    ...res.entries.map((e) => ({ key: `e-${e.id}`, href: `/catalog-manager/catalog/${e.id}` })),
    ...res.suppliers.map((s) => ({ key: `s-${s.id}`, href: `/catalog-manager/suppliers/${s.id}` })),
    ...res.pir.map((p, i) => ({ key: `p-${i}`, href: pirHref(p) })),
  ], [res]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onTrigger() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('cm:palette', onTrigger);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('cm:palette', onTrigger); };
  }, []);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 30); return; }
    // reset when the palette closes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ('');
    setRes(EMPTY);
    setCursor(0);
  }, [open]);

  useEffect(() => {
    // Keep the highlighted row in view as the cursor moves.
    const el = listRef.current?.querySelector<HTMLElement>('[data-cursor="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onChange(v: string) {
    setQ(v);
    setCursor(0);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await globalCatalogSearch(v);
      setRes(r);
      setLoading(false);
    }, 200);
  }

  function go(href: string) { setOpen(false); router.push(href); }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); go(rows[cursor].href); }
  }

  if (!open) return null;
  const hasResults = res.entries.length > 0 || res.suppliers.length > 0 || res.pir.length > 0;
  const rowIndex = (key: string) => rows.findIndex((r) => r.key === key);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
      <button aria-label="Close search" className="cm-fade-in absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="cm-scale-in relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Icon name="search" className="h-4 w-4 shrink-0 text-[#307c4c]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search catalog, suppliers, PIR / inventory…"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400"
          />
          {loading && <Spinner className="h-4 w-4 text-slate-300" />}
          <Kbd>ESC</Kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {q.trim().length < 2 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-slate-400">Type at least 2 characters to search the whole catalog.</p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-300">
                <Kbd>↑</Kbd><Kbd>↓</Kbd> to navigate · <Kbd>↵</Kbd> to open
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-2 px-4 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="skeleton-shimmer h-4 w-14 rounded" />
                  <span className="skeleton-shimmer h-4 flex-1 rounded" />
                  <span className="skeleton-shimmer h-4 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : !hasResults ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">No matches for “{q}”.</p>
          ) : (
            <>
              {res.entries.length > 0 && (
                <div className="px-2">
                  <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Catalog entries</p>
                  {res.entries.map((e) => {
                    const idx = rowIndex(`e-${e.id}`);
                    const hot = idx === cursor;
                    return (
                      <button
                        key={e.id}
                        data-cursor={hot}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(`/catalog-manager/catalog/${e.id}`)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${hot ? 'bg-[#307c4c]/10' : 'hover:bg-[#307c4c]/5'}`}
                      >
                        <span className="font-mono text-[11px] text-slate-400">{e.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-slate-800">{e.label}</span>
                          <span className="block truncate text-[11px] text-slate-400">{e.supplier_name} · {e.country_code}</span>
                        </span>
                        <StatusPill status={e.status} sm />
                        {hot && <Icon name="chevRight" className="h-3.5 w-3.5 shrink-0 text-[#307c4c]" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {res.suppliers.length > 0 && (
                <div className="px-2 pt-1">
                  <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Suppliers</p>
                  {res.suppliers.map((s) => {
                    const idx = rowIndex(`s-${s.id}`);
                    const hot = idx === cursor;
                    return (
                      <button
                        key={s.id}
                        data-cursor={hot}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(`/catalog-manager/suppliers/${s.id}`)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${hot ? 'bg-[#307c4c]/10' : 'hover:bg-[#307c4c]/5'}`}
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eaf4ef] text-[#307c4c]"><Icon name="building" className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{s.name}</span>
                        <span className="font-mono text-[11px] text-slate-400">{s.vendor_code}</span>
                        {hot && <Icon name="chevRight" className="h-3.5 w-3.5 shrink-0 text-[#307c4c]" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {res.pir.length > 0 && (
                <div className="px-2 pt-1">
                  <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">PIR / Inventory</p>
                  {res.pir.map((p, i) => {
                    const idx = rowIndex(`p-${i}`);
                    const hot = idx === cursor;
                    return (
                      <button
                        key={`${p.info_record_number}-${p.product_number}-${i}`}
                        data-cursor={hot}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(pirHref(p))}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${hot ? 'bg-[#307c4c]/10' : 'hover:bg-[#307c4c]/5'}`}
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><Icon name="sheet" className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-slate-800">{p.material_description || p.product_number || '—'}</span>
                          <span className="block truncate text-[11px] text-slate-400">{p.supplier_name}{p.country ? ` · ${p.country}` : ''}</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">{p.product_number}</span>
                        {hot && <Icon name="chevRight" className="h-3.5 w-3.5 shrink-0 text-[#307c4c]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
