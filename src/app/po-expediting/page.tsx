'use client';

/* ─── PO Expediting dashboard ─────────────────────────────────────────────
   The buyer-facing PO list: KPI cards, status tiles, filters, and the grouped
   PO table with its expandable line items.

   This file was a 2,304-line monolith holding eight components, the DS code
   catalogue, every formatter and the dashboard itself. The pieces now live in
   ./_components and ./_lib; the DS catalogue moved to '@/lib/ds-codes', which
   the supplier portal, reconciliation and analytics read as well. What is left
   here is the dashboard: the data fetch, the cascading filter state, and the
   layout that arranges the parts.
   ───────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import LineItemDrawer from '@/components/LineItemDrawer';
import Sidebar from '@/components/Sidebar';
import { useExpediteStore } from '@/store/useExpediteStore';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import type { PurchaseOrder } from '@/types/po';
import { DS_DISPLAY_LABELS } from '@/lib/ds-codes';
import type { PoGroup, PoSortKey, SortDir } from './_lib/types';
import { compareValues, daysDiff, formatCurrency, formatDate } from './_lib/format';
import {
  PO_SORT_MAP,
  rowMatchesAccountType,
  rowMatchesSearch,
  rowMatchesStatus,
} from './_lib/filters';
import { DSCodeReferenceModal } from './_components/DSCodeReferenceModal';
import { FilterBar } from './_components/FilterBar';
import { KpiCard } from './_components/KpiCard';
import { PaginationBar } from './_components/PaginationBar';
import { PoParentRow, PoSubTable } from './_components/PoRows';
import { StatusTiles } from './_components/StatusTiles';
import { SkeletonRows, SortIcon } from './_components/table-chrome';

import { PAGE_SIZE } from './_lib/constants';

export default function Dashboard() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer selection
  const [selectedLineItem, setSelectedLineItem] = useState<PurchaseOrder | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dsCodeModalOpen, setDsCodeModalOpen] = useState(false);

  // Expedite cart — Zustand store
  const {
    selectedItems,
    toggleSelection,
    isSelected,
    clearSelection,
    selectMultipleLines,
    deselectMultipleLines,
  } = useExpediteStore();

  // Filters
  const [search, setSearch] = useState('');
  // The row scan below reads this debounced copy, so a fast typist does not
  // re-scan every row on every keystroke. Only the timing changes, never the result.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDelivCode, setFilterDelivCode] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState<string[]>([]);
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([]);
  const [filterBuyers, setFilterBuyers] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterAccountTypes, setFilterAccountTypes] = useState<string[]>([]);
  const [filterPGroup, setFilterPGroup] = useState<string[]>([]);
  const [filterSegment, setFilterSegment] = useState<string[]>([]);

  // Sort + pagination
  const [poSortKey, setPoSortKey] = useState<PoSortKey>('earliestDate');
  const [poSortDir, setPoSortDir] = useState<SortDir>('asc');
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [poPage, setPoPage] = useState(1);

  /* Fetch -------------------------------------------------- */
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/pos', { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const json = await res.json();
        setRows(json.data ?? []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message ?? 'Unknown error');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  /* Debounce the search box before it feeds the row scan ---- */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  /* Reset page when any filter/sort changes ---------------- */
  useEffect(() => {
    setPoPage(1);
  }, [
    search,
    filterDelivCode,
    filterCountry,
    filterSuppliers,
    filterBuyers,
    filterStatus,
    filterAccountTypes,
    filterPGroup,
    filterSegment,
    poSortKey,
    poSortDir,
  ]);

  /* Clear all filters -------------------------------------- */
  function clearFilters() {
    setSearch('');
    setFilterDelivCode([]);
    setFilterCountry([]);
    setFilterSuppliers([]);
    setFilterBuyers([]);
    setFilterStatus([]);
    setFilterAccountTypes([]);
    setFilterPGroup([]);
    setFilterSegment([]);
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    filterDelivCode.length +
    filterCountry.length +
    filterSuppliers.length +
    filterBuyers.length +
    filterStatus.length +
    filterAccountTypes.length +
    filterPGroup.length +
    filterSegment.length;

  /* Remove Specific Filter ---------------------------------- */
  function removeFilter(
    type: 'search' | 'deliv' | 'country' | 'supplier' | 'buyer' | 'pGroup' | 'segment',
    val?: string,
  ) {
    if (type === 'search') setSearch('');
    if (type === 'deliv' && val) setFilterDelivCode((p) => p.filter((c) => c !== val));
    if (type === 'country' && val) setFilterCountry((p) => p.filter((c) => c !== val));
    if (type === 'supplier' && val) setFilterSuppliers((p) => p.filter((s) => s !== val));
    if (type === 'buyer' && val) setFilterBuyers((p) => p.filter((b) => b !== val));
    if (type === 'pGroup' && val) setFilterPGroup((p) => p.filter((g) => g !== val));
    if (type === 'segment' && val) setFilterSegment((p) => p.filter((s) => s !== val));
  }

  /* Toggle PO expand --------------------------------------- */
  const togglePO = useCallback((poNum: string) => {
    setExpandedPOs((prev) => {
      const next = new Set(prev);
      next.has(poNum) ? next.delete(poNum) : next.add(poNum);
      return next;
    });
  }, []);

  /* PO sort toggle ----------------------------------------- */
  function handlePoSort(key: PoSortKey) {
    if (poSortKey === key) setPoSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setPoSortKey(key);
      setPoSortDir('asc');
    }
  }

  /* ── Cascading dropdown options ────────────────────────────
     Each set of options is calculated from rows filtered by all
     OTHER active filters (but NOT the filter for that dropdown),
     preventing users from locking themselves out of deselecting. */

  /* Trimmed filter look-ups, built once per filter change rather than
     re-allocated for every row inside the scan below. */
  const delivCodeSet = useMemo(() => new Set(filterDelivCode), [filterDelivCode]);
  const countrySet = useMemo(() => new Set(filterCountry), [filterCountry]);
  const supplierSet = useMemo(
    () => new Set(filterSuppliers.map((s) => s.trim())),
    [filterSuppliers],
  );
  const buyerSet = useMemo(() => new Set(filterBuyers.map((b) => b.trim())), [filterBuyers]);
  const pGroupSet = useMemo(() => new Set(filterPGroup), [filterPGroup]);
  const segmentSet = useMemo(() => new Set(filterSegment), [filterSegment]);

  /* One pass over `rows` produces all six option lists plus the filtered set.
     A row is recorded against every dropdown whose OWN filter is the only one
     it fails (and against all six when it fails none), which is exactly the
     cascading "all other filters" rule the six separate scans implemented. */
  const {
    deliveryCodes,
    countries,
    supplierList,
    supplierDisplayMap,
    buyerList,
    pGroupList,
    segmentList,
    filtered,
  } = useMemo(() => {
    const dc = new Set<string>();
    const co = new Set<string>();
    const sp = new Map<string, string>(); // supplierName -> "ID - Name"
    const by = new Set<string>();
    const pg = new Set<string>();
    const sg = new Set<string>();
    const keep: PurchaseOrder[] = [];

    // The option scans matched on the raw box contents; `filtered` trimmed it first.
    const trimmedSearch = debouncedSearch.trim();
    const sameSearch = trimmedSearch === debouncedSearch;

    for (const r of rows) {
      if (!rowMatchesStatus(r, filterStatus)) continue;
      if (!rowMatchesAccountType(r, filterAccountTypes)) continue;

      const okOptions = rowMatchesSearch(r, debouncedSearch);
      const okFiltered = sameSearch ? okOptions : rowMatchesSearch(r, trimmedSearch);
      if (!okOptions && !okFiltered) continue;

      const failDC = delivCodeSet.size > 0 && !delivCodeSet.has(r['Delivery Code'] || '(Blank)');
      const failCO = countrySet.size > 0 && !countrySet.has(r['Country'] ?? '');
      const failSP = supplierSet.size > 0 && !supplierSet.has((r['Supplier Name'] ?? '').trim());
      const failBY = buyerSet.size > 0 && !buyerSet.has((r['Buyer Name'] ?? '').trim());
      const failPG = pGroupSet.size > 0 && !pGroupSet.has(r['P Group'] ?? '');
      const failSG = segmentSet.size > 0 && !segmentSet.has(r['Segment'] ?? '');
      const fails = +failDC + +failCO + +failSP + +failBY + +failPG + +failSG;

      if (fails === 0 && okFiltered) keep.push(r);
      if (!okOptions || fails > 1) continue;

      if (fails === 0 || failDC) dc.add(r['Delivery Code'] || '(Blank)');
      if ((fails === 0 || failCO) && r['Country']) co.add(r['Country']);
      if (fails === 0 || failSP) {
        const name = (r['Supplier Name'] ?? '').trim();
        if (name && !sp.has(name)) {
          const id = r['Supplier ID'];
          sp.set(name, id ? `${id} - ${name}` : name);
        }
      }
      if ((fails === 0 || failBY) && r['Buyer Name']) by.add(r['Buyer Name']);
      if ((fails === 0 || failPG) && r['P Group']) pg.add(r['P Group']);
      if ((fails === 0 || failSG) && r['Segment']) sg.add(r['Segment']);
    }

    const sortedNames = [...sp.keys()].sort();
    const displayMap: Record<string, string> = {};
    sortedNames.forEach((name) => {
      displayMap[name] = sp.get(name)!;
    });

    return {
      deliveryCodes: [...dc].sort(),
      countries: [...co].sort(),
      supplierList: sortedNames,
      supplierDisplayMap: displayMap,
      buyerList: [...by].sort(),
      pGroupList: [...pg].sort(),
      segmentList: [...sg].sort(),
      filtered: keep,
    };
  }, [
    rows,
    debouncedSearch,
    filterStatus,
    filterAccountTypes,
    delivCodeSet,
    countrySet,
    supplierSet,
    buyerSet,
    pGroupSet,
    segmentSet,
  ]);

  /* PO grouping -------------------------------------------- */
  const groupedPOs = useMemo((): PoGroup[] => {
    const map = new Map<string, PoGroup>();
    filtered.forEach((row) => {
      const key = row['PO Number'] ?? '(No PO)';
      if (!map.has(key)) {
        map.set(key, {
          poNumber: key,
          supplierName: row['Supplier Name'] ?? '—',
          country: row['Country'] ?? '—',
          deliveryCode: row['Delivery Code'] || '—',
          lineCount: 0,
          totalQty: 0,
          totalValue: 0,
          earliestDate: row['Delivery Date'],
          lines: [],
        });
      }
      const g = map.get(key)!;
      g.lines.push(row);
      g.lineCount++;
      g.totalQty += Number(row['Open QTY'] ?? 0);
      g.totalValue += Number(row['Open PO Value USD'] ?? 0);
      if (row['Delivery Date'] && g.earliestDate) {
        if (new Date(row['Delivery Date']) < new Date(g.earliestDate))
          g.earliestDate = row['Delivery Date'];
      } else if (row['Delivery Date']) {
        g.earliestDate = row['Delivery Date'];
      }
    });
    return Array.from(map.values());
  }, [filtered]);

  const sortedPOs = useMemo(
    () =>
      [...groupedPOs].sort((a, b) => {
        let cmp = 0;
        if (poSortKey === 'totalValue') cmp = a.totalValue - b.totalValue;
        if (poSortKey === 'earliestDate') cmp = compareValues(a.earliestDate, b.earliestDate);
        return poSortDir === 'asc' ? cmp : -cmp;
      }),
    [groupedPOs, poSortKey, poSortDir],
  );

  const poPages = Math.max(1, Math.ceil(sortedPOs.length / PAGE_SIZE));
  const curPoPage = Math.min(poPage, poPages);
  const pagePOs = useMemo(
    () => sortedPOs.slice((curPoPage - 1) * PAGE_SIZE, curPoPage * PAGE_SIZE),
    [sortedPOs, curPoPage],
  );

  /* KPI stats — always derived from the fully-filtered dataset */
  const stats = useMemo(() => {
    const distinctPOs = new Set(filtered.map((r) => r['PO Number'])).size;
    const pastDue = new Set(
      filtered.filter((r) => daysDiff(r['Delivery Date']) < 0).map((r) => r['PO Number']),
    ).size;
    const dueSoon = new Set(
      filtered
        .filter((r) => {
          const d = daysDiff(r['Delivery Date']);
          return d >= 0 && d <= 7;
        })
        .map((r) => r['PO Number']),
    ).size;
    const totalValue = filtered.reduce((s, r) => s + Number(r['Open PO Value USD'] ?? 0), 0);
    return { distinctPOs, pastDue, dueSoon, totalValue };
  }, [filtered]);

  /* Today label -------------------------------------------- */
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <LineItemDrawer
        lineItem={selectedLineItem}
        onClose={() => setSelectedLineItem(null)}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        deliveryStatusMap={DS_DISPLAY_LABELS}
      />
      <main className="flex-1 flex flex-col h-full relative bg-white">
        {/* ── Sticky top nav ── */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
              <svg
                className="w-4 h-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">NESR</span>
            <span className="hidden sm:inline text-gray-300 select-none">·</span>
            <span className="hidden sm:inline text-sm font-medium text-gray-500">
              PO Expediting Dashboard
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href="/po-expediting/help"
              title="Help & Training"
              aria-label="Help & Training"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#307c4c]"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </Link>
            <span className="text-xs text-gray-400 font-medium hidden sm:block">{todayLabel}</span>
          </div>
        </header>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scroll-smooth">
          {/* Page title */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                Open Purchase Orders
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Live view of all open POs sourced from SAP — grouped by PO, sortable by delivery
                date or value.
              </p>
            </div>
            <button
              onClick={() => setDsCodeModalOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
              }}
            >
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              DS Codes ?
            </button>
          </div>

          {/* ── KPI Cards ── */}
          {!loading && !error && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-in fade-in duration-500">
              <KpiCard
                label="Distinct Open POs"
                value={stats.distinctPOs.toLocaleString()}
                accent
              />
              <KpiCard
                label="Past Due"
                value={stats.pastDue.toLocaleString()}
                danger={stats.pastDue > 0}
              />
              <KpiCard
                label="Due This Week"
                value={stats.dueSoon.toLocaleString()}
                warning={stats.dueSoon > 0}
              />
              <KpiCard label="Total Open Value" value={formatCurrency(stats.totalValue)} accent />
            </div>
          )}

          {/* ── Table card ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-500">
            {/* ── Filter bar ── */}
            {!loading && !error && (
              <>
                {/* ── Status + Type Tile Slicer ── */}
                <StatusTiles
                  selected={filterStatus}
                  onChange={setFilterStatus}
                  selectedAccountTypes={filterAccountTypes}
                  onAccountTypeChange={setFilterAccountTypes}
                />

                <FilterBar
                  search={search}
                  onSearch={setSearch}
                  deliveryCode={filterDelivCode}
                  onDeliveryCode={setFilterDelivCode}
                  deliveryCodes={deliveryCodes}
                  country={filterCountry}
                  onCountry={setFilterCountry}
                  countries={countries}
                  suppliers={filterSuppliers}
                  onSuppliers={setFilterSuppliers}
                  supplierList={supplierList}
                  supplierDisplayMap={supplierDisplayMap}
                  buyers={filterBuyers}
                  onBuyers={setFilterBuyers}
                  buyerList={buyerList}
                  pGroup={filterPGroup}
                  onPGroup={setFilterPGroup}
                  pGroupList={pGroupList}
                  segment={filterSegment}
                  onSegment={setFilterSegment}
                  segmentList={segmentList}
                />

                {/* ── Active Filters Row ── */}
                {activeFilterCount > 0 && (
                  <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">
                        Active Filters:
                      </span>
                      {search && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm">
                          Search: {search}
                          <button
                            onClick={() => removeFilter('search')}
                            className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      )}
                      {filterDelivCode.map((c) => (
                        <span
                          key={`deliv-${c}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm"
                        >
                          Delivery Status: {DS_DISPLAY_LABELS[c] || c}
                          <button
                            onClick={() => removeFilter('deliv', c)}
                            className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {filterCountry.map((c) => (
                        <span
                          key={`country-${c}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm"
                        >
                          Country: {c}
                          <button
                            onClick={() => removeFilter('country', c)}
                            className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {filterSuppliers.map((s) => (
                        <span
                          key={`sup-${s}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#307c4c]/20 text-[#307c4c] text-xs font-medium rounded-full shadow-sm"
                        >
                          Supplier: {supplierDisplayMap[s] || s}
                          <button
                            onClick={() => removeFilter('supplier', s)}
                            className="hover:bg-[#307c4c]/10 p-0.5 rounded-full text-[#307c4c]/60 hover:text-[#307c4c] transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {filterBuyers.map((b) => (
                        <span
                          key={`buy-${b}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#307c4c]/20 text-[#307c4c] text-xs font-medium rounded-full shadow-sm"
                        >
                          Buyer: {b}
                          <button
                            onClick={() => removeFilter('buyer', b)}
                            className="hover:bg-[#307c4c]/10 p-0.5 rounded-full text-[#307c4c]/60 hover:text-[#307c4c] transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {filterPGroup.map((g) => (
                        <span
                          key={`pg-${g}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm"
                        >
                          P Group: {g}
                          <button
                            onClick={() => removeFilter('pGroup', g)}
                            className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {filterSegment.map((s) => (
                        <span
                          key={`seg-${s}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm"
                        >
                          Segment: {s}
                          <button
                            onClick={() => removeFilter('segment', s)}
                            className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={clearFilters}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap px-2 shrink-0"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
                    {/* Master Checkbox col */}
                    <th className="p-4 pl-6 w-14">
                      <SquareCheckbox
                        checked={
                          pagePOs.length > 0 &&
                          pagePOs.every((group) => group.lines.every((l) => isSelected(l)))
                        }
                        indeterminate={
                          pagePOs.length > 0 &&
                          pagePOs.some((group) => group.lines.some((l) => isSelected(l))) &&
                          !pagePOs.every((group) => group.lines.every((l) => isSelected(l)))
                        }
                        onChange={(e) => {
                          const visibleLines = pagePOs.flatMap((g) => g.lines);
                          if (e.target.checked) selectMultipleLines(visibleLines);
                          else deselectMultipleLines(visibleLines);
                        }}
                        aria-label="Select all visible items"
                      />
                    </th>

                    {/* Chevron col */}
                    <th className="p-4 pl-2 w-8" />

                    {/* PO Number — plain, non-sortable */}
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">PO Number</th>

                    {/* Sortable columns */}
                    {(['totalValue', 'earliestDate'] as PoSortKey[]).map((sk) => {
                      const label = PO_SORT_MAP[sk];
                      const align = sk === 'totalValue' ? 'right' : undefined;
                      const active = poSortKey === sk;
                      return (
                        <th
                          key={sk}
                          onClick={() => handlePoSort(sk)}
                          aria-sort={
                            active ? (poSortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                          className={[
                            'p-4 pl-6 font-medium whitespace-nowrap select-none cursor-pointer hover:text-[#307c4c] transition-colors duration-150',
                            align === 'right' ? 'text-right' : '',
                            active ? 'text-[#307c4c]' : '',
                          ].join(' ')}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {label}
                            <SortIcon active={active} dir={poSortDir} />
                          </span>
                        </th>
                      );
                    })}

                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Supplier Name</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Country</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Delivery Status</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap text-right">Lines</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && <SkeletonRows cols={9} />}

                  {!loading && error && (
                    <tr>
                      <td colSpan={9} className="p-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">⚠️</span>
                          <p className="font-semibold text-slate-700">Could not load data</p>
                          <p className="text-sm text-slate-400 max-w-sm">{error}</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && !error && sortedPOs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">🔍</span>
                          <p className="font-semibold text-slate-700">No results found</p>
                          <p className="text-sm text-slate-400">
                            Try adjusting your search or filters.
                          </p>
                          {activeFilterCount > 0 && (
                            <button
                              onClick={clearFilters}
                              className="mt-1 text-sm font-medium text-[#307c4c] hover:underline"
                            >
                              Clear all filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    !error &&
                    pagePOs.map((group) => {
                      const isOpen = expandedPOs.has(group.poNumber);
                      const isChecked = group.lines.every((l) => isSelected(l));
                      const isIndeterminate = group.lines.some((l) => isSelected(l)) && !isChecked;

                      return (
                        <React.Fragment key={group.poNumber}>
                          {/* ── PO parent row ── */}
                          <PoParentRow
                            group={group}
                            isOpen={isOpen}
                            isChecked={isChecked}
                            isIndeterminate={isIndeterminate}
                            togglePO={togglePO}
                            selectMultipleLines={selectMultipleLines}
                            deselectMultipleLines={deselectMultipleLines}
                          />

                          {/* ── Expandable sub-table row ── */}
                          <tr
                            key={`${group.poNumber}-expand`}
                            className="border-b border-slate-100 p-0 hover:bg-transparent"
                          >
                            <td colSpan={9} className="p-0">
                              <div className={`expand-grid${isOpen ? ' open' : ''}`}>
                                <div>
                                  <div className="border-t border-[#307c4c]/10 bg-slate-50/60">
                                    <PoSubTable
                                      lines={group.lines}
                                      searchTerm={search}
                                      onRowClick={setSelectedLineItem}
                                      selectedLineItem={selectedLineItem}
                                      toggleSelection={toggleSelection}
                                      isSelected={isSelected}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && !error && sortedPOs.length > 0 && (
              <PaginationBar
                currentPage={curPoPage}
                totalPages={poPages}
                totalItems={sortedPOs.length}
                setPage={setPoPage}
              />
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-8 pb-28">
            NESR Expediting Tool · Data sourced live from SAP Open PO Master
          </p>
        </div>
      </main>

      {/* ── DS Code Reference Modal ── */}
      <DSCodeReferenceModal open={dsCodeModalOpen} onClose={() => setDsCodeModalOpen(false)} />

      {/* ── Floating Expedite Action Bar ──────────────────────────── */}
      {selectedItems.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-8 py-4
          bg-slate-900/95 backdrop-blur-md border-t border-slate-700/60
          shadow-[0_-4px_32px_rgba(0,0,0,0.25)]
          animate-in slide-in-from-bottom-2 duration-200"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Left: selection summary */}
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#307c4c] shrink-0">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">
                  {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} in Expedite
                  Queue
                </p>
                <p className="text-xs text-slate-400 leading-tight">
                  {new Set(selectedItems.map((i) => i['Supplier Name'])).size} supplier
                  {new Set(selectedItems.map((i) => i['Supplier Name'])).size !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={clearSelection}
                className="text-xs font-medium text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
              >
                Clear all
              </button>
              <Link
                href="/po-expediting/queue"
                className="flex items-center gap-2 bg-[#307c4c] hover:bg-[#26663e]
                  text-white text-sm font-semibold px-5 py-2.5 rounded-xl
                  transition-all duration-150 hover:scale-[1.02] active:scale-95
                  shadow-lg shadow-[#307c4c]/30"
              >
                Expedite {selectedItems.length} Selected
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
