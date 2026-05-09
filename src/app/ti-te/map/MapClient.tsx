'use client';

import { useState } from 'react';
import TiteSidebar from '@/components/TiteSidebar';
import { ALERT_LABEL, BUCKET_HEX, sarFmt } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

export default function MapClient({ shipments }: { shipments: Shipment[] | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const open = shipments.filter(s => s.status !== 'Closed');
  const activeCount = open.length;
  const urgentCount = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  const routeMap: Record<string, { from: string; to: string; count: number; deposit: number; worst: string }> = {};
  const ORDER = ['ok', 'info', 'plan', 'action', 'urgent', 'overdue'];
  open.forEach(s => {
    const key = `${s.from_country}|${s.to_country}`;
    if (!routeMap[key]) routeMap[key] = { from: s.from_country || '', to: s.to_country || '', count: 0, deposit: 0, worst: 'ok' };
    routeMap[key].count++;
    routeMap[key].deposit += s.deposit_local || 0;
    if (ORDER.indexOf(s.alert_level) > ORDER.indexOf(routeMap[key].worst)) routeMap[key].worst = s.alert_level;
  });
  const routes = Object.values(routeMap).sort((a, b) => b.count - a.count);
  const countrySet = new Set(open.flatMap(s => [s.from_country, s.to_country].filter(Boolean)));

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
        <span className="font-semibold text-slate-900 text-sm">Map View</span>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pb-16 pt-6">
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">Home / Map view</p>
          <h1 className="text-2xl font-bold tracking-tight">Active movements — global view</h1>
          <p className="text-sm text-slate-500 mt-1">{open.length} active flows across {countrySet.size} countries</p>
        </div>

        {/* Placeholder */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#006B0C18' }}>
              <svg className="w-8 h-8" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Map view coming soon</h2>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed">
              Interactive map showing shipment locations and active routes will be available in the next release. Use the route summary below in the meantime.
            </p>
          </div>
        </div>

        {/* Route summary */}
        {open.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-slate-400">No active shipments to display.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-semibold text-sm text-slate-900">Flows by route</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Route', 'Count', 'Status mix', 'Total deposit (Local)', 'Worst alert'].map((h, i) => (
                      <th key={i} className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-4 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r, i) => {
                    const items = open.filter(s => s.from_country === r.from && s.to_country === r.to);
                    return (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1 text-[12.5px] text-slate-700 whitespace-nowrap">
                            <span>{r.from || '—'}</span>
                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                            <span>{r.to || '—'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px] text-slate-700 tabular-nums">{r.count}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            {items.map((s, j) => (
                              <span key={j} className="w-2 h-3.5 rounded-[3px]" style={{ background: BUCKET_HEX[s.alert_level] || '#94a3b8' }} title={`#${s.id} ${ALERT_LABEL[s.alert_level] || s.alert_level}`} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px] text-slate-700 tabular-nums">{sarFmt(r.deposit)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: BUCKET_HEX[r.worst] || '#94a3b8' }} />
                          <span className="text-[12px] text-slate-600">{ALERT_LABEL[r.worst] || r.worst}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
