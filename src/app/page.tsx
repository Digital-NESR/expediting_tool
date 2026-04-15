'use client';

import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import LineItemDrawer from '@/components/LineItemDrawer';
import Sidebar from '@/components/Sidebar';
import { useExpediteStore } from '@/store/useExpediteStore';
import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import { SquareCheckbox } from '@/components/SquareCheckbox';

/* ─── Constants ───────────────────────────────────────────── */
const PAGE_SIZE = 50;

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
import type { PurchaseOrder } from '@/types/po';

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

type PoSortKey = 'totalValue' | 'earliestDate';
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

const formatMatId = (id: string | null | undefined) =>
  id?.trim() ? id : <span className="text-gray-400 italic">Service</span>;

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

/* ─── Row-level filter helpers (used in cascading useMemos) ── */
function rowMatchesStatus(r: PurchaseOrder, statuses: string[]): boolean {
  if (statuses.length === 0) return true;
  const diff = daysDiff(r['Delivery Date']);
  const s = diff < 0 ? 'Past Due' : diff <= 7 ? 'Due Soon' : 'On Track';
  return statuses.includes(s);
}

function rowMatchesSearch(r: PurchaseOrder, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    String(r['PO Number'] ?? '').toLowerCase().includes(t) ||
    String(r['Supplier Name'] ?? '').toLowerCase().includes(t) ||
    String(r['Supplier ID'] ?? '').toLowerCase().includes(t) ||
    String(r['SAP MAT ID'] ?? '').toLowerCase().includes(t)
  );
}

