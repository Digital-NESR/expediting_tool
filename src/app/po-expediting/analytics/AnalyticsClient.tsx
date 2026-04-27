'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { getMyExpeditingAnalytics } from '@/app/actions/analytics';
import type { MyAnalytics, MySupplierRow, MyRecentSession, MyWeeklyRateRow } from '@/app/actions/analytics';

/* ─── Helpers ────────────────────────────────────────────────── */

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
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

/* ─── Rate Badge ─────────────────────────────────────────────── */

function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">
        —
      </span>
    );
  }
  const cls =
    rate >= 70
      ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
      : rate >= 30
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${cls}`}>
      {rate}%
    </span>
  );
}

/* ─── Sort Icon ──────────────────────────────────────────────── */

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 inline-flex flex-col leading-none text-[9px] ${active ? 'text-[#307c4c]' : 'text-slate-300'}`}>
      <span className={active && dir === 'asc' ? 'text-[#307c4c]' : ''}>▲</span>
      <span className={active && dir === 'desc' ? 'text-[#307c4c]' : ''}>▼</span>
    </span>
  );
}

/* ─── useSortable ────────────────────────────────────────────── */

function useSortable<T extends Record<string, unknown>>(
  data: T[],
  defaultKey: keyof T,
  defaultDir: 'asc' | 'desc' = 'desc',
) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);

  function handleSort(key: keyof T) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, handleSort };
}

/* ─── KPI Card ───────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  accent = false,
  warning = false,
  danger = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger
    ? 'text-red-600'
    : warning
      ? 'text-amber-600'
      : accent
        ? 'text-[#307c4c]'
        : 'text-slate-800';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}

/* ─── Section Title ──────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
      {children}
    </h2>
  );
}

/* ─── Chart Card ─────────────────────────────────────────────── */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

/* ─── My Response Rate Over Time (Line Chart) ─────────────────── */

