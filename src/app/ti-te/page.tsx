'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import {
  SHIPMENTS, TODAY, fmtDate, sarFmt, usdFmt, ALERT_LABEL,
  type Shipment, type AlertLevel,
} from '@/data/ti-te-mock-data';

/* ─── Alert styling ──────────────────────────────────────────── */

const ALERT_PILL: Record<AlertLevel, string> = {
  overdue: 'bg-red-100 text-red-700 border border-red-200',
  urgent:  'bg-orange-100 text-orange-700 border border-orange-200',
  action:  'bg-amber-100 text-amber-700 border border-amber-200',
  plan:    'bg-blue-100 text-blue-700 border border-blue-200',
  info:    'bg-cyan-100 text-cyan-700 border border-cyan-200',
  ok:      'bg-green-100 text-green-700 border border-green-200',
  closed:  'bg-slate-100 text-slate-500 border border-slate-200',
};

const ALERT_DOT: Record<AlertLevel, string> = {
  overdue: 'bg-red-500',
  urgent:  'bg-orange-500',
  action:  'bg-amber-500',
  plan:    'bg-blue-500',
  info:    'bg-cyan-500',
  ok:      'bg-green-600',
  closed:  'bg-slate-400',
};

const BUCKET_HEX: Record<AlertLevel, string> = {
  overdue: '#ef4444',
  urgent:  '#f97316',
  action:  '#f59e0b',
  plan:    '#3b82f6',
  info:    '#06b6d4',
  ok:      '#059669',
  closed:  '#94a3b8',
};

/* ─── Small reusables ────────────────────────────────────────── */

function StatusPill({ alert }: { alert: AlertLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${ALERT_PILL[alert]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ALERT_DOT[alert]}`} />
      {ALERT_LABEL[alert]}
    </span>
  );
}

function MovementPill({ movement }: { movement: 'Import' | 'Export' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${movement === 'Export' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-cyan-100 text-cyan-700 border border-cyan-200'}`}>
      {movement === 'Export' ? '↗' : '↘'} {movement}
    </span>
  );
}

function FlowRoute({ from, to }: { from: string; to: string }) {
  return (
    <span className="flex items-center gap-1 text-sm text-slate-700">
      <span>{from || '—'}</span>
      <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      <span>{to || '—'}</span>
    </span>
  );
}

/* ─── Compliance Donut ───────────────────────────────────────── */

