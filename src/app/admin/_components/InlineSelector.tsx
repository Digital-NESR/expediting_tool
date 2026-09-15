'use client';

import { useMemo, useState } from 'react';

/**
 * The inline multi-select that drops under a row when a reviewer clicks Approve or
 * Edit Access. Both access-approval panels select countries with it, so the copy
 * defaults to country wording but is overridable.
 */
export default function InlineSelector({
  options,
  preselected,
  label,
  onConfirm,
  onCancel,
  loading,
  emptyLabel = 'No countries found.',
  itemNoun = ['country', 'countries'],
}: {
  options: string[];
  preselected: string[];
  label: string;
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
  loading: boolean;
  emptyLabel?: string;
  itemNoun?: [singular: string, plural: string];
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));

  const filtered = useMemo(
    () => options.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  function toggle(c: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  return (
    <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in duration-150">
      <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>

      <div className="relative mb-2">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#307c4c]/30 focus:border-[#307c4c] placeholder-slate-400"
        />
      </div>

      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white mb-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">{emptyLabel}</p>
        ) : (
          <div className="p-1 space-y-0.5">
            {filtered.map(c => (
              <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={selected.has(c)}
                  onChange={() => toggle(c)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-700">{c}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <p className="text-[11px] text-[#307c4c] font-medium mb-2">
          {selected.size} {selected.size === 1 ? itemNoun[0] : itemNoun[1]} selected
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm([...selected])}
          disabled={loading || selected.size === 0}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
