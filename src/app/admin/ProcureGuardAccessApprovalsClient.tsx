'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  getProcureGuardApproverMatrix,
  setProcureGuardApprover,
  type ProcureGuardApproverMatrix,
  type ApproverMatrixColumn,
  type ApproverCell,
} from '@/app/actions/procureGuard';
import { searchEmployees, type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return s.toUpperCase() || '?';
}

/* ── Employee-directory picker (fixed-positioned so the table's horizontal scroll can't clip it) ── */
function EmployeePicker({
  pos,
  onPick,
  onClose,
}: {
  pos: { top: number; left: number };
  onPick: (emp: EmployeeDirectoryEntry) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<EmployeeDirectoryEntry[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchEmployees(q);
      if (active) {
        setResults(r);
        setSearching(false);
      }
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
        placeholder="Search name or email..."
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#307c4c]"
      />
      <div className="mt-1.5 max-h-56 overflow-auto">
        {searching ? (
          <div className="px-2 py-3 text-xs text-slate-400">Searching...</div>
        ) : q.trim().length < 2 ? (
          <div className="px-2 py-3 text-xs text-slate-400">Type at least 2 characters.</div>
        ) : results.length === 0 ? (
          <div className="px-2 py-3 text-xs text-slate-400">No matches.</div>
        ) : (
          results.map((emp) => (
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
                <span className="block truncate text-[13px] font-medium text-slate-800">{emp.name}</span>
                <span className="block truncate text-[11px] text-slate-400">{emp.email}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function EditableApproverCell({
  cell,
  saving,
  onAssign,
}: {
  cell: ApproverCell | null;
  saving: boolean;
  onAssign: (emp: EmployeeDirectoryEntry) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(r.left, window.innerWidth - 288 - 12);
      setPos({ top: r.bottom + 4, left: Math.max(12, left) });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={saving}
        onClick={toggle}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[#307c4c]/5 disabled:opacity-50"
      >
        {saving ? (
          <span className="text-xs text-slate-400">Saving...</span>
        ) : cell ? (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[10px] font-bold text-[#307c4c]">
              {personInitials(cell.name)}
            </span>
            <span className="truncate text-[13px] font-medium text-slate-700">{cell.name}</span>
          </>
        ) : (
          <span className="text-xs text-slate-300">Assign...</span>
        )}
        <Pencil className="ml-auto h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <EmployeePicker
            pos={pos}
            onPick={(emp) => {
              setOpen(false);
              onAssign(emp);
            }}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </>
  );
}

function EditableApproverMatrix({
  refreshKey,
  onLoaded,
}: {
  refreshKey: number;
  onLoaded?: () => void;
}) {
  const [data, setData] = useState<ProcureGuardApproverMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const d = await getProcureGuardApproverMatrix();
    setData(d);
    setLoading(false);
    onLoaded?.();
  }, [onLoaded]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function assign(country: string, col: ApproverMatrixColumn, emp: EmployeeDirectoryEntry) {
    const key = `${country}|${col.key}`;
    setSaving(key);
    setError('');
    const res = await setProcureGuardApprover({
      country,
      notificationRole: col.notificationRole,
      requestType: col.requestType,
      email: emp.email,
      displayName: emp.name,
    });
    setSaving(null);
    if (!res.success) {
      setError(res.error ?? 'Failed to update approver.');
      return;
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            cells: {
              ...prev.cells,
              [country]: { ...prev.cells[country], [col.key]: { name: emp.name, email: emp.email } },
            },
          }
        : prev,
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading approvers...</span>
      </div>
    );
  }

  if (!data || data.countries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
        No approver assignments found.
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Country</th>
                {data.columns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-3 py-3">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.countries.map((country) => (
                <tr key={country} className="hover:bg-[#307c4c]/[0.03]">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 font-semibold text-slate-900">{country}</td>
                  {data.columns.map((col) => (
                    <td key={col.key} className="min-w-[150px] px-2 py-1 align-top">
                      <EditableApproverCell
                        cell={data.cells[country]?.[col.key] ?? null}
                        saving={saving === `${country}|${col.key}`}
                        onAssign={(emp) => assign(country, col, emp)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function ProcureGuardAccessApprovalsClient({
  onPendingCountChange,
}: {
  userEmail?: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // The app is open-access now: there are no pending ProcureGuard access requests, so keep the nav badge cleared.
  useEffect(() => {
    onPendingCountChange?.(0);
  }, [onPendingCountChange]);

  const handleLoaded = useCallback(() => {
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Approvers by Country &amp; Role</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Last updated:{' '}
            {lastRefreshed
              ? lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '-'}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            setRefreshKey((k) => k + 1);
          }}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className="text-[12px] text-slate-400">
        The approver notified for each role in each country. Supply Chain Director is split into Adhoc and Advance. Click any
        cell to reassign from the employee directory.
      </p>
      <EditableApproverMatrix refreshKey={refreshKey} onLoaded={handleLoaded} />
    </div>
  );
}
