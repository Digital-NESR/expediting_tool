'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import LineItemDrawer from '@/components/LineItemDrawer';

/* ─── Constants ───────────────────────────────────────────── */
const PAGE_SIZE = 15;

const deliveryStatusMap: Record<string, string> = {
  "DS01": "DS01 - PO Copy Not Received",
  "DS02": "DS02 - PO Rejected",
  "DS03": "DS03 - PO Pending Revision",
  "DS04": "DS04 - PO Acknowledged - Delivery On time",
  "DS05": "DS05 - PO Acknowledged - Delivery Delay",
  "DS06": "DS06 - Delivery On Hold - Pending Import Permit",
  "DS07": "DS07 - PO Acknowledged - No response",
  "DS08": "DS08 - Delivery On Hold - Pending LC",
  "DS09": "DS09 - Delivery On Hold - Pending Advance Payment",
  "DS10": "DS10 - Delivery On-Hold - Payment Issues",
  "DS11": "DS11 - Delivery On Hold - Others",
  "DS12": "DS12 - Delivered & Invoiced",
  "DS13": "DS13 - Service Ongoing",
  "DS14": "DS14 - Service Completed",
  "DS15": "DS15 - Shipped - In Transit",
  "DS16": "DS16 - Ready for Collection",
  "DS17": "DS17 - Collected by Freight Forwarder",
  "DS18": "DS18 - Customs Clearance",
  "DS19": "DS19 - Products Delivered to Base "
};

/* ─── Types ───────────────────────────────────────────────── */
export interface PurchaseOrder {
  'PO Number': string;
  'PO Line'?: string;
  'Supplier Name': string;
  'Supplier ID'?: string;
  'Item Description': string;
  'SAP MAT ID': string;
  'Open QTY': number | string;
  'Open PO Value USD': number | string;
  'Delivery Date': string;
  'Delivery Code': string;
  'Country': string;
  'Delivery Comments'?: string;
}

interface PoGroup {
  poNumber: string;
  supplierName: string;
  country: string;
  deliveryCode: string;
  lineCount: number;
  totalQty: number;
  totalValue: number;
  earliestDate: string;
  lines: PurchaseOrder[];
}

type PoSortKey = 'poNumber' | 'totalValue' | 'earliestDate';
type SortDir = 'asc' | 'desc';

