'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import DetailModal from '@/components/DetailModal';
import { DS_DESCRIPTIONS } from '@/lib/constants';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts';
import { getTeamAnalyticsData, getFilterOptions } from '@/app/actions/teamAnalytics';
import { getBuyerDetail, getAdminSupplierDetail, getAdminSessionDetail } from '@/app/actions/adminAnalytics';
import type { TeamAnalyticsData, TeamAnalyticsFilters, FilterOptions } from '@/app/actions/teamAnalytics';
import type {
  BuyerRow, SupplierRow, RecentSession, WeeklyRateRow, SupplierResponseTimeRow,
  BuyerSessionRow, AdminSupplierDetailLine, AdminSessionDetailLine,
} from '@/app/actions/adminAnalytics';

/* ─── Helpers ───────────────────────────────────────────────── */

function formatSessionDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()} ${time}`;
}

function formatWeek(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]}`;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

/* ─── Shared UI components ──────────────────────────────────── */

function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">—</span>;
  }
  const cls = rate >= 70
    ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
    : rate >= 30
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${cls}`}>{rate}%</span>;
}

function ResponseBadge({ state }: { state: string }) {
  return state === 'Submitted'
    ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">Responded</span>
    : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">Pending</span>;
}

function DSTooltipBadge({ code }: { code: string | null }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!code) return <span className="text-slate-400">—</span>;
  const description = DS_DESCRIPTIONS[code];
  const show = () => { timer.current = setTimeout(() => setVisible(true), 150); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); setVisible(false); };
  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap cursor-default">{code}</span>
      {visible && description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-[#1f2937] text-white text-[11px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">{description}</div>
          <div className="w-2 h-2 bg-[#1f2937] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-[12px] font-medium text-slate-600 border border-slate-200">
      <span className="font-bold text-slate-800">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function ModalLoading() {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
      <svg className="w-5 h-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

function ModalEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 inline-flex flex-col leading-none text-[9px] ${active ? 'text-[#307c4c]' : 'text-slate-300'}`}>
      <span className={active && dir === 'asc' ? 'text-[#307c4c]' : ''}>▲</span>
      <span className={active && dir === 'desc' ? 'text-[#307c4c]' : ''}>▼</span>
    </span>
  );
}

function useSortable<T extends Record<string, unknown>>(data: T[], defaultKey: keyof T, defaultDir: 'asc' | 'desc' = 'desc') {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);
  function handleSort(key: keyof T) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }
  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);
  return { sorted, sortKey, sortDir, handleSort };
}

/* ─── KPI Card ──────────────────────────────────────────────── */

