'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · service register.

   Everything the country rents or receives on a recurring basis,
   whether or not it is in this month's cycle. Read-only: the
   register is loaded from the source workbooks, and editing it is
   a decision of its own rather than a side effect of seeing it.

   Search runs over every column a person would type from memory —
   plate, description, supplier, cost center, service number —
   because "where is 23X70474" is the question this page answers.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { RegisterRow, RrsmScope } from '@/app/actions/rrsm/overview';
import { daysUntil } from '@/lib/rrsm/renewals';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';

type Filter = 'on' | 'off' | 'all';

function isOnHire(r: RegisterRow): boolean {
  return r.active && !r.offHireDate;
}

export default function RrsmRegisterClient({
  scope,
  rows,
}: {
  scope: RrsmScope;
  rows: RegisterRow[];
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('on');
  const today = useMemo(() => new Date(), []);

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  const counts = useMemo(() => {
    const on = rows.filter(isOnHire).length;
    return { on, off: rows.length - on, all: rows.length };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'on' && !isOnHire(r)) return false;
      if (filter === 'off' && isOnHire(r)) return false;
      if (!needle) return true;
      return [
        r.description,
        r.assetRef,
        r.supplierName,
        r.supplierCode,
        r.segment,
        r.costCenter,
        r.costCenterName,
        r.serviceNumber,
        r.ownerEmail,
      ].some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  if (!scope.country) {
    return (
      <RrsmShell scope={scope} title="Service register">
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  const currency = scope.country.currency;

  return (
    <RrsmShell
      scope={scope}
      title="Service register"
      subtitle={`Every rented asset and recurrent service in ${scope.country.name}. ${counts.on} on hire, ${counts.off} off hire.`}
    >
      {/* ── search and filter ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plate, description, supplier, cost center, service number…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#307c4c]"
          />
        </label>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
          {(
            [
              ['on', 'On hire'],
              ['off', 'Off hire'],
              ['all', 'All'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === id ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label} <span className="opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── the list ──────────────────────────────────────────── */}
      {!rows.length ? (
        <RrsmEmpty
          title="The register is empty"
          body="No service lines have been loaded for this country yet."
        />
      ) : !shown.length ? (
        <RrsmEmpty title="Nothing matches" body="Try a shorter search, or switch the filter to All." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 text-left font-semibold">Asset / service</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Supplier</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Segment · cost center</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Rate</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Contract ends</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const onHire = isOnHire(r);
                  const left = r.contractEndsOn
                    ? daysUntil(new Date(r.contractEndsOn + 'T00:00:00Z'), today)
                    : null;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{r.description}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-slate-400">
                          {r.assetRef && <span>{r.assetRef}</span>}
                          {r.serviceNumber && <span>SN {r.serviceNumber}</span>}
                          <span>{r.operatingModel === 'shared_support' ? 'Shared support' : 'Segment based'}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="text-slate-700">{r.supplierName}</div>
                        <div className="font-mono text-[10.5px] text-slate-400">
                          {r.supplierCode}
                          {r.paymentTerms && ` · ${r.paymentTerms}`}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="text-slate-700">{r.segment}</div>
                        <div
                          className="font-mono text-[10.5px] text-slate-400"
                          title={r.costCenterName || undefined}
                        >
                          {r.costCenter}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-700">
                        {r.rate === null ? '—' : money.format(r.rate)}
                        <div className="text-[10.5px] text-slate-400">
                          {currency} / {r.uom}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        {r.contractEndsOn ? (
                          <>
                            <div className="text-slate-700">{r.contractEndsOn}</div>
                            {onHire && left !== null && left <= 90 && (
                              <div
                                className={`text-[11px] font-semibold ${
                                  left < 0 ? 'text-red-600' : left <= 30 ? 'text-amber-600' : 'text-slate-500'
                                }`}
                              >
                                {left < 0 ? `${-left} days ago` : left === 0 ? 'Today' : `In ${left} days`}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">No end date</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                            onHire ? 'bg-[#e6f1ea] text-[#1d4f31]' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {onHire ? 'On hire' : 'Off hire'}
                        </span>
                        {r.offHireDate && (
                          <div className="mt-1 text-[11px] text-slate-400">since {r.offHireDate}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[12px] text-slate-500">
            Showing {shown.length} of {rows.length}
          </div>
        </div>
      )}
    </RrsmShell>
  );
}
