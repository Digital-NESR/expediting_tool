'use client';

import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { usdFmt, fmtDate, BUCKET_HEX, ALERT_LABEL } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

/* ─── Constants ─────────────────────────────────────────────────── */
const ACCENT = '#006B0C';
const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ALERT_LEVELS_ORD = ['overdue','urgent','action','plan','info','ok'] as const;

const STATUS_OPTIONS = [
  { value: '',                          label: 'All Statuses' },
  { value: 'Open',                      label: 'Open' },
  { value: 'Open - Extended',           label: 'Open – Extended' },
  { value: 'Closed',                    label: 'Closed' },
  { value: 'Closed - Refund Recovered', label: 'Closed – Refund Recovered' },
];

const MOVEMENT_OPTIONS = [
  { value: '',                  label: 'Both' },
  { value: 'Temporary Import',  label: 'Temporary Import' },
  { value: 'Temporary Export',  label: 'Temporary Export' },
];

const ALERT_FILTER_OPTIONS = [
  { key: 'overdue', label: 'Overdue',    color: '#ef4444' },
  { key: 'urgent',  label: '≤ 7 days',   color: '#f97316' },
  { key: 'action',  label: '8–14 days',  color: '#f59e0b' },
  { key: 'plan',    label: '15–30 days', color: '#3b82f6' },
  { key: 'info',    label: '31–60 days', color: '#06b6d4' },
  { key: 'ok',      label: '60+ days',   color: '#059669' },
];

/* Client-side alert level derived from effective expiry, not the stored column */
function calcClientAlertLevel(s: Shipment): string {
  if (s.status === 'Closed' || s.status === 'Closed - Refund Recovered') return 'closed';
  const effective = s.extended_date || s.expiry_date;
  if (!effective) return 'info';
  const today = new Date();
  const todayUtc  = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [ey, em, ed] = effective.split('-').map(Number);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  const days = (expiryUtc - todayUtc) / 86400000;
  if (days < 0)   return 'overdue';
  if (days <= 7)  return 'urgent';
  if (days <= 14) return 'action';
  if (days <= 30) return 'plan';
  if (days <= 60) return 'info';
  return 'ok';
}

/* ─── Report definitions ─────────────────────────────────────────── */
interface ColDef { key: string; label: string; }
interface ReportDef {
  id: number; title: string; desc: string; owner: string;
  cols: ColDef[];
  getRows: (data: Shipment[]) => Shipment[];
}

