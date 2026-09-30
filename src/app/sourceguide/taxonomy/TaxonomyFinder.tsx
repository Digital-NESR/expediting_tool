'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../constants';
import { LEVEL_LABELS, searchTaxonomy } from '@/lib/sourceguide/taxonomy-search';
import type { SgTaxonomyRow } from '@/lib/sourceguide/types';

/**
 * Jump to any node in the taxonomy by typing part of its name.
 *
 * Drilling five levels works when you know where a thing lives. Nobody does: a reader knows one
 * word of what they are buying, and finding "Shaped Charges" by drilling means guessing Spend
 * Type, Category, Sub-Category and Family correctly before the guess that mattered. Picking a
 * result opens every column to it, so the drill-down still shows where the thing sits and what
 * sits beside it, which is the part worth keeping.
 *
 * A result is a PATH, not a name. "General" is a family under a dozen sub-categories and each is a
 * different place to land, so each is its own row, told apart by the trail printed above it.
 */
export default function TaxonomyFinder({
  rows,
  onPick,
}: {
  rows: SgTaxonomyRow[];
  onPick: (path: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => searchTaxonomy(rows, query), [rows, query]);

  // A click anywhere else closes it. Escape does too, on the input itself.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function choose(index: number) {
    const hit = hits[index];
    if (!hit) return;
    onPick(hit.path);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setOpen(false);
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(cursor);
    }
  }

  const showing = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative mb-4 max-w-[560px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search any level: a commodity, a family, a category…"
        aria-label="Search the spend taxonomy"
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#2A7E4F] focus:ring-2 focus:ring-[#2A7E4F]/15"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(false);
          }}
          aria-label="Clear the search"
          className="absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-slate-200 text-slate-500 transition-colors hover:bg-slate-300"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {showing && (
        <div className="absolute z-30 mt-1.5 max-h-[340px] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {!hits.length && (
            <p className="px-4 py-3 text-[13px] text-slate-500">
              Nothing in the taxonomy matches &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {hits.map((hit, i) => {
            const trail = hit.path.slice(0, -1);
            return (
              <button
                key={hit.path.join('>')}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(i)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left"
                style={i === cursor ? { background: SG_BRAND_SOFT } : undefined}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-slate-800">
                    <Highlight text={hit.value} query={query.trim()} />
                  </span>
                  {trail.length > 0 && (
                    /* Where it sits. Two results can share a name and differ only in this. */
                    <span className="block truncate text-[11.5px] text-slate-400">
                      {trail.join(' › ')}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: SG_BRAND_SOFT, color: SG_BRAND }}
                >
                  {LEVEL_LABELS[hit.level]}
                </span>
                {/* A commodity is one line; the count only means something above it. */}
                {hit.level < LEVEL_LABELS.length - 1 && (
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-400">
                    {hit.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The typed part, picked out of the name so a long name shows why it matched. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold" style={{ color: SG_BRAND }}>
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}
