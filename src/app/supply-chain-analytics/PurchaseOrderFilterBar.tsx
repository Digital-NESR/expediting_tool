'use client';

/**
 * The filter row above both Purchase Order boards.
 *
 * Mirrors the slicers on the Power BI page it sits beside — account classification, segment,
 * country, PO release date, purchasing org, supplier, buyer, PO first release date — so a
 * reader moving between the two is choosing from the same vocabulary.
 *
 * Each control is a multi-select that reads "All" until something is chosen. Options are
 * ordered by line volume rather than alphabetically, which is what makes the 400-supplier and
 * 300-buyer lists usable: the names behind most of the spend are at the top, and the search box
 * handles the rest.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FilterOption, PoFilters, PoFilterOptions } from '@/lib/purchase-orders/filters';

type MultiKey = 'accountClassification' | 'segment' | 'country' | 'purchasingOrg' | 'supplier' | 'buyer';

const LABELS: Record<MultiKey, string> = {
  accountClassification: 'Account Classification',
  segment: 'Reporting Segment',
  country: 'Reporting Country',
  purchasingOrg: 'Purchasing Org',
  supplier: 'Supplier',
  buyer: 'Buyer',
};

/* ─── One multi-select ──────────────────────────────────────────────────────
   A button that opens a panel, rather than a native <select multiple>: the native control
   cannot show counts, cannot be searched, and on a long list is close to unusable. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
  disabled,
  disabledNote,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  /* Close on an outside click or Escape. Both, because a filter panel left open over the
     charts is the most common way this kind of control gets in the way. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 300);
  }, [options, query]);

  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div className="min-w-0" ref={ref}>
      <label className="mb-1 block truncate text-[11px] font-medium text-slate-500" title={label}>
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          title={disabled ? disabledNote : summary}
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
            disabled
              ? 'cursor-not-allowed border-slate-200 text-slate-300'
              : selected.length
                ? 'border-[#307c4c] text-slate-900'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <span className="truncate">{summary}</span>
          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && !disabled && (
          <div className="absolute left-0 z-40 mt-1 w-[min(22rem,80vw)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {searchable && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#307c4c]"
              />
            )}
            <div className="max-h-64 overflow-y-auto">
              {shown.length === 0 && (
                <p className="px-2 py-6 text-center text-[12px] text-slate-400">No matches.</p>
              )}
              {shown.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() =>
                      onChange(on ? selected.filter((v) => v !== o.value) : selected.concat([o.value]))
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-slate-50"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] font-bold text-white ${
                        on ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={o.label}>
                      {o.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {o.lines.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                Clear {selected.length}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A from/to pair over one date column. */
function DateRange({
  label,
  from,
  to,
  min,
  max,
  onChange,
}: {
  label: string;
  from: string | null;
  to: string | null;
  min: string | null;
  max: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-[#307c4c]';
  return (
    <div className="min-w-0">
      <label className="mb-1 block truncate text-[11px] font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={from ?? ''}
          min={min ?? undefined}
          max={max ?? undefined}
          onChange={(e) => onChange(e.target.value || null, to)}
          className={field}
          aria-label={`${label} from`}
        />
        <span className="shrink-0 text-[11px] text-slate-400">to</span>
        <input
          type="date"
          value={to ?? ''}
          min={min ?? undefined}
          max={max ?? undefined}
          onChange={(e) => onChange(from, e.target.value || null)}
          className={field}
          aria-label={`${label} to`}
        />
      </div>
    </div>
  );
}

export default function PurchaseOrderFilterBar({
  options,
  value,
  onChange,
  onReset,
  busy,
  activeCount,
}: {
  options: PoFilterOptions;
  value: PoFilters;
  onChange: (next: PoFilters) => void;
  onReset: () => void;
  busy: boolean;
  activeCount: number;
}) {
  const set = (key: MultiKey) => (next: string[]) => onChange({ ...value, [key]: next });
  const range = options.releaseRange;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4 xl:grid-cols-8">
        <MultiSelect
          label={LABELS.accountClassification}
          options={options.accountClassification}
          selected={value.accountClassification}
          onChange={set('accountClassification')}
        />
        <MultiSelect
          label={LABELS.segment}
          options={options.segment}
          selected={value.segment}
          onChange={set('segment')}
          searchable
        />
        <MultiSelect
          label={LABELS.country}
          options={options.country}
          selected={value.country}
          onChange={set('country')}
        />
        <DateRange
          label="PO Release Date"
          from={value.releasedFrom}
          to={value.releasedTo}
          min={range.min}
          max={range.max}
          onChange={(releasedFrom, releasedTo) => onChange({ ...value, releasedFrom, releasedTo })}
        />
        <MultiSelect
          label={LABELS.purchasingOrg}
          options={options.purchasingOrg}
          selected={value.purchasingOrg}
          onChange={set('purchasingOrg')}
          searchable
        />
        <MultiSelect
          label={LABELS.supplier}
          options={options.supplier}
          selected={value.supplier}
          onChange={set('supplier')}
          searchable
        />
        <MultiSelect
          label={LABELS.buyer}
          options={options.buyer}
          selected={value.buyer}
          onChange={set('buyer')}
          searchable
        />
        <DateRange
          label="PO First Release Date"
          from={value.firstReleasedFrom}
          to={value.firstReleasedTo}
          min={range.min}
          max={range.max}
          onChange={(firstReleasedFrom, firstReleasedTo) =>
            onChange({ ...value, firstReleasedFrom, firstReleasedTo })
          }
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="text-[11.5px] text-slate-400">
          {busy
            ? 'Recalculating…'
            : activeCount === 0
              ? 'No filters applied — showing every PO line.'
              : `${activeCount} filter${activeCount === 1 ? '' : 's'} applied.`}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
