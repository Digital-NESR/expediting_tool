'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import {
  SHIPMENTS, fmtDate, sarFmt,
  ALERT_LABEL, type AlertLevel,
} from '@/data/ti-te-mock-data';

const BUCKET_COLOR: Record<AlertLevel, string> = {
  overdue: '#ef4444',
  urgent:  '#f97316',
  action:  '#f59e0b',
  plan:    '#3b82f6',
  info:    '#06b6d4',
  ok:      '#059669',
  closed:  '#94a3b8',
};

const ALERT_PILL: Record<AlertLevel, string> = {
  overdue: 'bg-red-100 text-red-700 border border-red-200',
  urgent:  'bg-orange-100 text-orange-700 border border-orange-200',
  action:  'bg-amber-100 text-amber-700 border border-amber-200',
  plan:    'bg-blue-100 text-blue-700 border border-blue-200',
  info:    'bg-cyan-100 text-cyan-700 border border-cyan-200',
  ok:      'bg-green-100 text-green-700 border border-green-200',
  closed:  'bg-slate-100 text-slate-500 border border-slate-200',
};

const GROUPS = [
  { key: 'overdue' as AlertLevel, label: 'Overdue — escalate now',         desc: 'Past re-export deadline. Penalty risk.' },
  { key: 'urgent'  as AlertLevel, label: 'Urgent — within 7 days',         desc: 'Submit extension or initiate re-export immediately.' },
  { key: 'action'  as AlertLevel, label: 'Action required — within 14 days', desc: 'Begin extension paperwork or schedule re-export.' },
  { key: 'plan'    as AlertLevel, label: 'Plan ahead — within 30 days',    desc: 'Confirm re-export plan with operations.' },
  { key: 'info'    as AlertLevel, label: 'Monitor — within 60 days',       desc: 'Informational. No action yet.' },
];

function FlowArrow({ from, to }: { from: string; to: string }) {
  return (
    <span className="flex items-center gap-1 text-[12.5px] text-slate-700 whitespace-nowrap">
      <span>{from || '—'}</span>
      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      <span>{to || '—'}</span>
    </span>
  );
}

export default function AlertsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const open = SHIPMENTS.filter(s => s.status !== 'Closed');

  const groups = GROUPS.map(g => ({
    ...g,
    items: open.filter(s => s.alert === g.key).sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0)),
  }));

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Alerts & Notifications</span>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pb-16 pt-6">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Alerts</p>
            <h1 className="text-2xl font-bold tracking-tight">Alerts &amp; notifications</h1>
            <p className="text-sm text-slate-500 mt-1">
              Automated rollup based on effective expiry dates. Email + Teams notifications fire automatically.
            </p>
          </div>
          <button className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Notification rules
          </button>
        </div>

        {/* Alert groups */}
        <div className="flex flex-col gap-4">
          {groups.map(g => (
            <div key={g.key} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: BUCKET_COLOR[g.key] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">{g.label}</div>
                  <div className="text-[12px] text-slate-400">{g.desc}</div>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                  {g.items.length} shipment{g.items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Rows */}
              {g.items.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {g.items.map(s => (
                      <tr
                        key={s.id}
                        onClick={() => router.push(`/ti-te/shipments/${s.id}`)}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400 w-16">
                          #{String(s.id).padStart(3, '0')}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900 text-[13px]">{s.description.slice(0, 50)}{s.description.length > 50 ? '…' : ''}</div>
                          <div className="text-[11.5px] text-slate-400">{s.segment} · Owner: {s.owner}</div>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <FlowArrow from={s.from} to={s.to} />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-semibold text-[12.5px]" style={{ color: BUCKET_COLOR[g.key] }}>
                            {s.daysToExpiry < 0 ? `${-s.daysToExpiry}d overdue` : `${s.daysToExpiry}d left`}
                          </div>
                          <div className="text-[11px] text-slate-400">{fmtDate(s.extended || s.expiry)}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[12px] whitespace-nowrap text-slate-600 hidden md:table-cell">
                          {sarFmt(s.depositSAR)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap ${ALERT_PILL[g.key]}`}>
                            {ALERT_LABEL[g.key]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-4 text-[12.5px] text-slate-400">No shipments in this bucket.</div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
