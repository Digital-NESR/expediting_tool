'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchEmployees, type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';

/**
 * Employee-directory picker shared by the ProcureGuard approvals panel and the
 * Laptop approver matrix.
 *
 * The two copies had drifted: the Laptop one had the better debounce (results are
 * stamped with the query they answered, so the effect never calls setState
 * synchronously and a slow response can't overwrite a newer one) plus an optional
 * "clear this assignment" footer. That implementation is the one kept here. The
 * bits of copy that genuinely differ between the two panels stay props so neither
 * panel's wording changes.
 */

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return s.toUpperCase() || '?';
}

/* Fixed-positioned rather than absolute so the table's horizontal scroll can't clip it. */
export function EmployeePicker({
  pos,
  onPick,
  onClear,
  onClose,
  placeholder = 'Search name or email…',
  searchingLabel = 'Searching…',
  noMatchesLabel = 'No matches in the employee directory.',
  clearLabel = 'Clear this assignment',
}: {
  pos: { top: number; left: number };
  onPick: (emp: EmployeeDirectoryEntry) => void;
  onClear?: () => void;
  onClose: () => void;
  placeholder?: string;
  searchingLabel?: string;
  noMatchesLabel?: string;
  clearLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [answered, setAnswered] = useState<{
    query: string;
    rows: EmployeeDirectoryEntry[];
  } | null>(null);

  const query = q.trim();
  const tooShort = query.length < 2;
  const rows = answered?.query === query ? answered.rows : null;

  useEffect(() => {
    const pending = q.trim();
    if (pending.length < 2) return;
    let active = true;
    const t = setTimeout(async () => {
      const r = await searchEmployees(pending);
      if (active) setAnswered({ query: pending, rows: r });
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#307c4c]"
      />
      <div className="mt-1.5 max-h-56 overflow-auto">
        {tooShort ? (
          <div className="px-2 py-3 text-xs text-slate-400">Type at least 2 characters.</div>
        ) : rows === null ? (
          <div className="px-2 py-3 text-xs text-slate-400">{searchingLabel}</div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-3 text-xs text-slate-400">{noMatchesLabel}</div>
        ) : (
          rows.map((emp) => (
            <button
              key={emp.email}
              type="button"
              onClick={() => onPick(emp)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[9px] font-bold text-[#307c4c]">
                {personInitials(emp.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-800">
                  {emp.name}
                </span>
                <span className="block truncate text-[11px] text-slate-400">{emp.email}</span>
              </span>
            </button>
          ))
        )}
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 w-full border-t border-slate-100 px-2 py-1.5 text-left text-[11px] font-semibold text-red-600 hover:bg-red-50"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}

/** Shared anchor logic for the fixed-positioned picker (used by cells and column headers). */
export function usePickerAnchor() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const toggle = useCallback(() => {
    setOpen((o) => {
      if (o) return false;
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        const left = Math.min(r.left, window.innerWidth - 288 - 12);
        setPos({ top: r.bottom + 4, left: Math.max(12, left) });
      }
      return true;
    });
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return { btnRef, open, pos, toggle, close };
}

export function PickerPortal({
  open,
  pos,
  onPick,
  onClear,
  onClose,
  placeholder,
  searchingLabel,
  noMatchesLabel,
  clearLabel,
}: {
  open: boolean;
  pos: { top: number; left: number } | null;
  onPick: (emp: EmployeeDirectoryEntry) => void;
  onClear?: () => void;
  onClose: () => void;
  placeholder?: string;
  searchingLabel?: string;
  noMatchesLabel?: string;
  clearLabel?: string;
}) {
  if (!open || !pos) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <EmployeePicker
        pos={pos}
        onPick={onPick}
        onClear={onClear}
        onClose={onClose}
        placeholder={placeholder}
        searchingLabel={searchingLabel}
        noMatchesLabel={noMatchesLabel}
        clearLabel={clearLabel}
      />
    </>
  );
}
