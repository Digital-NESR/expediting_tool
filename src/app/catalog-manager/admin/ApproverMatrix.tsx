'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  clearCatalogCountryApprover,
  getCatalogApproverMatrix,
  seedCatalogApproversFromProcureGuard,
  setCatalogCountryApprover,
  type CatalogApproverCell,
} from '@/app/actions/catalog-manager';
import { searchEmployees } from '@/app/actions/employeeDirectory';

/**
 * One approver per country, as a grid.
 *
 * The screen this replaces was a three-dropdown add form over a list of whoever happened to be
 * assigned, which answers "who approves Oman?" only by reading every row — and offered users
 * from `app_user`, so somebody who had never opened Catalog Repo could not be made its approver
 * at all. A country per row says who is missing as plainly as who is set, and the picker searches
 * the employee directory, which is where the person actually is.
 */
export default function ApproverMatrix({
  initialCells,
}: {
  /**
   * Rows to start from instead of fetching. The admin page passes nothing and the grid loads its
   * own; the dev preview passes stubs, because this screen sits behind SSO *and* behind an admin
   * check, so there is otherwise no way to look at it before it ships.
   */
  initialCells?: CatalogApproverCell[];
} = {}) {
  const [cells, setCells] = useState<CatalogApproverCell[]>(initialCells ?? []);
  const [loading, setLoading] = useState(!initialCells);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () =>
    getCatalogApproverMatrix().then((rows) => {
      setCells(rows);
      setLoading(false);
    });

  useEffect(() => {
    if (!initialCells) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unset = cells.filter((c) => !c.email).length;
  const seeded = cells.filter((c) => c.seeded).length;

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.success) setNote(res.error ?? 'That did not work.');
      else setNote(null);
      setEditing(null);
      await load();
    });
  }

  return (
    <div>
      <p className="mb-1 text-[13px] text-slate-500">
        Who signs off catalogue rates for each country. An approver only sees the approval queue for
        the countries set here, and being listed here is itself access to that country.
      </p>
      <p className="mb-4 text-[12px] text-slate-400">
        {unset === 0
          ? 'Every country has an approver.'
          : `${unset} ${unset === 1 ? 'country has' : 'countries have'} no approver yet.`}
        {seeded > 0 &&
          ` ${seeded} still carry the ProcureGuard default — worth confirming, since those people were chosen to approve adhoc payments rather than rates.`}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending || unset === 0}
          onClick={() =>
            run(async () => {
              const res = await seedCatalogApproversFromProcureGuard();
              if (res.success) {
                setNote(
                  `Filled ${res.filled ?? 0} ${res.filled === 1 ? 'country' : 'countries'} from ProcureGuard` +
                    (res.skipped?.length ? `. No SCM found for: ${res.skipped.join(', ')}.` : '.'),
                );
                return { success: true };
              }
              return res;
            })
          }
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          Fill empty rows from ProcureGuard
        </button>
        {note && <span className="text-[12px] font-medium text-slate-600">{note}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Approver</th>
              <th className="px-4 py-2.5 text-right">—</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              cells.map((cell) => (
                <tr key={cell.countryCode} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">
                    {cell.countryName}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing === cell.countryCode ? (
                      <EmployeeSearch
                        onPick={(email, name) =>
                          run(() =>
                            setCatalogCountryApprover({
                              countryCode: cell.countryCode,
                              email,
                              name,
                            }),
                          )
                        }
                        onCancel={() => setEditing(null)}
                      />
                    ) : cell.email ? (
                      <span className="text-sm text-slate-700">
                        {cell.name ?? cell.email}
                        <span className="ml-2 text-[12px] text-slate-400">{cell.email}</span>
                        {cell.seeded && (
                          <span
                            title="Inherited from the ProcureGuard Country SCM. Nobody has confirmed it for the catalogue."
                            className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                          >
                            ProcureGuard default
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editing !== cell.countryCode && (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setEditing(cell.countryCode)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
                        >
                          {cell.email ? 'Change' : 'Set'}
                        </button>
                        {cell.email && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => run(() => clearCatalogCountryApprover(cell.countryCode))}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 disabled:opacity-50"
                          >
                            Clear
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Directory search, so the approver can be anyone at NESR rather than only existing users. */
function EmployeeSearch({
  onPick,
  onCancel,
}: {
  onPick: (email: string, name: string) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ name: string; email: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(() => {
      searchEmployees(q).then((rows) =>
        setHits(
          rows
            .filter((r) => r.email)
            .slice(0, 6)
            .map((r) => ({ name: r.name || r.email, email: r.email })),
        ),
      );
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] outline-none focus:border-[#307c4c]"
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      {hits.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {hits.map((h) => (
            <li key={h.email}>
              <button
                type="button"
                onClick={() => onPick(h.email, h.name)}
                className="block w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{h.name}</span>
                <span className="ml-2 text-slate-400">{h.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-1 text-[12px] text-slate-400">No one found.</p>
      )}
    </div>
  );
}
