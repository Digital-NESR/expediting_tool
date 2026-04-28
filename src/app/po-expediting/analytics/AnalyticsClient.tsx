'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import DetailModal from '@/components/DetailModal';
import { DS_DESCRIPTIONS } from '@/lib/constants';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { getMyExpeditingAnalytics, getSupplierDetail, getSessionDetail } from '@/app/actions/analytics';
import type {
  MyAnalytics, MySupplierRow, MyRecentSession, MyWeeklyRateRow,
  SupplierDetailLine, SessionDetailLine, MySupplierResponseTimeRow,
} from '@/app/actions/analytics';

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

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

/* ─── DSTooltipBadge ─────────────────────────────────────────── */

function DSTooltipBadge({ code }: { code: string | null }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!code) return <span className="text-slate-400">—</span>;

  const description = DS_DESCRIPTIONS[code];

  const show = () => { timer.current = setTimeout(() => setVisible(true), 150); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); setVisible(false); };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap cursor-default">
        {code}
      </span>
      {visible && description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-[#1f2937] text-white text-[11px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            {description}
          </div>
          <div className="w-2 h-2 bg-[#1f2937] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}

/* ─── ResponseBadge ──────────────────────────────────────────── */

function ResponseBadge({ state }: { state: string }) {
  const responded = state === 'Submitted';
  return responded ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
      Responded
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      Pending
    </span>
  );
}

/* ─── StatPill ───────────────────────────────────────────────── */

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-[12px] font-medium text-slate-600 border border-slate-200">
      <span className="font-bold text-slate-800">{value}</span>
      <span>{label}</span>
    </span>
  );
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
    .map(r => ({
      supplierName: String(r.supplier_name || '').slice(0, 25),
      responseRate: Number(r.response_rate) || 0,
      linesResponded: Number(r.lines_responded) || 0,
      totalLines: Number(r.total_lines) || 0,
    }));

  const chartHeight = Math.max(320, chartData.length * 40);

  return (
    <ChartCard title="My Supplier Response Rates">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 0' }}>
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
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
                width={180}
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
        </div>
      </div>
    </ChartCard>
  );
}

/* ─── My Avg Response Time by Supplier (Horizontal Bar Chart) ── */