const REPORTS: ReportDef[] = [
  {
    id: 0, title: 'Monthly customs summary',
    desc: 'All open & closed temporary movements with Bayan, deposit, expiry, status',
    owner: 'Customs',
    cols: [
      { key: 'reference_number',          label: 'Reference' },
      { key: 'customs_reference_number',  label: 'Bayan / Customs Ref' },
      { key: 'country',                   label: 'Country' },
      { key: 'movement_type',             label: 'Movement' },
      { key: 'status',                    label: 'Status' },
      { key: 'deposit_usd',               label: 'Deposit (USD)' },
      { key: 'import_date',               label: 'Import Date' },
      { key: 'expiry_date',               label: 'Expiry Date' },
      { key: 'extended_date',             label: 'Extended Expiry' },
    ],
    getRows: d => d,
  },
  {
    id: 1, title: 'Finance — duty exposure roll-up',
    desc: 'Open shipments with deposit by segment, country, and alert level',
    owner: 'Finance',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'segment',          label: 'Segment' },
      { key: 'country',          label: 'Country' },
      { key: 'alert_level_label',label: 'Alert Level' },
      { key: 'deposit_usd',      label: 'Deposit (USD)' },
      { key: 'status',           label: 'Status' },
    ],
    getRows: d => d.filter(s => s.status === 'Open' || s.status === 'Open - Extended'),
  },
  {
    id: 2, title: 'Legal — penalty risk register',
    desc: 'Overdue & at-risk shipments with extension status and timeline',
    owner: 'Legal',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'alert_level_label',label: 'Alert Level' },
      { key: 'expiry_date',      label: 'Expiry Date' },
      { key: 'extended_date',    label: 'Extended Expiry' },
      { key: 'deposit_usd',      label: 'Deposit (USD)' },
      { key: 'status',           label: 'Status' },
    ],
    getRows: d => d.filter(s => ['overdue','urgent','action'].includes(s.alert_level)),
  },
  {
    id: 3, title: 'Re-export confirmations',
    desc: 'Closed shipments with re-export documentation and refund status',
    owner: 'Customs / Finance',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'movement_type',    label: 'Movement' },
      { key: 'status',           label: 'Status' },
      { key: 'deposit_usd',      label: 'Deposit (USD)' },
      { key: 'expiry_date',      label: 'Expiry Date' },
    ],
    getRows: d => d.filter(s => s.status === 'Closed' || s.status === 'Closed - Refund Recovered'),
  },
  {
    id: 4, title: 'Extensions log',
    desc: 'All extensions requested and granted, with original vs effective expiry',
    owner: 'Customs',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'expiry_date',      label: 'Original Expiry' },
      { key: 'extended_date',    label: 'Extended Expiry' },
      { key: 'status',           label: 'Status' },
      { key: 'deposit_usd',      label: 'Deposit (USD)' },
    ],
    getRows: d => d.filter(s => s.extended_date != null),
  },
  {
    id: 5, title: 'Audit trail — full history',
    desc: 'All shipments: reference, country, status, alert level, created by, created at',
    owner: 'All',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'status',           label: 'Status' },
      { key: 'alert_level_label',label: 'Alert Level' },
      { key: 'created_by',       label: 'Created By' },
      { key: 'created_at',       label: 'Created At' },
    ],
    getRows: d => d,
  },
  {
    id: 6, title: 'Deposit recovery tracker',
    desc: 'Shipments with deposit > 0, showing status, deposit amount, and outstanding balance',
    owner: 'Finance',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'status',           label: 'Status' },
      { key: 'deposit_usd',      label: 'Deposit (USD)' },
      { key: 'recovered',        label: 'Refund Received' },
      { key: 'outstanding',      label: 'Outstanding Balance' },
    ],
    getRows: d => d.filter(s => Number(s.deposit_usd) > 0),
  },
  {
    id: 7, title: 'Overdue shipments register',
    desc: 'All shipments where alert level = Overdue, with days overdue and deposit at risk',
    owner: 'Legal / Customs',
    cols: [
      { key: 'reference_number', label: 'Reference' },
      { key: 'country',          label: 'Country' },
      { key: 'segment',          label: 'Segment' },
      { key: 'days_overdue',     label: 'Days Overdue' },
      { key: 'deposit_usd',      label: 'Deposit at Risk (USD)' },
      { key: 'expiry_date',      label: 'Expiry Date' },
      { key: 'extended_date',    label: 'Extended Expiry' },
    ],
    getRows: d => d.filter(s => s.alert_level === 'overdue'),
  },
];

/* ─── Cell renderer ──────────────────────────────────────────────── */
function renderCell(col: string, row: Shipment): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  switch (col) {
    case 'deposit_usd':      return usdFmt(row.deposit_usd);
    case 'import_date':
    case 'expiry_date':
    case 'extended_date':    return fmtDate(row[col as keyof Shipment] as string | null);
    case 'created_at':       return fmtDate(row.created_at);
    case 'alert_level_label':return ALERT_LABEL[row.alert_level] ?? row.alert_level;
    case 'recovered':        return row.status === 'Closed - Refund Recovered' ? usdFmt(row.deposit_usd) : '$0.00';
    case 'outstanding': {
      const dep = Number(row.deposit_usd) || 0;
      const rec = row.status === 'Closed - Refund Recovered' ? dep : 0;
      return usdFmt(dep - rec);
    }
    case 'days_overdue': {
      const eff = row.extended_date || row.expiry_date;
      if (!eff) return '—';
      const days = Math.floor((today.getTime() - new Date(eff).getTime()) / 86400000);
      return days > 0 ? `${days}d` : '—';
    }
    default: return (row[col as keyof Shipment] as string | null) ?? '—';
  }
}

