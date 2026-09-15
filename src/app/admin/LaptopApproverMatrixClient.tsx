'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  getLaptopApproverMatrix,
  setLaptopApproverCell,
  setLaptopApproverColumn,
  setLaptopApproverCountryActive,
} from '@/app/actions/laptopProcurement';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import {
  personInitials,
  usePickerAnchor,
  PickerPortal,
} from './_components/EmployeePicker';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopApproverMatrixRow } from '@/types/laptopProcurement';

/* ── Columns ──────────────────────────────────────────────────────
   One column per approver slot on laptop_approver_matrix. IT Manager has three
   co-manager slots (all carrying identical IT Manager authority); every other stage has
   exactly one. `role`/`slot` address a column server-side for the assign-for-every-country
   path; `nameCol`/`emailCol` address it row-side for single-cell edits. */
interface MatrixColumn {
  key: string;
  label: string;
  role: LaptopApprovalStage;
  slot: number;
  nameCol: keyof LaptopApproverMatrixRow;
  emailCol: keyof LaptopApproverMatrixRow;
}

const COLUMNS: MatrixColumn[] = [
  { key: 'itm1', label: 'IT Manager', role: 'IT Manager', slot: 1, nameCol: 'it_manager_name', emailCol: 'it_manager_email' },
  { key: 'itm2', label: 'IT Manager 2', role: 'IT Manager', slot: 2, nameCol: 'it_manager_2_name', emailCol: 'it_manager_2_email' },
  { key: 'itm3', label: 'IT Manager 3', role: 'IT Manager', slot: 3, nameCol: 'it_manager_3_name', emailCol: 'it_manager_3_email' },
  { key: 'cm', label: 'Country Manager', role: 'Country Manager', slot: 1, nameCol: 'cm_name', emailCol: 'cm_email' },
  { key: 'itd', label: 'IT Director', role: 'IT Director', slot: 1, nameCol: 'itd_name', emailCol: 'itd_email' },
  { key: 'scd', label: 'SC Director', role: 'Supply Chain Director', slot: 1, nameCol: 'scd_name', emailCol: 'scd_email' },
];

function cellValue(row: LaptopApproverMatrixRow, col: MatrixColumn): { name: string; email: string } | null {
  const email = ((row[col.emailCol] as string | null) ?? '').trim();
  if (!email) return null;
  const name = ((row[col.nameCol] as string | null) ?? '').trim();
  return { name: name || email, email };
}

/* personInitials / EmployeePicker / usePickerAnchor / PickerPortal are shared with the
   ProcureGuard approvals panel and now live in ./_components/EmployeePicker. This panel
   uses the shared defaults verbatim. */

