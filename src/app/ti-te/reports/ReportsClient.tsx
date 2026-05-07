'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import { sarFmt } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

const REPORTS = [
  { title: 'Monthly customs summary',       desc: 'All open & closed temporary movements with Bayan, deposit, expiry, status',          owner: 'Customs' },
  { title: 'Finance — duty exposure roll-up', desc: 'Aggregated SAR/USD deposit by segment, country, and aging bucket',                 owner: 'Finance' },
  { title: 'Legal — penalty risk register', desc: 'Overdue & at-risk shipments with extension status and timeline',                     owner: 'Legal' },
  { title: 'Re-export confirmations',       desc: 'Closed shipments with re-export documentation and refund status',                    owner: 'Customs / Finance' },
  { title: 'Extensions log',                desc: 'All extensions requested and granted, with original vs effective expiry',            owner: 'Customs' },
  { title: 'Audit trail — full history',    desc: 'Append-only change log per shipment, all events and users',                         owner: 'All' },
];

export default function ReportsClient({ shipments }: { shipments: Shipment[] | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  if (shipments === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          </div>
          <p className="font-semibold text-slate-900 mb-1">Database connection unavailable</p>
          <p className="text-sm text-slate-500">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  const open   = shipments.filter(s => s.status !== 'Closed');
  const closed = shipments.filter(s => s.status === 'Closed');
  const activeCount  = open.length;
  const urgentCount  = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  const totalDeposit  = open.reduce((a, s) => a + (s.deposit_sar || 0), 0);
  const refunded      = closed.reduce((a, s) => a + (s.deposit_sar || 0), 0);
  const penaltyRisk   = shipments.filter(s => s.alert_level === 'overdue').reduce((a, s) => a + (s.deposit_sar || 0), 0);
  const completionPct = shipments.length > 0 ? Math.round((closed.length / shipments.length) * 100) : 0;

  const kpis = [
    { label: 'Total active deposit',    value: sarFmt(totalDeposit),    sub: `${open.length} open shipments`,   accent: '#006B0C' },
    { label: 'Refunds initiated YTD',   value: sarFmt(refunded),         sub: `${closed.length} closed`,         accent: '#059669' },
    { label: 'Penalty risk exposure',   value: sarFmt(penaltyRisk),      sub: 'From overdue shipments',          accent: '#f59e0b' },
    { label: 'Re-export completion',    value: `${completionPct}%`,      sub: 'Closed / total all-time',         accent: '#3b82f6' },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeCount={activeCount} urgentCount={urgentCount} />

      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Reports</span>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pb-16 pt-6">
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">Home / Reports</p>
          <h1 className="text-2xl font-bold tracking-tight">Audit-ready reports</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly snapshots for customs, finance and legal. Ready to export as PDF or Excel.</p>
        </div>

        {shipments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center py-20 text-center mb-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: '#006B0C18' }}>
              <svg className="w-6 h-6" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" /></svg>
            </div>
            <p className="font-semibold text-slate-900 mb-1">No shipments found</p>
            <p className="text-sm text-slate-500 mb-5">Add your first TI-TE shipment to get started.</p>
            <button onClick={() => router.push('/ti-te/shipments/new')} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#006B0C' }}>Add Shipment</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-sm text-slate-900">Available reports</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {REPORTS.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#006B0C18' }}>
                  <svg className="w-4.5 h-4.5" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] text-slate-900">{r.title}</div>
                  <div className="text-[11.5px] text-slate-400">{r.desc}</div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />{r.owner}
                </span>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  PDF
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Excel
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