function KpiCard({ label, value, accent = false, warning = false, danger = false }: { label: string; value: string; accent?: boolean; warning?: boolean; danger?: boolean }) {
  const valueColor = danger ? 'text-red-600' : warning ? 'text-amber-600' : accent ? 'text-[#307c4c]' : 'text-slate-800';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
      {children}
    </h2>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

/* ─── Charts ────────────────────────────────────────────────── */

function ResponseRateLineChart({ data }: { data: WeeklyRateRow[] }) {
  const chartData = data.map(d => ({ week: formatWeek(d.week), linesExpedited: d.lines_expedited, linesResponded: d.lines_responded }));
  const showLabels = chartData.length <= 12;
  return (
    <ChartCard title="Expediting vs Responses by Week">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <Tooltip formatter={(value: unknown, name: unknown) => [Number(value).toLocaleString(), name === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded']} />
          <Legend formatter={(value) => value === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded'} />
          <Line type="monotone" dataKey="linesExpedited" stroke="#059669" strokeWidth={2} dot={{ r: 4, fill: '#059669' }} activeDot={{ r: 6 }} name="linesExpedited">
            {showLabels && <LabelList dataKey="linesExpedited" position="top" formatter={(v: unknown) => Number(v).toLocaleString()} style={{ fontSize: 11, fill: '#059669', fontWeight: 600 }} />}
          </Line>
          <Line type="monotone" dataKey="linesResponded" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} name="linesResponded">
            {showLabels && <LabelList dataKey="linesResponded" position="bottom" formatter={(v: unknown) => Number(v).toLocaleString()} style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }} />}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function BuyerLinesBarChart({ data }: { data: BuyerRow[] }) {
  const chartData = data.map(r => ({ name: r.display_name ?? 'Unknown', lines: r.total_lines }));
  return (
    <ChartCard title="PO Lines Expedited by Buyer">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip formatter={(v: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v), 'PO Lines']} />
          <Bar dataKey="lines" fill="#307c4c" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="lines" position="top" formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : String(v)} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SupplierBarChart({ data }: { data: SupplierRow[] }) {
  const chartData = data
    .filter(r => Number(r.times_expedited) >= 1)
    .sort((a, b) => (b.response_rate ?? 0) - (a.response_rate ?? 0))
    .map(r => ({ supplierName: String(r.supplier_name || '').slice(0, 25), responseRate: Number(r.response_rate) || 0 }));
  const chartHeight = Math.max(320, chartData.length * 40);
  return (
    <ChartCard title="Supplier Response Rates">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 0' }}>
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: unknown) => `${v}%`} />
              <YAxis type="category" dataKey="supplierName" tick={{ fontSize: 11, fill: '#94a3b8' }} width={180} />
              <Tooltip formatter={(v: unknown) => [`${v}%`, 'Response Rate']} />
              <Bar dataKey="responseRate" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.responseRate >= 70 ? '#059669' : entry.responseRate >= 30 ? '#f59e0b' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

function AvgResponseTimeBarChart({ data }: { data: SupplierResponseTimeRow[] }) {
  const chartData = data.map(r => ({ supplierName: String(r.supplier_name || '').slice(0, 28), avgDays: r.avg_days_to_respond, responsesCount: r.responses_count }));
  const chartHeight = Math.max(320, chartData.length * 40);
  return (
    <ChartCard title="Avg. Response Time by Supplier (Days)">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 0' }}>
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 40, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: unknown) => `${v}d`} />
              <YAxis type="category" dataKey="supplierName" tick={{ fontSize: 11, fill: '#94a3b8' }} width={180} />
              <Tooltip formatter={(v: unknown, _: unknown, props: { payload?: { responsesCount?: number } }) => [`${v} days avg (${props.payload?.responsesCount ?? 0} responses)`, 'Response Time']} />
              <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.avgDays <= 1 ? '#059669' : entry.avgDays <= 3 ? '#f59e0b' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/* ─── Tables ────────────────────────────────────────────────── */

function BuyerTable({ rows, onBuyerClick }: { rows: BuyerRow[]; onBuyerClick: (buyer: BuyerRow) => void }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(rows as unknown as Record<string, unknown>[], 'total_lines');
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'display_name', label: 'Buyer' }, { key: 'job_title', label: 'Job Title' },
    { key: 'total_sessions', label: 'Sessions', align: 'right' }, { key: 'total_lines', label: 'PO Lines', align: 'right' },
    { key: 'total_suppliers', label: 'Suppliers', align: 'right' }, { key: 'total_emails', label: 'Emails Sent', align: 'right' },
    { key: 'avg_response_rate', label: 'Avg Response', align: 'center' }, { key: 'last_active_at', label: 'Last Active' },
  ];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 360, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {cols.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} className={['py-3 px-4 font-semibold cursor-pointer select-none hover:text-[#307c4c] transition-colors whitespace-nowrap', col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '', sortKey === col.key ? 'text-[#307c4c]' : ''].join(' ')}>
                  <span className="inline-flex items-center gap-0.5">{col.label}<SortIcon active={sortKey === col.key} dir={sortDir} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={cols.length} className="py-10 text-center text-sm text-slate-400">No buyer data yet.</td></tr>}
            {sorted.map((row, idx) => {
              const r = row as unknown as BuyerRow;
              return (
                <tr key={idx} onClick={() => onBuyerClick(r)} className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                  <td className="py-3 px-4 text-sm font-semibold whitespace-nowrap"><span className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline">{r.display_name ?? r.email ?? '—'}<svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg></span></td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{r.job_title ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_sessions.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-slate-800 tabular-nums">{r.total_lines.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_suppliers.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_emails.toLocaleString()}</td>
                  <td className="py-3 px-4 text-center"><RateBadge rate={r.avg_response_rate} /></td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{formatDate(r.last_active_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierTable({ rows, onSupplierClick }: { rows: SupplierRow[]; onSupplierClick: (name: string) => void }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(rows as unknown as Record<string, unknown>[], 'response_rate');
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'supplier_name', label: 'Supplier Name' }, { key: 'times_expedited', label: 'Times Expedited', align: 'right' },
    { key: 'total_lines', label: 'Lines Sent', align: 'right' }, { key: 'lines_responded', label: 'Lines Responded', align: 'right' },
    { key: 'response_rate', label: 'Response Rate', align: 'center' }, { key: 'last_response', label: 'Last Response' },
  ];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 420, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {cols.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)} className={['py-3 px-4 font-semibold cursor-pointer select-none hover:text-[#307c4c] transition-colors whitespace-nowrap', col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '', sortKey === col.key ? 'text-[#307c4c]' : ''].join(' ')}>
                  <span className="inline-flex items-center gap-0.5">{col.label}<SortIcon active={sortKey === col.key} dir={sortDir} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={cols.length} className="py-10 text-center text-sm text-slate-400">No supplier data yet.</td></tr>}
            {sorted.map((row, idx) => {
              const r = row as unknown as SupplierRow;
              return (
                <tr key={idx} onClick={() => onSupplierClick(r.supplier_name)} className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                  <td className="py-3 px-4 text-sm font-semibold max-w-[240px]"><span className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline truncate" title={r.supplier_name}>{r.supplier_name || '—'}<svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg></span></td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.times_expedited.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_lines.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.lines_responded.toLocaleString()}</td>
                  <td className="py-3 px-4 text-center"><RateBadge rate={r.response_rate} /></td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{formatDate(r.last_response)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionsTable({ rows, onSessionClick }: { rows: RecentSession[]; onSessionClick: (session: RecentSession) => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 whitespace-nowrap">Date</th>
              <th className="py-3 px-4 whitespace-nowrap">Dispatched By</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Suppliers</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">PO Lines</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Emails Sent</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Responded</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Response Rate</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">No sessions yet.</td></tr>}
            {rows.map((r, idx) => (
              <tr key={r.session_ref} onClick={() => onSessionClick(r)} className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatSessionDate(r.dispatched_at)}</td>
                <td className="py-3 px-4 text-sm font-medium text-slate-800 whitespace-nowrap">{r.display_name ?? r.dispatched_by}</td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_suppliers}</td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_po_lines}</td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_emails_sent}</td>
                <td className="py-3 px-4 text-sm text-center font-medium text-slate-700 tabular-nums">{r.suppliers_responded != null ? `${r.suppliers_responded} / ${r.total_suppliers}` : '—'}</td>
                <td className="py-3 px-4 text-center"><RateBadge rate={r.response_rate_pct} /></td>
                <td className="py-3 px-4 text-center">{r.fully_closed === true ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">Closed</span> : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">Open</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Detail Modals ─────────────────────────────────────────── */

function BuyerDetailModal({ buyer, onClose, onSessionClick }: { buyer: BuyerRow; onClose: () => void; onSessionClick: (session: RecentSession) => void }) {
  const [rows, setRows] = useState<BuyerSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getBuyerDetail(buyer.email).then(setRows).finally(() => setLoading(false)); }, [buyer.email]);
  const totalLines = rows.reduce((s, r) => s + r.total_po_lines, 0);
  const totalSuppliers = rows.reduce((s, r) => s + r.total_suppliers, 0);
  const rates = rows.map(r => r.response_rate_pct).filter((v): v is number => v != null);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  function handleSessionClick(bsr: BuyerSessionRow) {
    const session: RecentSession = { session_ref: bsr.session_ref, dispatched_at: bsr.dispatched_at, dispatched_by: buyer.email, display_name: buyer.display_name, total_suppliers: bsr.total_suppliers, total_po_lines: bsr.total_po_lines, total_emails_sent: bsr.total_emails_sent, suppliers_responded: bsr.suppliers_responded, response_rate_pct: bsr.response_rate_pct, fully_closed: bsr.fully_closed };
    onClose();
    onSessionClick(session);
  }
  return (
    <DetailModal isOpen title={buyer.display_name ?? buyer.email} onClose={onClose}>
      <div className="px-6 pt-1 pb-3 border-b border-slate-100">
        {buyer.job_title && <p className="text-sm text-slate-500 mb-2">{buyer.job_title}</p>}
        <div className="flex flex-wrap gap-2">
          <StatPill label="Sessions" value={rows.length} /><StatPill label="Total Lines" value={totalLines.toLocaleString()} /><StatPill label="Total Suppliers" value={totalSuppliers.toLocaleString()} /><StatPill label="Avg Response Rate" value={avgRate != null ? `${avgRate}%` : '—'} />
        </div>
      </div>
      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && rows.length === 0 && <ModalEmpty message="No sessions found for this buyer." />}
        {!loading && rows.length > 0 && (
          <div className="rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 140 }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 90 }} /></colgroup>
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider"><th className="py-3 px-4">Date</th><th className="py-3 px-4 text-right">Suppliers</th><th className="py-3 px-4 text-right">PO Lines</th><th className="py-3 px-4 text-right">Emails Sent</th><th className="py-3 px-4 text-center">Responded</th><th className="py-3 px-4 text-center">Response Rate</th><th className="py-3 px-4 text-center">Status</th></tr></thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.session_ref} onClick={() => handleSessionClick(r)} className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">{formatSessionDate(r.dispatched_at)}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_suppliers}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_po_lines}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_emails_sent}</td>
                    <td className="py-3 px-4 text-sm text-center font-medium text-slate-700 tabular-nums">{r.suppliers_responded != null ? `${r.suppliers_responded} / ${r.total_suppliers}` : '—'}</td>
                    <td className="py-3 px-4 text-center"><RateBadge rate={r.response_rate_pct} /></td>
                    <td className="py-3 px-4 text-center">{r.fully_closed === true ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">Closed</span> : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">Open</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DetailModal>
  );
}

function SupplierDetailModal({ supplierName, onClose }: { supplierName: string; onClose: () => void }) {
  const [lines, setLines] = useState<AdminSupplierDetailLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { getAdminSupplierDetail(supplierName).then(data => { setLines(data); setExpanded(new Set(data.map(l => l.po_number))); }).finally(() => setLoading(false)); }, [supplierName]);
  const groups = useMemo(() => { const map = new Map<string, AdminSupplierDetailLine[]>(); for (const l of lines) { const arr = map.get(l.po_number) ?? []; arr.push(l); map.set(l.po_number, arr); } return Array.from(map.entries()).map(([po, poLines]) => ({ po, lines: poLines })); }, [lines]);
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;
  function togglePO(po: string) { setExpanded(prev => { const next = new Set(prev); if (next.has(po)) next.delete(po); else next.add(po); return next; }); }
  const colHeaders = ['Line', 'Buyer', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];
  return (
    <DetailModal isOpen title={supplierName} onClose={onClose}>
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2"><StatPill label="PO Lines" value={lines.length} /><StatPill label="Responded" value={totalResponded} /><StatPill label="POs" value={groups.length} /></div>
      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && <ModalEmpty message="No lines found for this supplier." />}
        {!loading && groups.map(({ po, lines: poLines }) => {
          const isOpen = expanded.has(po);
          const responded = poLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={po} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => togglePO(po)} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                <span className="font-bold text-sm text-slate-800">PO {po}</span>
                <span className="text-xs text-slate-500 font-medium">{poLines.length} line{poLines.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-xs font-medium text-slate-500">{responded} / {poLines.length} responded</span>
              </button>
              {isOpen && (
                <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup><col style={{ width: 60 }} /><col style={{ width: 120 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 100 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 90 }} /><col style={{ width: 150 }} /><col style={{ width: 100 }} /></colgroup>
                  <thead><tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{colHeaders.map(h => <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {poLines.map((line, i) => (
                      <tr key={line.po_line} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                        <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">{line.po_line}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate" title={line.buyer_display_name ?? line.buyer_email}>{line.buyer_display_name ?? line.buyer_email}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{line.sap_mat_id || '—'}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-700 overflow-hidden truncate" title={line.item_description ?? undefined}>{line.item_description || '—'}</td>
                        <td className="py-2.5 px-3 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">{line.open_qty != null ? line.open_qty.toLocaleString() : '—'}</td>
                        <td className="py-2.5 px-3 text-xs text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(line.open_po_value_usd)}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(line.original_delivery_date)}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(line.new_delivery_date)}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap"><DSTooltipBadge code={line.sap_delivery_code} /></td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate" title={line.supplier_comments ?? undefined}>{line.supplier_comments || '—'}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap"><ResponseBadge state={line.workflow_state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </DetailModal>
  );
}

function SessionDetailModal({ session, onClose }: { session: RecentSession; onClose: () => void }) {
  const [lines, setLines] = useState<AdminSessionDetailLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { getAdminSessionDetail(session.session_ref).then(data => { setLines(data); setExpanded(new Set(data.map(l => l.supplier_name))); }).finally(() => setLoading(false)); }, [session.session_ref]);
  const groups = useMemo(() => { const map = new Map<string, AdminSessionDetailLine[]>(); for (const l of lines) { const arr = map.get(l.supplier_name) ?? []; arr.push(l); map.set(l.supplier_name, arr); } return Array.from(map.entries()).map(([supplier, supplierLines]) => ({ supplier, lines: supplierLines })); }, [lines]);
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;
  function toggleSupplier(supplier: string) { setExpanded(prev => { const next = new Set(prev); if (next.has(supplier)) next.delete(supplier); else next.add(supplier); return next; }); }
  const colHeaders = ['PO Number', 'Line', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];
  return (
    <DetailModal isOpen title={`Session — ${formatSessionDate(session.dispatched_at)}`} onClose={onClose}>
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2"><StatPill label="PO Lines" value={lines.length} /><StatPill label="Responded" value={totalResponded} /><StatPill label="Suppliers" value={groups.length} /><StatPill label="Emails Sent" value={session.total_emails_sent} />{(session.display_name ?? session.dispatched_by) && <StatPill label="Dispatched By" value={session.display_name ?? session.dispatched_by} />}</div>
      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && <ModalEmpty message="No lines found for this session." />}
        {!loading && groups.map(({ supplier, lines: supplierLines }) => {
          const isOpen = expanded.has(supplier);
          const responded = supplierLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={supplier} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => toggleSupplier(supplier)} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                <span className="font-bold text-sm text-slate-800 truncate max-w-[300px]">{supplier}</span>
                <span className="text-xs text-slate-500 font-medium shrink-0">{supplierLines.length} line{supplierLines.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-xs font-medium text-slate-500 shrink-0">{responded} / {supplierLines.length} responded</span>
              </button>
              {isOpen && (
                <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                  <colgroup><col style={{ width: 110 }} /><col style={{ width: 60 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 100 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 90 }} /><col style={{ width: 150 }} /><col style={{ width: 100 }} /></colgroup>
                  <thead><tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{colHeaders.map(h => <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {supplierLines.map((line, i) => (
                      <tr key={`${line.po_number}-${line.po_line}`} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                        <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">{line.po_number}</td>
                        <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">{line.po_line}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{line.sap_mat_id || '—'}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-700 overflow-hidden truncate" title={line.item_description ?? undefined}>{line.item_description || '—'}</td>
                        <td className="py-2.5 px-3 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">{line.open_qty != null ? line.open_qty.toLocaleString() : '—'}</td>
                        <td className="py-2.5 px-3 text-xs text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(line.open_po_value_usd)}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(line.original_delivery_date)}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">{formatDate(line.new_delivery_date)}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap"><DSTooltipBadge code={line.sap_delivery_code} /></td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate" title={line.supplier_comments ?? undefined}>{line.supplier_comments || '—'}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap"><ResponseBadge state={line.workflow_state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </DetailModal>
  );
}

/* ─── Multi-select dropdown ─────────────────────────────────── */

function MultiSelect({ label, options, selected, onChange, searchable = false }: { label: string; options: { value: string; label: string }[]; selected: string[]; onChange: (vals: string[]) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);
  const filtered = searchable && search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;
  function toggle(val: string) { onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]); }
  return (
    <div ref={ref} className="relative min-w-[160px]">
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-left text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors">
        <span className="truncate">{selected.length ? `${selected.length} selected` : 'All'}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#307c4c] placeholder-slate-400" />
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No options.</p>
          ) : (
            filtered.map(o => (
              <label key={o.value} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5 rounded accent-[#307c4c] cursor-pointer" />
                <span className="text-sm text-slate-700 truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function TeamAnalyticsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<TeamAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState('');
  const [buyerEmails, setBuyerEmails] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>([]);
  const [supplierNames, setSupplierNames] = useState<string[]>([]);

  // Modals
  const [buyerModal, setBuyerModal] = useState<BuyerRow | null>(null);
  const [supplierModalName, setSupplierModalName] = useState<string | null>(null);
  const [sessionModal, setSessionModal] = useState<RecentSession | null>(null);

  // Document title
  useEffect(() => { document.title = 'Team Analytics — PO Expediting | SC Agents'; }, []);

  const buildFilters = useCallback((): TeamAnalyticsFilters => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    buyerEmails: buyerEmails.length ? buyerEmails : undefined,
    countries: countries.length ? countries : undefined,
    segments: segments.length ? segments : undefined,
    supplierNames: supplierNames.length ? supplierNames : undefined,
  }), [dateFrom, dateTo, buyerEmails, countries, segments, supplierNames]);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await getTeamAnalyticsData(buildFilters());
      setData(result);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [buildFilters]);

  // Load filter options once
  useEffect(() => { getFilterOptions().then(setFilterOpts); }, []);

  // Initial fetch
  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce filter changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) return; // skip initial
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [dateFrom, dateTo, buyerEmails, countries, segments, supplierNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilters = !!dateFrom || !!dateTo || buyerEmails.length > 0 || countries.length > 0 || segments.length > 0 || supplierNames.length > 0;

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setBuyerEmails([]);
    setCountries([]);
    setSegments([]);
    setSupplierNames([]);
  }

  const hasData = data && (data.totalLinesExpedited > 0 || data.buyerBreakdown.length > 0);

  const rateColor = !data || data.overallResponseRate === null ? 'text-slate-800'
    : data.overallResponseRate >= 70 ? 'text-[#307c4c]'
    : data.overallResponseRate >= 30 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col h-full relative bg-white">
        {/* Header */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-10 text-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">Team Analytics</h1>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-16 scroll-smooth">
          <div className="max-w-[1400px] mx-auto py-6">

            {/* Page header + refresh */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">Team Analytics</h2>
                <p className="text-sm text-gray-500 mt-0.5">PO Expediting performance across all buyers.</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Last updated: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              </div>
              <button onClick={fetchData} disabled={isRefreshing} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0">
                <svg className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-6">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Date range */}
                <div className="min-w-[160px]">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Date From</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors" />
                </div>
                <div className="min-w-[160px]">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Date To</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors" />
                </div>

                {filterOpts && (
                  <>
                    <MultiSelect label="Expeditor" options={filterOpts.buyers} selected={buyerEmails} onChange={setBuyerEmails} searchable />
                    <MultiSelect label="Country" options={filterOpts.countries.map(c => ({ value: c, label: c }))} selected={countries} onChange={setCountries} />
                    <MultiSelect label="P Group" options={filterOpts.segments.map(s => ({ value: s, label: s }))} selected={segments} onChange={setSegments} searchable />
                    <MultiSelect label="Supplier" options={filterOpts.suppliers.map(s => ({ value: s, label: s }))} selected={supplierNames} onChange={setSupplierNames} searchable />
                  </>
                )}

                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors pb-2">
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
                <div className="grid grid-cols-2 gap-6">{[1,2].map(i => <div key={i} className="h-72 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !hasData && (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 max-w-md w-full text-center">
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <h3 className="text-base font-bold text-slate-900 mb-1">No data found for the selected filters.</h3>
                  <p className="text-sm text-slate-500 mb-4">Try adjusting your date range or filters.</p>
                  <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#307c4c] rounded-lg hover:bg-[#26663e] transition-colors">Clear Filters</button>
                </div>
              </div>
            )}

            {/* Analytics content */}
            {!loading && data && hasData && (
              <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">

                {/* KPI cards */}
                <div>
                  <SectionTitle>Overview</SectionTitle>
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    <KpiCard label="Total PO Lines Expedited" value={data.totalLinesExpedited.toLocaleString()} accent />
                    <KpiCard label="Total Suppliers Contacted" value={data.totalSuppliersContacted.toLocaleString()} accent />
                    <KpiCard label="Total Active Buyers" value={data.totalActiveBuyers.toLocaleString()} />
                    <KpiCard label="Total Emails Sent" value={data.totalEmailsSent.toLocaleString()} />
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Overall Response Rate</p>
                      <p className={`text-3xl font-bold tracking-tight ${rateColor}`}>{data.overallResponseRate !== null ? `${data.overallResponseRate}%` : '—'}</p>
                    </div>
                    <KpiCard label="Total Expediting Sessions" value={data.totalBatches.toLocaleString()} />
                  </div>
                </div>

                {/* Charts row 1 */}
                <div>
                  <SectionTitle>Trends</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <ResponseRateLineChart data={data.weeklyRateData} />
                    <BuyerLinesBarChart data={data.buyerBreakdown} />
                  </div>
                </div>

                {/* Supplier performance charts */}
                <div>
                  <SectionTitle>Supplier Performance</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <SupplierBarChart data={data.supplierBreakdown} />
                    <AvgResponseTimeBarChart data={data.supplierResponseTime} />
                  </div>
                </div>

                {/* Buyer Activity */}
                <div>
                  <SectionTitle>Buyer Activity</SectionTitle>
                  <BuyerTable rows={data.buyerBreakdown} onBuyerClick={setBuyerModal} />
                </div>

                {/* Supplier Response Rates */}
                <div>
                  <SectionTitle>Supplier Response Rates</SectionTitle>
                  <SupplierTable rows={data.supplierBreakdown} onSupplierClick={setSupplierModalName} />
                </div>

                {/* Recent Sessions */}
                <div>
                  <SectionTitle>Recent Expediting Sessions</SectionTitle>
                  <SessionsTable rows={data.recentSessions} onSessionClick={setSessionModal} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      {buyerModal && <BuyerDetailModal buyer={buyerModal} onClose={() => setBuyerModal(null)} onSessionClick={setSessionModal} />}
      {supplierModalName && <SupplierDetailModal supplierName={supplierModalName} onClose={() => setSupplierModalName(null)} />}
      {sessionModal && <SessionDetailModal session={sessionModal} onClose={() => setSessionModal(null)} />}
    </div>
  );
}