function MyAvgResponseTimeBarChart({ data }: { data: MySupplierResponseTimeRow[] }) {
  const chartData = [...data]
    .sort((a, b) => a.avg_days_to_respond - b.avg_days_to_respond)
    .map(r => ({
      supplierName: String(r.supplier_name || '').slice(0, 25),
      avgDays: Number(r.avg_days_to_respond) || 0,
      responsesCount: Number(r.responses_count) || 0,
    }));

  const chartHeight = Math.max(320, chartData.length * 40);

  return (
    <ChartCard title="Avg. Response Time by Supplier (Days)">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 0' }}>
        <div style={{ height: chartHeight, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 30, bottom: 10, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v: unknown) => `${v}d`}
              />
              <YAxis
                type="category"
                dataKey="supplierName"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                width={180}
              />
              <Tooltip formatter={(v: unknown) => [`${v} days`, 'Avg. Response Time']} />
              <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={
                      entry.avgDays <= 1 ? '#059669' :
                      entry.avgDays <= 3 ? '#f59e0b' :
                      '#ef4444'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}

/* ─── Supplier Detail Modal ──────────────────────────────────── */

function SupplierDetailModal({
  supplierName,
  userEmail,
  onClose,
}: {
  supplierName: string;
  userEmail: string;
  onClose: () => void;
}) {
  const [lines, setLines]     = useState<SupplierDetailLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getSupplierDetail(supplierName, userEmail)
      .then(data => {
        setLines(data);
        // Start all POs expanded
        const pos = new Set(data.map(l => l.po_number));
        setExpanded(pos);
      })
      .finally(() => setLoading(false));
  }, [supplierName, userEmail]);

  // Group lines by PO number
  const groups = useMemo(() => {
    const map = new Map<string, SupplierDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.po_number) ?? [];
      arr.push(l);
      map.set(l.po_number, arr);
    }
    return Array.from(map.entries()).map(([po, poLines]) => ({ po, lines: poLines }));
  }, [lines]);

  const totalLines    = lines.length;
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;

  function togglePO(po: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(po) ? next.delete(po) : next.add(po);
      return next;
    });
  }

  const colHeaders = ['Line', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];

  return (
    <DetailModal isOpen title={supplierName} onClose={onClose}>
      {/* Stats row */}
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="POs" value={groups.length} />
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <svg className="w-5 h-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-medium">Loading lines…</span>
          </div>
        )}

        {!loading && lines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">No lines found for this supplier.</p>
          </div>
        )}

        {!loading && groups.map(({ po, lines: poLines }) => {
          const isOpen = expanded.has(po);
          const responded = poLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={po} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
              {/* PO parent row */}
              <button
                onClick={() => togglePO(po)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span className="font-bold text-sm text-slate-800">PO {po}</span>
                <span className="text-xs text-slate-500 font-medium">{poLines.length} line{poLines.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-xs font-medium text-slate-500">{responded} / {poLines.length} responded</span>
              </button>

              {/* Sub-rows */}
              {isOpen && (
                <div>
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 60 }} />
                      <col style={{ width: 120 }} />
                      <col />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 100 }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {colHeaders.map(h => (
                          <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map((line, i) => (
                        <tr key={line.po_line} className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DetailModal>
  );
}

/* ─── Session Detail Modal ───────────────────────────────────── */

function SessionDetailModal({
  session,
  userEmail,
  onClose,
}: {
  session: MyRecentSession;
  userEmail: string;
  onClose: () => void;
}) {
  const [lines, setLines]       = useState<SessionDetailLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getSessionDetail(session.session_ref, userEmail)
      .then(data => {
        setLines(data);
        // Start all supplier groups expanded
        const suppliers = new Set(data.map(l => l.supplier_name));
        setExpanded(suppliers);
      })
      .finally(() => setLoading(false));
  }, [session.session_ref, userEmail]);

  // Group lines by supplier_name
  const groups = useMemo(() => {
    const map = new Map<string, SessionDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.supplier_name) ?? [];
      arr.push(l);
      map.set(l.supplier_name, arr);
    }
    return Array.from(map.entries()).map(([supplier, supplierLines]) => ({ supplier, lines: supplierLines }));
  }, [lines]);

  const totalLines    = lines.length;
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;

  function toggleSupplier(supplier: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(supplier) ? next.delete(supplier) : next.add(supplier);
      return next;
    });
  }

  const colHeaders = ['PO Number', 'Line', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];

  return (
    <DetailModal isOpen title={`Session — ${formatSessionDate(session.dispatched_at)}`} onClose={onClose}>
      {/* Stats row */}
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="Suppliers" value={groups.length} />
        <StatPill label="Emails Sent" value={session.total_emails_sent} />
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
            <svg className="w-5 h-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-medium">Loading lines…</span>
          </div>
        )}

        {!loading && lines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">No lines found for this session.</p>
          </div>
        )}

        {!loading && groups.map(({ supplier, lines: supplierLines }) => {
          const isOpen = expanded.has(supplier);
          const responded = supplierLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={supplier} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
              {/* Supplier parent row */}
              <button
                onClick={() => toggleSupplier(supplier)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span className="font-bold text-sm text-slate-800 truncate max-w-[300px]">{supplier}</span>
                <span className="text-xs text-slate-500 font-medium shrink-0">{supplierLines.length} line{supplierLines.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-xs font-medium text-slate-500 shrink-0">{responded} / {supplierLines.length} responded</span>
              </button>

              {/* Sub-rows */}
              {isOpen && (
                <div>
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 110 }} />
                      <col style={{ width: 60 }} />
                      <col style={{ width: 110 }} />
                      <col />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 100 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 100 }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {colHeaders.map(h => (
                          <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
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
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <DSTooltipBadge code={line.sap_delivery_code} />
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate" title={line.supplier_comments ?? undefined}>{line.supplier_comments || '—'}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap"><ResponseBadge state={line.workflow_state} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DetailModal>
  );
}

/* ─── My Supplier Table ──────────────────────────────────────── */

function MySupplierTable({
  rows,
  onSupplierClick,
}: {
  rows: MySupplierRow[];
  onSupplierClick: (name: string) => void;
}) {
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
    <div
      className="bg-white shadow-sm"
      style={{ height: 420, overflowY: 'auto', overflowX: 'hidden', borderRadius: 16, border: '1px solid #e5e7eb' }}
    >
      <table className="w-full text-left border-collapse">
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
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
                  onClick={() => onSupplierClick(r.supplier_name)}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold max-w-[240px]">
                    <span className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline truncate" title={r.supplier_name}>
                      {r.supplier_name || '—'}
                      <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                    </span>
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
  );
}

/* ─── My Sessions Table ──────────────────────────────────────── */

function MySessionsTable({
  rows,
  onSessionClick,
}: {
  rows: MyRecentSession[];
  onSessionClick: (session: MyRecentSession) => void;
}) {
  return (
    <div
      className="bg-white shadow-sm"
      style={{ height: 400, overflowY: 'auto', overflowX: 'hidden', borderRadius: 16, border: '1px solid #e5e7eb' }}
    >
      <table className="w-full text-left border-collapse">
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
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
                onClick={() => onSessionClick(r)}
                className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
              >
                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                  <span className="group inline-flex items-center gap-1.5">
                    {formatSessionDate(r.dispatched_at)}
                    <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </span>
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

  // Modal state
  const [supplierModalName, setSupplierModalName] = useState<string | null>(null);
  const [sessionModal, setSessionModal]           = useState<MyRecentSession | null>(null);

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

              {/* Row 2 — Trends */}
              <div>
                <SectionTitle>Trends</SectionTitle>
                <MyResponseRateLineChart data={analytics.weeklyRateData} />
              </div>

              {/* Row 3 — Supplier Performance */}
              <div>
                <SectionTitle>My Supplier Performance</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <MySupplierBarChart data={analytics.supplierBreakdown} />
                  <MyAvgResponseTimeBarChart data={analytics.supplierResponseTime} />
                </div>
                <MySupplierTable
                  rows={analytics.supplierBreakdown}
                  onSupplierClick={setSupplierModalName}
                />
              </div>

              {/* Row 4 — Recent Sessions table */}
              <div>
                <SectionTitle>My Recent Sessions</SectionTitle>
                <MySessionsTable
                  rows={analytics.recentSessions}
                  onSessionClick={setSessionModal}
                />
              </div>

            </div>
          )}

        </div>
      </main>

      {/* ── Modals ── */}
      {supplierModalName && (
        <SupplierDetailModal
          supplierName={supplierModalName}
          userEmail={userEmail}
          onClose={() => setSupplierModalName(null)}
        />
      )}
      {sessionModal && (
        <SessionDetailModal
          session={sessionModal}
          userEmail={userEmail}
          onClose={() => setSessionModal(null)}
        />
      )}
    </div>
  );
}