/* ─── Helpers ─────────────────────────────────────────────── */
function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(raw: number | string | null | undefined): string {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === '' || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function daysDiff(raw: string | null | undefined): number {
  if (!raw) return 0;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 0;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function compareValues(a: string, b: string): number {
  const na = Number(a); const nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  const da = new Date(a).getTime(); const db = new Date(b).getTime();
  if (!isNaN(da) && !isNaN(db)) return da - db;
  return a.localeCompare(b);
}

/* ─── Delivery Status Badge ───────────────────────────────── */
function DeliveryBadge({ raw }: { raw: string | null | undefined }) {
  const diff = daysDiff(raw);
  if (!raw) return <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-500">—</span>;
  if (diff < 0) return <span className="bg-red-100/80 border border-red-200 text-red-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">Overdue</span>;
  if (diff <= 7) return <span className="bg-amber-100/80 border border-amber-200 text-amber-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">Due Soon</span>;
  return <span className="bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c] text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">On Track</span>;
}

/* ─── Sort Icon ───────────────────────────────────────────── */
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-flex flex-col leading-none text-[9px] ${active ? 'text-[#307c4c]' : 'text-slate-300'}`}>
      <span className={active && dir === 'asc' ? 'text-[#307c4c]' : ''}>▲</span>
      <span className={active && dir === 'desc' ? 'text-[#307c4c]' : ''}>▼</span>
    </span>
  );
}

/* ─── Chevron Icon ────────────────────────────────────────── */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ease-in-out ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20" fill="currentColor"
    >
      <path fillRule="evenodd" d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Skeleton Rows ───────────────────────────────────────── */
function SkeletonRows({ cols }: { cols: number }) {
  const pats = ['w-8', 'w-20', 'w-24', 'w-36', 'w-16', 'w-16', 'w-20', 'w-16'];
  return (
    <>
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="p-4 pl-6">
              <div className={`h-3.5 ${pats[j % pats.length]} skeleton-shimmer`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ─── KPI Card ────────────────────────────────────────────── */
function KpiCard({ label, value, accent = false, warning = false, danger = false }: {
  label: string; value: string; accent?: boolean; warning?: boolean; danger?: boolean;
}) {
  const valueColor = danger ? 'text-red-600' : warning ? 'text-amber-600' : accent ? 'text-[#307c4c]' : 'text-slate-800';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}

/* ─── Pagination Bar ──────────────────────────────────────── */
function PaginationBar({ currentPage, totalPages, totalItems, setPage }: {
  currentPage: number; totalPages: number; totalItems: number; setPage: (p: number) => void;
}) {
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);

  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => {
      if (totalPages <= 7) return true;
      if (p === 1 || p === totalPages) return true;
      return Math.abs(p - currentPage) <= 2;
    })
    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
      acc.push(p); return acc;
    }, []);

  return (
    <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{start}–{end}</span> of{' '}
        <span className="font-semibold text-slate-700">{totalItems.toLocaleString()}</span> purchase orders
      </p>
      <div className="flex items-center gap-2">
        <button
          id="pagination-prev"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="h-9 px-4 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >← Previous</button>

        <div className="flex items-center gap-1">
          {pageNums.map((p, i) =>
            p === '…' ? (
              <span key={`el-${i}`} className="px-2 text-slate-400 text-sm select-none">…</span>
            ) : (
              <button
                key={p}
                id={`pagination-page-${p}`}
                onClick={() => setPage(p as number)}
                className={[
                  'h-9 min-w-[36px] rounded-lg text-sm font-medium transition-all duration-150',
                  currentPage === p
                    ? 'bg-[#307c4c] text-white shadow-sm'
                    : 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')}
              >{p}</button>
            )
          )}
        </div>

        <button
          id="pagination-next"
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="h-9 px-4 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >Next →</button>
      </div>
    </div>
  );
}

/* ─── Filter Bar ──────────────────────────────────────────── */
function FilterBar({
  search, onSearch,
  deliveryCode, onDeliveryCode, deliveryCodes,
  country, onCountry, countries,
  activeCount, onClear,
}: {
  search: string; onSearch: (v: string) => void;
  deliveryCode: string; onDeliveryCode: (v: string) => void; deliveryCodes: string[];
  country: string; onCountry: (v: string) => void; countries: string[];
  activeCount: number; onClear: () => void;
}) {
  const inputBase = 'bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] outline-none transition-colors duration-150';

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-white">
      <div className="flex flex-col md:flex-row md:items-center gap-3">

        {/* ── Global Search ── */}
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            id="filter-search"
            type="search"
            placeholder="Search by PO Number, Supplier, or SAP MAT ID…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search by PO Number, Supplier Name or SAP MAT ID"
            className={`${inputBase} pl-9 pr-4 py-2.5 w-full`}
          />
        </div>

        {/* ── Delivery Code dropdown ── */}
        <div className="relative shrink-0">
          <select
            id="filter-delivery-code"
            value={deliveryCode}
            onChange={(e) => onDeliveryCode(e.target.value)}
            aria-label="Filter by Delivery Code"
            className={`${inputBase} pl-3 pr-8 py-2.5 appearance-none cursor-pointer w-full md:w-48`}
          >
            <option value="">All Delivery Codes</option>
            {deliveryCodes.map((c) => (
              <option key={c} value={c}>
                {deliveryStatusMap[c] || c}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>

        {/* ── Country dropdown ── */}
        <div className="relative shrink-0">
          <select
            id="filter-country"
            value={country}
            onChange={(e) => onCountry(e.target.value)}
            aria-label="Filter by Country"
            className={`${inputBase} pl-3 pr-8 py-2.5 appearance-none cursor-pointer w-full md:w-44`}
          >
            <option value="">All Countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>

        {/* ── Clear button (only when filters active) ── */}
        {activeCount > 0 && (
          <button
            id="filter-clear"
            onClick={onClear}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-700 transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Clear
            <span className="bg-[#307c4c]/10 text-[#307c4c] text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── PO Sort column map ──────────────────────────────────── */
const PO_SORT_MAP: Record<PoSortKey, string> = {
  poNumber: 'PO Number',
  totalValue: 'Open PO Value (USD)',
  earliestDate: 'Delivery Date',
};

/* ─── Sub-table for expanded PO lines ────────────────────── */
function PoSubTable({ 
  lines, 
  searchTerm, 
  onRowClick, 
  selectedLineItem 
}: { 
  lines: PurchaseOrder[]; 
  searchTerm: string;
  onRowClick: (line: PurchaseOrder) => void;
  selectedLineItem: PurchaseOrder | null;
}) {
  const SUB_COLS: { label: string; align?: 'right' }[] = [
    { label: 'SAP MAT ID' },
    { label: 'Item Description' },
    { label: 'Open QTY', align: 'right' },
    { label: 'Open PO Value (USD)', align: 'right' },
    { label: 'Delivery Date' },
    { label: 'Status' },
  ];

  // Highlight matching lines when searching by SAP MAT ID
  const term = searchTerm.toLowerCase().trim();

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-100/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {SUB_COLS.map((c) => (
            <th key={c.label} className={`py-2.5 px-4 pl-10 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {lines.map((line, i) => {
          const diff = daysDiff(line['Delivery Date']);
          // Highlight this row if SAP MAT ID matches the search term
          const isMatch = term !== '' && (
            String(line['SAP MAT ID'] ?? '').toLowerCase().includes(term) ||
            String(line['PO Number'] ?? '').toLowerCase().includes(term) ||
            String(line['Supplier Name'] ?? '').toLowerCase().includes(term)
          );
          const isSelected = selectedLineItem === line;
          return (
            <tr
              key={i}
              onClick={() => onRowClick(line)}
              className={[
                'transition-colors duration-150 cursor-pointer',
                isSelected
                  ? 'bg-[#307c4c]/10 border-l-2 border-l-[#307c4c]'
                  : isMatch
                    ? 'bg-[#307c4c]/5 border-l-2 border-l-[#307c4c] border-l-opacity-50'
                    : 'hover:bg-[#307c4c]/5',
              ].join(' ')}
            >
              <td className="py-3 px-4 pl-10 font-mono text-xs font-semibold text-slate-500 whitespace-nowrap">
                {line['SAP MAT ID'] ?? '—'}
              </td>
              <td className="py-3 px-4 pl-10 text-sm text-slate-600 max-w-[280px] truncate" title={line['Item Description']}>
                {line['Item Description'] ?? '—'}
              </td>
              <td className="py-3 px-4 pl-10 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                {Number(line['Open QTY'] ?? 0).toLocaleString()}
              </td>
              <td className="py-3 px-4 pl-10 text-sm text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                {formatCurrency(line['Open PO Value USD'])}
              </td>
              <td className={`py-3 px-4 pl-10 text-sm whitespace-nowrap font-medium ${diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                {formatDate(line['Delivery Date'])}
              </td>
              <td className="py-3 px-4 pl-10 whitespace-nowrap">
                <DeliveryBadge raw={line['Delivery Date']} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── Main Dashboard ──────────────────────────────────────── */
export default function Dashboard() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLineItem, setSelectedLineItem] = useState<PurchaseOrder | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDelivCode, setFilterDelivCode] = useState('');
  const [filterCountry, setFilterCountry] = useState('');

  // Sort + pagination
  const [poSortKey, setPoSortKey] = useState<PoSortKey>('earliestDate');
  const [poSortDir, setPoSortDir] = useState<SortDir>('asc');
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [poPage, setPoPage] = useState(1);

  /* Fetch -------------------------------------------------- */
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fetch('/api/pos', { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const json = await res.json();
        setRows(json.data ?? []);
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message ?? 'Unknown error'); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  /* Reset page when any filter/sort changes ---------------- */
  useEffect(() => { setPoPage(1); }, [search, filterDelivCode, filterCountry, poSortKey, poSortDir]);

  /* Clear all filters -------------------------------------- */
  function clearFilters() {
    setSearch('');
    setFilterDelivCode('');
    setFilterCountry('');
  }

  const activeFilterCount = (search ? 1 : 0) + (filterDelivCode ? 1 : 0) + (filterCountry ? 1 : 0);

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
    if (poSortKey === key) setPoSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setPoSortKey(key); setPoSortDir('asc'); }
  }

  /* Dynamic dropdown options (from full dataset) ----------- */
  const { deliveryCodes, countries } = useMemo(() => {
    const dc = new Set<string>();
    const co = new Set<string>();
    rows.forEach((r) => {
      if (r['Delivery Code']) dc.add(r['Delivery Code']);
      if (r['Country']) co.add(r['Country']);
    });
    return {
      deliveryCodes: [...dc].sort(),
      countries: [...co].sort(),
    };
  }, [rows]);

  /* Smart filtering:
     A line row passes if it matches search + dropdown filters.
     A PO group passes if ANY of its lines pass — ensuring
     parent rows remain visible when a SAP MAT ID matches. */
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return rows.filter((r) => {
      // Dropdown filters apply at line level
      if (filterDelivCode && r['Delivery Code'] !== filterDelivCode) return false;
      if (filterCountry && r['Country'] !== filterCountry) return false;

      // Search: match PO Number, Supplier Name, or SAP MAT ID
      if (term) {
        const matchesPO = String(r['PO Number'] ?? '').toLowerCase().includes(term);
        const matchesSupplier = String(r['Supplier Name'] ?? '').toLowerCase().includes(term);
        const matchesMatID = String(r['SAP MAT ID'] ?? '').toLowerCase().includes(term);
        if (!matchesPO && !matchesSupplier && !matchesMatID) return false;
      }

      return true;
    });
  }, [rows, search, filterDelivCode, filterCountry]);

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
          deliveryCode: row['Delivery Code'] ?? '—',
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
        if (new Date(row['Delivery Date']) < new Date(g.earliestDate)) g.earliestDate = row['Delivery Date'];
      } else if (row['Delivery Date']) {
        g.earliestDate = row['Delivery Date'];
      }
    });
    return Array.from(map.values());
  }, [filtered]);

  const sortedPOs = useMemo(() =>
    [...groupedPOs].sort((a, b) => {
      let cmp = 0;
      if (poSortKey === 'poNumber') cmp = a.poNumber.localeCompare(b.poNumber);
      if (poSortKey === 'totalValue') cmp = a.totalValue - b.totalValue;
      if (poSortKey === 'earliestDate') cmp = compareValues(a.earliestDate, b.earliestDate);
      return poSortDir === 'asc' ? cmp : -cmp;
    }), [groupedPOs, poSortKey, poSortDir]);

  const poPages = Math.max(1, Math.ceil(sortedPOs.length / PAGE_SIZE));
  const curPoPage = Math.min(poPage, poPages);
  const pagePOs = useMemo(() => sortedPOs.slice((curPoPage - 1) * PAGE_SIZE, curPoPage * PAGE_SIZE), [sortedPOs, curPoPage]);

  /* KPI stats — always from full unfiltered dataset -------- */
  const stats = useMemo(() => {
    const distinctPOs = new Set(rows.map((r) => r['PO Number'])).size;
    const overdue     = new Set(rows.filter((r) => daysDiff(r['Delivery Date']) < 0).map(r => r['PO Number'])).size;
    const dueSoon     = new Set(rows.filter((r) => { const d = daysDiff(r['Delivery Date']); return d >= 0 && d <= 7; }).map(r => r['PO Number'])).size;
    const totalValue  = rows.reduce((s, r) => s + Number(r['Open PO Value USD'] ?? 0), 0);
    return { distinctPOs, overdue, dueSoon, totalValue };
  }, [rows]);

  /* Today label -------------------------------------------- */
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900 relative">
      <LineItemDrawer 
        lineItem={selectedLineItem} 
        onClose={() => setSelectedLineItem(null)} 
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        deliveryStatusMap={deliveryStatusMap}
      />
      <main className="flex-1 flex flex-col h-full relative bg-white">

        {/* ── Sticky top nav ── */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">NESR</span>
            <span className="hidden sm:inline text-gray-300 select-none">·</span>
            <span className="hidden sm:inline text-sm font-medium text-gray-500">PO Expediting Dashboard</span>
          </div>
          <span className="text-xs text-gray-400 font-medium hidden sm:block">{todayLabel}</span>
        </header>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scroll-smooth">

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">Open Purchase Orders</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Live view of all open POs sourced from SAP — grouped by PO, sortable by delivery date, value, or PO number.
            </p>
          </div>

          {/* ── KPI Cards ── */}
          {!loading && !error && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-in fade-in duration-500">
              <KpiCard label="Distinct Open POs" value={stats.distinctPOs.toLocaleString()} accent />
              <KpiCard label="Overdue" value={stats.overdue.toLocaleString()} danger={stats.overdue > 0} />
              <KpiCard label="Due This Week" value={stats.dueSoon.toLocaleString()} warning={stats.dueSoon > 0} />
              <KpiCard label="Total Open Value" value={formatCurrency(stats.totalValue)} accent />
            </div>
          )}

          {/* ── Table card ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-500">

            {/* ── Top toolbar: count only ── */}
            <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
              <p className="text-lg font-semibold text-slate-800">
                {loading
                  ? 'Loading data…'
                  : activeFilterCount > 0
                    ? `${sortedPOs.length.toLocaleString()} of ${stats.distinctPOs.toLocaleString()} purchase orders`
                    : `${sortedPOs.length.toLocaleString()} purchase orders`}
              </p>
              {/* Active filter pill summary */}
              {!loading && !error && activeFilterCount > 0 && (
                <span className="text-xs text-slate-500 font-medium hidden sm:block">
                  {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                </span>
              )}
            </div>

            {/* ── Filter bar ── */}
            {!loading && !error && (
              <FilterBar
                search={search} onSearch={setSearch}
                deliveryCode={filterDelivCode} onDeliveryCode={setFilterDelivCode} deliveryCodes={deliveryCodes}
                country={filterCountry} onCountry={setFilterCountry} countries={countries}
                activeCount={activeFilterCount}
                onClear={clearFilters}
              />
            )}

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
                    {/* Chevron col */}
                    <th className="p-4 pl-6 w-10" />

                    {/* Sortable columns */}
                    {(['poNumber', 'totalValue', 'earliestDate'] as PoSortKey[]).map((sk) => {
                      const label = PO_SORT_MAP[sk];
                      const align = sk === 'totalValue' ? 'right' : undefined;
                      const active = poSortKey === sk;
                      return (
                        <th
                          key={sk}
                          onClick={() => handlePoSort(sk)}
                          aria-sort={active ? (poSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
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
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Delivery Code</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap text-right">Lines</th>
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && <SkeletonRows cols={9} />}

                  {!loading && error && (
                    <tr><td colSpan={9} className="p-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">⚠️</span>
                        <p className="font-semibold text-slate-700">Could not load data</p>
                        <p className="text-sm text-slate-400 max-w-sm">{error}</p>
                      </div>
                    </td></tr>
                  )}

                  {!loading && !error && sortedPOs.length === 0 && (
                    <tr><td colSpan={9} className="p-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-4xl">🔍</span>
                        <p className="font-semibold text-slate-700">No results found</p>
                        <p className="text-sm text-slate-400">Try adjusting your search or filters.</p>
                        {activeFilterCount > 0 && (
                          <button
                            onClick={clearFilters}
                            className="mt-1 text-sm font-medium text-[#307c4c] hover:underline"
                          >Clear all filters</button>
                        )}
                      </div>
                    </td></tr>
                  )}

                  {!loading && !error && pagePOs.map((group) => {
                    const isOpen = expandedPOs.has(group.poNumber);
                    const diff = daysDiff(group.earliestDate);
                    return (
                      <>
                        {/* ── PO parent row ── */}
                        <tr
                          key={group.poNumber}
                          onClick={() => togglePO(group.poNumber)}
                          className="border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors duration-150 group"
                        >
                          <td className="p-4 pl-6 w-10">
                            <ChevronIcon open={isOpen} />
                          </td>
                          <td className="p-4 pl-6 font-mono text-sm font-semibold text-slate-700 whitespace-nowrap">
                            {group.poNumber}
                          </td>
                          <td className="p-4 pl-6 text-sm text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            {formatCurrency(group.totalValue)}
                          </td>
                          <td className={`p-4 pl-6 text-sm whitespace-nowrap font-medium ${diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                            {formatDate(group.earliestDate)}
                          </td>
                          <td className="p-4 pl-6 text-sm text-slate-700 max-w-[180px] truncate" title={group.supplierName}>
                            {group.supplierName}
                          </td>
                          <td className="p-4 pl-6 text-sm text-slate-600 whitespace-nowrap">
                            {group.country}
                          </td>
                          <td className="p-4 pl-6 whitespace-nowrap">
                            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600">
                              {group.deliveryCode}
                            </span>
                          </td>
                          <td className="p-4 pl-6 text-sm text-right font-medium text-slate-600 tabular-nums">
                            {group.lineCount}
                          </td>
                          <td className="p-4 pl-6 whitespace-nowrap">
                            <DeliveryBadge raw={group.earliestDate} />
                          </td>
                        </tr>

                        {/* ── Expandable sub-table row ── */}
                        <tr key={`${group.poNumber}-expand`} className="border-b border-slate-100">
                          <td colSpan={9} className="p-0">
                            <div className={`expand-grid${isOpen ? ' open' : ''}`}>
                              <div>
                                <div className="border-t border-[#307c4c]/10 bg-slate-50/60">
                                  <PoSubTable 
                                    lines={group.lines} 
                                    searchTerm={search} 
                                    onRowClick={setSelectedLineItem}
                                    selectedLineItem={selectedLineItem}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </>
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
          <p className="text-center text-xs text-gray-400 mt-8 pb-4">
            NESR Expediting Tool · Data sourced live from SAP Open PO Master
          </p>
        </div>
      </main>
    </div>
  );
}
