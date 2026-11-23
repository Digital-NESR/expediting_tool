'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · A recurrent service's PO history from SAP: what it cost
   each year, the change on the year before, and every PO behind
   it with the lines that were counted.

   Used in the service drawer and in the dashboard's drill-through.
   ───────────────────────────────────────────────────────────── */

import { createContext, useContext, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History, TrendingDown, TrendingUp } from 'lucide-react';
import { getRecurrentPoHistory } from '@/app/actions/rrsm/recurrent';
import type { PoHistory } from '@/lib/rrsm/po-history-read';

const BRAND = '#307c4c';

/** Where the history comes from: the server action, or sample data on the dev previews. */
export const PoHistoryLoader =
  createContext<(serviceId: number) => Promise<PoHistory>>(getRecurrentPoHistory);

const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function pct(change: number | null | undefined): string {
  if (change === null || change === undefined) return '';
  const p = Math.round(change * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

function ChangeChip({ change }: { change: number | null | undefined }) {
  if (change === null || change === undefined) return <span className="text-slate-300">—</span>;
  const up = change > 0.005;
  const down = change < -0.005;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        up
          ? 'bg-amber-50 text-amber-800'
          : down
            ? 'bg-[#e6f1ea] text-[#1d4f31]'
            : 'bg-slate-100 text-slate-500'
      }`}
    >
      {(up || down) && <Icon className="h-3 w-3" />}
      {up || down ? pct(change) : 'flat'}
    </span>
  );
}

export default function PoHistoryPanel({ serviceId }: { serviceId: number }) {
  const load = useContext(PoHistoryLoader);
  /* Kept with the service it was read for, so switching service shows "Reading" until it lands. */
  const [loaded, setLoaded] = useState<{ id: number; data: PoHistory } | null>(null);
  const data = loaded?.id === serviceId ? loaded.data : null;
  const [openPo, setOpenPo] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void load(serviceId).then((h) => live && setLoaded({ id: serviceId, data: h }));
    return () => {
      live = false;
    };
  }, [serviceId, load]);

  /* The chart follows one currency: the one the latest year was paid in. */
  const latest = data?.years[0];
  const currency = latest
    ? (Object.entries(latest.totals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '')
    : '';
  const chart = [...(data?.years ?? [])].reverse();
  const max = Math.max(1, ...chart.map((y) => y.totals[currency] ?? 0));
  const inCurrency = (data?.years ?? []).filter((y) => y.totals[currency] !== undefined);
  const average = inCurrency.length
    ? inCurrency.reduce((n, y) => n + (y.totals[currency] ?? 0), 0) / inCurrency.length
    : 0;
  const first = inCurrency[inCurrency.length - 1];
  const growth =
    latest && first && first !== latest && first.totals[currency]
      ? (latest.totals[currency] ?? 0) / (first.totals[currency] ?? 1) - 1
      : null;

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900">
        <History className="h-4 w-4 text-[#307c4c]" /> PO history and cost
      </h3>
      <p className="mt-0.5 text-[11.5px] text-slate-500">
        From SAP: the POs recorded on this service, and the supplier&apos;s other POs whose lines
        name it. Lines on a shared PO that belong to something else are left out.
      </p>

      {!data ? (
        <p className="mt-3 text-[12.5px] text-slate-400">Reading SAP…</p>
      ) : !data.ok ? (
        <p className="mt-3 text-[12.5px] text-slate-500">SAP could not be read just now.</p>
      ) : !data.pos.length ? (
        <p className="mt-3 text-[12.5px] text-slate-500">
          No POs found in SAP for this supplier and service. Check the supplier code, or record the
          PO number on the service.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label={`${latest!.year} spend`}
              value={`${compact.format(latest!.totals[currency] ?? 0)}`}
              unit={currency}
              title={`${money.format(latest!.totals[currency] ?? 0)} ${currency}`}
            />
            <Stat
              label={`vs ${latest!.year - 1}`}
              node={<ChangeChip change={latest!.change[currency]} />}
            />
            <Stat
              label="Average a year"
              value={compact.format(average)}
              unit={currency}
              title={`${money.format(average)} ${currency} over ${inCurrency.length} year(s)`}
            />
            <Stat
              label={first && first !== latest ? `Since ${first.year}` : 'POs'}
              node={
                first && first !== latest ? (
                  <ChangeChip change={growth} />
                ) : (
                  <span className="text-[15px] font-bold text-slate-900">{data.pos.length}</span>
                )
              }
            />
          </div>

          {chart.length > 1 && (
            <div className="mt-4 flex h-32 items-end gap-2">
              {chart.map((y) => {
                const v = y.totals[currency];
                return (
                  <div
                    key={y.year}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                    title={Object.entries(y.totals)
                      .map(([c, n]) => `${money.format(n)} ${c}`)
                      .join(' + ')}
                  >
                    <span className="text-[10.5px] font-semibold text-slate-600">
                      {v !== undefined ? compact.format(v) : '·'}
                    </span>
                    <span
                      className="block w-full max-w-[3rem] rounded-t"
                      style={{
                        height: `${Math.round(((v ?? 0) / max) * 84)}px`,
                        minHeight: v ? 4 : 1,
                        background: v ? BRAND : '#e2e8f0',
                      }}
                    />
                    <span className="text-[10.5px] text-slate-400">{y.year}</span>
                  </div>
                );
              })}
            </div>
          )}

          <table className="mt-4 w-full table-fixed text-[12.5px]">
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-24" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-1.5 text-left font-semibold">Year</th>
                <th className="px-2 py-1.5 text-right font-semibold">Spend</th>
                <th className="px-2 py-1.5 text-right font-semibold">vs year before</th>
                <th className="px-2 py-1.5 text-right font-semibold">POs</th>
              </tr>
            </thead>
            <tbody>
              {data.years.map((y) => (
                <tr key={y.year} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-semibold text-slate-700">{y.year}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                    {Object.entries(y.totals).map(([c, n]) => (
                      <div key={c}>
                        {money.format(n)} <span className="text-slate-400">{c}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {Object.keys(y.totals).map((c) => (
                      <div key={c}>
                        <ChangeChip change={y.change[c]} />
                      </div>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">{y.pos}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Every PO ({data.pos.length})
          </h4>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-100">
            {data.pos.map((p) => {
              const open = openPo === p.poNumber;
              return (
                <li key={p.poNumber}>
                  <button
                    type="button"
                    onClick={() => setOpenPo(open ? null : p.poNumber)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12.5px] hover:bg-slate-50"
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="shrink-0 font-mono text-slate-800">{p.poNumber}</span>
                    <span className="shrink-0 font-mono text-[11.5px] text-slate-400">
                      {p.created}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-slate-500"
                      title={p.lines[0]?.description}
                    >
                      {p.lines[0]?.description}
                    </span>
                    {p.recorded && (
                      <span className="shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        Recorded
                      </span>
                    )}
                    <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-slate-800">
                      {money.format(p.value)}{' '}
                      <span className="font-normal text-slate-400">{p.currency}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="bg-slate-50/60 px-8 pb-2.5 pt-1 text-[12px]">
                      <p className="mb-1 text-[11px] text-slate-500">
                        {p.releaseState || 'Status unknown'}
                        {p.matchedOn.length > 0 && <> · matched on “{p.matchedOn.join('”, “')}”</>}
                        {p.otherLines > 0 && (
                          <> · {p.otherLines} other line(s) on this PO left out</>
                        )}
                      </p>
                      <table className="w-full text-[12px]">
                        <tbody>
                          {p.lines.map((l) => (
                            <tr key={l.item}>
                              <td className="w-12 py-0.5 font-mono text-slate-400">{l.item}</td>
                              <td className="py-0.5 text-slate-600">{l.description}</td>
                              <td className="py-0.5 text-right font-mono text-slate-700">
                                {money.format(l.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  title,
  node,
}: {
  label: string;
  value?: string;
  unit?: string;
  title?: string;
  node?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2" title={title}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5">
        {node ?? (
          <span className="text-[17px] font-bold tracking-tight text-slate-900">
            {value} <span className="text-[11px] font-semibold text-slate-400">{unit}</span>
          </span>
        )}
      </div>
    </div>
  );
}
