'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import {
  ALERT_PILL, ALERT_DOT, BUCKET_HEX, ALERT_LABEL,
  fmtDate, usdFmt, calcDays, getStatusBadge,
} from '@/lib/tite-utils';
import type { Shipment, ShipmentStats } from '@/types/tite';
import type { RecentActivityRow } from '@/app/actions/tite';

/* ─── DB error / empty states ────────────────────────────────── */

function DbError() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Please contact your administrator.</p>
      </div>
    </div>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#006B0C18' }}>
          <svg className="w-6 h-6" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">No shipments found</p>
        <p className="text-sm text-slate-500 mb-5">Add your first TI-TE shipment to get started.</p>
        <button
          onClick={() => router.push('/ti-te/shipments/new')}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#006B0C' }}
        >
          Add Shipment
        </button>
      </div>
    </div>
  );
}

/* ─── Compliance Donut ───────────────────────────────────────── */

function ComplianceDonut({ buckets, total }: { buckets: { key: string; label: string; count: number }[]; total: number }) {
  const size = 160, r = 60, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex justify-center relative">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} stroke="#e2e8f0" strokeWidth={14} fill="none" />
        {buckets.map(b => {
          if (b.count === 0) return null;
          const len = C * (b.count / (total || 1));
          const el = (
            <circle key={b.key} cx={cx} cy={cy} r={r}
              stroke={BUCKET_HEX[b.key] || '#94a3b8'}
              strokeWidth={14} fill="none"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-slate-900">{total}</span>
        <span className="text-[11px] text-slate-500">open</span>
      </div>
    </div>
  );
}

/* ─── Activity helpers ───────────────────────────────────────── */

function activityDot(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('created'))                         return 'bg-green-500';
  if (a.includes('status'))                          return 'bg-blue-500';
  if (a.includes('document') && a.includes('upload')) return 'bg-purple-500';
  if (a.includes('document') && a.includes('delet')) return 'bg-red-500';
  return 'bg-slate-400';
}

function timeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days  = Math.floor(diffMs / 86400000);
  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

/* ─── Dashboard ──────────────────────────────────────────────── */

export default function TiteDashboardClient({
  stats,
  shipments,
  recentActivity,
}: {
  stats: ShipmentStats | null;
  shipments: Shipment[] | null;
  recentActivity: RecentActivityRow[];
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  if (shipments === null || stats === null) return <DbError />;
  if (shipments.length === 0) return <EmptyState />;

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const open = shipments.filter(s => s.status !== 'Closed' && s.status !== 'Closed - Refund Recovered');

  const activeCount = open.length;
  const urgentCount = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  const buckets = [
    { key: 'overdue', label: 'Overdue',    count: open.filter(s => s.alert_level === 'overdue').length },
    { key: 'urgent',  label: '≤ 7 days',   count: open.filter(s => s.alert_level === 'urgent').length },
    { key: 'action',  label: '8–14 days',  count: open.filter(s => s.alert_level === 'action').length },
    { key: 'plan',    label: '15–30 days', count: open.filter(s => s.alert_level === 'plan').length },
    { key: 'info',    label: '31–60 days', count: open.filter(s => s.alert_level === 'info').length },
    { key: 'ok',      label: '60+ days',   count: open.filter(s => s.alert_level === 'ok').length },
  ];

  const segMap: Record<string, { count: number; deposit: number }> = {};
  open.forEach(s => {
    const seg = s.segment || 'Unknown';
    segMap[seg] = segMap[seg] || { count: 0, deposit: 0 };
    segMap[seg].count++;
    segMap[seg].deposit += Number(s.deposit_usd) || 0;
  });
  const segments = Object.entries(segMap).sort((a, b) => b[1].count - a[1].count);

  const actionQueue = shipments
    .filter(s =>
      ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level) &&
      s.status !== 'Closed' &&
      s.status !== 'Closed - Refund Recovered',
    )
    .slice(0, 8);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeCount={activeCount} urgentCount={urgentCount} />

      {/* Top bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Temporary Import / Export</span>
        <div className="flex-1" />
        <span className="text-xs text-slate-400 hidden sm:block">{today}</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 pb-16 pt-6">

        {/* Page header */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Dashboard</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compliance Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              {today} · {activeCount} active temporary movements · {stats.overdue_count + stats.urgent_count} need action this week
            </p>
          </div>
          <button
            onClick={() => router.push('/ti-te/shipments/new')}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#006B0C' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New shipment
          </button>
        </div>

        {/* Overdue banner */}
        {stats.overdue_count > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-800">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
            <span className="flex-1">
              <strong>{stats.overdue_count} shipment{stats.overdue_count > 1 ? 's are' : ' is'} past re-export deadline.</strong> Penalty risk — escalate to legal & customs immediately.
            </span>
            <button onClick={() => router.push('/ti-te/alerts')} className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 transition-colors">
              Review
            </button>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active movements',      value: stats.active_count,                      sub: `${stats.import_count} imports · ${stats.export_count} exports`, accent: '#006B0C',  color: '#1e293b' },
            { label: 'Overdue',               value: stats.overdue_count,                     sub: 'Past expiry, action required',                                   accent: '#ef4444',  color: '#ef4444' },
            { label: 'Due this week',         value: stats.urgent_count,                      sub: '≤ 7 days to expiry',                                             accent: '#f97316',  color: '#f97316' },
            { label: 'Customs deposit at risk', value: usdFmt(stats.total_deposit_usd),       sub: 'Open and extended shipments only',                                accent: '#006B0C',  color: '#1e293b' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 inset-y-0 w-[3px] rounded-r-sm" style={{ background: kpi.accent }} />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{kpi.label}</p>
              <p className="text-3xl font-bold tabular-nums mt-1 tracking-tight" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Action queue + compliance donut */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Action queue</h2>
              <span className="text-xs text-slate-400">Sorted by days remaining</span>
              <div className="flex-1" />
              <button onClick={() => router.push('/ti-te/shipments')} className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors">
                View all
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[320px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
                    {['Shipment', 'Route', 'Movement', 'Deposit', 'Expiry', 'Status'].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-4 py-2.5 whitespace-nowrap bg-slate-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionQueue.map(s => {
                    const days = calcDays(s);
                    return (
                      <tr key={s.id} onClick={() => router.push(`/ti-te/shipments/${s.id}`)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">#{String(s.id).padStart(3, '0')} · {s.segment}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{(s.description || '').slice(0, 48)}{(s.description || '').length > 48 ? '…' : ''}</div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-sm text-slate-700">
                            <span>{s.from_country || '—'}</span>
                            <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                            <span>{s.to_country || '—'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${(s.movement_type || '').toLowerCase().includes('export') ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-cyan-100 text-cyan-700 border border-cyan-200'}`}>
                            {(s.movement_type || '').toLowerCase().includes('export') ? '↗' : '↘'} {s.movement_type || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] whitespace-nowrap">
                          {usdFmt(s.deposit_usd)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="text-sm">{fmtDate(s.extended_date || s.expiry_date)}</div>
                          <div className="text-[11px] text-slate-400">
                            {days === null ? '—' : days < 0 ? `${-days}d overdue` : `${days}d left`}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {(() => { const sb = getStatusBadge(s.status); return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${sb.className}`}>
                              {sb.label}
                            </span>
                          ); })()}
                        </td>
                      </tr>
                    );
                  })}
                  {actionQueue.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No urgent items.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Compliance health</h2>
            </div>
            <div className="p-5">
              <ComplianceDonut buckets={buckets} total={activeCount} />
              <div className="mt-5 space-y-2">
                {buckets.map(b => (
                  <div key={b.key} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: BUCKET_HEX[b.key] }} />
                    <span className="text-slate-600">{b.label}</span>
                    <div className="flex-1" />
                    <span className="font-semibold text-slate-900 tabular-nums">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* By segment */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">By business segment</h2>
            </div>
            <div className="p-5 space-y-4">
              {segments.length === 0 && <p className="text-sm text-slate-400">No segment data.</p>}
              {segments.map(([seg, info]) => {
                const pct = stats.total_deposit_usd > 0 ? (info.deposit / stats.total_deposit_usd) * 100 : 0;
                return (
                  <div key={seg}>
                    <div className="flex items-center text-[12.5px] mb-1.5">
                      <span className="font-semibold text-slate-800">{seg}</span>
                      <span className="text-slate-400 text-[11.5px] ml-2">· {info.count} active</span>
                      <div className="flex-1" />
                      <span className="tabular-nums text-slate-700">{usdFmt(info.deposit)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#006B0C' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Recent activity</h2>
              <span className="text-[11.5px] text-slate-400">Last 7 days</span>
            </div>
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400">No activity in the last 7 days</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50 overflow-y-auto max-h-[320px]">
                {recentActivity.map(row => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/ti-te/shipments/${row.shipment_id}`)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activityDot(row.action)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] text-slate-700">
                          {row.action}{' '}
                          {row.reference_number && (
                            <span className="font-semibold text-slate-900">{row.reference_number}</span>
                          )}
                        </p>
                        {row.description && (
                          <p className="text-[11.5px] text-slate-400 truncate">{row.description}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                        {timeAgo(row.performed_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
