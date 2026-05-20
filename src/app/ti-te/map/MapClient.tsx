'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import TiteSidebar from '@/components/TiteSidebar';
import { ALERT_LABEL, BUCKET_HEX, usdFmt } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

/* Load Leaflet map client-side only — Leaflet requires window/document. */
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

const ALERT_LEVELS = ['overdue', 'urgent', 'action', 'plan', 'info', 'ok'] as const;

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

  const open = shipments.filter(s => s.status !== 'Closed' && s.status !== 'Closed - Refund Recovered');
  const activeCount = open.length;
  const urgentCount = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  /* Route aggregation */
  const routeMap: Record<string, { from: string; to: string; count: number; deposit: number }> = {};
  open.forEach(s => {
    const key = `${s.from_country}|${s.to_country}`;
    if (!routeMap[key]) routeMap[key] = { from: s.from_country || '', to: s.to_country || '', count: 0, deposit: 0 };
    routeMap[key].count++;
    routeMap[key].deposit += Number(s.deposit_usd) || 0;
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

        {/* Interactive map */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6" style={{ height: 460 }}>
          {open.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-sm text-slate-400">No active shipments to display on the map.</p>
            </div>
          ) : (
            <LeafletMap shipments={open} />
          )}
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
                    {['Route', 'Count', 'Alert breakdown', 'Total deposit (USD)'].map((h, i) => (
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
                          <div className="flex items-center gap-0 flex-wrap">
                            {(() => {
                              const parts = ALERT_LEVELS
                                .map(level => ({ level, count: items.filter(s => s.alert_level === level).length }))
                                .filter(x => x.count > 0);
                              return parts.map((x, j) => (
                                <span key={x.level} className="flex items-center">
                                  {j > 0 && <span className="text-slate-300 mx-1 text-[11px]">·</span>}
                                  <span style={{ color: BUCKET_HEX[x.level] || '#94a3b8' }} className="font-semibold text-[11.5px] whitespace-nowrap">
                                    {x.count} {ALERT_LABEL[x.level] || x.level}
                                  </span>
                                </span>
                              ));
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px] text-slate-700 tabular-nums">{usdFmt(r.deposit)}</td>
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
