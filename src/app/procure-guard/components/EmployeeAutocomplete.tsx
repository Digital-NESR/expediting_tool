'use client';

import { useEffect, useRef, useState } from 'react';
import { searchEmployees, type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';

const BOX = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400';

/**
 * Directory search box. Type a name or email; pick a colleague from the Azure AD
 * directory. On pick it calls onSelect and clears its own input, so it works both for
 * filling a single field (delegation) and for appending to a list (CC recipients).
 *
 * Pass `value`/`onChange` to run it in controlled mode instead — the input becomes the
 * field itself (e.g. an actual "Email" input) rather than a separate search-then-clear box:
 * typing updates `value` via `onChange` on every keystroke, and picking a result still
 * calls `onSelect`, but the typed text is kept rather than cleared.
 */
export default function EmployeeAutocomplete({
  onSelect,
  placeholder = 'Search directory by name or email…',
  className,
  inputClassName,
  value,
  onChange,
}: {
  onSelect: (employee: EmployeeDirectoryEntry) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const controlled = value !== undefined;
  const [internalQuery, setInternalQuery] = useState('');
  const query = controlled ? value : internalQuery;
  const [results, setResults] = useState<EmployeeDirectoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const suppressNextSearch = useRef(false);

  useEffect(() => {
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await searchEmployees(q);
      if (cancelled) return;
      setResults(rows);
      setHighlight(0);
      setOpen(true);
      setLoading(false);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function setQuery(next: string) {
    if (controlled) onChange?.(next);
    else setInternalQuery(next);
  }

  function pick(emp: EmployeeDirectoryEntry) {
    onSelect(emp);
    if (controlled) {
      suppressNextSearch.current = true;
      onChange?.(emp.email);
    } else {
      setInternalQuery('');
    }
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <input
        type="text"
        className={inputClassName ?? BOX}
        value={query}
        placeholder={placeholder}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400">Searching…</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.email}-${i}`}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(r)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition ${i === highlight ? 'bg-[#307c4c]/10' : 'hover:bg-slate-50'}`}
              >
                <span className="text-sm font-semibold text-slate-900">{r.name}</span>
                <span className="text-xs text-slate-500">{r.email}</span>
                {(r.jobTitle || r.department || r.country) && (
                  <span className="text-[0.6875rem] text-slate-400">
                    {[r.jobTitle, r.department, r.country].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
