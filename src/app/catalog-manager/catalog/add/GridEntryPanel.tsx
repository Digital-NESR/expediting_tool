'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../components/CatalogManagerUI';
import { bulkImportCatalogEntries, type CatalogImportRow } from '@/app/actions/catalog-manager';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy';
import { SPEND_TYPE_OPTIONS, INCOTERMS } from '@/lib/catalog-manager-utils';

interface GridRow {
  key: number;
  supplier: string;
  code: string;
  country: string;
  category: string;
  subcategory: string;
  description: string;
  uom: string;
  price: string;
  currency: string;
  effective: string;
  expiry: string;
  incoterms: string;
  lead_time: string;
}

const CCY_BY_COUNTRY: Record<string, string> = { SA: 'SAR', AE: 'AED', KW: 'KWD', OM: 'OMR', QA: 'QAR', IQ: 'USD', DZ: 'DZD', EG: 'EGP' };
const todayStr = () => new Date().toISOString().slice(0, 10);
const cellCls = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-[#307c4c] focus:ring-1 focus:ring-[#307c4c]/30';

let keySeq = 1;

export default function GridEntryPanel({
  countries, currencies, uoms, services, defaultCountry,
}: {
  countries: { code: string; name: string; flag: string | null }[];
  currencies: { code: string }[];
  uoms: { name: string }[];
  services: string[];
  defaultCountry: string;
}) {
  const baseCountry = defaultCountry !== 'ALL' ? defaultCountry : countries[0]?.code ?? 'SA';
  const baseCcy = CCY_BY_COUNTRY[baseCountry] ?? currencies[0]?.code ?? 'USD';
  const blank = (): GridRow => ({ key: keySeq++, supplier: '', code: '', country: baseCountry, category: '', subcategory: '', description: '', uom: '', price: '', currency: baseCcy, effective: todayStr(), expiry: '', incoterms: '', lead_time: '' });

  const [rows, setRows] = useState<GridRow[]>(() => [blank(), blank(), blank(), blank()]);
  const [phase, setPhase] = useState<'form' | 'running' | 'done'>('form');
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const catGroups = SPEND_TYPE_OPTIONS.map((t) => ({ type: t, cats: SPEND_TAXONOMY.filter((c) => c.type === t) })).filter((g) => g.cats.length);

  function setCell(key: number, patch: Partial<GridRow>) {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const n = { ...r, ...patch };
      if (patch.country !== undefined) n.currency = CCY_BY_COUNTRY[patch.country] ?? n.currency;
      if (patch.category !== undefined) n.subcategory = '';
      return n;
    }));
  }
  const addRows = (count = 1) => setRows((rs) => [...rs, ...Array.from({ length: count }, blank)]);
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const duplicateRow = (key: number) => setRows((rs) => {
    const i = rs.findIndex((r) => r.key === key);
    if (i < 0) return rs;
    const copy = { ...rs[i], key: keySeq++ };
    return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
  });

  const isBlankRow = (r: GridRow) => !r.supplier.trim() && !r.code.trim() && !r.description.trim() && !r.price.trim();
  const filledRows = rows.filter((r) => !isBlankRow(r));

  async function submit() {
    setError(null);
    if (filledRows.length === 0) { setError('Enter at least one row.'); return; }
    setPhase('running');
    const payload: CatalogImportRow[] = filledRows.map((r, i) => ({
      rowIndex: i + 1,
      supplier: r.supplier.trim(),
      supplier_code: r.code.trim(),
      country: r.country,
      category: r.category,
      subcategory: r.subcategory || null,
      commodity: r.description.trim() || null,
      description: r.description.trim() || null,
      uom: r.uom,
      unit_price: r.price ? Number(r.price) : null,
      currency: r.currency,
      effective_date: r.effective || null,
      expiry_date: r.expiry || null,
      manager: null,
      sirion_contract_id: null,
      notes: null,
      incoterms: r.incoterms || null,
      lead_time_days: r.lead_time.trim() ? Number(r.lead_time) : null,
    }));
    try {
      const res = await bulkImportCatalogEntries({ rows: payload, filename: 'Grid entry' });
      setResult({ inserted: res.inserted, skipped: res.skipped, errors: res.errors });
      setLog(res.log);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('form');
    }
  }

  function reset() {
    setRows([blank(), blank(), blank(), blank()]);
    setPhase('form'); setResult(null); setLog([]); setError(null);
  }

  if (phase === 'done' && result) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${result.errors === 0 ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-amber-50 text-amber-500'}`}><Icon name={result.errors === 0 ? 'check' : 'alert'} className="h-5 w-5" /></div>
          <div><p className="text-base font-bold text-slate-900">Grid submitted</p><p className="text-xs text-slate-400">{filledRows.length} rows processed</p></div>
        </div>
        <div className="grid max-w-md grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inserted</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-[#307c4c]">{result.inserted}</p></div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Skipped</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-500">{result.skipped}</p></div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Errors</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-red-500">{result.errors}</p></div>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl bg-[#0f172a] p-4 font-mono text-[11px] leading-5">
          {log.map((line, i) => <div key={i} className={line.startsWith('✅') ? 'text-emerald-400' : line.startsWith('⚠️') ? 'text-amber-400' : line.startsWith('❌') ? 'text-red-400' : 'text-slate-400'}>{line}</div>)}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Icon name="plus" className="h-4 w-4" /> New grid</button>
          <Link href="/catalog-manager/catalog" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44]">View catalog <Icon name="arrowRight" className="h-4 w-4" /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Type rows straight into the grid — one catalog entry per row. Rates over the threshold go to Pending Approval, the rest activate. Leave a row blank to skip it.</p>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1360px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="w-8 px-2 py-2.5 text-center">#</th>
              <th className="px-2 py-2.5">Supplier *</th>
              <th className="px-2 py-2.5">Vendor code *</th>
              <th className="px-2 py-2.5">Country *</th>
              <th className="px-2 py-2.5">Spend category *</th>
              <th className="px-2 py-2.5">Sub-category</th>
              <th className="px-2 py-2.5">Description *</th>
              <th className="px-2 py-2.5">UOM *</th>
              <th className="px-2 py-2.5">Unit price *</th>
              <th className="px-2 py-2.5">Ccy</th>
              <th className="px-2 py-2.5">Effective *</th>
              <th className="px-2 py-2.5">Expiry</th>
              <th className="px-2 py-2.5">Incoterms</th>
              <th className="px-2 py-2.5">Lead time</th>
              <th className="w-16 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const cat = SPEND_TAXONOMY.find((c) => c.name === r.category);
              return (
                <tr key={r.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
                  <td className="px-2 py-1.5 text-center text-[11px] text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="px-1.5 py-1.5 min-w-[160px]"><input className={cellCls} value={r.supplier} onChange={(e) => setCell(r.key, { supplier: e.target.value })} placeholder="Supplier name" /></td>
                  <td className="px-1.5 py-1.5 min-w-[110px]"><input className={`${cellCls} font-mono`} value={r.code} onChange={(e) => setCell(r.key, { code: e.target.value })} placeholder="V-100000" /></td>
                  <td className="px-1.5 py-1.5 min-w-[88px]">
                    <select className={cellCls} value={r.country} onChange={(e) => setCell(r.key, { country: e.target.value })}>
                      {countries.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[170px]">
                    <select className={cellCls} value={r.category} onChange={(e) => setCell(r.key, { category: e.target.value })}>
                      <option value="">Select…</option>
                      {catGroups.map((g) => <optgroup key={g.type} label={g.type}>{g.cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[150px]">
                    <select className={cellCls} value={r.subcategory} onChange={(e) => setCell(r.key, { subcategory: e.target.value })} disabled={!cat}>
                      <option value="">{cat ? '—' : 'pick category'}</option>
                      {cat?.subs.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[200px]"><input list="gridServiceOpts" className={cellCls} value={r.description} onChange={(e) => setCell(r.key, { description: e.target.value })} placeholder="Service / item" /></td>
                  <td className="px-1.5 py-1.5 min-w-[110px]">
                    <select className={cellCls} value={r.uom} onChange={(e) => setCell(r.key, { uom: e.target.value })}>
                      <option value="">UOM…</option>
                      {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[100px]"><input type="number" inputMode="decimal" className={`${cellCls} font-mono`} value={r.price} onChange={(e) => setCell(r.key, { price: e.target.value })} placeholder="0.00" /></td>
                  <td className="px-1.5 py-1.5 min-w-[78px]">
                    <select className={cellCls} value={r.currency} onChange={(e) => setCell(r.key, { currency: e.target.value })}>
                      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[140px]"><input type="date" className={cellCls} value={r.effective} onChange={(e) => setCell(r.key, { effective: e.target.value })} /></td>
                  <td className="px-1.5 py-1.5 min-w-[140px]"><input type="date" className={cellCls} value={r.expiry} onChange={(e) => setCell(r.key, { expiry: e.target.value })} /></td>
                  <td className="px-1.5 py-1.5 min-w-[110px]">
                    <select className={cellCls} value={r.incoterms} onChange={(e) => setCell(r.key, { incoterms: e.target.value })}>
                      <option value="">—</option>
                      {INCOTERMS.map((ic) => <option key={ic.code} value={ic.code}>{ic.code}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5 min-w-[90px]"><input type="number" inputMode="numeric" min={0} className={`${cellCls} font-mono`} value={r.lead_time} onChange={(e) => setCell(r.key, { lead_time: e.target.value })} placeholder="days" /></td>
                  <td className="px-1.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => duplicateRow(r.key)} title="Duplicate row" className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="layers" className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeRow(r.key)} title="Remove row" className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"><Icon name="trash" className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => addRows(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"><Icon name="plus" className="h-4 w-4" /> Add row</button>
          <button onClick={() => addRows(5)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">+5 rows</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-slate-500">{filledRows.length} {filledRows.length === 1 ? 'row' : 'rows'} ready</span>
          <button onClick={submit} disabled={phase === 'running' || filledRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2b6f44] disabled:opacity-50">
            <Icon name="check" className="h-4 w-4" /> {phase === 'running' ? 'Submitting…' : `Submit ${filledRows.length} ${filledRows.length === 1 ? 'entry' : 'entries'}`}
          </button>
        </div>
      </div>

      <datalist id="gridServiceOpts">{services.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
