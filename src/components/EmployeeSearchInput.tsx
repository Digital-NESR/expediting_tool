'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchEmployees } from '@/app/actions/employees';
import type { Employee } from '@/app/actions/employees';

export type { Employee } from '@/app/actions/employees';

interface EmployeeSearchInputProps {
  placeholder?: string;
  onSelect: (employee: Employee) => void;
  excludeEmails?: string[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '').toUpperCase();
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-slate-900">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function EmployeeSearchInput({
  placeholder = 'Search NESR employees…',
  onSelect,
  excludeEmails = [],
}: EmployeeSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [manualWarning, setManualWarning] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeSet = useRef(new Set(excludeEmails.map(e => e.toLowerCase())));
  useEffect(() => {
    excludeSet.current = new Set(excludeEmails.map(e => e.toLowerCase()));
  }, [excludeEmails]);

  // Track mount for portal
  useEffect(() => { setMounted(true); }, []);

  // Update dropdown position
  const updatePosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchEmployees(q);
      const filtered = data.filter(e => !excludeSet.current.has(e.mail.toLowerCase()));
      setResults(filtered);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    setManualWarning(false);

    if (val.includes('@')) {
      setManualWarning(true);
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }

  function handleSelect(emp: Employee) {
    onSelect(emp);
    setQuery('');
    setResults([]);
    setOpen(false);
    setManualWarning(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  // Close on outside click — check both container and portal dropdown
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const dropdown = open && mounted && (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: Math.max(dropdownPos.width, 320),
        maxWidth: 480,
        zIndex: 9999,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxHeight: '280px',
        overflowY: 'auto' as const,
      }}
    >
      {results.length === 0 && !loading ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-slate-400">No NESR employees found for &lsquo;{query}&rsquo;</p>
        </div>
      ) : (
        results.map((emp, idx) => (
          <button
            key={emp.id}
            type="button"
            onClick={() => handleSelect(emp)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 cursor-pointer transition-colors ${
              idx < results.length - 1 ? 'border-b border-slate-100' : ''
            }`}
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-white leading-none">
                {getInitials(emp.display_name)}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-800 truncate">
                {highlightMatch(emp.display_name, query)}
              </p>
              {(emp.job_title || emp.department) && (
                <p className="text-[11px] text-slate-400 truncate">
                  {emp.job_title && highlightMatch(emp.job_title, query)}
                  {emp.job_title && emp.department && ' · '}
                  {emp.department && highlightMatch(emp.department, query)}
                </p>
              )}
              <p className="text-[11px] text-slate-400 truncate">
                {highlightMatch(emp.mail, query)}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            updatePosition();
            if (results.length > 0 && query.length >= 2) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c] transition-colors pr-7"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <svg className="w-3.5 h-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}
      </div>

      {manualWarning && (
        <p className="mt-1 text-[10px] text-amber-600 font-medium">
          Only NESR employees can be added to CC. Search by name or department.
        </p>
      )}

      <p className="mt-1 text-[11px] text-gray-400">Search NESR employees by name or department</p>

      {mounted ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
