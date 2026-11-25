'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Reports.

   What a country is getting in a month, grouped by supplier or
   by category (user request, 25 Nov 2026). Both views group the
   same list of units, so they always add up to the same total.
   Each group opens to its units: what it is, the plate, segment,
   cost center, quantity, rate and value. The month comes from the
   URL, so a report can be linked; the grouping, search and open
   groups are on the page.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Download, Search } from 'lucide-react';
import type { HistoryRow, RrsmScope } from '@/app/actions/rrsm/overview';
import type { ReportUnit, RrsmReport } from '@/app/actions/rrsm/reports';
import { STAGE_LABEL, periodLabel } from '@/lib/rrsm/cycle';
import RrsmShell, { RrsmEmpty, RrsmNoCountry, RrsmNotYourRole } from './components/RrsmShell';

type By = 'supplier' | 'category' | 'costCenter';

const BY_LABEL: Record<By, string> = {
  supplier: 'By supplier',
  category: 'By category',
  costCenter: 'By cost center',
};
const GROUP_HEAD: Record<By, string> = {
  supplier: 'Supplier',
  category: 'Category',
  costCenter: 'Cost center',
};
const GROUP_PLURAL: Record<By, string> = {
  supplier: 'suppliers',
  category: 'categories',
  costCenter: 'cost centers',
};

/** What a group is keyed on, and the "other" name shown beside each unit inside it. */
function keyOf(u: ReportUnit, by: By): string {
  return by === 'supplier'
    ? u.supplierCode
    : by === 'category'
      ? u.category
      : u.costCenter || 'No cost center';
}
function otherOf(u: ReportUnit, by: By): string {
  return by === 'supplier' ? u.category : u.supplierName;
}

interface Group {
  key: string;
  name: string;
  sub: string;
  units: ReportUnit[];
  value: number;
  /** The other dimension's distinct names: categories for a supplier, suppliers for a category. */
  other: string[];
}

function groupUnits(units: ReportUnit[], by: By): Group[] {
  const map = new Map<string, Group>();
  for (const u of units) {
    const key = keyOf(u, by);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: by === 'supplier' ? u.supplierName : key,
        sub: by === 'supplier' ? u.supplierCode : '',
        units: [],
        value: 0,
        other: [],
      };
      map.set(key, g);
    }
    g.units.push(u);
    g.value += u.value;
  }
  for (const g of map.values()) {
    g.other = [...new Set(g.units.map((u) => otherOf(u, by)))].sort();
    g.units.sort((a, b) => b.value - a.value || a.description.localeCompare(b.description));
  }
  return [...map.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** The visible rows as a CSV, so the report can go into Excel as it is on screen. */
function toCsv(groups: Group[], by: By): string {
  const head = [
    GROUP_HEAD[by],
    by === 'supplier' ? 'Category' : 'Supplier',
    'Supplier code',
    'Service',
    'Asset / plate',
    'Segment',
    'Cost center',
    'Unit',
    'Qty',
    'Rate',
    'Value',
    'Stage',
  ];
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(',')];
  for (const g of groups) {
    for (const u of g.units) {
      lines.push(
        [
          g.name,
          otherOf(u, by),
          u.supplierCode,
          u.description,
          u.assetRef,
          u.segment,
          u.costCenter,
          u.uom,
          u.qty,
          u.rate ?? '',
          u.value.toFixed(2),
          u.stage ? STAGE_LABEL[u.stage] : '',
        ]
          .map(q)
          .join(','),
      );
    }
  }
  return lines.join('\r\n');
}

