'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import CatalogManagerShell from '../components/CatalogManagerShell';
import { Icon, EmptyState, Card, StatCard, tableClasses } from '../components/CatalogManagerUI';
import type { PirEntry } from '@/types/catalog-manager';
import { csvSafe } from '@/lib/catalog-manager-utils';

type SortKey = 'supplier' | 'priceHi' | 'priceLo' | 'record';
const PAGE_SIZE = 50;

// Field config drives the detail panel (grouped) and the CSV export (in this order).
const FIELDS: { label: string; key: keyof PirEntry; group: string }[] = [
  { group: 'Identification', label: 'Info Record Number', key: 'info_record_number' },
  { group: 'Identification', label: 'Status', key: 'status' },
  { group: 'Identification', label: 'Deletion Flag', key: 'deletion_flag' },
  { group: 'Material', label: 'Product Number', key: 'product_number' },
  { group: 'Material', label: 'Material Description', key: 'material_description' },
  { group: 'Material', label: 'Material Group', key: 'material_group' },
  { group: 'Supplier', label: 'Supplier Name', key: 'supplier_name' },
  { group: 'Supplier', label: 'Suppliers Account Number', key: 'suppliers_account_number' },
  { group: 'Purchasing', label: 'Purchasing Organization', key: 'purchasing_organization' },
  { group: 'Purchasing', label: 'Purchase Org Description', key: 'purchase_org_description' },
  { group: 'Purchasing', label: 'Purchasing Group', key: 'purchasing_group' },
  { group: 'Purchasing', label: 'Plant', key: 'plant' },
  { group: 'Purchasing', label: 'Country', key: 'country' },
  { group: 'Pricing', label: 'Unit Price', key: 'unit_price' },
  { group: 'Pricing', label: 'Currency', key: 'currency_key' },
  { group: 'Pricing', label: 'Standard QTY', key: 'standard_qty' },
  { group: 'Units', label: 'Order Unit', key: 'order_unit' },
  { group: 'Units', label: 'Base Unit of Measure', key: 'base_unit_of_measure' },
  { group: 'Units', label: 'Numerator for Conversion', key: 'numerator_for_conversion' },
  { group: 'Logistics', label: 'Incoterms', key: 'incoterms' },
  { group: 'Logistics', label: 'Incoterms Location 1', key: 'incoterms_location_1' },
  { group: 'Logistics', label: 'Planned Delivery Time (days)', key: 'planned_delivery_time_days' },
  { group: 'Logistics', label: 'Overdelivery Tolerance Limit', key: 'overdelivery_tolerance_limit' },
  { group: 'Logistics', label: 'Shipping Instructions', key: 'shipping_instructions' },
  { group: 'Logistics', label: 'Minimum Remaining Shelf Life', key: 'minimum_remaining_shelf_life' },
  { group: 'Validity', label: 'Valid Days', key: 'valid_days' },
  { group: 'Validity', label: 'Valid Till / Expiry Date', key: 'valid_till_expiry_date' },
  { group: 'Validity', label: 'Expiring In', key: 'expiring_in' },
];
const GROUP_ORDER = ['Identification', 'Material', 'Supplier', 'Purchasing', 'Pricing', 'Units', 'Logistics', 'Validity'];