/* ─── Delivery Status Badge ───────────────────────────────── */
function DeliveryBadge({ raw }: { raw: string | null | undefined }) {
  const diff = daysDiff(raw);
  if (!raw) return <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-500">—</span>;
  if (diff < 0) return <span className="bg-red-100/80 border border-red-200 text-red-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">Past Due</span>;
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

/* ─── Status Tile Slicer ──────────────────────────────────── */
const STATUS_TILES = [
  {
    id: 'Past Due',
    activeClass: 'bg-red-100/80 border-red-300 text-red-700 shadow-sm ring-1 ring-red-200',
  },
  {
    id: 'Due Soon',
    activeClass: 'bg-amber-100/80 border-amber-300 text-amber-700 shadow-sm ring-1 ring-amber-200',
  },
  {
    id: 'On Track',
    activeClass: 'bg-[#307c4c]/10 border-[#307c4c]/30 text-[#307c4c] shadow-sm ring-1 ring-[#307c4c]/20',
  },
] as const;

function StatusTiles({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
      {STATUS_TILES.map((tile) => {
        const isActive = selected.includes(tile.id);
        return (
          <button
            key={tile.id}
            onClick={() => toggle(tile.id)}
            className={[
              'px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-150',
              isActive
                ? tile.activeClass
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            ].join(' ')}
          >
            {tile.id}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="ml-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/* ─── Filter Bar ──────────────────────────────────────────── */
function FilterBar({
  search, onSearch,
  deliveryCode, onDeliveryCode, deliveryCodes,
  country, onCountry, countries,
  suppliers, onSuppliers, supplierList, supplierDisplayMap,
  buyers, onBuyers, buyerList,
}: {
  search: string; onSearch: (v: string) => void;
  deliveryCode: string[]; onDeliveryCode: (v: string[]) => void; deliveryCodes: string[];
  country: string[]; onCountry: (v: string[]) => void; countries: string[];
  suppliers: string[]; onSuppliers: (v: string[]) => void; supplierList: string[]; supplierDisplayMap: Record<string, string>;
  buyers: string[]; onBuyers: (v: string[]) => void; buyerList: string[];
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
            placeholder="Search by PO Number, Supplier, Supplier ID, or SAP MAT ID…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search by PO Number, Supplier Name, Supplier ID or SAP MAT ID"
            className={`${inputBase} pl-9 pr-4 py-2.5 w-full`}
          />
        </div>

        {/* ── Multi-Selects ── */}
        <MultiSelectDropdown options={supplierList} selectedOptions={suppliers} onChange={onSuppliers} label="Supplier" displayMap={supplierDisplayMap} />
        <MultiSelectDropdown options={buyerList} selectedOptions={buyers} onChange={onBuyers} label="Buyer Name" />
        <MultiSelectDropdown options={deliveryCodes} selectedOptions={deliveryCode} onChange={onDeliveryCode} label="Delivery Status" displayMap={deliveryStatusMap} />
        <MultiSelectDropdown options={countries} selectedOptions={country} onChange={onCountry} label="Country" />

      </div>
    </div>
  );
}

/* ─── PO Sort column map ──────────────────────────────────── */
const PO_SORT_MAP: Record<PoSortKey, string> = {
  totalValue: 'Open PO Value (USD)',
  earliestDate: 'Delivery Date',
};

/* ─── Memoized Line Item Component ────────────────────────── */
const PoLineItemRow = memo(function PoLineItemRow({
  line,
  term,
  isChecked,
  isDrawerOpen,
  onRowClick,
  toggleSelection,
}: {
  line: PurchaseOrder;
  term: string;
  isChecked: boolean;
  isDrawerOpen: boolean;
  onRowClick: (line: PurchaseOrder) => void;
  toggleSelection: (line: PurchaseOrder) => void;
}) {
  const diff = daysDiff(line['Delivery Date']);
  const isMatch = term !== '' && (
    String(line['SAP MAT ID'] ?? '').toLowerCase().includes(term) ||
    String(line['PO Number'] ?? '').toLowerCase().includes(term) ||
    String(line['Supplier Name'] ?? '').toLowerCase().includes(term) ||
    String(line['Supplier ID'] ?? '').toLowerCase().includes(term)
  );

  return (
    <tr
      onClick={() => onRowClick(line)}
      className={[
        'transition-colors duration-150 cursor-pointer',
        isChecked
          ? 'bg-[#307c4c]/10'
          : isDrawerOpen
            ? 'bg-[#307c4c]/10 border-l-2 border-l-[#307c4c]'
            : isMatch
              ? 'bg-[#307c4c]/5 border-l-2 border-l-[#307c4c]/50'
              : 'hover:bg-[#307c4c]/5',
      ].join(' ')}
    >
      <td className="py-3 pl-6 pr-2 w-10" onClick={(e) => e.stopPropagation()}>
        <SquareCheckbox
          checked={isChecked}
          onChange={() => toggleSelection(line)}
          aria-label={`Select ${line['SAP MAT ID'] ?? 'line item'}`}
        />
      </td>
      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-500 whitespace-nowrap">
        {formatMatId(line['SAP MAT ID'])}
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 max-w-[280px] truncate" title={line['Item Description']}>
        {line['Item Description'] ?? '—'}
      </td>
      <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
        {Number(line['Open QTY'] ?? 0).toLocaleString()}
      </td>
      <td className="py-3 px-4 text-sm text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
        {formatCurrency(line['Open PO Value USD'])}
      </td>
      <td className={`py-3 px-4 text-sm whitespace-nowrap font-medium ${diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
        {formatDate(line['Delivery Date'])}
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        <DeliveryBadge raw={line['Delivery Date']} />
      </td>
    </tr>
  );
}, (prev, next) => {
  return prev.line === next.line &&
    prev.term === next.term &&
    prev.isChecked === next.isChecked &&
    prev.isDrawerOpen === next.isDrawerOpen;
});

/* ─── Memoized Parent PO Row Component ────────────────────── */
const PoParentRow = memo(function PoParentRow({
  group,
  isOpen,
  isChecked,
  isIndeterminate,
  togglePO,
  selectMultipleLines,
  deselectMultipleLines,
}: {
  group: PoGroup;
  isOpen: boolean;
  isChecked: boolean;
  isIndeterminate: boolean;
  togglePO: (poNumber: string) => void;
  selectMultipleLines: (lines: PurchaseOrder[]) => void;
  deselectMultipleLines: (lines: PurchaseOrder[]) => void;
}) {
  const diff = daysDiff(group.earliestDate);
  return (
    <tr
      onClick={() => togglePO(group.poNumber)}
      className="border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors duration-150 group"
    >
      <td className="p-4 pl-6 w-14" onClick={(e) => e.stopPropagation()}>
        <SquareCheckbox
          checked={isChecked}
          indeterminate={isIndeterminate}
          onChange={(e) => {
            if (e.target.checked) selectMultipleLines(group.lines);
            else deselectMultipleLines(group.lines);
          }}
          aria-label={`Select PO ${group.poNumber}`}
        />
      </td>
      <td className="p-4 pl-2 w-8">
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
  );
}, (prev, next) => {
  return prev.group === next.group &&
    prev.isOpen === next.isOpen &&
    prev.isChecked === next.isChecked &&
    prev.isIndeterminate === next.isIndeterminate;
});

/* ─── Sub-table for expanded PO lines ────────────────────── */
function PoSubTable({
  lines,
  searchTerm,
  onRowClick,
  selectedLineItem,
  toggleSelection,
  isSelected,
}: {
  lines: PurchaseOrder[];
  searchTerm: string;
  onRowClick: (line: PurchaseOrder) => void;
  selectedLineItem: PurchaseOrder | null;
  toggleSelection: (item: PurchaseOrder) => void;
  isSelected: (item: PurchaseOrder) => boolean;
}) {
  const term = searchTerm.toLowerCase().trim();

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-100/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {/* Checkbox col */}
          <th className="py-2.5 pl-6 pr-2 w-10" />
          <th className="py-2.5 px-4 font-semibold">SAP MAT ID</th>
          <th className="py-2.5 px-4 font-semibold">Item Description</th>
          <th className="py-2.5 px-4 font-semibold text-right">Open QTY</th>
          <th className="py-2.5 px-4 font-semibold text-right">Open PO Value (USD)</th>
          <th className="py-2.5 px-4 font-semibold">Delivery Date</th>
          <th className="py-2.5 px-4 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {lines.map((line, i) => {
          const isChecked = isSelected(line);
          const isDrawerOpen = selectedLineItem === line;
          return (
            <PoLineItemRow
              key={i}
              line={line}
              term={term}
              isChecked={isChecked}
              isDrawerOpen={isDrawerOpen}
              onRowClick={onRowClick}
              toggleSelection={toggleSelection}
            />
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

  // Drawer selection
  const [selectedLineItem, setSelectedLineItem] = useState<PurchaseOrder | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Expedite cart — Zustand store
  const { selectedItems, toggleSelection, isSelected, clearSelection, selectMultipleLines, deselectMultipleLines } = useExpediteStore();

  // Filters
  const [search, setSearch] = useState('');
  const [filterDelivCode, setFilterDelivCode] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState<string[]>([]);
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([]);
  const [filterBuyers, setFilterBuyers] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);

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
  useEffect(() => { setPoPage(1); }, [search, filterDelivCode, filterCountry, filterSuppliers, filterBuyers, filterStatus, poSortKey, poSortDir]);

  /* Clear all filters -------------------------------------- */
  function clearFilters() {
    setSearch('');
    setFilterDelivCode([]);
    setFilterCountry([]);
    setFilterSuppliers([]);
    setFilterBuyers([]);
    setFilterStatus([]);
  }

  const activeFilterCount = (search ? 1 : 0) + filterDelivCode.length + filterCountry.length + filterSuppliers.length + filterBuyers.length + filterStatus.length;

  /* Remove Specific Filter ---------------------------------- */
  function removeFilter(type: 'search' | 'deliv' | 'country' | 'supplier' | 'buyer', val?: string) {
    if (type === 'search') setSearch('');
    if (type === 'deliv' && val) setFilterDelivCode(p => p.filter(c => c !== val));
    if (type === 'country' && val) setFilterCountry(p => p.filter(c => c !== val));
    if (type === 'supplier' && val) setFilterSuppliers(p => p.filter(s => s !== val));
    if (type === 'buyer' && val) setFilterBuyers(p => p.filter(b => b !== val));
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
    if (poSortKey === key) setPoSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setPoSortKey(key); setPoSortDir('asc'); }
  }

  /* ── Cascading dropdown options ────────────────────────────
     Each set of options is calculated from rows filtered by all
     OTHER active filters (but NOT the filter for that dropdown),
     preventing users from locking themselves out of deselecting. */

  const deliveryCodes = useMemo(() => {
    const dc = new Set<string>();
    rows.forEach((r) => {
      if (!rowMatchesStatus(r, filterStatus)) return;
      if (!rowMatchesSearch(r, search)) return;
      if (filterCountry.length > 0 && !filterCountry.includes(r['Country'] ?? '')) return;
      if (filterSuppliers.length > 0 && !filterSuppliers.map(s => s.trim()).includes((r['Supplier Name'] ?? '').trim())) return;
      if (filterBuyers.length > 0 && !filterBuyers.map(b => b.trim()).includes((r['Buyer Name'] ?? '').trim())) return;
      dc.add(r['Delivery Code'] || '(Blank)');
    });
    return [...dc].sort();
  }, [rows, filterStatus, search, filterCountry, filterSuppliers, filterBuyers]);

  const countries = useMemo(() => {
    const co = new Set<string>();
    rows.forEach((r) => {
      if (!rowMatchesStatus(r, filterStatus)) return;
      if (!rowMatchesSearch(r, search)) return;
      if (filterDelivCode.length > 0 && !filterDelivCode.includes(r['Delivery Code'] || '(Blank)')) return;
      if (filterSuppliers.length > 0 && !filterSuppliers.map(s => s.trim()).includes((r['Supplier Name'] ?? '').trim())) return;
      if (filterBuyers.length > 0 && !filterBuyers.map(b => b.trim()).includes((r['Buyer Name'] ?? '').trim())) return;
      if (r['Country']) co.add(r['Country']);
    });
    return [...co].sort();
  }, [rows, filterStatus, search, filterDelivCode, filterSuppliers, filterBuyers]);

  const { supplierList, supplierDisplayMap } = useMemo(() => {
    const sp = new Map<string, string>(); // supplierName -> "ID - Name"
    rows.forEach((r) => {
      if (!rowMatchesStatus(r, filterStatus)) return;
      if (!rowMatchesSearch(r, search)) return;
      if (filterDelivCode.length > 0 && !filterDelivCode.includes(r['Delivery Code'] || '(Blank)')) return;
      if (filterCountry.length > 0 && !filterCountry.includes(r['Country'] ?? '')) return;
      if (filterBuyers.length > 0 && !filterBuyers.map(b => b.trim()).includes((r['Buyer Name'] ?? '').trim())) return;
      const name = (r['Supplier Name'] ?? '').trim();
      if (name && !sp.has(name)) {
        const id = r['Supplier ID'];
        sp.set(name, id ? `${id} - ${name}` : name);
      }
    });
    const sortedNames = [...sp.keys()].sort();
    const displayMap: Record<string, string> = {};
    sortedNames.forEach((name) => { displayMap[name] = sp.get(name)!; });
    return { supplierList: sortedNames, supplierDisplayMap: displayMap };
  }, [rows, filterStatus, search, filterDelivCode, filterCountry, filterBuyers]);

  const buyerList = useMemo(() => {
    const by = new Set<string>();
    rows.forEach((r) => {
      if (!rowMatchesStatus(r, filterStatus)) return;
      if (!rowMatchesSearch(r, search)) return;
      if (filterDelivCode.length > 0 && !filterDelivCode.includes(r['Delivery Code'] || '(Blank)')) return;
      if (filterCountry.length > 0 && !filterCountry.includes(r['Country'] ?? '')) return;
      if (filterSuppliers.length > 0 && !filterSuppliers.map(s => s.trim()).includes((r['Supplier Name'] ?? '').trim())) return;
      if (r['Buyer Name']) by.add(r['Buyer Name']);
    });
    return [...by].sort();
  }, [rows, filterStatus, search, filterDelivCode, filterCountry, filterSuppliers]);

  /* Smart filtering ---------------------------------------- */
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (filterDelivCode.length > 0 && !filterDelivCode.includes(r['Delivery Code'] || '(Blank)')) return false;
      if (filterCountry.length > 0 && !filterCountry.includes(r['Country'] ?? '')) return false;
      if (filterSuppliers.length > 0 && !filterSuppliers.map(s => s.trim()).includes((r['Supplier Name'] ?? '').trim())) return false;
      if (filterBuyers.length > 0 && !filterBuyers.map(b => b.trim()).includes((r['Buyer Name'] ?? '').trim())) return false;

      // Status tile filter
      if (!rowMatchesStatus(r, filterStatus)) return false;

      // Search: match PO Number, Supplier Name, Supplier ID, or SAP MAT ID
      if (term) {
        const matchesPO = String(r['PO Number'] ?? '').toLowerCase().includes(term);
        const matchesSupplier = String(r['Supplier Name'] ?? '').toLowerCase().includes(term);
        const matchesSupplierID = String(r['Supplier ID'] ?? '').toLowerCase().includes(term);
        const matchesMatID = String(r['SAP MAT ID'] ?? '').toLowerCase().includes(term);
        if (!matchesPO && !matchesSupplier && !matchesSupplierID && !matchesMatID) return false;
      }

      return true;
    });
  }, [rows, search, filterDelivCode, filterCountry, filterSuppliers, filterBuyers, filterStatus]);

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
    const pastDue     = new Set(rows.filter((r) => daysDiff(r['Delivery Date']) < 0).map(r => r['PO Number'])).size;
    const dueSoon     = new Set(rows.filter((r) => { const d = daysDiff(r['Delivery Date']); return d >= 0 && d <= 7; }).map(r => r['PO Number'])).size;
    const totalValue  = rows.reduce((s, r) => s + Number(r['Open PO Value USD'] ?? 0), 0);
    return { distinctPOs, pastDue, dueSoon, totalValue };
  }, [rows]);

  /* Today label -------------------------------------------- */
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
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
        deliveryStatusMap={deliveryStatusMap}
      />
      <main className="flex-1 flex flex-col h-full relative bg-white">

        {/* ── Sticky top nav ── */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
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
              Live view of all open POs sourced from SAP — grouped by PO, sortable by delivery date or value.
            </p>
          </div>

          {/* ── KPI Cards ── */}
          {!loading && !error && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-in fade-in duration-500">
              <KpiCard label="Distinct Open POs" value={stats.distinctPOs.toLocaleString()} accent />
              <KpiCard label="Past Due" value={stats.pastDue.toLocaleString()} danger={stats.pastDue > 0} />
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
              <>
                {/* ── Status Tile Slicer ── */}
                <StatusTiles selected={filterStatus} onChange={setFilterStatus} />

                <FilterBar
                  search={search} onSearch={setSearch}
                  deliveryCode={filterDelivCode} onDeliveryCode={setFilterDelivCode} deliveryCodes={deliveryCodes}
                  country={filterCountry} onCountry={setFilterCountry} countries={countries}
                  suppliers={filterSuppliers} onSuppliers={setFilterSuppliers} supplierList={supplierList} supplierDisplayMap={supplierDisplayMap}
                  buyers={filterBuyers} onBuyers={setFilterBuyers} buyerList={buyerList}
                />

                {/* ── Active Filters Row ── */}
                {activeFilterCount > 0 && (
                  <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Active Filters:</span>
                      {search && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm">
                          Search: {search}
                          <button onClick={() => removeFilter('search')} className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </span>
                      )}
                      {filterDelivCode.map(c => (
                        <span key={`deliv-${c}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm">
                          Delivery Status: {deliveryStatusMap[c] || c}
                          <button onClick={() => removeFilter('deliv', c)} className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </span>
                      ))}
                      {filterCountry.map(c => (
                        <span key={`country-${c}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-full shadow-sm">
                          Country: {c}
                          <button onClick={() => removeFilter('country', c)} className="hover:bg-slate-100 p-0.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </span>
                      ))}
                      {filterSuppliers.map(s => (
                        <span key={`sup-${s}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#307c4c]/20 text-[#307c4c] text-xs font-medium rounded-full shadow-sm">
                          Supplier: {supplierDisplayMap[s] || s}
                          <button onClick={() => removeFilter('supplier', s)} className="hover:bg-[#307c4c]/10 p-0.5 rounded-full text-[#307c4c]/60 hover:text-[#307c4c] transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </span>
                      ))}
                      {filterBuyers.map(b => (
                        <span key={`buy-${b}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#307c4c]/20 text-[#307c4c] text-xs font-medium rounded-full shadow-sm">
                          Buyer: {b}
                          <button onClick={() => removeFilter('buyer', b)} className="hover:bg-[#307c4c]/10 p-0.5 rounded-full text-[#307c4c]/60 hover:text-[#307c4c] transition-colors">
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
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
                        checked={pagePOs.length > 0 && pagePOs.every(group => group.lines.every(l => isSelected(l)))}
                        indeterminate={
                          pagePOs.length > 0 &&
                          pagePOs.some(group => group.lines.some(l => isSelected(l))) &&
                          !pagePOs.every(group => group.lines.every(l => isSelected(l)))
                        }
                        onChange={(e) => {
                          const visibleLines = pagePOs.flatMap(g => g.lines);
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
                    <th className="p-4 pl-6 font-medium whitespace-nowrap">Delivery Status</th>
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
                    const isChecked = group.lines.every(l => isSelected(l));
                    const isIndeterminate = group.lines.some(l => isSelected(l)) && !isChecked;

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
                        <tr key={`${group.poNumber}-expand`} className="border-b border-slate-100 p-0 hover:bg-transparent">
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

      {/* ── Floating Expedite Action Bar ──────────────────────────── */}
      {selectedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-8 py-4
          bg-slate-900/95 backdrop-blur-md border-t border-slate-700/60
          shadow-[0_-4px_32px_rgba(0,0,0,0.25)]
          animate-in slide-in-from-bottom-2 duration-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

            {/* Left: selection summary */}
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#307c4c] shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">
                  {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} in Expedite Queue
                </p>
                <p className="text-xs text-slate-400 leading-tight">
                  {new Set(selectedItems.map((i) => i['Supplier Name'])).size} supplier{new Set(selectedItems.map((i) => i['Supplier Name'])).size !== 1 ? 's' : ''}
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
                href="/expedite"
                className="flex items-center gap-2 bg-[#307c4c] hover:bg-[#26663e]
                  text-white text-sm font-semibold px-5 py-2.5 rounded-xl
                  transition-all duration-150 hover:scale-[1.02] active:scale-95
                  shadow-lg shadow-[#307c4c]/30"
              >
                Expedite {selectedItems.length} Selected
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