export default function RrsmReportsClient({
  scope,
  report,
  history = [],
}: {
  scope: RrsmScope;
  report: RrsmReport | null;
  /** Every month the country has run, newest first (Cycle history, part of Reports). */
  history?: HistoryRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [by, setBy] = useState<By>('supplier');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  const units = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = report?.units ?? [];
    if (!needle) return all;
    return all.filter((u) =>
      [
        u.supplierName,
        u.supplierCode,
        u.category,
        u.description,
        u.assetRef,
        u.segment,
        u.costCenter,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [report, q]);
  const groups = useMemo(() => groupUnits(units, by), [units, by]);
  const total = useMemo(() => units.reduce((n, u) => n + u.value, 0), [units]);

  if (!scope.country) {
    return (
      <RrsmShell scope={scope} title="Reports">
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  if (!scope.canBuy) {
    return (
      <RrsmShell scope={scope} title="Reports">
        <RrsmNotYourRole what="Reports" />
      </RrsmShell>
    );
  }
  const currency = scope.country.currency;
  const sourceLabel =
    report?.sources.find((s) => s.key === report.source)?.label ?? 'On hire now (register)';

  function pickMonth(key: string) {
    const params = new URLSearchParams();
    if (scope.country) params.set('country', scope.country.code);
    params.set('month', key);
    setOpen(new Set());
    router.push(`${pathname}?${params.toString()}`);
  }

  function download() {
    const blob = new Blob(['﻿' + toCsv(groups, by)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RRSM ${scope.country?.name} ${BY_LABEL[by].toLowerCase()} - ${sourceLabel}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <RrsmShell
      scope={scope}
      title="Reports"
      subtitle={
        <>
          {sourceLabel} · {units.length} units · {groups.length} {GROUP_PLURAL[by]} ·{' '}
          <b className="font-semibold text-white">
            {money.format(total)} {currency}
          </b>
        </>
      }
      actions={
        <button
          type="button"
          onClick={download}
          disabled={!units.length}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download CSV
        </button>
      }
    >
      {/* ── controls ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['supplier', 'category', 'costCenter'] as By[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                setBy(b);
                setOpen(new Set());
              }}
              aria-pressed={by === b}
              className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                by === b ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {BY_LABEL[b]}
            </button>
          ))}
        </div>
        <select
          value={report?.source ?? 'register'}
          onChange={(e) => pickMonth(e.target.value)}
          aria-label="Month"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none"
        >
          {(report?.sources ?? []).map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search supplier, category, service, plate, cost center…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#6AAF8E]"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setOpen((prev) =>
              prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.key)),
            )
          }
          disabled={!groups.length}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {open.size === groups.length && groups.length ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* ── groups ───────────────────────────────────────── */}
      {!report?.units.length ? (
        <RrsmEmpty
          title="Nothing to report"
          body="This month has no lines, and nothing is on hire on the register."
        />
      ) : !groups.length ? (
        <RrsmEmpty title="No matches" body="Nothing matches that search." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span>{GROUP_HEAD[by]}</span>
            <span className="w-16 text-right">Units</span>
            <span className="w-36 text-right">Value ({currency})</span>
          </div>
          {groups.map((g) => {
            const isOpen = open.has(g.key);
            const share = total ? g.value / total : 0;
            return (
              <div key={g.key} className="border-t border-slate-100 first:border-t-0">
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <ChevronRight
                      className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-slate-800">
                        {g.name}
                        {g.sub && (
                          <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
                            {g.sub}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        {g.other.slice(0, 4).join(' · ')}
                        {g.other.length > 4 ? ` · +${g.other.length - 4} more` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="w-16 text-right text-[13px] text-slate-600">
                    {g.units.length}
                  </span>
                  <span className="w-36 text-right">
                    <span className="block font-mono text-[13px] font-semibold text-slate-800">
                      {money.format(g.value)}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-[#307c4c]"
                        style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                      />
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/40">
                    <table className="w-full min-w-[52rem] text-[12.5px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                          <th className="py-1.5 pl-10 pr-2 text-left font-semibold">Service</th>
                          <th className="px-2 py-1.5 text-left font-semibold">
                            {by === 'supplier' ? 'Category' : 'Supplier'}
                          </th>
                          <th className="px-2 py-1.5 text-left font-semibold">Segment</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Cost center</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Value</th>
                          {report.source !== 'register' && (
                            <th className="px-4 py-1.5 text-right font-semibold">Stage</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.units.map((u, i) => (
                          <tr key={i} className="border-t border-slate-100 align-top">
                            <td className="py-1.5 pl-10 pr-2">
                              <div className="text-slate-800">
                                {!u.onHire && (
                                  <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[9.5px] font-semibold text-slate-500">
                                    OFF
                                  </span>
                                )}
                                {u.description}
                              </div>
                              {u.assetRef && (
                                <div className="font-mono text-[10.5px] text-slate-400">
                                  {u.assetRef}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">{otherOf(u, by)}</td>
                            <td className="px-2 py-1.5 text-slate-600">{u.segment}</td>
                            <td className="px-2 py-1.5 font-mono text-[11.5px] text-slate-600">
                              {u.costCenter}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                              {u.qty}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                              {u.rate === null ? '—' : money.format(u.rate)}
                              <span className="ml-1 text-[10px] text-slate-400">/{u.uom}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono font-semibold text-slate-800">
                              {money.format(u.value)}
                            </td>
                            {report.source !== 'register' && (
                              <td className="px-4 py-1.5 text-right text-[11.5px] text-slate-500">
                                {u.stage ? STAGE_LABEL[u.stage] : ''}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── cycle history: every month the country has run ─────── */}
      {history.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <h2 className="text-[13.5px] font-semibold text-slate-800">Cycle history</h2>
            <span className="text-[11.5px] text-slate-500">
              Every month {scope.country.name} has run. Click one to see it above.
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-[13px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left font-semibold">Month</th>
                  <th className="px-2 py-2 text-left font-semibold">Window</th>
                  <th className="px-2 py-2 text-right font-semibold">Suppliers</th>
                  <th className="px-2 py-2 text-right font-semibold">Lines</th>
                  <th className="px-2 py-2 text-right font-semibold">With PO</th>
                  <th className="px-2 py-2 text-right font-semibold">Value ({currency})</th>
                  <th className="px-4 py-2 text-left font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const shown = report?.source === String(h.id);
                  const done = h.lines ? h.closedLines / h.lines : 0;
                  return (
                    <tr
                      key={h.id}
                      onClick={() => pickMonth(String(h.id))}
                      className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-[#307c4c]/[0.04] ${
                        shown ? 'bg-[#307c4c]/[0.06]' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                        {periodLabel(new Date(h.period + 'T00:00:00Z'))}
                        {i === 0 && (
                          <span className="ml-2 text-[10.5px] font-semibold text-[#307c4c]">
                            Current
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-slate-500">
                        {h.opensOn} to {h.closesOn}
                      </td>
                      <td className="px-2 py-2.5 text-right text-slate-700">{h.suppliers}</td>
                      <td className="px-2 py-2.5 text-right text-slate-700">{h.lines}</td>
                      <td className="px-2 py-2.5 text-right text-slate-700">{h.withPo}</td>
                      <td className="px-2 py-2.5 text-right font-mono font-semibold text-slate-800">
                        {money.format(h.value)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-[#307c4c]"
                              style={{ width: `${Math.round(done * 100)}%` }}
                            />
                          </span>
                          <span className="text-[11.5px] text-slate-500">
                            {h.closedLines === h.lines && h.lines
                              ? 'Closed'
                              : `${h.closedLines} of ${h.lines} closed`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </RrsmShell>
  );
}