function fmt(v: string | number | null): string {
  if (v == null || v === '') return '—';
  return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : String(v);
}
function money(v: number | null, ccy: string | null): string {
  if (v == null) return '—';
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ccy ? ` ${ccy}` : ''}`;
}
/** Distinct, sorted non-empty values of a column — pure so it's stable across renders. */
function facetValues(entries: PirEntry[], key: keyof PirEntry): string[] {
  return Array.from(new Set(entries.map((e) => e[key]).filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
}

export default function PirCatalogClient({
  entries, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  entries: PirEntry[];
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [porg, setPorg] = useState('');
  const [plant, setPlant] = useState('');
  const [mgroup, setMgroup] = useState('');
  const [sort, setSort] = useState<SortKey>('supplier');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<PirEntry | null>(null);

  const countries = useMemo(() => facetValues(entries, 'country'), [entries]);
  const porgs = useMemo(() => facetValues(entries, 'purchasing_organization'), [entries]);
  const plants = useMemo(() => facetValues(entries, 'plant'), [entries]);
  const mgroups = useMemo(() => facetValues(entries, 'material_group'), [entries]);

  const rows = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (country && e.country !== country) return false;
      if (porg && e.purchasing_organization !== porg) return false;
      if (plant && e.plant !== plant) return false;
      if (mgroup && e.material_group !== mgroup) return false;
      if (q.trim()) {
        const hay = `${e.info_record_number ?? ''} ${e.product_number ?? ''} ${e.material_description ?? ''} ${e.supplier_name ?? ''} ${e.suppliers_account_number ?? ''} ${e.material_supplier ?? ''} ${e.plant ?? ''} ${e.purchasing_organization ?? ''}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'priceHi') return (b.unit_price ?? 0) - (a.unit_price ?? 0);
      if (sort === 'priceLo') return (a.unit_price ?? 0) - (b.unit_price ?? 0);
      if (sort === 'record') return (a.info_record_number ?? '').localeCompare(b.info_record_number ?? '');
      return (a.supplier_name ?? '').localeCompare(b.supplier_name ?? '');
    });
  }, [entries, country, porg, plant, mgroup, q, sort]);

  const activeFilters = [country, porg, plant, mgroup].filter(Boolean).length + (q.trim() ? 1 : 0);
  const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const cur = Math.min(page, maxPage);
  const pageRows = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const suppliers = useMemo(() => new Set(entries.map((e) => e.supplier_name).filter(Boolean)).size, [entries]);

  function clearAll() {
    setQ(''); setCountry(''); setPorg(''); setPlant(''); setMgroup(''); setPage(0);
  }

  function exportCsv() {
    const head = FIELDS.map((f) => f.label).join(',');
    const body = rows.map((e) => FIELDS.map((f) => `"${csvSafe(e[f.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NESR_PIR_Catalog_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectCls = 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-700 outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20';

  return (
    <CatalogManagerShell
      title="PIR / Inventory"
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
      headerAction={
        <button onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-[#6aaf8e] hover:text-slate-900 active:scale-[0.98] disabled:opacity-50">
          <Icon name="download" className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
        </button>
      }
    >
      <div className="cm-stagger space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">PIR / Inventory catalog</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Read-only mirror of SAP Purchasing Info Records — synced from Power BI. View and export only; nothing here can be edited.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#307c4c]/20 bg-[#307c4c]/10 px-2.5 py-1 text-xs font-semibold text-[#1d4f31]">
            <Icon name="link" className="h-3.5 w-3.5" /> View only
          </span>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Info records" value={entries.length.toLocaleString()} sub="Purchasing info records" icon="sheet" />
          <StatCard label="Suppliers" value={suppliers.toLocaleString()} sub="Distinct suppliers" icon="building" tone="cyan" />
          <StatCard label="Plants" value={plants.length.toLocaleString()} sub="Distinct plants" icon="globe" tone="ink" />
          <StatCard label="Countries" value={countries.length.toLocaleString()} sub="Operating countries" icon="globe" tone="amber" />
        </section>

        <Card className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  placeholder="Search info record, material, supplier, plant…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm outline-none focus:border-[#307c4c] focus:bg-white focus:ring-2 focus:ring-[#307c4c]/20"
                />
                {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"><Icon name="close" className="h-4 w-4" /></button>}
              </div>
              <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }} className={selectCls}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={porg} onChange={(e) => { setPorg(e.target.value); setPage(0); }} className={selectCls}>
                <option value="">All purchasing orgs</option>
                {porgs.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={plant} onChange={(e) => { setPlant(e.target.value); setPage(0); }} className={selectCls}>
                <option value="">All plants</option>
                {plants.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={mgroup} onChange={(e) => { setMgroup(e.target.value); setPage(0); }} className={selectCls}>
                <option value="">All material groups</option>
                {mgroups.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
                <option value="supplier">Supplier A→Z</option>
                <option value="priceHi">Price: high → low</option>
                <option value="priceLo">Price: low → high</option>
                <option value="record">Info record</option>
              </select>
              {activeFilters > 0 && <button onClick={clearAll} className="text-[12.5px] font-semibold text-[#1d4f31] hover:underline">Clear ({activeFilters})</button>}
            </div>
            <p className="mt-2.5 text-[12.5px] text-slate-500"><span className="font-semibold tabular-nums text-slate-900">{rows.length.toLocaleString()}</span> {rows.length === 1 ? 'record' : 'records'}{rows.length !== entries.length ? ` of ${entries.length.toLocaleString()}` : ''}</p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon="sheet"
              title={entries.length === 0 ? 'No PIR data yet' : 'No matching records'}
              sub={entries.length === 0 ? 'The catalog fills once the n8n sync runs its first load.' : 'Try adjusting the search or filters.'}
              action={activeFilters > 0 ? (
                <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-[#6aaf8e] active:scale-[0.98]">
                  <Icon name="close" className="h-4 w-4" /> Clear filters
                </button>
              ) : undefined}
            />
          ) : (
            <>
              <div className={tableClasses.scroller}>
                <table className={`${tableClasses.table} text-[13px]`}>
                  <thead className={tableClasses.thead}>
                    <tr>
                      <th className={tableClasses.th}>Info record</th>
                      <th className={tableClasses.th}>Product / material</th>
                      <th className={tableClasses.th}>Supplier</th>
                      <th className={tableClasses.th}>Purch org · plant</th>
                      <th className={tableClasses.th}>Country</th>
                      <th className={tableClasses.th}>UOM</th>
                      <th className={`${tableClasses.th} text-right`}>Unit price</th>
                      <th className={tableClasses.th}>Incoterms</th>
                      <th className={tableClasses.th}>Valid till</th>
                    </tr>
                  </thead>
                  <tbody className={tableClasses.tbody}>
                    {pageRows.map((e, i) => (
                      <tr
                        key={`${e.info_record_number}-${e.purchasing_organization}-${e.plant}-${i}`}
                        onClick={() => setDetail(e)}
                        className={tableClasses.trClickable}
                        tabIndex={0}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') setDetail(e); }}
                      >
                        <td className={`${tableClasses.td} font-mono text-[12px] text-slate-500`}>{e.info_record_number ?? '—'}</td>
                        <td className={`${tableClasses.td} max-w-[280px]`}>
                          <div className="truncate font-semibold text-slate-900">{e.material_description || e.product_number || '—'}</div>
                          <div className="truncate font-mono text-[11px] text-slate-400">{e.product_number}{e.material_group ? ` · ${e.material_group}` : ''}</div>
                        </td>
                        <td className={`${tableClasses.td} max-w-[200px]`}>
                          <div className="truncate font-semibold text-slate-900">{e.supplier_name ?? '—'}</div>
                          <div className="font-mono text-[11px] text-slate-400">{e.suppliers_account_number}</div>
                        </td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-slate-500`}>{e.purchasing_organization ?? '—'}{e.plant ? ` · ${e.plant}` : ''}</td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-slate-500`}>{e.country ?? '—'}</td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-[12.5px] text-slate-500`}>{e.order_unit ?? e.base_unit_of_measure ?? '—'}</td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-right font-mono font-semibold text-slate-900`}>{money(e.unit_price, e.currency_key)}</td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-slate-500`}>{e.incoterms ?? '—'}{e.incoterms_location_1 ? ` · ${e.incoterms_location_1}` : ''}</td>
                        <td className={`${tableClasses.td} whitespace-nowrap text-[12.5px] text-slate-500`}>{e.valid_till_expiry_date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {maxPage > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[12.5px] text-slate-500">
                  <span>Showing {cur * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE + PAGE_SIZE, rows.length)} of {rows.length.toLocaleString()}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 transition-colors hover:border-[#6aaf8e] disabled:opacity-40">
                      <Icon name="chevRight" className="h-3.5 w-3.5 rotate-180" /> Prev
                    </button>
                    <span className="px-1 tabular-nums">Page {cur + 1} / {maxPage + 1}</span>
                    <button onClick={() => setPage(Math.min(maxPage, cur + 1))} disabled={cur >= maxPage} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 transition-colors hover:border-[#6aaf8e] disabled:opacity-40">
                      Next <Icon name="chevRight" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* read-only detail panel — portaled to <body> so `fixed` anchors to the viewport,
          not the transformed page container (otherwise it pins to the top of the page on scroll). */}
      {detail && createPortal(
        <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[8vh]">
          <button aria-label="Close" className="cm-fade-in absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="cm-scale-in relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#eaf4ef] to-white px-5 py-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[12px] text-slate-600">{detail.info_record_number ?? '—'}</span>
                  {detail.status && <span className="rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1d4f31]">{detail.status}</span>}
                </div>
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">{detail.material_description || detail.product_number || detail.supplier_name || 'Purchasing info record'}</h2>
                <p className="truncate text-[12.5px] text-slate-500">{detail.supplier_name}{detail.plant ? ` · ${detail.plant}` : ''}{detail.country ? ` · ${detail.country}` : ''}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {GROUP_ORDER.map((group) => {
                const items = FIELDS.filter((f) => f.group === group);
                return (
                  <div key={group} className="mb-5 last:mb-0">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
                    <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                      {items.map((f) => (
                        <div key={String(f.key)} className="min-w-0">
                          <div className="text-[11px] font-medium text-slate-400">{f.label}</div>
                          <div className="truncate text-[13.5px] font-medium text-slate-900" title={fmt(detail[f.key])}>
                            {f.key === 'unit_price' ? money(detail.unit_price, detail.currency_key) : fmt(detail[f.key])}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11.5px] text-slate-400">
              Read-only — sourced from SAP via the PIR sync. To change a record, update it in SAP.
            </div>
          </div>
        </div>,
        document.body,
      )}
    </CatalogManagerShell>
  );
}
