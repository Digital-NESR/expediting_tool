'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  clearCatalogCountryApprover,
  getCatalogApproverMatrix,
  setCatalogCountryApprover,
  type CatalogApproverCell,
} from '@/app/actions/catalog-manager';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

/**
 * One approver per country, as a grid.
 *
 * The screen this replaces was a three-dropdown add form over a list of whoever happened to be
 * assigned. It answers "who approves Oman?" only by reading every row, and it offered people from
 * `app_user`, so somebody who had never opened Catalog Repo could not be made its approver at
 * all -- which is most of the people you would want to name. A country per row says who is
 * missing as plainly as who is set, and the picker searches the employee directory, which is
 * where the person actually is.
 *
 * Built on the same `usePickerAnchor`/`PickerPortal` pair as the Laptop approver matrix and the
 * ProcureGuard approvals panel, rather than a fourth hand-rolled search box.
 */
export default function CatalogApproverMatrixClient({
  initialCells,
}: {
  /**
   * Rows to start from instead of fetching. The admin panel passes nothing and the grid loads its
   * own; the dev preview passes stubs, because this screen sits behind SSO *and* behind an admin
   * check, so there is otherwise no way to look at it before it ships.
   */
  initialCells?: CatalogApproverCell[];
} = {}) {
  const [cells, setCells] = useState<CatalogApproverCell[]>(initialCells ?? []);
  const [loading, setLoading] = useState(!initialCells);
  const [savingCountry, setSavingCountry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await getCatalogApproverMatrix();
    setCells(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!initialCells) void load();
    // Preview rows are a fixed prop; the real panel loads once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unset = cells.filter((c) => !c.email).length;

  async function run(countryCode: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setSavingCountry(countryCode);
    setError(null);
    const res = await fn();
    if (!res.success) setError(res.error ?? 'That did not work.');
    await load();
    setSavingCountry(null);
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">Country Approvers</h2>
        <p className="text-[13px] text-slate-500">
          Who signs off catalogue rates for each country. An approver only sees the approval queue
          for the countries set here, and being listed here is itself access to that country.
        </p>
      </div>

      <p className="mb-4 text-[12px] text-slate-400">
        {loading
          ? ' '
          : unset === 0
            ? 'Every country has an approver.'
            : `${unset} ${unset === 1 ? 'country has' : 'countries have'} no approver yet.`}
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Approver</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && cells.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                  No active countries.
                </td>
              </tr>
            )}
            {!loading &&
              cells.map((cell) => (
                <tr key={cell.countryCode} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-sm font-medium text-slate-700">
                    {cell.countryName}
                  </td>
                  <td className="px-4 py-2">
                    <ApproverCell
                      cell={cell}
                      saving={savingCountry === cell.countryCode}
                      onAssign={(emp) =>
                        run(cell.countryCode, () =>
                          setCatalogCountryApprover({
                            countryCode: cell.countryCode,
                            email: emp.email,
                            name: emp.name,
                          }),
                        )
                      }
                      onClear={() =>
                        run(cell.countryCode, () => clearCatalogCountryApprover(cell.countryCode))
                      }
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApproverCell({
  cell,
  saving,
  onAssign,
  onClear,
}: {
  cell: CatalogApproverCell;
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
        title={cell.email ? `${cell.name ?? cell.email} · ${cell.email}` : 'Assign an approver'}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[#307c4c]/5 disabled:opacity-50"
      >
        {saving ? (
          <span className="text-xs text-slate-400">Saving…</span>
        ) : cell.email ? (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[10px] font-bold text-[#307c4c]">
              {personInitials(cell.name ?? cell.email)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-slate-700">
                {cell.name ?? cell.email}
              </span>
              <span className="block truncate text-[11px] text-slate-400">{cell.email}</span>
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-300">Not assigned</span>
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
        onClear={
          cell.email
            ? () => {
                close();
                onClear();
              }
            : undefined
        }
        onClose={close}
        clearLabel="Clear this country's approver"
      />
    </>
  );
}
