'use client';

import { displayStatus, statusLabel } from '../lib/helpers';
import { shapeRow } from '../lib/shapeRow';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { DisplayStatus } from '../lib/types';

const STATUSES = [
  'Draft',
  'Pending Level 1',
  'Pending Level 2',
  'Active',
  'Extended',
  'Expiring soon',
  'Expired',
  'Rejected',
];

/** KPI accents. Kept as hex because they also colour the figure itself. */
const ACCENT = {
  green: { bar: 'bg-[#307c4c]', text: 'text-[#307c4c]' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-600' },
  red: { bar: 'bg-red-500', text: 'text-red-600' },
  mint: { bar: 'bg-[#6AAF8E]', text: 'text-[#1d4f31]' },
} as const;

export default function RegistryScreen({ app }: { app: RegistryApp }) {
  const counts = (status: string) => app.records.filter((r) => displayStatus(r) === status).length;
  const rows = app.filteredRecords;

  const kpis = [
    {
      label: 'Active IDs',
      value: counts('Active') + counts('Extended'),
      sub: 'valid for SAP reference',
      accent: ACCENT.green,
    },
    {
      label: 'Expiring soon',
      value: counts('Expiring soon'),
      sub: 'within 60 days',
      accent: ACCENT.amber,
    },
    {
      label: 'Expired',
      value: counts('Expired'),
      sub: 'reference is non-compliant',
      accent: ACCENT.red,
    },
    {
      label: 'In validation',
      value: counts('Pending Level 1') + counts('Pending Level 2'),
      sub: 'awaiting validation',
      accent: ACCENT.mint,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Registry Search</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
            Check for an active single-source or sole-source ID before you raise a single-quotation
            PO or RFQ.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={app.exportCsv}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
          >
            Export to Excel
          </button>
          <button
            type="button"
            onClick={app.newDraft}
            className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90"
          >
            New Registry Record
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <div className={`h-1 ${k.accent.bar}`} />
            <div className="px-4 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                {k.label}
              </p>
              <p className={`mt-1 text-3xl font-bold leading-none ${k.accent.text}`}>{k.value}</p>
              <p className="mt-1 text-[11.5px] text-slate-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex min-w-[220px] flex-[1_1_260px] flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Search
            </label>
            <input
              value={app.filters.q}
              onChange={(e) => app.setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="ID, supplier, family, commodity"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#307c4c]"
            />
          </div>
          <FilterSelect
            label="Country / entity"
            value={app.filters.fCountry}
            options={['All countries', ...app.countries.map((c) => c[0])]}
            onChange={(v) => app.setFilters((f) => ({ ...f, fCountry: v }))}
          />
          <FilterSelect
            label="Classification"
            value={app.filters.fCls}
            options={['All classifications', 'SINGLE-SOURCE', 'SOLE-SOURCE']}
            onChange={(v) => app.setFilters((f) => ({ ...f, fCls: v }))}
          />
          <FilterSelect
            label="Status"
            value={app.filters.fStatus}
            options={['All statuses', ...STATUSES]}
            // The value has to stay the stored spelling — it is compared
            // against displayStatus — so only the visible label changes.
            labelOf={(v) => (v === 'All statuses' ? v : statusLabel(v as DisplayStatus))}
            onChange={(v) => app.setFilters((f) => ({ ...f, fStatus: v }))}
          />
          <FilterSelect
            label="Segment"
            value={app.filters.fSeg}
            options={['All segments', ...app.segments]}
            onChange={(v) => app.setFilters((f) => ({ ...f, fSeg: v }))}
          />
          <button
            type="button"
            onClick={app.resetFilters}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            Reset
          </button>
        </div>

        <p className="border-b border-slate-200 px-4 py-2 text-[11.5px] text-slate-400">
          {rows.length} of {app.records.length} records — click any row to open the full case
        </p>

        {/* The table is wider than a phone and several columns cannot usefully
            wrap, so it scrolls inside its own box rather than pushing the page
            sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="bg-[#307c4c] text-left text-white">
                {[
                  'Registry ID',
                  'Classification',
                  'Country',
                  'Supplier',
                  'Scope',
                  'Annual spend',
                  'Status',
                  'Expiry',
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wider ${
                      h === 'Annual spend' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sh = shapeRow(r);
                return (
                  <tr
                    key={sh.rid}
                    onClick={() => app.open(sh.rid)}
                    className="cursor-pointer border-b border-slate-100 transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-[#307c4c]/5"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-[#1d4f31]">
                      {sh.idLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide"
                        style={{ background: sh.clsBg, color: sh.clsFg }}
                      >
                        {sh.clsLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{sh.country}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800">{sh.supplierName}</div>
                      <div className="text-[11px] text-slate-400">SAP {sh.supplierId}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-700">{sh.scopeLabel}</div>
                      <div className="text-[11px] text-slate-400">{sh.scopeDetail}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {sh.spendLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style={{ background: sh.statusBg, color: sh.statusFg }}
                      >
                        {sh.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="text-slate-700">{sh.expiryLabel}</div>
                      <div className="text-[11px]" style={{ color: sh.expiryNoteColor }}>
                        {sh.expiryNote}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] font-semibold text-slate-800">
              No records match these filters
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
              No active ID exists for this combination. Raise a new registry record before
              proceeding with a single quotation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  labelOf,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Lets an option read differently from the value it submits. */
  labelOf?: (v: string) => string;
}) {
  return (
    <div className="flex flex-[0_1_190px] flex-col gap-1.5">
      <label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none transition-colors focus:border-[#307c4c]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labelOf ? labelOf(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}
