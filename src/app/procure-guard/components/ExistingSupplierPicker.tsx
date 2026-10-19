'use client';

import { useEffect, useRef, useState } from 'react';
import { searchExistingSuppliers } from '@/app/actions/procure-guard/suppliers';
import type { AvlSupplierOption } from '@/lib/procure-guard/avl-suppliers';

const BOX =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400';
const BOX_ERR =
  'w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 placeholder:text-slate-400';

/**
 * Picking a supplier that already exists in SAP.
 *
 * Used when a buyer needs one urgent purchase from a supplier the vendor master has, usually a
 * centrally blocked one, without going through an unblock. Picking fills the supplier's name and
 * their SAP ID together, so the two can never be mismatched by hand; the server re-reads both
 * from the vendor master anyway, because a form post is not evidence.
 *
 * Not filtered by the country on the form. `supplier_avl` has no country, and the two things
 * that could stand in for one place only 10 and 29 of the 444 blocked suppliers respectively, so
 * a country filter would empty the list for exactly the suppliers this is for. Blocked suppliers
 * sort to the top instead, which is the ordering that actually helps.
 */
export default function ExistingSupplierPicker({
  code,
  name,
  onPick,
  invalid,
}: {
  code: string;
  name: string;
  onPick: (supplier: { code: string; name: string; email: string; blocked: boolean } | null) => void;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AvlSupplierOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchExistingSuppliers(query.trim());
      if (cancelled) return;
      setResults(rows);
      setHighlight(0);
      setLoading(false);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (s: AvlSupplierOption) => {
    onPick({ code: s.code, name: s.name, email: s.email, blocked: s.blocked });
    setQuery('');
    setOpen(false);
  };

  /* Chosen state rather than a text box, because the value is a pair and half of it is not
     editable: a buyer may change WHICH supplier, never the name attached to an ID. */
  if (code) {
    return (
      <div className="rounded-lg border border-[#307c4c]/30 bg-[#307c4c]/5 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
            <div className="mt-0.5 font-mono text-xs text-slate-500">SAP ID {code}</div>
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={invalid ? BOX_ERR : BOX}
        value={query}
        placeholder="Search the vendor master by name or SAP ID…"
        aria-label="Existing supplier"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(results[highlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400">Searching the vendor master…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-400">
              {query.trim() ? 'No supplier matches that.' : 'Start typing a name or SAP ID.'}
            </div>
          ) : (
            results.map((s, i) => (
              <button
                key={s.code}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(s)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition ${
                  i === highlight ? 'bg-[#307c4c]/10' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">{s.name}</span>
                  {/* The reason most of these requests exist, so it is on the row rather than
                      discovered after picking. */}
                  {s.blocked && (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                      Blocked
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{s.code}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
