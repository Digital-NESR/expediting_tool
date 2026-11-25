'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · cycle history.

   Every month the country has run, newest first, with what it
   came to. "Closed" is counted from the lines rather than read
   off the cycle's status, because a month is only finished when
   every line in it is, and the two can disagree.
   ───────────────────────────────────────────────────────────── */

import { useMemo } from 'react';
import type { HistoryRow, RrsmScope } from '@/app/actions/rrsm/overview';
import { periodLabel } from '@/lib/rrsm/cycle';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';

export default function RrsmHistoryClient({
  scope,
  rows,
}: {
  scope: RrsmScope;
  rows: HistoryRow[];
}) {
  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  if (!scope.country) {
    return (
      <RrsmShell scope={scope} title="Cycle history">
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  const currency = scope.country.currency;

  return (
    <RrsmShell
      scope={scope}
      title="Cycle history"
      subtitle={`Every monthly cycle ${scope.country.name} has run, with its value and how far it got.`}
    >
      {!rows.length ? (
        <RrsmEmpty
          title="No cycles yet"
          body="The first one appears here once a buyer opens a month on PR & PO."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 text-left font-semibold">Cycle</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Window</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Suppliers</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Lines</th>
                  <th className="px-2 py-2.5 text-right font-semibold">With PO</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const pct = r.lines ? Math.round((r.closedLines / r.lines) * 100) : 0;
                  const done = r.lines > 0 && r.closedLines === r.lines;
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">
                          {periodLabel(new Date(r.period + 'T00:00:00Z'))}
                        </div>
                        {i === 0 && !done && (
                          <span className="text-[11px] font-semibold text-[#307c4c]">Current</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-slate-500">
                        {r.opensOn} to {r.closesOn}
                      </td>
                      <td className="px-2 py-3 text-right text-slate-700">{r.suppliers}</td>
                      <td className="px-2 py-3 text-right text-slate-700">{r.lines}</td>
                      <td className="px-2 py-3 text-right text-slate-700">{r.withPo}</td>
                      <td className="whitespace-nowrap px-2 py-3 text-right font-mono font-semibold text-slate-800">
                        {money.format(r.value)}{' '}
                        <span className="text-[10.5px] font-normal text-slate-400">{currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={done ? 'h-full bg-[#1d4f31]' : 'h-full bg-[#6AAF8E]'}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-[12px] text-slate-500">
                            {done ? 'Closed' : `${r.closedLines} of ${r.lines} closed`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </RrsmShell>
  );
}
