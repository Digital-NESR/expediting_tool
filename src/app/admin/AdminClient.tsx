'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type {
  ExpeditingAnalytics,
  BuyerRow,
  SupplierRow,
  RecentSession,
  WeeklyRateRow,
} from '@/app/actions/adminAnalytics';

/* ─── Props ──────────────────────────────────────────────────── */

interface AdminClientProps {
  analytics: ExpeditingAnalytics;
  userEmail: string;
  userName: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

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

/* ─── Response Rate Badge ─────────────────────────────────────── */

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

/* ─── Section heading ─────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
      {children}
    </h2>
  );
}

/* ─── Buyer Activity Table ────────────────────────────────────── */

function BuyerTable({ rows }: { rows: BuyerRow[] }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(
    rows as unknown as Record<string, unknown>[],
    'total_lines',
  );
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'display_name',      label: 'Buyer'             },
    { key: 'job_title',         label: 'Job Title'         },
    { key: 'total_sessions',    label: 'Sessions',      align: 'right' },
    { key: 'total_lines',       label: 'PO Lines',      align: 'right' },
    { key: 'total_suppliers',   label: 'Suppliers',     align: 'right' },
    { key: 'total_emails',      label: 'Emails Sent',   align: 'right' },
    { key: 'avg_response_rate', label: 'Avg Response',  align: 'center' },
    { key: 'last_active_at',    label: 'Last Active'   },
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
                  No buyer data yet.
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => {
              const r = row as unknown as BuyerRow;
              return (
                <tr
                  key={idx}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold text-slate-800 whitespace-nowrap">
                    {r.display_name ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {r.job_title ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_sessions.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-slate-800 tabular-nums">
                    {r.total_lines.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_suppliers.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_emails.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <RateBadge rate={r.avg_response_rate} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.last_active_at)}
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

/* ─── Supplier Response Table ─────────────────────────────────── */

function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(
    rows as unknown as Record<string, unknown>[],
    'response_rate',
  );
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'supplier_name',   label: 'Supplier Name'                        },
    { key: 'times_expedited', label: 'Times Expedited', align: 'right'      },
    { key: 'total_lines',     label: 'Lines Sent',      align: 'right'      },
    { key: 'lines_responded', label: 'Lines Responded', align: 'right'      },
    { key: 'response_rate',   label: 'Response Rate',   align: 'center'     },
    { key: 'last_response',   label: 'Last Response'                        },
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
              const r = row as unknown as SupplierRow;
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

/* ─── Recent Sessions Table ───────────────────────────────────── */

function SessionsTable({ rows }: { rows: RecentSession[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
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
                <td className="py-3 px-4 text-sm font-medium text-slate-800 whitespace-nowrap">
                  {r.display_name ?? r.dispatched_by}
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

/* ─── Chart Card wrapper ──────────────────────────────────────── */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

/* ─── Chart 1 — Response Rate Over Time ──────────────────────── */

function ResponseRateLineChart({ data }: { data: WeeklyRateRow[] }) {
  const chartData = data.map(d => ({
    week: formatWeek(d.week),
    rate: d.avg_response_rate,
  }));

  return (
    <ChartCard title="Response Rate Over Time">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
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

/* ─── Chart 3 — PO Lines Expedited by Buyer ──────────────────── */

function BuyerLinesBarChart({ data }: { data: BuyerRow[] }) {
  const chartData = data.map(r => ({
    name: r.display_name ?? 'Unknown',
    lines: r.total_lines,
  }));

  return (
    <ChartCard title="PO Lines Expedited by Buyer">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 48, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip formatter={(v: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v), 'PO Lines']} />
          <Bar dataKey="lines" fill="#307c4c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Chart 2 — Top 10 Suppliers by Response Rate ────────────── */

function SupplierBarChart({ data }: { data: SupplierRow[] }) {
  const chartData = data
    .filter(r => r.times_expedited > 1 && r.response_rate !== null)
    .sort((a, b) => (b.response_rate ?? 0) - (a.response_rate ?? 0))
    .slice(0, 10)
    .map(r => ({
      name: r.supplier_name.length > 20 ? r.supplier_name.slice(0, 20) + '…' : r.supplier_name,
      rate: r.response_rate,
    }));

  function barColor(rate: number | null): string {
    if (rate === null) return '#94a3b8';
    if (rate >= 70) return '#059669';
    if (rate >= 30) return '#f59e0b';
    return '#ef4444';
  }

  return (
    <ChartCard title="Top 10 Suppliers by Response Rate">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={148}
          />
          <Tooltip formatter={(v: unknown) => [`${v}%`, 'Response Rate']} />
          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={`cell-${i}`} fill={barColor(entry.rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Analytics Section ───────────────────────────────────────── */

function AnalyticsSection({ analytics }: { analytics: ExpeditingAnalytics }) {
  const rateColor =
    analytics.overallResponseRate === null
      ? 'text-slate-800'
      : analytics.overallResponseRate >= 70
        ? 'text-[#307c4c]'
        : analytics.overallResponseRate >= 30
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">

      {/* Row 1 — KPI cards */}
      <div>
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total PO Lines Expedited"
            value={analytics.totalLinesExpedited.toLocaleString()}
            accent
          />
          <KpiCard
            label="Total Suppliers Contacted"
            value={analytics.totalSuppliersContacted.toLocaleString()}
            accent
          />
          <KpiCard
            label="Total Emails Sent"
            value={analytics.totalEmailsSent.toLocaleString()}
          />
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Overall Response Rate
            </p>
            <p className={`text-3xl font-bold tracking-tight ${rateColor}`}>
              {analytics.overallResponseRate !== null
                ? `${analytics.overallResponseRate}%`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2 — Charts: Response Rate Over Time + PO Lines by Buyer */}
      <div>
        <SectionTitle>Trends</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ResponseRateLineChart data={analytics.weeklyRateData} />
          <BuyerLinesBarChart data={analytics.buyerBreakdown} />
        </div>
      </div>

      {/* Row 3 — Buyer Activity */}
      <div>
        <SectionTitle>Buyer Activity</SectionTitle>
        <BuyerTable rows={analytics.buyerBreakdown} />
      </div>

      {/* Row 4 — Top Suppliers chart */}
      <div>
        <SectionTitle>Supplier Performance</SectionTitle>
        <SupplierBarChart data={analytics.supplierBreakdown} />
      </div>

      {/* Row 5 — Supplier Response Rates table */}
      <div>
        <SectionTitle>Supplier Response Rates</SectionTitle>
        <SupplierTable rows={analytics.supplierBreakdown} />
      </div>

      {/* Row 6 — Recent Sessions */}
      <div>
        <SectionTitle>Recent Expediting Sessions</SectionTitle>
        <SessionsTable rows={analytics.recentSessions} />
      </div>
    </div>
  );
}

/* ─── Main AdminClient ────────────────────────────────────────── */

export default function AdminClient({ analytics, userEmail, userName }: AdminClientProps) {
  const [selectedTool, setSelectedTool] = useState<string>('po-expediting');

  const navItemBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900 flex flex-col">

      {/* ── Slim header ── */}
      <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-10 px-6 lg:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/nesr-logo-circle.png"
            alt="NESR"
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="text-sm font-semibold text-slate-900 tracking-tight">NESR</span>
          <span className="text-slate-300 select-none">·</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[220px]">
            {userName !== userEmail ? `${userName} · ` : ''}{userEmail}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + main ── */}
      <div className="flex flex-1">

        {/* ── Sidebar ── */}
        <aside
          className="shrink-0 bg-white"
          style={{ width: 240, borderRight: '1px solid #e5e7eb', padding: '24px 16px' }}
        >
          {/* Section label */}
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tools
          </p>

          {/* PO Expediting */}
          <button
            onClick={() => setSelectedTool('po-expediting')}
            style={{
              ...navItemBase,
              borderLeft: selectedTool === 'po-expediting' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'po-expediting' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'po-expediting' ? '#059669' : '#4b5563',
              cursor: 'pointer',
            }}
          >
            PO Expediting
          </button>

          {/* GRN & Invoice Reconciliation */}
          <div
            style={{
              ...navItemBase,
              borderLeft: '3px solid transparent',
              color: '#d1d5db',
              cursor: 'not-allowed',
            }}
          >
            <span>GRN & Invoice Reconciliation</span>
            <span style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 10, padding: '2px 6px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
              Soon
            </span>
          </div>

          {/* Supply Chain Analytics */}
          <div
            style={{
              ...navItemBase,
              borderLeft: '3px solid transparent',
              color: '#d1d5db',
              cursor: 'not-allowed',
            }}
          >
            <span>Supply Chain Analytics</span>
            <span style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 10, padding: '2px 6px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
              Soon
            </span>
          </div>

          <hr style={{ borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto" style={{ padding: 32 }}>
          {selectedTool === 'po-expediting' && (
            <AnalyticsSection analytics={analytics} />
          )}
        </main>

      </div>
    </div>
  );
}
