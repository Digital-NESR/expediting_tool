'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../../components/CatalogManagerShell';
import { Icon } from '../../components/CatalogManagerUI';
import BulkImportPanel from '../import/BulkImportPanel';
import GridEntryPanel from './GridEntryPanel';
import { createCatalogEntriesBatch, searchSupplierDirectory, type CatalogEntryLine } from '@/app/actions/catalog-manager';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy';
import type { SpendType } from '@/types/catalog-manager';
import { APPROVAL_THRESHOLD_USD, fmtUsd, toUsd, SPEND_TYPE_OPTIONS } from '@/lib/catalog-manager-utils';

interface LineState {
  key: number;
  category: string;
  subcategory: string;
  commodity: string;
  family: string;
  unspsc: string;
  item: string;
  uom: string;
  price: string;
  currency: string;
  effective: string;
  expiry: string;
}

const CCY_BY_COUNTRY: Record<string, string> = { SA: 'SAR', AE: 'AED', KW: 'KWD', OM: 'OMR', QA: 'QAR', IQ: 'USD', DZ: 'DZD', EG: 'EGP' };
const todayStr = () => new Date().toISOString().slice(0, 10);
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20';

let keySeq = 1;
function blankLine(currency: string): LineState {
  return { key: keySeq++, category: '', subcategory: '', commodity: '', family: '', unspsc: '', item: '', uom: '', price: '', currency, effective: todayStr(), expiry: '' };
}

