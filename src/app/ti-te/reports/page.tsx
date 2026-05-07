'use client';

import { useState } from 'react';
import TiteSidebar from '@/components/TiteSidebar';
import { SHIPMENTS, sarFmt } from '@/data/ti-te-mock-data';

const REPORTS = [
  {
    title: 'Monthly customs summary',
    desc: 'All open & closed temporary movements with Bayan, deposit, expiry, status',
    owner: 'Customs',
  },
  {
    title: 'Finance — duty exposure roll-up',
    desc: 'Aggregated SAR/USD deposit by segment, country, and aging bucket',
    owner: 'Finance',
  },
  {
    title: 'Legal — penalty risk register',
    desc: 'Overdue & at-risk shipments with extension status and timeline',
    owner: 'Legal',
  },
  {
    title: 'Re-export confirmations',
    desc: 'Closed shipments with re-export documentation and refund status',
    owner: 'Customs / Finance',
  },
  {
    title: 'Extensions log',
    desc: 'All extensions requested and granted, with original vs effective expiry',
    owner: 'Customs',
  },
  {
    title: 'Audit trail — full history',
    desc: 'Append-only change log per shipment, all events and users',
    owner: 'All',
  },
];

export default function ReportsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const open   = SHIPMENTS.filter(s => s.status !== 'Closed');
  const closed = SHIPMENTS.filter(s => s.status === 'Closed');

  const totalDeposit   = open.reduce((a, s) => a + (s.depositSAR || 0), 0);
  const refunded       = closed.reduce((a, s) => a + (s.depositSAR || 0), 0);
  const penaltyRisk    = SHIPMENTS.filter(s => s.alert === 'overdue').reduce((a, s) => a + (s.depositSAR || 0), 0);
  const completionPct  = Math.round((closed.length / SHIPMENTS.length) * 100);

  const kpis = [
    {
      label: 'Total active deposit',
      value: sarFmt(totalDeposit),
      sub: `${open.length} open shipments`,
      accent: '#006B0C',
      light: '#006B0C18',
    },
    {
      label: 'Refunds initiated YTD',
      value: sarFmt(refunded),
      sub: `${closed.length} closed shipments`,
      accent: '#059669',
      light: '#d1fae5',
    },
    {
      label: 'Penalty risk exposure',
      value: sarFmt(penaltyRisk),
      sub: 'From overdue shipments',
      accent: '#f59e0b',
      light: '#fef3c7',
    },
    {
      label: 'Re-export completion',
      value: `${completionPct}%`,
      sub: 'Closed / total all-time',
      accent: '#3b82f6',
      light: '#dbeafe',
    },
  ];

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
        <span className="font-semibold text-slate-900 text-sm">Reports</span>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pb-16 pt-6">
        {/* Page header */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">Home / Reports</p>
          <h1 className="text-2xl font-bold tracking-tight">Audit-ready reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monthly snapshots for customs, finance and legal. Ready to export as PDF or Excel.
          </p>
        </div>

        {/* KPI cards */}
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

        {/* Available reports */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-sm text-slate-900">Available reports</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {REPORTS.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#006B0C18' }}>
                  <svg className="w-4.5 h-4.5" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] text-slate-900">{r.title}</div>
                  <div className="text-[11.5px] text-slate-400">{r.desc}</div>
                </div>

                {/* Owner pill */}
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  {r.owner}
                </span>

                {/* Action buttons */}
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  PDF
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
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