function EditableApproverCell({
  cell,
  saving,
  onAssign,
  onClear,
}: {
  cell: { name: string; email: string } | null;
  saving: boolean;
  onAssign: (emp: EmployeeDirectoryEntry) => void;
  onClear: () => void;
}) {
  const { btnRef, open, pos, toggle, close } = usePickerAnchor();
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={saving}
        onClick={toggle}
        title={cell ? `${cell.name} · ${cell.email}` : 'Assign an approver'}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[#307c4c]/5 disabled:opacity-50"
      >
        {saving ? (
          <span className="text-xs text-slate-400">Saving…</span>
        ) : cell ? (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[10px] font-bold text-[#307c4c]">
              {personInitials(cell.name)}
            </span>
            <span className="truncate text-[13px] font-medium text-slate-700">{cell.name}</span>
          </>
        ) : (
          <span className="text-xs text-slate-300">Not assigned</span>
        )}
        <Pencil className="ml-auto h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      <PickerPortal
        open={open}
        pos={pos}
        onPick={emp => { close(); onAssign(emp); }}
        onClear={cell ? () => { close(); onClear(); } : undefined}
        onClose={close}
      />
    </>
  );
}

// Clickable column heading: picking a person assigns that role for EVERY country at once.
function ColumnHeader({
  col,
  busy,
  onAssign,
}: {
  col: MatrixColumn;
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
          <span className="normal-case tracking-normal text-slate-400">· saving…</span>
        ) : (
          <Pencil className="h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </button>
      <PickerPortal open={open} pos={pos} onPick={emp => { close(); onAssign(emp); }} onClose={close} />
    </>
  );
}

export default function LaptopApproverMatrixClient() {
  const [rows, setRows] = useState<LaptopApproverMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savingCol, setSavingCol] = useState<string | null>(null);
  const [savingActive, setSavingActive] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (opts?: { refreshing?: boolean }) => {
    if (opts?.refreshing) setIsRefreshing(true);
    try {
      const data = await getLaptopApproverMatrix();
      setRows(data ?? []);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Writes just this one cell, then patches local state so the matrix doesn't flash
  // through a full reload on every edit.
  async function saveCell(row: LaptopApproverMatrixRow, col: MatrixColumn, name: string, email: string) {
    setSavingCell(`${row.id}|${col.key}`);
    setError('');
    const result = await setLaptopApproverCell({
      country: row.country,
      role: col.role,
      slot: col.slot,
      email,
      displayName: name,
    });
    setSavingCell(null);
    if (!result.success) {
      setError(result.error ?? 'Failed to update approver.');
      return;
    }
    setRows(prev => prev.map(r => (
      r.id === row.id ? { ...r, [col.nameCol]: name || null, [col.emailCol]: email || null } : r
    )));
  }

  async function assignColumn(col: MatrixColumn, emp: EmployeeDirectoryEntry) {
    setSavingCol(col.key);
    setError('');
    const result = await setLaptopApproverColumn({ role: col.role, slot: col.slot, email: emp.email, displayName: emp.name });
    setSavingCol(null);
    if (!result.success) {
      setError(result.error ?? 'Failed to update this role for every country.');
      return;
    }
    setRows(prev => prev.map(r => ({ ...r, [col.nameCol]: emp.name, [col.emailCol]: emp.email })));
  }

  async function toggleActive(row: LaptopApproverMatrixRow) {
    setSavingActive(row.id);
    setError('');
    const result = await setLaptopApproverCountryActive({ country: row.country, isActive: !row.is_active });
    setSavingActive(null);
    if (!result.success) {
      setError(result.error ?? 'Failed to update country status.');
      return;
    }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, is_active: !row.is_active } : r)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading approvers…</span>
      </div>
    );
  }

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
          disabled={isRefreshing}
          onClick={() => void load({ refreshing: true })}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="text-[12px] text-slate-400">
        The approver notified at each stage in each country, in order: IT Manager → Country Manager → IT Director → Supply
        Chain Director. IT Manager has three interchangeable slots — anyone in them holds full IT Manager authority. Click any
        cell to reassign from the employee directory, or a column heading to set that role for every country.
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
          No approver assignments found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Country</th>
                  {COLUMNS.map(col => (
                    <th key={col.key} className="px-3 py-3">
                      <ColumnHeader col={col} busy={savingCol === col.key} onAssign={emp => void assignColumn(col, emp)} />
                    </th>
                  ))}
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr key={row.id} className={`hover:bg-[#307c4c]/[0.03] ${row.is_active ? '' : 'opacity-60'}`}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-semibold text-slate-900">{row.country}</td>
                    {COLUMNS.map(col => (
                      <td key={col.key} className="min-w-[160px] px-2 py-1 align-top">
                        <EditableApproverCell
                          cell={cellValue(row, col)}
                          saving={savingCell === `${row.id}|${col.key}`}
                          onAssign={emp => void saveCell(row, col, emp.name, emp.email)}
                          onClear={() => void saveCell(row, col, '', '')}
                        />
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        disabled={savingActive === row.id}
                        onClick={() => void toggleActive(row)}
                        title={row.is_active ? 'Click to deactivate this country' : 'Click to activate this country'}
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition disabled:opacity-50 ${
                          row.is_active
                            ? 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#307c4c] hover:bg-[#307c4c]/20'
                            : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {savingActive === row.id ? 'Saving…' : row.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