export default function AddEntriesClient({
  countries, currencies, uoms, services, managers, scope, initialTab, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  countries: ScopeCountry[];
  currencies: { code: string }[];
  uoms: { name: string }[];
  services: string[];
  managers: string[];
  scope: string;
  initialTab: 'manual' | 'grid' | 'bulk';
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'manual' | 'grid' | 'bulk'>(initialTab);

  const defaultCountry = scope !== 'ALL' ? scope : countries[0]?.code ?? 'SA';
  const defaultCcy = CCY_BY_COUNTRY[defaultCountry] ?? currencies[0]?.code ?? 'USD';

  const [supplierName, setSupplierName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [manager, setManager] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [lines, setLines] = useState<LineState[]>([blankLine(defaultCcy)]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // live supplier typeahead against the SAP master in nesr_expediting_db
  const [supResults, setSupResults] = useState<{ name: string; code: string }[]>([]);
  const [supOpen, setSupOpen] = useState(false);
  const [supSearching, setSupSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const catGroups = useMemo(
    () => SPEND_TYPE_OPTIONS.map((t) => ({ type: t, cats: SPEND_TAXONOMY.filter((c) => c.type === t) })).filter((g) => g.cats.length),
    [],
  );

  function onSupplierName(name: string) {
    setSupplierName(name);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (name.trim().length < 2) { setSupResults([]); setSupOpen(false); return; }
    setSupSearching(true);
    setSupOpen(true);
    searchTimer.current = setTimeout(async () => {
      const r = await searchSupplierDirectory(name);
      setSupResults(r);
      setSupSearching(false);
    }, 220);
  }
  function pickSupplier(s: { name: string; code: string }) {
    setSupplierName(s.name);
    setSupplierCode(s.code);
    setSupOpen(false);
    setSupResults([]);
  }

  function onCountry(code: string) {
    setCountry(code);
    const ccy = CCY_BY_COUNTRY[code] ?? defaultCcy;
    setLines((ls) => ls.map((l) => ({ ...l, currency: ccy })));
  }

  function setLine(key: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const n = { ...l, ...patch };
      if (patch.category !== undefined) { n.subcategory = ''; n.commodity = ''; n.family = ''; n.unspsc = ''; }
      if (patch.subcategory !== undefined) { n.commodity = ''; }
      if (patch.commodity !== undefined) {
        const cat = SPEND_TAXONOMY.find((c) => c.name === n.category);
        const sub = cat?.subs.find((s) => s.name === n.subcategory);
        const com = sub?.commodities.find((c) => c.n === patch.commodity);
        if (com) { n.family = com.f; n.unspsc = com.code; if (!n.item) n.item = com.desc; }
      }
      return n;
    }));
  }

  const addLine = () => setLines((ls) => [...ls, blankLine(CCY_BY_COUNTRY[country] ?? defaultCcy)]);
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  function validate(): string | null {
    if (!supplierName.trim()) return 'Enter the supplier name.';
    if (!supplierCode.trim()) return 'Enter the supplier (vendor) code.';
    if (!country) return 'Choose a country.';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const n = i + 1;
      if (!l.category) return `Line ${n}: choose a spend category.`;
      if (!l.item.trim()) return `Line ${n}: enter a description.`;
      if (!l.uom) return `Line ${n}: choose a unit of measure.`;
      if (!l.price || Number(l.price) <= 0) return `Line ${n}: unit price must be greater than 0.`;
      if (!l.effective) return `Line ${n}: choose an effective date.`;
      if (l.expiry && l.expiry < l.effective) return `Line ${n}: expiry must be after the effective date.`;
    }
    return null;
  }

  async function submit(mode: 'draft' | 'submit') {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    const payload: CatalogEntryLine[] = lines.map((l) => {
      const cat = SPEND_TAXONOMY.find((c) => c.name === l.category);
      return {
        category_name: l.category,
        subcategory_name: l.subcategory || null,
        spend_type: (cat?.type ?? null) as SpendType | null,
        family: l.family || null,
        commodity: l.commodity || null,
        unspsc_code: l.unspsc || null,
        item_name: l.item.trim(),
        description: l.item.trim(),
        uom_name: l.uom,
        unit_price: Number(l.price),
        currency_code: l.currency,
        effective_date: l.effective,
        expiry_date: l.expiry || null,
        notes: null,
        sirion_contract_id: null,
        sirion_url: null,
      };
    });
    try {
      await createCatalogEntriesBatch(
        { supplier_name: supplierName.trim(), supplier_code: supplierCode.trim(), manager: manager || null, country_code: country },
        payload,
        mode,
      );
      router.push('/catalog-manager/catalog');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  const totalUsd = lines.reduce((s, l) => s + (l.price ? toUsd(Number(l.price), l.currency) : 0), 0);

  return (
    <CatalogManagerShell title="Add entries" roleLabel={roleLabel} canApprove={canApprove} canAdmin={canAdmin} pendingCount={pendingCount} showScope={false}>
      <div className={`${tab === 'grid' ? '' : 'mx-auto max-w-5xl '}space-y-5`}>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Add catalog entries</h1>
          <p className="mt-1 text-sm text-slate-500">Add rates by hand (one supplier, many lines), fill a spreadsheet-style grid, or import a whole rate card from Excel.</p>
        </div>

        {/* mode toggle */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
          {([['manual', 'Manual entry', 'edit'], ['grid', 'Grid entry', 'catalog'], ['bulk', 'Bulk import (Excel)', 'sheet']] as const).map(([v, label, icon]) => (
            <button key={v} onClick={() => setTab(v)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon name={icon} className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'bulk' ? (
          <BulkImportPanel />
        ) : tab === 'grid' ? (
          <GridEntryPanel countries={countries} currencies={currencies} uoms={uoms} services={services} defaultCountry={scope} />
        ) : (
          <div className="space-y-4">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            {/* shared supplier header — entered once */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Supplier (applies to all lines)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="relative flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-slate-600">Supplier name <span className="text-red-500">*</span></span>
                  <input
                    className={inputCls}
                    value={supplierName}
                    onChange={(e) => onSupplierName(e.target.value)}
                    onFocus={() => { if (supResults.length) setSupOpen(true); }}
                    onBlur={() => setTimeout(() => setSupOpen(false), 150)}
                    placeholder="Search NESR suppliers (SAP master)…"
                    autoComplete="off"
                  />
                  {supOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {supSearching ? (
                        <div className="px-3 py-2.5 text-[12.5px] text-slate-400">Searching…</div>
                      ) : supResults.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12.5px] text-slate-400">No matches — you can still type a new supplier.</div>
                      ) : (
                        supResults.map((s) => (
                          <button
                            key={s.code}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickSupplier(s); }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#307c4c]/5"
                          >
                            <span className="truncate text-[13px] text-slate-800">{s.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-slate-400">{s.code}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-slate-600">Vendor code <span className="text-red-500">*</span></span>
                  <input className={`${inputCls} font-mono`} value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} placeholder="auto-fills for known suppliers" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-slate-600">Supplier manager</span>
                  <input list="managerOpts" className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Accountable owner" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-slate-600">Country <span className="text-red-500">*</span></span>
                  <select className={inputCls} value={country} onChange={(e) => onCountry(e.target.value)}>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {/* line items */}
            {lines.map((l, idx) => {
              const cat = SPEND_TAXONOMY.find((c) => c.name === l.category);
              const sub = cat?.subs.find((s) => s.name === l.subcategory);
              const commodityOpts = sub?.commodities ?? [];
              return (
                <div key={l.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Line {idx + 1}</p>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(l.key)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400 hover:text-red-500"><Icon name="trash" className="h-3.5 w-3.5" /> Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Spend category <span className="text-red-500">*</span></span>
                      <select className={inputCls} value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value })}>
                        <option value="">Select category…</option>
                        {catGroups.map((g) => <optgroup key={g.type} label={g.type}>{g.cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Sub-category</span>
                      <select className={inputCls} value={l.subcategory} onChange={(e) => setLine(l.key, { subcategory: e.target.value })} disabled={!cat}>
                        <option value="">{cat ? 'Select…' : 'Pick a category first'}</option>
                        {cat?.subs.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="text-[12.5px] font-semibold text-slate-600">Commodity</span>
                      <select className={inputCls} value={l.commodity} onChange={(e) => setLine(l.key, { commodity: e.target.value })} disabled={!l.subcategory}>
                        <option value="">{l.subcategory ? (commodityOpts.length ? 'Select commodity…' : 'No commodities — describe below') : 'Pick a sub-category first'}</option>
                        {commodityOpts.map((c) => <option key={c.n} value={c.n}>{c.n}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="text-[12.5px] font-semibold text-slate-600">Description <span className="text-red-500">*</span></span>
                      <input list="serviceActivityOpts" className={inputCls} value={l.item} onChange={(e) => setLine(l.key, { item: e.target.value })} placeholder="Pick a service activity or type a description" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Unit of measure <span className="text-red-500">*</span></span>
                      <select className={inputCls} value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })}>
                        <option value="">Select UOM…</option>
                        {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Unit price <span className="text-red-500">*</span></span>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <input type="number" inputMode="decimal" className={`${inputCls} font-mono`} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} placeholder="0.00" />
                        </div>
                        <div className="w-[88px] shrink-0">
                          <select className={inputCls} value={l.currency} onChange={(e) => setLine(l.key, { currency: e.target.value })}>
                            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        </div>
                      </div>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Effective date <span className="text-red-500">*</span></span>
                      <input type="date" className={inputCls} value={l.effective} onChange={(e) => setLine(l.key, { effective: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-semibold text-slate-600">Expiry date</span>
                      <input type="date" className={inputCls} value={l.expiry} onChange={(e) => setLine(l.key, { expiry: e.target.value })} />
                    </label>
                  </div>
                </div>
              );
            })}

            <button onClick={addLine} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white py-3 text-[13px] font-semibold text-[#1d4f31] hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5">
              <Icon name="plus" className="h-4 w-4" /> Add another line
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[12.5px] text-slate-500">{lines.length} {lines.length === 1 ? 'line' : 'lines'} · <span className="font-mono font-semibold text-slate-900">≈ USD {fmtUsd(totalUsd)}</span> total <span className="text-slate-400">(lines ≥ ${APPROVAL_THRESHOLD_USD / 1000}k go to approval)</span></div>
              <div className="flex gap-2.5">
                <button onClick={() => submit('draft')} disabled={submitting} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Save as drafts</button>
                <button onClick={() => submit('submit')} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2b6f44] disabled:opacity-50">
                  <Icon name="check" className="h-4 w-4" /> {submitting ? 'Saving…' : `Create ${lines.length} ${lines.length === 1 ? 'entry' : 'entries'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <datalist id="managerOpts">{managers.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="serviceActivityOpts">{services.map((s) => <option key={s} value={s} />)}</datalist>
    </CatalogManagerShell>
  );
}
