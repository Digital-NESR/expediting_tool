'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  activeFilterCount,
  FILTER_KEYS,
  type TravelFilterOptions,
  type TravelFilters,
} from '@/lib/travel-analytics/filters';

const LABELS: Record<(typeof FILTER_KEYS)[number], string> = {
  channels: 'Booked via',
  countries: 'Country',
  costCentres: 'Cost centre',
  segments: 'Segment',
  companies: 'Company',
  travelTypes: 'Travel type',
  cabinClasses: 'Cabin',
  statuses: 'Status',
};

/* The order the bar reads in, which is not the order the keys were declared in: channel and
   country are what a reader reaches for first, and cabin and status are refinements. */
const ORDER: (typeof FILTER_KEYS)[number][] = [
  'channels',
  'countries',
  'costCentres',
  'segments',
  'companies',
  'travelTypes',
  'cabinClasses',
  'statuses',
];

/**
 * One multi-select per dimension, and everything below the bar obeys them.
 *
 * Every option is a checkbox rather than a single choice, because the questions asked of this
 * board are comparative: KSA and Kuwait together, business and rotation but not vacation.
 * Nothing is pre-selected, and nothing selected means no restriction on that dimension rather
 * than nothing shown.
 *
 * Applied on the server. The alternative, shipping every booking to the browser and folding
 * there, would mean a second implementation of each band and two places for a figure to be
 * computed differently. One round trip is the cheaper mistake.
 */
export default function TravelFilterBar({
  options,
  applied,
  onChange,
  busy,
  showing,
  total,
}: {
  options: TravelFilterOptions;
  applied: TravelFilters;
  onChange: (next: TravelFilters) => void;
  busy: boolean;
  showing: number;
  total: number;
}) {
  const count = activeFilterCount(applied);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {ORDER.filter((key) => options[key]?.length > 1).map((key) => (
          <FilterMenu
            key={key}
            label={LABELS[key]}
            options={options[key]}
            selected={applied[key] ?? []}
            disabled={busy}
            onChange={(values) => onChange({ ...applied, [key]: values })}
          />
        ))}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {busy ? (
              'Updating…'
            ) : count > 0 ? (
              <>
                Showing <span className="font-semibold text-slate-800">{showing}</span> of {total}{' '}
                bookings
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-800">{total}</span> bookings
              </>
            )}
          </span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange({})}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Clear {count}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FilterMenu({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const shown = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          selected.length
            ? 'border-[#307c4c] bg-[#307c4c]/5 text-[#1f5733]'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-[#307c4c] px-1.5 text-[10px] font-bold text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          {/* A search box only where the list is long enough to need one: cabin class has four
              options and a filter above them is furniture. */}
          {options.length > 8 && (
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full border-b border-slate-100 px-3 py-2 text-xs outline-none placeholder:text-slate-400"
            />
          )}
          <div className="max-h-64 overflow-auto py-1">
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Nothing matches.</p>
            ) : (
              shown.map((option) => {
                const on = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300'
                      }`}
                    >
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="truncate text-slate-700" title={option}>
                      {option}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