/* ─── Date / chart helpers ───────────────────────────────────────── */
function monthKey(s: string | null | undefined): string | null {
  return s && s.length >= 7 ? s.slice(0, 7) : null;
}
function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS_SHORT[parseInt(m) - 1]} '${y.slice(2)}`;
}
function last12(): string[] {
  const r: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    r.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return r;
}
function buildFilterSummary(fc: string, fs: string, fm: string, fst: string, fdf: string, fdt: string, fal: string): string {
  const parts: string[] = [];
  if (fc) parts.push(`Country: ${fc}`);
  if (fs) parts.push(`Segment: ${fs}`);
  if (fm) parts.push(`Movement: ${fm}`);
  if (fst) parts.push(`Status: ${fst}`);
  if (fal) parts.push(`Alert: ${fal}`);
  if (fdf || fdt) parts.push(`Import date: ${fdf || '…'} → ${fdt || '…'}`);
  return parts.length ? parts.join(' | ') : 'None';
}

/* ─── Chart card wrapper ─────────────────────────────────────────── */
function ChartCard({ title, subtitle, height = 220, children }: {
  title: string; subtitle: string; height?: number; children: ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <h3 className="font-semibold text-[13px] text-slate-900">{title}</h3>
      <p className="text-[11px] text-slate-400 mt-0.5 mb-3">{subtitle}</p>
      <div style={{ height }}>{children}</div>
    </div>
  );
}
const NoData = () => (
  <div className="flex items-center justify-center h-full text-[12px] text-slate-400">No data for current filters</div>
);

