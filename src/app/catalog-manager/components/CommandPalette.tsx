'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, StatusPill } from './CatalogManagerUI';
import { globalCatalogSearch, type GlobalSearchResult } from '@/app/actions/catalog-manager';

const EMPTY: GlobalSearchResult = { entries: [], suppliers: [] };

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<GlobalSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [open]);

  function onChange(v: string) {
    setQ(v);
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

  if (!open) return null;
  const hasResults = res.entries.length > 0 || res.suppliers.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
      <button aria-label="Close search" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search catalog IDs, suppliers, commodities…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-2">
          {q.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-400">Type at least 2 characters to search.</p>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-400">Searching…</p>
          ) : !hasResults ? (
            <p className="px-4 py-6 text-center text-[13px] text-slate-400">No matches for “{q}”.</p>
          ) : (
            <>
              {res.entries.length > 0 && (
                <div className="px-2">
                  <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Catalog entries</p>
                  {res.entries.map((e) => (
                    <button key={e.id} onClick={() => go(`/catalog-manager/catalog/${e.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#307c4c]/5">
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
              {res.suppliers.length > 0 && (
                <div className="px-2 pt-1">
                  <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Suppliers</p>
                  {res.suppliers.map((s) => (
                    <button key={s.id} onClick={() => go(`/catalog-manager/suppliers/${s.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#307c4c]/5">
                      <Icon name="building" className="h-4 w-4 text-[#307c4c]" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{s.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{s.vendor_code}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
