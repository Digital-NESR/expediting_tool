'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import DetailModal from '@/components/DetailModal';
import { DS_DESCRIPTIONS } from '@/lib/constants';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts';
import {
  getExpeditingAnalytics,
  getBuyerDetail,
  getAdminSupplierDetail,
  getAdminSessionDetail,
} from '@/app/actions/adminAnalytics';
import AccessApprovalsClient from './AccessApprovalsClient';
import TiteMigrationClient from './TiteMigrationClient';
import TiteAccessApprovalsClient from './TiteAccessApprovalsClient';
import TiteDefaultNotifiersClient from './TiteDefaultNotifiersClient';
import TiteAnalyticsClient from './TiteAnalyticsClient';
import ProcureGuardAccessApprovalsClient from './ProcureGuardAccessApprovalsClient';
import ProcureGuardAdminPanelClient from '../procure-guard/admin/AdminPanelClient';
import ProcureGuardAnalyticsClient from '../procure-guard/analytics/AnalyticsClient';
import ProcureGuardAdminAnalyticsClient from '../procure-guard/admin-analytics/AdminAnalyticsClient';
import { SourceGuideAccessApprovalsClient, SourceGuideGuidesClient, SourceGuideAnalyticsClient, SourceGuideChampionsClient } from './SourceGuideAdmin';
import type { Shipment } from '@/types/tite';
import type { ProcureGuardAdminAnalyticsData, ProcureGuardAdminData, ProcureGuardAnalyticsData } from '@/types/procureGuard';
import type {
  ExpeditingAnalytics,
  BuyerRow,
  SupplierRow,
  RecentSession,
  WeeklyRateRow,
  BuyerSessionRow,
  AdminSupplierDetailLine,
  AdminSessionDetailLine,
  SupplierResponseTimeRow,
} from '@/app/actions/adminAnalytics';

/* ─── Props ──────────────────────────────────────────────────── */

interface AdminClientProps {
  analytics: ExpeditingAnalytics;
  userEmail: string;
  userName: string;
  pendingCount: number;
  titePendingCount: number;
  titeShipments: Shipment[] | null;
  procureGuardPendingCount: number;
  procureGuardAdminData: ProcureGuardAdminData | null;
  procureGuardAnalyticsData: ProcureGuardAnalyticsData | null;
  procureGuardAdminAnalyticsData: ProcureGuardAdminAnalyticsData | null;
  sourceGuidePendingCount?: number;
  initialTool?: string;
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

/* ─── Modal loading / empty shared ──────────────────────────── */

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

/* ─── RateBadge ──────────────────────────────────────────────── */

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

/* ─── SortIcon ───────────────────────────────────────────────── */

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

/* ─── Buyer Detail Modal ─────────────────────────────────────── */

function BuyerDetailModal({
  buyer,
  onClose,
  onSessionClick,
}: {
  buyer: BuyerRow;
  onClose: () => void;
  onSessionClick: (session: RecentSession) => void;
}) {
  const [rows, setRows]     = useState<BuyerSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuyerDetail(buyer.email)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [buyer.email]);

  const totalLines    = rows.reduce((s, r) => s + r.total_po_lines, 0);
  const totalSuppliers = rows.reduce((s, r) => s + r.total_suppliers, 0);
  const rates = rows.map(r => r.response_rate_pct).filter((v): v is number => v != null);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  function handleSessionClick(bsr: BuyerSessionRow) {
    const session: RecentSession = {
      session_ref:        bsr.session_ref,
      dispatched_at:      bsr.dispatched_at,
      dispatched_by:      buyer.email,
      display_name:       buyer.display_name,
      total_suppliers:    bsr.total_suppliers,
      total_po_lines:     bsr.total_po_lines,
      total_emails_sent:  bsr.total_emails_sent,
      suppliers_responded: bsr.suppliers_responded,
      response_rate_pct:  bsr.response_rate_pct,
      fully_closed:       bsr.fully_closed,
    };
    onClose();
    onSessionClick(session);
  }

