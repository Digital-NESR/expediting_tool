'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  getProcureGuardApproverMatrix,
  setProcureGuardApprover,
  setProcureGuardApproverForColumn,
  getProcureGuardViewerGrants,
  updateProcureGuardPermission,
  deleteProcureGuardAccessRequest,
  type ProcureGuardApproverMatrix,
  type ApproverMatrixColumn,
  type ApproverCell,
  type ProcureGuardViewerGrant,
} from '@/app/actions/procureGuard';
import { searchEmployees, type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { COUNTRY_OPTIONS } from '@/lib/procureGuard-utils';

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

// Shared anchor logic for the fixed-positioned employee picker (used by both cells and column headers).
function usePickerAnchor() {
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

function PickerPortal({
  open,
  pos,
  onPick,
  onClose,
}: {
  open: boolean;
  pos: { top: number; left: number } | null;
  onPick: (emp: EmployeeDirectoryEntry) => void;
  onClose: () => void;
}) {
  if (!open || !pos) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <EmployeePicker pos={pos} onPick={onPick} onClose={onClose} />
    </>
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
  const { btnRef, open, pos, toggle, close } = usePickerAnchor();
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
      <PickerPortal
        open={open}
        pos={pos}
        onPick={(emp) => {
          close();
          onAssign(emp);
        }}
        onClose={close}
      />
    </>
  );
}

// Clickable column header: picking a person reassigns that role for EVERY country at once.
function ColumnHeader({
  col,
  busy,
  onAssign,
}: {
  col: ApproverMatrixColumn;
  busy: boolean;
  onAssign: (emp: EmployeeDirectoryEntry) => void;
}) {
  const { btnRef, open, pos, toggle, close } = usePickerAnchor();
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={busy}
        onClick={toggle}
        title="Assign this role for every country"
        className="group flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-[#307c4c] disabled:opacity-50"
      >
        {col.label}
        {busy ? (
          <span className="normal-case tracking-normal text-slate-400">· saving...</span>
        ) : (
          <Pencil className="h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
      <PickerPortal
        open={open}
        pos={pos}
        onPick={(emp) => {
          close();
          onAssign(emp);
        }}
        onClose={close}
      />
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
  const [savingCol, setSavingCol] = useState<string | null>(null);
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

  async function assignColumn(col: ApproverMatrixColumn, emp: EmployeeDirectoryEntry) {
    setSavingCol(col.key);
    setError('');
    const res = await setProcureGuardApproverForColumn({
      notificationRole: col.notificationRole,
      requestType: col.requestType,
      email: emp.email,
      displayName: emp.name,
    });
    setSavingCol(null);
    if (!res.success) {
      setError(res.error ?? 'Failed to update column.');
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      const cells = { ...prev.cells };
      for (const country of prev.countries) {
        cells[country] = { ...cells[country], [col.key]: { name: emp.name, email: emp.email } };
      }
      return { ...prev, cells };
    });
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
                  <th key={col.key} className="px-3 py-3">
                    <ColumnHeader col={col} busy={savingCol === col.key} onAssign={(emp) => assignColumn(col, emp)} />
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

/* ── Grant Viewer access (read-only, scoped by country) ── */

function CountryScopePicker({
  all,
  selected,
  onToggleAll,
  onToggleCountry,
}: {
  all: boolean;
  selected: Set<string>;
  onToggleAll: () => void;
  onToggleCountry: (country: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
        <input type="checkbox" checked={all} onChange={onToggleAll} className="h-4 w-4 accent-[#307c4c]" />
        All countries
      </label>
      <div className={`mt-1 grid max-h-40 grid-cols-2 gap-x-2 overflow-auto border-t border-slate-100 pt-1 ${all ? 'pointer-events-none opacity-40' : ''}`}>
        {COUNTRY_OPTIONS.map((c) => (
          <label key={c} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-slate-600 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(c)} disabled={all} onChange={() => onToggleCountry(c)} className="h-3.5 w-3.5 accent-[#307c4c]" />
            <span className="truncate">{c}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function toggleInSet(setter: (fn: (prev: Set<string>) => Set<string>) => void, country: string) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(country)) next.delete(country);
    else next.add(country);
    return next;
  });
}

function GrantViewerAccess() {
  const [grants, setGrants] = useState<ProcureGuardViewerGrant[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Grant form
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const picker = usePickerAnchor();

  // Inline edit
  const [editEmail, setEditEmail] = useState<string | null>(null);
  const [editAll, setEditAll] = useState(true);
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setGrants(await getProcureGuardViewerGrants());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function grant() {
    if (!person) return;
    if (!all && selected.size === 0) {
      setError('Pick at least one country, or choose All countries.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await updateProcureGuardPermission({
      email: person.email,
      name: person.name,
      role: 'Viewer',
      country: all ? undefined : [...selected].join(', '),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to grant Viewer access.');
      return;
    }
    setPerson(null);
    setAll(true);
    setSelected(new Set());
    await load();
  }

  async function saveEdit(g: ProcureGuardViewerGrant) {
    if (!editAll && editSelected.size === 0) {
      setError('Pick at least one country, or choose All countries.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await updateProcureGuardPermission({
      email: g.email,
      name: g.name,
      role: 'Viewer',
      country: editAll ? undefined : [...editSelected].join(', '),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to update Viewer access.');
      return;
    }
    setEditEmail(null);
    await load();
  }

  async function revoke(g: ProcureGuardViewerGrant) {
    setSaving(true);
    setError('');
    const res = await deleteProcureGuardAccessRequest(g.email);
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to revoke access.');
      return;
    }
    await load();
  }

  return (
    <section className="mt-8">
      <h3 className="mb-1 text-sm font-bold text-slate-900">Grant Viewer Access</h3>
      <p className="mb-3 text-[12px] text-slate-400">
        Give someone read-only visibility of requests and analytics, scoped to specific countries or all countries.
        Revoking drops them back to Requester.
      </p>

      {error && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
      )}

      {/* Grant form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Person</label>
            <button
              ref={picker.btnRef}
              type="button"
              onClick={picker.toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-[#307c4c]/40"
            >
              {person ? (
                <>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[9px] font-bold text-[#307c4c]">{personInitials(person.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{person.name}</span>
                </>
              ) : (
                <span className="text-slate-400">Search employee...</span>
              )}
            </button>
            <PickerPortal open={picker.open} pos={picker.pos} onPick={(e) => { picker.close(); setPerson(e); }} onClose={picker.close} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Countries</label>
            <CountryScopePicker all={all} selected={selected} onToggleAll={() => setAll((a) => !a)} onToggleCountry={(c) => toggleInSet(setSelected, c)} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!person || saving}
            onClick={grant}
            className="rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#276440] disabled:opacity-50"
          >
            Grant Viewer access
          </button>
        </div>
      </div>

      {/* Current viewers */}
      <div className="mt-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current viewers</h4>
        {grants === null ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : grants.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">No Viewer grants yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {grants.map((g) => (
              <div key={g.email} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[10px] font-bold text-[#307c4c]">{personInitials(g.name)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{g.name}</p>
                      <p className="truncate text-xs text-slate-400">{g.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setError(''); setEditEmail(g.email); setEditAll(g.countries.length === 0); setEditSelected(new Set(g.countries)); }}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50"
                    >
                      Modify
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => revoke(g)}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                {editEmail === g.email ? (
                  <div className="mt-3">
                    <CountryScopePicker all={editAll} selected={editSelected} onToggleAll={() => setEditAll((a) => !a)} onToggleCountry={(c) => toggleInSet(setEditSelected, c)} />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditEmail(null)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">Cancel</button>
                      <button type="button" disabled={saving || (!editAll && editSelected.size === 0)} onClick={() => saveEdit(g)} className="rounded-md bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.countries.length === 0 ? (
                      <span className="rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#307c4c]">All countries</span>
                    ) : (
                      g.countries.map((c) => <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{c}</span>)
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
      <GrantViewerAccess />
    </div>
  );
}