/* ─── Export helpers ─────────────────────────────────────────────── */
async function exportToPDF(
  report: ReportDef, rows: Shipment[],
  fc: string, fs: string, fm: string, fst: string, fdf: string, fdt: string, fal: string,
) {
  const { jsPDF }           = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const summary = buildFilterSummary(fc, fs, fm, fst, fdf, fdt, fal);

  try {
    const resp = await fetch('/nesr-logo-circle.png');
    const blob = await resp.blob();
    const b64  = await new Promise<string>(res => {
      const rd = new FileReader();
      rd.onload = () => res(rd.result as string);
      rd.readAsDataURL(blob);
    });
    doc.addImage(b64, 'PNG', 10, 7, 18, 18);
  } catch { /* logo unavailable */ }

  doc.setFont('helvetica', 'bold');  doc.setFontSize(13);
  doc.text(report.title, 33, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}   |   Filters: ${summary}`, 33, 19);
  doc.setTextColor(0);

  autoTable(doc, {
    head: [report.cols.map(c => c.label)],
    body: rows.map(row => report.cols.map(c => renderCell(c.key, row))),
    startY: 28,
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [0, 107, 12] as [number,number,number], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number,number,number] },
  });

  doc.save(`${report.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function exportToExcel(
  report: ReportDef, rows: Shipment[],
  fc: string, fs: string, fm: string, fst: string, fdf: string, fdt: string, fal: string,
) {
  const XLSX    = await import('xlsx');
  const summary = buildFilterSummary(fc, fs, fm, fst, fdf, fdt, fal);
  const wsData  = [
    [`Report: ${report.title}`],
    [`Generated: ${new Date().toLocaleDateString('en-GB')}`],
    [`Filters: ${summary}`],
    [],
    report.cols.map(c => c.label),
    ...rows.map(row => report.cols.map(c => renderCell(c.key, row))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${report.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function TiteAnalyticsClient({ shipments }: { shipments: Shipment[] | null }) {
  const [filterCountry,  setFilterCountry]  = useState('');
  const [filterSegment,  setFilterSegment]  = useState('');
  const [filterMovement, setFilterMovement] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterDateFrom,     setFilterDateFrom]     = useState('');
  const [filterDateTo,       setFilterDateTo]       = useState('');
  const [filterAlertLevels,  setFilterAlertLevels]  = useState<Set<string>>(new Set());
  const [expanded,           setExpanded]           = useState<Set<number>>(new Set());

  /* Dynamic dropdown options */
  const countries = useMemo(() =>
    [...new Set((shipments ?? []).map(s => s.country).filter((c): c is string => c != null))].sort(),
    [shipments],
  );
  const segments = useMemo(() => {
    const base = filterCountry ? (shipments ?? []).filter(s => s.country === filterCountry) : (shipments ?? []);
    return [...new Set(base.map(s => s.segment).filter((s): s is string => s != null))].sort();
  }, [shipments, filterCountry]);

  /* Reset segment when country changes and selected segment is no longer valid */
  useEffect(() => {
    if (filterSegment && !segments.includes(filterSegment)) setFilterSegment('');
  }, [segments, filterSegment]);

  /* Client-side filtered dataset — all KPIs, charts, and report tables use this.
     alert_level is recalculated from (extended_date ?? expiry_date) – today
     so it stays fresh even if the stored column is stale. */
  const filtered = useMemo(() => {
    if (!shipments) return [];
    return shipments
      .map(s => ({ ...s, alert_level: calcClientAlertLevel(s) }))
      .filter(s => {
        if (filterCountry  && s.country       !== filterCountry)  return false;
        if (filterSegment  && s.segment       !== filterSegment)  return false;
        if (filterMovement && s.movement_type !== filterMovement) return false;
        if (filterStatus   && s.status        !== filterStatus)   return false;
        if (filterAlertLevels.size > 0 && !filterAlertLevels.has(s.alert_level)) return false;
        if (filterDateFrom && s.import_date   && s.import_date   < filterDateFrom) return false;
        if (filterDateTo   && s.import_date   && s.import_date   > filterDateTo)   return false;
        return true;
      });
  }, [shipments, filterCountry, filterSegment, filterMovement, filterStatus, filterAlertLevels, filterDateFrom, filterDateTo]);

  const isFiltered = !!(filterCountry || filterSegment || filterMovement || filterStatus || filterAlertLevels.size || filterDateFrom || filterDateTo);

  function resetFilters() {
    setFilterCountry(''); setFilterSegment(''); setFilterMovement('');
    setFilterStatus('');  setFilterAlertLevels(new Set()); setFilterDateFrom(''); setFilterDateTo('');
  }
  function toggleAlertLevel(key: string) {
    setFilterAlertLevels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleReport(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /* ── KPI computations ── */
  const openRows   = useMemo(() => filtered.filter(s => s.status === 'Open' || s.status === 'Open - Extended'), [filtered]);
  const closedRows = useMemo(() => filtered.filter(s => s.status === 'Closed' || s.status === 'Closed - Refund Recovered'), [filtered]);
  const totalDeposit  = openRows.reduce((a, s) => a + (Number(s.deposit_usd) || 0), 0);
  const refunded      = closedRows.reduce((a, s) => a + (Number(s.deposit_usd) || 0), 0);
  const penaltyRisk   = filtered.filter(s => s.alert_level === 'overdue').reduce((a, s) => a + (Number(s.deposit_usd) || 0), 0);
  const completionPct = filtered.length > 0 ? Math.round((closedRows.length / filtered.length) * 100) : 0;
  const kpis = [
    { label: 'Total active deposit',  value: usdFmt(totalDeposit), sub: `${openRows.length} open shipments`,  accent: ACCENT },
    { label: 'Refunds initiated YTD', value: usdFmt(refunded),     sub: `${closedRows.length} closed`,        accent: '#059669' },
    { label: 'Penalty risk exposure', value: usdFmt(penaltyRisk),  sub: 'From overdue shipments',             accent: '#f59e0b' },
    { label: 'Re-export completion',  value: `${completionPct}%`,  sub: 'Closed / total (filtered)',           accent: '#3b82f6' },
  ];

  /* ── Chart data ── */
  const shipsByCountry = useMemo(() => {
    const map: Record<string, { count: number; worst: string }> = {};
    openRows.forEach(s => {
      const c = s.country || 'Unknown';
      if (!map[c]) map[c] = { count: 0, worst: 'ok' };
      map[c].count++;
      if (ALERT_LEVELS_ORD.indexOf(s.alert_level as typeof ALERT_LEVELS_ORD[number]) <
          ALERT_LEVELS_ORD.indexOf(map[c].worst as typeof ALERT_LEVELS_ORD[number]))
        map[c].worst = s.alert_level;
    });
    return Object.entries(map).map(([country, v]) => ({ country, count: v.count, worst: v.worst }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [openRows]);

  const depositByCountry = useMemo(() => {
    const map: Record<string, number> = {};
    openRows.forEach(s => { const c = s.country || 'Unknown'; map[c] = (map[c] || 0) + (Number(s.deposit_usd) || 0); });
    return Object.entries(map).map(([country, deposit]) => ({ country, deposit: Math.round(deposit) }))
      .sort((a, b) => b.deposit - a.deposit).slice(0, 10);
  }, [openRows]);

  const alertDist = useMemo(() =>
    ALERT_LEVELS_ORD
      .map(l => ({ name: ALERT_LABEL[l] ?? l, value: filtered.filter(s => s.alert_level === l).length, color: BUCKET_HEX[l] ?? '#94a3b8' }))
      .filter(x => x.value > 0),
    [filtered],
  );

  const monthlyTrend = useMemo(() => {
    const months = last12();
    const om: Record<string, number> = {}; const cm: Record<string, number> = {};
    months.forEach(m => { om[m] = 0; cm[m] = 0; });
    filtered.forEach(s => {
      const ok = monthKey(s.import_date);
      if (ok && om[ok] !== undefined) om[ok]++;
      const ck = monthKey(s.extended_date || s.expiry_date);
      if ((s.status === 'Closed' || s.status === 'Closed - Refund Recovered') && ck && cm[ck] !== undefined) cm[ck]++;
    });
    return months.map(m => ({ month: fmtMonthLabel(m), opened: om[m], closed: cm[m] }));
  }, [filtered]);

  const avgDaysByCountry = useMemo(() => {
    const map: Record<string, number[]> = {};
    closedRows.forEach(s => {
      if (!s.import_date) return;
      const end = s.extended_date || s.expiry_date;
      if (!end) return;
      const days = Math.round((new Date(end).getTime() - new Date(s.import_date).getTime()) / 86400000);
      if (days < 0) return;
      const c = s.country || 'Unknown';
      if (!map[c]) map[c] = [];
      map[c].push(days);
    });
    return Object.entries(map)
      .map(([country, arr]) => ({ country, avgDays: Math.round(arr.reduce((a, d) => a + d, 0) / arr.length) }))
      .sort((a, b) => b.avgDays - a.avgDays).slice(0, 10);
  }, [closedRows]);

  const movementSplit = useMemo(() => {
    const imp = filtered.filter(s => s.movement_type === 'Temporary Import').length;
    const exp = filtered.filter(s => s.movement_type === 'Temporary Export').length;
    return [
      ...(imp > 0 ? [{ name: 'Temporary Import', value: imp, color: '#3b82f6' }] : []),
      ...(exp > 0 ? [{ name: 'Temporary Export', value: exp, color: '#22c55e' }] : []),
    ];
  }, [filtered]);

  /* ── DB unavailable ── */
  if (shipments === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">TI-TE database unavailable</p>
        <p className="text-sm text-slate-500">Unable to load shipment data.</p>
      </div>
    );
  }

  const selectCls = 'text-[12px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pr-7 appearance-none cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#006B0C]/20 focus:border-[#006B0C]/50 transition-colors';
  const inputCls  = 'text-[12px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#006B0C]/20 focus:border-[#006B0C]/50 transition-colors';
  const selStyle  = { backgroundImage: SELECT_ARROW, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 8px center' };
  const fc = filterCountry, fs = filterSegment, fm = filterMovement, fst = filterStatus, fdf = filterDateFrom, fdt = filterDateTo;
  const fal = filterAlertLevels.size > 0
    ? [...filterAlertLevels].map(k => ALERT_FILTER_OPTIONS.find(o => o.key === k)?.label ?? k).join(', ')
    : '';
  const barH = (n: number) => Math.max(160, n * 34 + 20);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">TI-TE Analytics &amp; Reports</h2>
        <p className="text-[12px] text-gray-400 mt-0.5">
          Audit-ready reports for customs, finance and legal.{' '}
          {isFiltered && (
            <span className="text-amber-600 font-medium">
              Filters active — {filtered.length} of {shipments.length} shipments shown.
            </span>
          )}
        </p>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Country</span>
            <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} className={selectCls} style={selStyle}>
              <option value="">All Countries</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Segment</span>
            <select value={filterSegment} onChange={e => setFilterSegment(e.target.value)} className={selectCls} style={selStyle}>
              <option value="">All Segments</option>
              {segments.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Movement</span>
            <select value={filterMovement} onChange={e => setFilterMovement(e.target.value)} className={selectCls} style={selStyle}>
              {MOVEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Status</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls} style={selStyle}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Alert</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterAlertLevels(new Set())}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                  filterAlertLevels.size === 0
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >All</button>
              {ALERT_FILTER_OPTIONS.map(opt => {
                const active = filterAlertLevels.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleAlertLevel(opt.key)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors border flex items-center gap-1"
                    style={active
                      ? { backgroundColor: opt.color + '18', color: opt.color, borderColor: opt.color + '40' }
                      : { backgroundColor: 'white', color: '#64748b', borderColor: '#e2e8f0' }
                    }
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: opt.color }} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Import date</span>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className={inputCls} />
            <span className="text-slate-400 text-[11px]">→</span>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className={inputCls} />
          </div>

          <button
            onClick={resetFilters} disabled={!isFiltered}
            className={`ml-auto text-[12px] underline underline-offset-2 whitespace-nowrap transition-colors ${isFiltered ? 'text-slate-500 hover:text-slate-800 cursor-pointer' : 'text-slate-300 cursor-default'}`}
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center py-12 text-center">
          <p className="font-semibold text-slate-900 mb-1">No shipments match</p>
          <p className="text-sm text-slate-500 mb-4">Try adjusting or resetting the filters above.</p>
          <button onClick={resetFilters} className="px-4 py-2 rounded-lg text-[12.5px] font-medium text-white" style={{ background: ACCENT }}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 relative overflow-hidden">
              <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: k.accent }} />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 pl-2">{k.label}</div>
              <div className="text-[22px] font-bold tabular-nums pl-2" style={{ color: k.accent }}>{k.value}</div>
              <div className="text-[11.5px] text-slate-400 mt-0.5 pl-2">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts grid ───────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* 1 — Active shipments by country */}
          <ChartCard title="Active shipments by country" subtitle="Open shipments per country — colored by worst alert level" height={barH(shipsByCountry.length)}>
            {shipsByCountry.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={shipsByCountry} margin={{ left: 0, right: 28, top: 2, bottom: 2 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="country" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [v, 'Shipments']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {shipsByCountry.map((e, i) => <Cell key={i} fill={BUCKET_HEX[e.worst] ?? '#94a3b8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 2 — Deposit at risk by country */}
          <ChartCard title="Deposit at risk by country" subtitle="Total open deposit (USD) per country" height={barH(depositByCountry.length)}>
            {depositByCountry.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={depositByCountry} margin={{ left: 0, right: 28, top: 2, bottom: 2 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="country" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [usdFmt(v as number), 'Deposit']} />
                  <Bar dataKey="deposit" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 3 — Alert level distribution */}
          <ChartCard title="Alert level distribution" subtitle="Shipment count by current alert status" height={230}>
            {alertDist.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={alertDist} cx="50%" cy="46%" innerRadius={56} outerRadius={82} dataKey="value" paddingAngle={2}>
                    {alertDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: '#475569' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* 4 — Monthly trend */}
          <ChartCard title="Monthly trend" subtitle="Shipments opened vs closed per month — last 12 months" height={230}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <Tooltip />
                <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: '#475569' }}>{v}</span>} />
                <Line type="monotone" dataKey="opened" stroke={ACCENT}    name="Opened" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="closed" stroke="#94a3b8" name="Closed" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 5 — Avg days to closure */}
          <ChartCard title="Avg days to closure by country" subtitle="Closed shipments only — days from import date to effective expiry" height={barH(avgDaysByCountry.length)}>
            {avgDaysByCountry.length === 0
              ? <div className="flex items-center justify-center h-full text-[12px] text-slate-400">No closed shipments in filtered view</div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={avgDaysByCountry} margin={{ left: 0, right: 28, top: 2, bottom: 2 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="country" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [`${v} days`, 'Avg. duration']} />
                    <Bar dataKey="avgDays" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </ChartCard>

          {/* 6 — Import vs Export split */}
          <ChartCard title="Import vs Export split" subtitle="Temporary Import vs Temporary Export shipment count" height={230}>
            {movementSplit.length === 0 ? <NoData /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={movementSplit} cx="50%" cy="46%" innerRadius={56} outerRadius={82} dataKey="value" paddingAngle={3}>
                    {movementSplit.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: '#475569' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>
      )}

      {/* ── Available reports — expandable ────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-sm text-slate-900">Available reports</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Click a row to expand its data table. Exports respect active filters.</p>
        </div>
        <div className="divide-y divide-slate-50">
          {REPORTS.map(r => {
            const isExp     = expanded.has(r.id);
            const reportRows = r.getRows(filtered);
            return (
              <div key={r.id}>
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer select-none"
                  onClick={() => toggleReport(r.id)}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${ACCENT}18` }}>
                    <svg className="w-4 h-4" style={{ color: ACCENT }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-slate-900">{r.title}</span>
                      <span className="text-[11px] text-slate-400 tabular-nums">{reportRows.length} rows</span>
                    </div>
                    <div className="text-[11.5px] text-slate-400">{r.desc}</div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />{r.owner}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); exportToPDF(r, reportRows, fc, fs, fm, fst, fdf, fdt, fal); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    PDF
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); exportToExcel(r, reportRows, fc, fs, fm, fst, fdf, fdt, fal); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Excel
                  </button>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isExp ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded data table */}
                {isExp && (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    {reportRows.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12px] text-slate-400">No data matches the current filters.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="max-h-[360px] overflow-y-auto">
                          <table className="w-full text-[12px]">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-slate-100 border-b border-slate-200">
                                {r.cols.map(c => (
                                  <th key={c.key} className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2 whitespace-nowrap">{c.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {reportRows.map((row, ri) => (
                                <tr key={ri} className="border-b border-slate-100 last:border-0 hover:bg-white transition-colors">
                                  {r.cols.map(c => (
                                    <td key={c.key} className="px-3 py-2 text-slate-700 whitespace-nowrap">{renderCell(c.key, row)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