function ComplianceDonut({
  buckets,
  total,
}: {
  buckets: { key: AlertLevel; label: string; count: number }[];
  total: number;
}) {
  const size = 160, r = 60, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex justify-center relative">
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle cx={cx} cy={cy} r={r} stroke="#e2e8f0" strokeWidth={14} fill="none" />
        {buckets.map(b => {
          if (b.count === 0) return null;
          const frac = b.count / (total || 1);
          const len = C * frac;
          const el = (
            <circle
              key={b.key}
              cx={cx}
              cy={cy}
              r={r}
              stroke={BUCKET_HEX[b.key]}
              strokeWidth={14}
              fill="none"
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

/* ─── Dashboard ──────────────────────────────────────────────── */

export default function TiteDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const open = SHIPMENTS.filter(s => s.status !== 'Closed');
  const overdue = open.filter(s => s.alert === 'overdue');
  const urgent = open.filter(s => s.alert === 'urgent');
  const totalDeposit = open.reduce((a, s) => a + (s.depositSAR || 0), 0);
  const totalUSD = totalDeposit / 3.75;

  const buckets: { key: AlertLevel; label: string; count: number }[] = [
    { key: 'overdue', label: 'Overdue',    count: overdue.length },
    { key: 'urgent',  label: '≤ 7 days',   count: urgent.length },
    { key: 'action',  label: '8–14 days',  count: open.filter(s => s.alert === 'action').length },
    { key: 'plan',    label: '15–30 days', count: open.filter(s => s.alert === 'plan').length },
    { key: 'info',    label: '31–60 days', count: open.filter(s => s.alert === 'info').length },
    { key: 'ok',      label: '60+ days',   count: open.filter(s => s.alert === 'ok').length },
  ];

  const segMap: Record<string, { count: number; deposit: number }> = {};
  open.forEach(s => {
    segMap[s.segment] = segMap[s.segment] || { count: 0, deposit: 0 };
    segMap[s.segment].count++;
    segMap[s.segment].deposit += s.depositSAR || 0;
  });
  const segments = Object.entries(segMap).sort((a, b) => b[1].count - a[1].count);

  const actionQueue = open
    .filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert))
    .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
    .slice(0, 8);

  const recentActivity = [
    { kind: 'document', who: 'Khalid Reza',   text: 'Uploaded extension approval for #043 (TRS rental)',                  when: '2 hours ago' },
    { kind: 'alert',    who: 'System',         text: 'Re-export deadline passed for #044 (Sand king — Algeria)',           when: 'Yesterday · 06:00' },
    { kind: 'extension',who: 'Customs Authority',text: 'Extension granted for #016 (Motors — UAE), new expiry 8 Mar 2026', when: '2 days ago' },
    { kind: 'closed',   who: 'Salem Khoury',   text: 'Re-export confirmed for #027 (SLK Unit 59)',                         when: '3 days ago' },
    { kind: 'created',  who: 'Layla Hassan',   text: 'Logged new shipment #047 — Pressure/Temp logging suite',            when: '5 days ago' },
  ];

  const timelineDot: Record<string, string> = {
    created:   'border-[#006B0C] bg-white',
    document:  'border-blue-500 bg-white',
    system:    'border-slate-400 bg-white',
    extension: 'border-amber-500 bg-white',
    alert:     'border-red-500 bg-red-500',
    closed:    'border-green-600 bg-green-600',
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: '#006B0C' }}
        >
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Temporary Import / Export</span>
        <div className="flex-1" />
        <span className="text-xs text-slate-400 hidden sm:block">{fmtDate(TODAY)}</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 pb-16 pt-6">

        {/* Page header */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Dashboard</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compliance Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              {fmtDate(TODAY)} · {open.length} active temporary movements · {overdue.length + urgent.length} need action this week
            </p>
          </div>
          <button
            onClick={() => router.push('/ti-te/shipments')}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: '#006B0C' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New shipment
          </button>
        </div>

        {/* Overdue banner */}
        {overdue.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-800">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <span className="flex-1">
              <strong>{overdue.length} shipment{overdue.length > 1 ? 's are' : ' is'} past re-export deadline.</strong> Penalty risk — escalate to legal & customs immediately.
            </span>
            <button
              onClick={() => router.push('/ti-te/alerts')}
              className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
            >
              Review
            </button>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Active movements',
              value: open.length,
              sub: `${open.filter(s => s.movement === 'Import').length} imports · ${open.filter(s => s.movement === 'Export').length} exports`,
              accent: '#006B0C',
            },
            {
              label: 'Overdue',
              value: overdue.length,
              sub: 'Past expiry, action required',
              accent: '#ef4444',
            },
            {
              label: 'Due this week',
              value: urgent.length,
              sub: '≤ 7 days to expiry',
              accent: '#f97316',
            },
            {
              label: 'Customs deposit at risk',
              value: sarFmt(totalDeposit),
              sub: `≈ ${usdFmt(totalUSD)} USD`,
              accent: '#006B0C',
              big: false,
            },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 inset-y-0 w-[3px] rounded-r-sm" style={{ background: kpi.accent }} />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{kpi.label}</p>
              <p
                className="text-3xl font-bold tabular-nums mt-1 tracking-tight"
                style={{ color: i === 1 ? '#ef4444' : i === 2 ? '#f97316' : '#1e293b' }}
              >
                {kpi.value}
              </p>
              <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Action queue + compliance donut */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 mb-5">
          {/* Action queue */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Action queue</h2>
              <span className="text-xs text-slate-400">Sorted by days remaining</span>
              <div className="flex-1" />
              <button
                onClick={() => router.push('/ti-te/shipments')}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
              >
                View all
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Shipment', 'Route', 'Movement', 'Deposit', 'Expiry', 'Status'].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-4 py-2.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionQueue.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/ti-te/shipments/${s.id}`)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">#{String(s.id).padStart(3, '0')} · {s.segment}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{s.description.slice(0, 48)}{s.description.length > 48 ? '…' : ''}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><FlowRoute from={s.from} to={s.to} /></td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><MovementPill movement={s.movement} /></td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] whitespace-nowrap">
                        {s.depositSAR ? sarFmt(s.depositSAR) : '—'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-sm">{fmtDate(s.extended || s.expiry)}</div>
                        <div className="text-[11px] text-slate-400">
                          {(s.daysToExpiry ?? 0) < 0
                            ? `${-(s.daysToExpiry ?? 0)}d overdue`
                            : `${s.daysToExpiry}d left`}
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><StatusPill alert={s.alert} /></td>
                    </tr>
                  ))}
                  {actionQueue.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No urgent items.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Compliance health */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Compliance health</h2>
            </div>
            <div className="p-5">
              <ComplianceDonut buckets={buckets} total={open.length} />
              <div className="mt-5 space-y-2">
                {buckets.map(b => (
                  <div key={b.key} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: BUCKET_HEX[b.key] }}
                    />
                    <span className="text-slate-600">{b.label}</span>
                    <div className="flex-1" />
                    <span className="font-semibold text-slate-900 tabular-nums">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* By segment + recent activity */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* By segment */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">By business segment</h2>
            </div>
            <div className="p-5 space-y-4">
              {segments.map(([seg, info]) => {
                const pct = totalDeposit > 0 ? (info.deposit / totalDeposit) * 100 : 0;
                return (
                  <div key={seg}>
                    <div className="flex items-center text-[12.5px] mb-1.5">
                      <span className="font-semibold text-slate-800">{seg}</span>
                      <span className="text-slate-400 text-[11.5px] ml-2">· {info.count} active</span>
                      <div className="flex-1" />
                      <span className="tabular-nums text-slate-700">{sarFmt(info.deposit)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: '#006B0C' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Recent activity</h2>
              <span className="text-[11.5px] text-slate-400">Last 7 days</span>
            </div>
            <div className="p-5">
              <div className="relative pl-5">
                <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-slate-200" />
                {recentActivity.map((ev, i) => (
                  <div key={i} className="relative pb-4">
                    <span
                      className={`absolute -left-[18px] top-[3px] w-3 h-3 rounded-full border-2 ${timelineDot[ev.kind] || timelineDot.system}`}
                    />
                    <p className="text-[11.5px] text-slate-400">{ev.who}</p>
                    <p className="text-[13px] text-slate-800 mt-0.5">{ev.text}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{ev.when}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
