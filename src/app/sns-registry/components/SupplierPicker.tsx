'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchSnsSuppliers } from '@/app/actions/sns-suppliers';
import type { SupplierOption } from '@/app/actions/sns-suppliers';

/**
 * Supplier chooser for the New Record wizard.
 *
 * Type-to-filter over the approved vendor list rather than two free-text boxes:
 * the SAP ID and name have to agree with each other and with SAP, and typing
 * both by hand is how a record ends up naming one vendor by code and another by
 * name. Picking sets both at once.
 *
 * Results come from the server a page at a time — the list is ~4,400 rows, too
 * many to ship to the browser just to filter locally.
 */
export default function SupplierPicker({
  sapId,
  name,
  onPick,
  onClear,
}: {
  sapId: string;
  name: string;
  onPick: (option: SupplierOption) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = Boolean(sapId && name);

  /* Debounced so typing a vendor name is one query, not one per keystroke. The
     sequence guard drops a slow earlier response that lands after a later one,
     which would otherwise repopulate the list with stale matches. */
  const seq = useRef(0);
  useEffect(() => {
    if (!open || chosen) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      // Inside the timer rather than the effect body: the previous results stay
      // on screen through the debounce window instead of flashing "Searching…"
      // on every keystroke.
      setLoading(true);
      void searchSnsSuppliers(query).then((rows) => {
        if (mine !== seq.current) return;
        setOptions(rows);
        setHighlight(0);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, chosen]);

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = useCallback(
    (option: SupplierOption) => {
      onPick(option);
      setOpen(false);
      setQuery('');
    },
    [onPick],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) choose(options[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (chosen) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
          Supplier
        </label>
        <div className="flex items-center gap-2.5 rounded-lg border border-[#6AAF8E] bg-[#307c4c]/5 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-bold text-slate-800">{name}</div>
            <div className="font-mono text-[11.5px] text-slate-500">SAP {sapId}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear();
              setQuery('');
              setOpen(true);
            }}
            className="shrink-0 text-[11.5px] font-semibold text-[#307c4c] underline underline-offset-2 hover:no-underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1.5">
      <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        Supplier
      </label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search by name or SAP ID"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#307c4c]"
      />
      <span className="text-[11px] leading-relaxed text-slate-400">
        From the approved vendor list. Choosing sets the SAP ID and name together.
      </span>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2.5 text-[12px] text-slate-400">Searching…</div>}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2.5 text-[12px] text-slate-400">
              {query.trim()
                ? 'No approved supplier matches that.'
                : 'Start typing a name or SAP ID.'}
            </div>
          )}
          {!loading &&
            options.map((o, i) => (
              <div
                key={o.sapId}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o)}
                className={`cursor-pointer border-b border-slate-100 px-3 py-2 ${
                  i === highlight ? 'bg-[#307c4c]/5' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-bold text-slate-800">{o.name}</span>
                  {o.blocked && (
                    <span className="rounded-full bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-700">
                      blocked in SAP
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11.5px] text-slate-500">{o.sapId}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