function MyResponseRateLineChart({ data }: { data: MyWeeklyRateRow[] }) {
  const chartData = data.map(d => ({
    week: formatWeek(d.week),
    rate: d.avg_response_rate,
  }));

  return (
    <ChartCard title="My Response Rate Over Time">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            domain={[0, 100]}
            tickFormatter={(v: unknown) => `${v}%`}
          />
          <Tooltip formatter={(v: unknown) => [`${v}%`, 'Response Rate']} />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3, fill: '#059669' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── My Supplier Response Rates (Horizontal Bar Chart) ──────── */

function MySupplierBarChart({ data }: { data: MySupplierRow[] }) {
  const chartData = data
    .filter(r => Number(r.times_expedited) >= 1)
    .sort((a, b) => (b.response_rate ?? 0) - (a.response_rate ?? 0))
    .slice(0, 10)
    .map(r => ({
      supplierName: String(r.supplier_name || '').slice(0, 25),
      responseRate: Number(r.response_rate) || 0,
      linesResponded: Number(r.lines_responded) || 0,
      totalLines: Number(r.total_lines) || 0,
    }));

  return (
    <ChartCard title="My Supplier Response Rates">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, bottom: 10, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={(v: unknown) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="supplierName"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={160}
          />
          <Tooltip formatter={(v: unknown) => [`${v}%`, 'Response Rate']} />
          <Bar dataKey="responseRate" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={
                  entry.responseRate >= 70 ? '#059669' :
                  entry.responseRate >= 30 ? '#f59e0b' :
                  '#ef4444'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── My Supplier Table ──────────────────────────────────────── */

function MySupplierTable({ rows }: { rows: MySupplierRow[] }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(
    rows as unknown as Record<string, unknown>[],
    'response_rate',
  );
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'supplier_name',   label: 'Supplier Name'                    },
    { key: 'times_expedited', label: 'Times Expedited', align: 'right'  },
    { key: 'total_lines',     label: 'Total Lines',     align: 'right'  },
    { key: 'lines_responded', label: 'Lines Responded', align: 'right'  },
    { key: 'response_rate',   label: 'Response Rate',   align: 'center' },
    { key: 'last_response',   label: 'Last Response'                    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={[
                    'py-3 px-4 font-semibold cursor-pointer select-none hover:text-[#307c4c] transition-colors whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '',
                    sortKey === col.key ? 'text-[#307c4c]' : '',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="py-10 text-center text-sm text-slate-400">
                  No supplier data yet.
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => {
              const r = row as unknown as MySupplierRow;
              return (
                <tr
                  key={idx}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold text-slate-800 max-w-[240px] truncate" title={r.supplier_name}>
                    {r.supplier_name || '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.times_expedited.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_lines.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.lines_responded.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <RateBadge rate={r.response_rate} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.last_response)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── My Sessions Table ──────────────────────────────────────── */

function MySessionsTable({ rows }: { rows: MyRecentSession[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 whitespace-nowrap">Date</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Suppliers</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">PO Lines</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Emails Sent</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Responded</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Response Rate</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  No sessions yet.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr
                key={r.session_ref}
                className={`border-b border-slate-100 hover:bg-[#307c4c]/5 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
              >
                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                  {formatSessionDate(r.dispatched_at)}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                  {r.total_suppliers}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                  {r.total_po_lines}
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                  {r.total_emails_sent}
                </td>
                <td className="py-3 px-4 text-sm text-center font-medium text-slate-700 tabular-nums">
                  {r.suppliers_responded != null
                    ? `${r.suppliers_responded} / ${r.total_suppliers}`
                    : '—'}
                </td>
                <td className="py-3 px-4 text-center">
                  <RateBadge rate={r.response_rate_pct} />
                </td>
                <td className="py-3 px-4 text-center">
                  {r.fully_closed === true ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
                      Closed
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                      Open
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Empty State ────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex justify-center mt-16 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-800">No expediting sessions found.</p>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Your analytics will appear here after you send your first batch of expediting emails.
        </p>
        <Link
          href="/po-expediting"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#307c4c] hover:bg-[#26663e] text-white text-sm font-semibold rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm"
        >
          Go to Dashboard
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

/* ─── Loading Skeleton ───────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 h-24">
            <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
            <div className="h-8 w-16 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-6 h-[340px] bg-white">
            <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
            <div className="h-full bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main AnalyticsClient ───────────────────────────────────── */

export default function AnalyticsClient({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [analytics, setAnalytics]         = useState<MyAnalytics | null>(null);
  const [isLoading, setIsLoading]         = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMyExpeditingAnalytics(userEmail);
      setAnalytics(data);
      setLastRefreshed(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [userEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rateColor =
    analytics?.overallResponseRate == null
      ? 'text-slate-800'
      : analytics.overallResponseRate >= 70
        ? undefined  // accent
        : analytics.overallResponseRate >= 30
          ? undefined  // warning
          : undefined; // danger — handled via KpiCard props

  const hasData = analytics !== null && analytics.recentSessions.length > 0;
  const isEmpty = analytics !== null && !isLoading && analytics.recentSessions.length === 0;

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 flex flex-col h-full relative bg-white">

        {/* ── Sticky header ── */}
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c] shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">NESR</span>
            <span className="hidden sm:inline text-gray-300 select-none">·</span>
            <span className="hidden sm:inline text-sm font-medium text-gray-500">My Analytics</span>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg
              className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </header>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scroll-smooth">

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">My Analytics</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Your personal expediting performance and supplier response tracking.
            </p>
            {lastRefreshed && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                Last updated: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>

          {/* Loading */}
          {isLoading && <LoadingSkeleton />}

          {/* Empty state */}
          {isEmpty && <EmptyState />}

          {/* Analytics content */}
          {hasData && analytics && (
            <div className="space-y-8 animate-in fade-in duration-500">

              {/* Row 1 — KPI cards */}
              <div>
                <SectionTitle>Overview</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    label="My PO Lines Expedited"
                    value={analytics.totalLinesExpedited.toLocaleString()}
                    accent
                  />
                  <KpiCard
                    label="My Suppliers Contacted"
                    value={analytics.totalSuppliersContacted.toLocaleString()}
                    accent
                  />
                  <KpiCard
                    label="My Emails Sent"
                    value={analytics.totalEmailsSent.toLocaleString()}
                  />
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      My Response Rate
                    </p>
                    <p className={`text-3xl font-bold tracking-tight ${
                      analytics.overallResponseRate === null
                        ? 'text-slate-800'
                        : analytics.overallResponseRate >= 70
                          ? 'text-[#307c4c]'
                          : analytics.overallResponseRate >= 30
                            ? 'text-amber-600'
                            : 'text-red-600'
                    }`}>
                      {analytics.overallResponseRate !== null
                        ? `${analytics.overallResponseRate}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 2 — Charts */}
              <div>
                <SectionTitle>Trends</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <MyResponseRateLineChart data={analytics.weeklyRateData} />
                  <MySupplierBarChart data={analytics.supplierBreakdown} />
                </div>
              </div>

              {/* Row 3 — Supplier Performance table */}
              <div>
                <SectionTitle>My Supplier Performance</SectionTitle>
                <MySupplierTable rows={analytics.supplierBreakdown} />
              </div>

              {/* Row 4 — Recent Sessions table */}
              <div>
                <SectionTitle>My Recent Sessions</SectionTitle>
                <MySessionsTable rows={analytics.recentSessions} />
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