  return (
    <DetailModal isOpen title={buyer.display_name ?? buyer.email} onClose={onClose}>
      {/* Sub-title + stats */}
      <div className="px-6 pt-1 pb-3 border-b border-slate-100">
        {buyer.job_title && (
          <p className="text-sm text-slate-500 mb-2">{buyer.job_title}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <StatPill label="Sessions" value={rows.length} />
          <StatPill label="Total Lines" value={totalLines.toLocaleString()} />
          <StatPill label="Total Suppliers" value={totalSuppliers.toLocaleString()} />
          <StatPill label="Avg Response Rate" value={avgRate != null ? `${avgRate}%` : '—'} />
        </div>
      </div>

      {/* Sessions list */}
      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && rows.length === 0 && <ModalEmpty message="No sessions found for this buyer." />}
        {!loading && rows.length > 0 && (
          <div className="rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
              </colgroup>
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
                {rows.map((r, idx) => (
                  <tr
                    key={r.session_ref}
                    onClick={() => handleSessionClick(r)}
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
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_suppliers}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_po_lines}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">{r.total_emails_sent}</td>
                    <td className="py-3 px-4 text-sm text-center font-medium text-slate-700 tabular-nums">
                      {r.suppliers_responded != null ? `${r.suppliers_responded} / ${r.total_suppliers}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-center"><RateBadge rate={r.response_rate_pct} /></td>
                    <td className="py-3 px-4 text-center">
                      {r.fully_closed === true ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">Closed</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">Open</span>
                      )}
                    </td>
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

/* ─── Admin Supplier Detail Modal ────────────────────────────── */

function AdminSupplierDetailModal({
  supplierName,
  onClose,
}: {
  supplierName: string;
  onClose: () => void;
}) {
  const [lines, setLines]       = useState<AdminSupplierDetailLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAdminSupplierDetail(supplierName)
      .then(data => {
        setLines(data);
        const pos = new Set(data.map(l => l.po_number));
        setExpanded(pos);
      })
      .finally(() => setLoading(false));
  }, [supplierName]);

  const groups = useMemo(() => {
    const map = new Map<string, AdminSupplierDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.po_number) ?? [];
      arr.push(l);
      map.set(l.po_number, arr);
    }
    return Array.from(map.entries()).map(([po, poLines]) => ({ po, lines: poLines }));
  }, [lines]);

  const totalLines     = lines.length;
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;

  function togglePO(po: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(po)) {
        next.delete(po);
      } else {
        next.add(po);
      }
      return next;
    });
  }

  const colHeaders = ['Line', 'Buyer', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];

  return (
    <DetailModal isOpen title={supplierName} onClose={onClose}>
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="POs" value={groups.length} />
      </div>

      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && <ModalEmpty message="No lines found for this supplier." />}

        {!loading && groups.map(({ po, lines: poLines }) => {
          const isOpen = expanded.has(po);
          const responded = poLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={po} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
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

              {isOpen && (
                <div>
                  <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 60 }} />
                      <col style={{ width: 120 }} />
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DetailModal>
  );
}

/* ─── Admin Session Detail Modal ─────────────────────────────── */

function AdminSessionDetailModal({
  session,
  onClose,
}: {
  session: RecentSession;
  onClose: () => void;
}) {
  const [lines, setLines]       = useState<AdminSessionDetailLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAdminSessionDetail(session.session_ref)
      .then(data => {
        setLines(data);
        const suppliers = new Set(data.map(l => l.supplier_name));
        setExpanded(suppliers);
      })
      .finally(() => setLoading(false));
  }, [session.session_ref]);

  const groups = useMemo(() => {
    const map = new Map<string, AdminSessionDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.supplier_name) ?? [];
      arr.push(l);
      map.set(l.supplier_name, arr);
    }
    return Array.from(map.entries()).map(([supplier, supplierLines]) => ({ supplier, lines: supplierLines }));
  }, [lines]);

  const totalLines     = lines.length;
  const totalResponded = lines.filter(l => l.workflow_state === 'Submitted').length;

  function toggleSupplier(supplier: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(supplier)) {
        next.delete(supplier);
      } else {
        next.add(supplier);
      }
      return next;
    });
  }

  const colHeaders = ['PO Number', 'Line', 'SAP MAT ID', 'Description', 'Open QTY', 'Value (USD)', 'Original Del. Date', 'New Del. Date', 'DS Status', 'Supplier Comments', 'Response'];

  return (
    <DetailModal isOpen title={`Session — ${formatSessionDate(session.dispatched_at)}`} onClose={onClose}>
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="Suppliers" value={groups.length} />
        <StatPill label="Emails Sent" value={session.total_emails_sent} />
        {(session.display_name ?? session.dispatched_by) && (
          <StatPill label="Dispatched By" value={session.display_name ?? session.dispatched_by} />
        )}
      </div>

      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && <ModalEmpty message="No lines found for this session." />}

        {!loading && groups.map(({ supplier, lines: supplierLines }) => {
          const isOpen = expanded.has(supplier);
          const responded = supplierLines.filter(l => l.workflow_state === 'Submitted').length;
          return (
            <div key={supplier} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
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

function BuyerTable({
  rows,
  onBuyerClick,
}: {
  rows: BuyerRow[];
  onBuyerClick: (buyer: BuyerRow) => void;
}) {
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
      <div style={{ height: 360, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
                  onClick={() => onBuyerClick(r)}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold whitespace-nowrap">
                    <span className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline">
                      {r.display_name ?? r.email ?? '—'}
                      <svg className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                    </span>
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

function SupplierTable({
  rows,
  onSupplierClick,
}: {
  rows: SupplierRow[];
  onSupplierClick: (name: string) => void;
}) {
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
      <div style={{ height: 420, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
    </div>
  );
}

/* ─── Recent Sessions Table ───────────────────────────────────── */

function SessionsTable({
  rows,
  onSessionClick,
}: {
  rows: RecentSession[];
  onSessionClick: (session: RecentSession) => void;
}) {
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
    linesExpedited: d.lines_expedited,
    linesResponded: d.lines_responded,
  }));

  const showLabels = chartData.length <= 12;

  return (
    <ChartCard title="Expediting vs Responses by Week">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              Number(value).toLocaleString(),
              name === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded',
            ]}
          />
          <Legend
            formatter={(value) =>
              value === 'linesExpedited' ? 'Lines Expedited' : 'Lines Responded'
            }
          />
          <Line
            type="monotone"
            dataKey="linesExpedited"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 4, fill: '#059669' }}
            activeDot={{ r: 6 }}
            name="linesExpedited"
          >
            {showLabels && (
              <LabelList
                dataKey="linesExpedited"
                position="top"
                formatter={(v: unknown) => Number(v).toLocaleString()}
                style={{ fontSize: 11, fill: '#059669', fontWeight: 600 }}
              />
            )}
          </Line>
          <Line
            type="monotone"
            dataKey="linesResponded"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
            name="linesResponded"
          >
            {showLabels && (
              <LabelList
                dataKey="linesResponded"
                position="bottom"
                formatter={(v: unknown) => Number(v).toLocaleString()}
                style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }}
              />
            )}
          </Line>
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
        <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 10 }}>
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
          <Bar dataKey="lines" fill="#307c4c" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="lines"
              position="top"
              formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : String(v)}
              style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─── Chart 2 — Top 10 Suppliers by Response Rate ────────────── */

function SupplierBarChart({ data }: { data: SupplierRow[] }) {
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
    <ChartCard title="Top 10 Suppliers by Response Rate">
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

/* ─── Chart — Avg Response Time by Supplier ──────────────────── */

function AvgResponseTimeBarChart({ data }: { data: SupplierResponseTimeRow[] }) {
  const chartData = data.map(r => ({
    supplierName:  String(r.supplier_name || '').slice(0, 28),
    avgDays:       r.avg_days_to_respond,
    responsesCount: r.responses_count,
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
              margin={{ top: 10, right: 40, bottom: 10, left: 10 }}
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
              <Tooltip
                formatter={(v: unknown, _: unknown, props: { payload?: { responsesCount?: number } }) =>
                  [`${v} days avg (${props.payload?.responsesCount ?? 0} responses)`, 'Response Time']
                }
              />
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

/* ─── Analytics Section ───────────────────────────────────────── */

function AnalyticsSection({
  analytics,
  onBuyerClick,
  onSupplierClick,
  onSessionClick,
}: {
  analytics: ExpeditingAnalytics;
  onBuyerClick: (buyer: BuyerRow) => void;
  onSupplierClick: (name: string) => void;
  onSessionClick: (session: RecentSession) => void;
}) {
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

      {/* Row 2 — Charts */}
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
        <BuyerTable rows={analytics.buyerBreakdown} onBuyerClick={onBuyerClick} />
      </div>

      {/* Row 4 — Supplier Performance charts */}
      <div>
        <SectionTitle>Supplier Performance</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SupplierBarChart data={analytics.supplierBreakdown} />
          <AvgResponseTimeBarChart data={analytics.supplierResponseTime} />
        </div>
      </div>

      {/* Row 5 — Supplier Response Rates table */}
      <div>
        <SectionTitle>Supplier Response Rates</SectionTitle>
        <SupplierTable rows={analytics.supplierBreakdown} onSupplierClick={onSupplierClick} />
      </div>

      {/* Row 6 — Recent Sessions */}
      <div>
        <SectionTitle>Recent Expediting Sessions</SectionTitle>
        <SessionsTable rows={analytics.recentSessions} onSessionClick={onSessionClick} />
      </div>
    </div>
  );
}

/* ─── Main AdminClient ────────────────────────────────────────── */

export default function AdminClient({
  analytics: initialAnalytics,
  userEmail,
  userName,
  pendingCount,
  titePendingCount,
  titeShipments,
  procureGuardPendingCount,
  procureGuardAdminData,
  procureGuardAnalyticsData,
  procureGuardAdminAnalyticsData,
  sourceGuidePendingCount = 0,
  initialTool = 'po-expediting',
}: AdminClientProps) {
  const [selectedTool, setSelectedTool]       = useState<string>(initialTool);
  const [liveAnalytics, setLiveAnalytics]     = useState<ExpeditingAnalytics>(initialAnalytics);
  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [lastRefreshed, setLastRefreshed]     = useState<Date>(() => new Date());
  const [livePendingCount, setLivePendingCount]       = useState(pendingCount);
  const [liveTitePendingCount, setLiveTitePendingCount] = useState(titePendingCount);
  const [liveProcureGuardPendingCount, setLiveProcureGuardPendingCount] = useState(procureGuardPendingCount);
  const [liveSourceGuidePendingCount, setLiveSourceGuidePendingCount] = useState(sourceGuidePendingCount);

  // Modal state
  const [buyerModal, setBuyerModal]             = useState<BuyerRow | null>(null);
  const [supplierModalName, setSupplierModalName] = useState<string | null>(null);
  const [sessionModal, setSessionModal]           = useState<RecentSession | null>(null);

  // Dynamic document title per tab
  useEffect(() => {
    const titles: Record<string, string> = {
      'po-expediting':          'Analytics — PO Expediting | Admin | SC Agents',
      'access-approvals':       'Access Approvals | Admin | SC Agents',
      'tite-migration':           'Migration — TI-TE | Admin | SC Agents',
      'tite-default-notifiers':  'Default Notifiers — TI-TE | Admin | SC Agents',
      'tite-analytics':          'Analytics — TI-TE | Admin | SC Agents',
      'tite-access-approvals':   'TI-TE Access Approvals | Admin | SC Agents',
      'procureguard-admin':     'ProcureGuard Admin | Admin | SC Agents',
      'procureguard-analytics': 'ProcureGuard Analytics | Admin | SC Agents',
      'procureguard-usage':     'ProcureGuard Usage Analytics | Admin | SC Agents',
      'procureguard-access':    'ProcureGuard Access Approvals | Admin | SC Agents',
      'sourceguide-guides':     'Source Guides — SourceGuide | Admin | SC Agents',
      'sourceguide-champions':  'Champions — SourceGuide | Admin | SC Agents',
      'sourceguide-analytics':  'Analytics — SourceGuide | Admin | SC Agents',
      'sourceguide-access':     'SourceGuide Access Approvals | Admin | SC Agents',
    };
    document.title = titles[selectedTool] ?? 'Admin — SC Agents';
  }, [selectedTool]);

  const fetchAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getExpeditingAnalytics();
      setLiveAnalytics(data);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
          {/* TOOLS section label */}
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tools
          </p>

          {/* PO Expediting group label */}
          <div style={{ padding: '6px 12px 2px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            PO Expediting
          </div>

          {/* Analytics sub-item */}
          <button
            onClick={() => setSelectedTool('po-expediting')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'po-expediting' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'po-expediting' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'po-expediting' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Analytics
          </button>

          {/* Access Approvals sub-item */}
          <button
            onClick={() => setSelectedTool('access-approvals')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'access-approvals' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'access-approvals' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'access-approvals' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            <span>Access Approvals</span>
            {livePendingCount > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}>
                {livePendingCount}
              </span>
            )}
          </button>

          <div style={{ margin: '8px 0' }} />

          {/* TI-TE group label */}
          <div style={{ padding: '6px 12px 2px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            TI-TE
          </div>

          {/* TI-TE Migration — active */}
          <button
            onClick={() => setSelectedTool('tite-migration')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'tite-migration' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'tite-migration' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'tite-migration' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Migration
          </button>

          {/* TI-TE Default Notifiers */}
          <button
            onClick={() => setSelectedTool('tite-default-notifiers')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'tite-default-notifiers' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'tite-default-notifiers' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'tite-default-notifiers' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Default Notifiers
          </button>

          {/* TI-TE Analytics */}
          <button
            onClick={() => setSelectedTool('tite-analytics')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'tite-analytics' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'tite-analytics' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'tite-analytics' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Analytics
          </button>

          {/* TI-TE Access Approvals — active */}
          <button
            onClick={() => setSelectedTool('tite-access-approvals')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'tite-access-approvals' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'tite-access-approvals' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'tite-access-approvals' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            <span>Access Approvals</span>
            {liveTitePendingCount > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}>
                {liveTitePendingCount}
              </span>
            )}
          </button>

          <div style={{ margin: '8px 0' }} />

          <div style={{ padding: '6px 12px 2px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            ProcureGuard
          </div>

          <button
            onClick={() => setSelectedTool('procureguard-admin')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'procureguard-admin' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'procureguard-admin' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'procureguard-admin' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Admin Panel
          </button>

          <button
            onClick={() => setSelectedTool('procureguard-analytics')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'procureguard-analytics' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'procureguard-analytics' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'procureguard-analytics' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Payment Analytics
          </button>

          <button
            onClick={() => setSelectedTool('procureguard-usage')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'procureguard-usage' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'procureguard-usage' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'procureguard-usage' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Usage Analytics
          </button>

          <button
            onClick={() => setSelectedTool('procureguard-access')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'procureguard-access' ? '3px solid #059669' : '3px solid transparent',
              background: selectedTool === 'procureguard-access' ? '#f0fdf4' : 'transparent',
              color: selectedTool === 'procureguard-access' ? '#059669' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            <span>Access Approvals</span>
            {liveProcureGuardPendingCount > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
              }}>
                {liveProcureGuardPendingCount}
              </span>
            )}
          </button>

          <div style={{ margin: '8px 0' }} />

          {/* SourceGuide group label */}
          <div style={{ padding: '6px 12px 2px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            SourceGuide
          </div>

          <button
            onClick={() => setSelectedTool('sourceguide-guides')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'sourceguide-guides' ? '3px solid #2A7E4F' : '3px solid transparent',
              background: selectedTool === 'sourceguide-guides' ? '#eaf4ef' : 'transparent',
              color: selectedTool === 'sourceguide-guides' ? '#1f5d3a' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Source Guides
          </button>

          <button
            onClick={() => setSelectedTool('sourceguide-champions')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'sourceguide-champions' ? '3px solid #2A7E4F' : '3px solid transparent',
              background: selectedTool === 'sourceguide-champions' ? '#eaf4ef' : 'transparent',
              color: selectedTool === 'sourceguide-champions' ? '#1f5d3a' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Champions
          </button>

          <button
            onClick={() => setSelectedTool('sourceguide-analytics')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'sourceguide-analytics' ? '3px solid #2A7E4F' : '3px solid transparent',
              background: selectedTool === 'sourceguide-analytics' ? '#eaf4ef' : 'transparent',
              color: selectedTool === 'sourceguide-analytics' ? '#1f5d3a' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            Analytics
          </button>

          <button
            onClick={() => setSelectedTool('sourceguide-access')}
            style={{
              ...navItemBase,
              paddingLeft: 24,
              borderLeft: selectedTool === 'sourceguide-access' ? '3px solid #2A7E4F' : '3px solid transparent',
              background: selectedTool === 'sourceguide-access' ? '#eaf4ef' : 'transparent',
              color: selectedTool === 'sourceguide-access' ? '#1f5d3a' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            <span>Access Approvals</span>
            {liveSourceGuidePendingCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9999,
                fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
              }}>
                {liveSourceGuidePendingCount}
              </span>
            )}
          </button>

          <div style={{ margin: '8px 0' }} />

          {/* Coming-soon tools */}
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
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto" style={{ padding: 32 }}>
          {selectedTool === 'access-approvals' && (
            <AccessApprovalsClient onPendingCountChange={setLivePendingCount} />
          )}
          {selectedTool === 'tite-migration' && (
            <TiteMigrationClient userEmail={userEmail} />
          )}
          {selectedTool === 'tite-default-notifiers' && (
            <TiteDefaultNotifiersClient userEmail={userEmail} />
          )}
          {selectedTool === 'tite-access-approvals' && (
            <TiteAccessApprovalsClient
              userEmail={userEmail}
              onPendingCountChange={setLiveTitePendingCount}
            />
          )}
          {selectedTool === 'tite-analytics' && (
            <TiteAnalyticsClient shipments={titeShipments} />
          )}
          {selectedTool === 'procureguard-admin' && (
            <ProcureGuardAdminPanelClient data={procureGuardAdminData} embedded />
          )}
          {selectedTool === 'procureguard-analytics' && (
            <ProcureGuardAnalyticsClient data={procureGuardAnalyticsData} embedded />
          )}
          {selectedTool === 'procureguard-usage' && (
            <ProcureGuardAdminAnalyticsClient data={procureGuardAdminAnalyticsData} embedded />
          )}
          {selectedTool === 'procureguard-access' && (
            <ProcureGuardAccessApprovalsClient
              userEmail={userEmail}
              onPendingCountChange={setLiveProcureGuardPendingCount}
            />
          )}
          {selectedTool === 'sourceguide-guides' && (
            <SourceGuideGuidesClient />
          )}
          {selectedTool === 'sourceguide-champions' && (
            <SourceGuideChampionsClient />
          )}
          {selectedTool === 'sourceguide-analytics' && (
            <SourceGuideAnalyticsClient />
          )}
          {selectedTool === 'sourceguide-access' && (
            <SourceGuideAccessApprovalsClient
              userEmail={userEmail}
              onPendingCountChange={setLiveSourceGuidePendingCount}
            />
          )}
          {selectedTool === 'po-expediting' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">PO Expediting Analytics</h2>
                  <p className="text-[12px] text-gray-400 mt-0.5">
                    Last updated: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={fetchAnalytics}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                >
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              <AnalyticsSection
                analytics={liveAnalytics}
                onBuyerClick={setBuyerModal}
                onSupplierClick={setSupplierModalName}
                onSessionClick={setSessionModal}
              />
            </>
          )}
        </main>

      </div>

      {/* ── Modals ── */}
      {buyerModal && (
        <BuyerDetailModal
          buyer={buyerModal}
          onClose={() => setBuyerModal(null)}
          onSessionClick={setSessionModal}
        />
      )}
      {supplierModalName && (
        <AdminSupplierDetailModal
          supplierName={supplierModalName}
          onClose={() => setSupplierModalName(null)}
        />
      )}
      {sessionModal && (
        <AdminSessionDetailModal
          session={sessionModal}
          onClose={() => setSessionModal(null)}
        />
      )}
    </div>
  );
}
