'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon, StatusPill, EmptyState } from '../components/CatalogManagerUI';
import { logExport, bulkDeactivateEntries, bulkSubmitEntries } from '@/app/actions/catalog-manager';
import type { CatalogEntry, CatalogStatus, SpendType } from '@/types/catalog-manager';
import { fmtMoney, fmtDateNice, isExpiringSoon, ALL_STATUSES, SPEND_TYPE_OPTIONS } from '@/lib/catalog-manager-utils';

type SortKey = 'recent' | 'priceHi' | 'priceLo' | 'expiry' | 'supplier';

function FacetGroup({
  title, options, selected, onToggle, counts, max,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  counts: Record<string, number>;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded || !max ? options : options.slice(0, max);
  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-0.5">
        {shown.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button key={opt.value} onClick={() => onToggle(opt.value)} className={`group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] transition-colors ${on ? 'bg-[#307c4c]/[0.06]' : 'hover:bg-slate-50'}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-all ${on ? 'border-[#307c4c] bg-[#307c4c] text-white' : 'border-slate-300 bg-white group-hover:border-[#6aaf8e]'}`}>
                {on && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={`flex-1 truncate text-left transition-colors ${on ? 'font-semibold text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>{opt.label}</span>
              <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-[#307c4c]/10 font-semibold text-[#1d4f31]' : 'text-slate-400'}`}>{counts[opt.value] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {max && options.length > max && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1.5 px-1.5 text-[12px] font-semibold text-[#1d4f31] hover:underline">
          {expanded ? 'Show less' : `Show all ${options.length}`}
        </button>
      )}
    </div>
  );
}

export default function CatalogListClient({
  entries, categories, countries, scope, pendingCount, roleLabel, canCreate, canApprove, canAdmin, homeCountry,
  initialStatus, initialCategory, initialExpiring,
  initialQuery,
}: {
  entries: CatalogEntry[];
  categories: { name: string; type: SpendType }[];
  countries: ScopeCountry[];
  scope: string;
  pendingCount: number;
  roleLabel: string;
  canCreate: boolean;
  canApprove: boolean;
  canAdmin: boolean;
  homeCountry: string | null;
  initialStatus: string | null;
  initialCategory: string | null;
  initialExpiring: boolean;
  initialQuery: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery ?? '');
  const [status, setStatus] = useState<string[]>(initialStatus ? [initialStatus] : []);
  const [cats, setCats] = useState<string[]>(initialCategory ? [initialCategory] : []);
  const [stypes, setStypes] = useState<string[]>([]);
  const [ctys, setCtys] = useState<string[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expiringOnly, setExpiringOnly] = useState(initialExpiring);
  const [sort, setSort] = useState<SortKey>('recent');

  const toggle = (arr: string[], set: (v: string[]) => void) => (v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const counts = useMemo(() => {
    const cat: Record<string, number> = {}, st: Record<string, number> = {}, sty: Record<string, number> = {}, cty: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.category_name) cat[e.category_name] = (cat[e.category_name] ?? 0) + 1;
      st[e.status] = (st[e.status] ?? 0) + 1;
      if (e.spend_type) sty[e.spend_type] = (sty[e.spend_type] ?? 0) + 1;
      cty[e.country_code] = (cty[e.country_code] ?? 0) + 1;
    });
    return { cat, st, sty, cty };
  }, [entries]);

  const rows = useMemo(() => {
    let r = entries.filter((e) => {
      if (!includeInactive && (e.status === 'Expired' || e.status === 'Rejected') && !status.includes(e.status)) return false;
      if (status.length && !status.includes(e.status)) return false;
      if (cats.length && (!e.category_name || !cats.includes(e.category_name))) return false;
      if (stypes.length && (!e.spend_type || !stypes.includes(e.spend_type))) return false;
      if (ctys.length && !ctys.includes(e.country_code)) return false;
      if (expiringOnly && !isExpiringSoon(e.status, e.expiry_date)) return false;
      if (q.trim()) {
        const hay = `${e.supplier_name} ${e.supplier_code} ${e.description ?? ''} ${e.category_name ?? ''} ${e.subcategory_name ?? ''} ${e.commodity ?? ''} ${e.unspsc_code ?? ''} ${e.code} ${e.uom_name ?? ''} ${e.item_name}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sort === 'recent') return (b.modified_at || '').localeCompare(a.modified_at || '');
      if (sort === 'priceHi') return b.usd_equivalent - a.usd_equivalent;
      if (sort === 'priceLo') return a.usd_equivalent - b.usd_equivalent;
      if (sort === 'expiry') return (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999');
      if (sort === 'supplier') return a.supplier_name.localeCompare(b.supplier_name);
      return 0;
    });
    return r;
  }, [entries, status, cats, stypes, ctys, includeInactive, expiringOnly, q, sort]);

  const activeFilterCount = status.length + cats.length + stypes.length + ctys.length + (expiringOnly ? 1 : 0);
  function clearAll() {
    setStatus([]); setCats([]); setStypes([]); setCtys([]); setExpiringOnly(false); setIncludeInactive(false); setQ('');
  }

  // ── multi-select ──
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  function toggleRow(id: number) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => (rowIds.every((id) => prev.has(id)) ? new Set() : new Set(rowIds)));
  }
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const selectedSubmittable = selectedRows.filter((r) => r.status === 'Draft' || r.status === 'Rejected');
  const selectedDeactivatable = selectedRows.filter((r) => r.status !== 'Expired' && r.status !== 'Rejected');

  async function runBulk(fn: () => Promise<unknown>) {
    setBulkBusy(true);
    try { await fn(); setSelected(new Set()); router.refresh(); } finally { setBulkBusy(false); }
  }

  function exportCsv(which: CatalogEntry[] = rows) {
    const cols: (keyof CatalogEntry)[] = ['code', 'supplier_name', 'supplier_code', 'manager', 'spend_type', 'category_name', 'subcategory_name', 'commodity', 'unspsc_code', 'item_name', 'uom_name', 'unit_price', 'currency_code', 'country_name', 'effective_date', 'expiry_date', 'status', 'sirion_contract_id'];
    const head = ['Catalog ID', 'Supplier', 'Vendor Code', 'Manager', 'Spend Type', 'Category', 'Sub-category', 'Commodity', 'UNSPSC', 'Description', 'UOM', 'Unit Price', 'Currency', 'Country', 'Effective', 'Expiry', 'Status', 'Sirion Contract ID'];
    const csv = [head.join(','), ...which.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESR_Catalog_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void logExport(scope === 'ALL' ? 'All countries' : scope, which.length);
  }

  const statusOpts = ALL_STATUSES.map((s) => ({ value: s, label: s }));
  const catOpts = categories.map((c) => ({ value: c.name, label: c.name }));
  const typeOpts = SPEND_TYPE_OPTIONS.map((t) => ({ value: t, label: t }));
  const ctyOpts = countries.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.name}`.trim() }));

  return (
    <CatalogManagerShell
      title="Catalog"
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      scope={scope}
      countries={countries}
      fill
      headerAction={
        <div className="flex items-center gap-2">
          <button onClick={() => exportCsv()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-[#6aaf8e] hover:text-slate-900 active:scale-[0.98]">
            <Icon name="download" className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
          </button>
          {canCreate && (
            <Link href="/catalog-manager/catalog/add" className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98]">
              <Icon name="plus" className="h-4 w-4" /> <span className="hidden sm:inline">Add entries</span>
            </Link>
          )}
        </div>
      }
    >
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:h-full lg:grid-cols-[252px_1fr]">
        {/* facet rail */}
        <aside className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:h-full lg:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="filter" className="h-4 w-4 text-[#307c4c]" /> Filters</span>
            {activeFilterCount > 0 && <button onClick={clearAll} className="text-[12px] font-semibold text-[#1d4f31] hover:underline">Clear ({activeFilterCount})</button>}
          </div>
          <button
            onClick={() => setExpiringOnly((v) => !v)}
            className={`mb-4 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-semibold ${expiringOnly ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${expiringOnly ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white'}`}>
              {expiringOnly && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
            </span>
            Expiring ≤ 30 days
          </button>
          <FacetGroup title="Status" options={statusOpts} selected={status} onToggle={toggle(status, setStatus)} counts={counts.st} />
          <FacetGroup title="Spend type" options={typeOpts} selected={stypes} onToggle={toggle(stypes, setStypes)} counts={counts.sty} />
          <FacetGroup title="Spend category" options={catOpts} selected={cats} onToggle={toggle(cats, setCats)} counts={counts.cat} max={6} />
          {scope === 'ALL' && <FacetGroup title="Country" options={ctyOpts} selected={ctys} onToggle={toggle(ctys, setCtys)} counts={counts.cty} />}
        </aside>

        {/* main */}
        <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:h-full">
          <div className="shrink-0 border-b border-slate-200 p-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Catalog</h1>
                <p className="mt-0.5 text-[13px] text-slate-500"><span className="font-semibold tabular-nums text-slate-900">{rows.length}</span> {rows.length === 1 ? 'entry' : 'entries'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search supplier, description, code, or ID…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm outline-none focus:border-[#307c4c] focus:bg-white focus:ring-2 focus:ring-[#307c4c]/20"
                />
                {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"><Icon name="close" className="h-4 w-4" /></button>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-400">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                  <option value="recent">Recently updated</option>
                  <option value="priceHi">Price: high → low</option>
                  <option value="priceLo">Price: low → high</option>
                  <option value="expiry">Expiry date</option>
                  <option value="supplier">Supplier A→Z</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-slate-500">
                <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#307c4c]" />
                Include inactive
              </label>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="cm-fade-in flex flex-wrap items-center gap-2 border-b border-[#307c4c]/20 bg-gradient-to-r from-[#eaf4ef] to-[#f7fbf9] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[#1d4f31]">{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} className="text-[12px] font-medium text-slate-500 hover:text-slate-700">Clear</button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button onClick={() => exportCsv(selectedRows)} disabled={bulkBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  <Icon name="download" className="h-3.5 w-3.5" /> Export ({selected.size})
                </button>
                {canCreate && selectedSubmittable.length > 0 && (
                  <button onClick={() => runBulk(() => bulkSubmitEntries(selectedSubmittable.map((r) => r.id)))} disabled={bulkBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#1d4f31] hover:bg-[#307c4c]/5 disabled:opacity-50">
                    <Icon name="arrowRight" className="h-3.5 w-3.5" /> Submit ({selectedSubmittable.length})
                  </button>
                )}
                {canCreate && selectedDeactivatable.length > 0 && (
                  <button onClick={() => { if (confirm(`Deactivate ${selectedDeactivatable.length} entr${selectedDeactivatable.length === 1 ? 'y' : 'ies'}?`)) runBulk(() => bulkDeactivateEntries(selectedDeactivatable.map((r) => r.id))); }} disabled={bulkBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Icon name="x" className="h-3.5 w-3.5" /> Deactivate ({selectedDeactivatable.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {homeCountry && rows.some((r) => r.country_code !== homeCountry) && (
            <div className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
              <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Some rates below are outside your home country (<span className="font-semibold">{homeCountry}</span>) — these are flagged with an
                <span className="mx-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"><Icon name="globe" className="h-3 w-3" />other country</span>
                marker.
              </span>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              title="No matching entries"
              sub="Try adjusting filters or search terms."
              action={activeFilterCount > 0 || q ? (
                <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-[#6aaf8e] active:scale-[0.98]">
                  <Icon name="close" className="h-4 w-4" /> Clear all filters
                </button>
              ) : undefined}
            />
          ) : (
            <div className="cm-fade-in min-h-0 flex-1 overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200 bg-slate-50/95 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur-sm">
                    <th className="w-9 px-3 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-[#307c4c]" aria-label="Select all" /></th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Service / item</th>
                    <th className="px-4 py-3">Category</th>
                    {scope === 'ALL' && <th className="px-4 py-3">Country</th>}
                    <th className="px-4 py-3">UOM</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const exp = isExpiringSoon(e.status, e.expiry_date);
                    return (
                      <tr key={e.id} onClick={() => router.push(`/catalog-manager/catalog/${e.id}`)} className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-[#307c4c]/5 ${selected.has(e.id) ? 'bg-[#307c4c]/5' : ''}`}>
                        <td className="w-9 px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleRow(e.id)} className="h-4 w-4 rounded border-slate-300 text-[#307c4c]" aria-label={`Select ${e.code}`} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-[12px] text-slate-500">{e.code}</span>
                            {e.sirion_contract_id && <Icon name="link" className="h-3.5 w-3.5 text-[#6aaf8e]" />}
                            {homeCountry && e.country_code !== homeCountry && (
                              <span title={`Outside your home country (${homeCountry})`} className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                <Icon name="globe" className="h-3 w-3" />{e.country_code}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="max-w-[200px] px-4 py-3">
                          <div className="truncate font-semibold text-slate-900">{e.supplier_name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{e.supplier_code}</div>
                        </td>
                        <td className="max-w-[300px] px-4 py-3">
                          <div className="truncate font-medium text-slate-700">{e.commodity || e.item_name}</div>
                          <div className="truncate text-[11px] text-slate-400">{e.family ? `${e.family} · ` : ''}{e.spend_type}</div>
                        </td>
                        <td className="max-w-[170px] px-4 py-3">
                          <div className="truncate text-[12.5px] text-slate-700">{e.category_name}</div>
                          <div className="truncate text-[11px] text-slate-400">{e.subcategory_name}</div>
                        </td>
                        {scope === 'ALL' && <td className="whitespace-nowrap px-4 py-3 text-slate-500">{e.country_flag} {e.country_code}</td>}
                        <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">{e.uom_name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <span className="font-mono font-semibold text-slate-900">{fmtMoney(e.unit_price, e.currency_code)}</span>
                          <span className="ml-1 text-[10.5px] text-slate-400">{e.currency_code}</span>
                        </td>
                        <td className="px-4 py-3"><StatusPill status={e.status as CatalogStatus} sm /></td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {e.expiry_date ? (
                            <span className={`text-[12.5px] ${exp ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                              {exp && <Icon name="clock" className="mr-1 inline h-3 w-3 align-[-1px]" />}
                              {fmtDateNice(e.expiry_date)}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CatalogManagerShell>
  );
}
