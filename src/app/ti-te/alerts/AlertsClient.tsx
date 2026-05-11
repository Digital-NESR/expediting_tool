'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import { ALERT_LABEL, ALERT_PILL, BUCKET_HEX, fmtDate, usdFmt, calcDays } from '@/lib/tite-utils';
import type { Shipment } from '@/types/tite';

const GROUPS = [
  { key: 'overdue', label: 'Overdue — escalate now',           desc: 'Past re-export deadline. Penalty risk.' },
  { key: 'urgent',  label: 'Urgent — within 7 days',           desc: 'Submit extension or initiate re-export immediately.' },
  { key: 'action',  label: 'Action required — within 14 days', desc: 'Begin extension paperwork or schedule re-export.' },
  { key: 'plan',    label: 'Plan ahead — within 30 days',      desc: 'Confirm re-export plan with operations.' },
  { key: 'info',    label: 'Monitor — within 60 days',         desc: 'Informational. No action yet.' },
];

export default function AlertsClient({ shipments }: { shipments: Shipment[] | null }) {
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

  const open = shipments.filter(s => s.status !== 'Closed');
  const activeCount = open.length;
  const urgentCount = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert_level)).length;

  const groups = GROUPS.map(g => ({
    ...g,
    items: open
      .filter(s => s.alert_level === g.key)
      .sort((a, b) => (calcDays(a) ?? 0) - (calcDays(b) ?? 0)),
  }));

  const hasAny = groups.some(g => g.items.length > 0);

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
        <span className="font-semibold text-slate-900 text-sm">Alerts &amp; Notifications</span>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pb-16 pt-6">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Alerts</p>
            <h1 className="text-2xl font-bold tracking-tight">Alerts &amp; notifications</h1>
            <p className="text-sm text-slate-500 mt-1">Automated rollup based on effective expiry dates.</p>
          </div>
          <button className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Notification rules
          </button>
        </div>

        {!hasAny ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: '#006B0C18' }}>
              <svg className="w-6 h-6" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="font-semibold text-slate-900 mb-1">No active alerts</p>
            <p className="text-sm text-slate-500">All shipments are on track.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(g => (
              <div key={g.key} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BUCKET_HEX[g.key] }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-900">{g.label}</div>
                    <div className="text-[12px] text-slate-400">{g.desc}</div>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                    {g.items.length} shipment{g.items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {g.items.length > 0 ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {g.items.map(s => {
                        const days = calcDays(s);
                        return (
                          <tr key={s.id} onClick={() => router.push(`/ti-te/shipments/${s.id}`)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors">
                            <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400 w-16">#{String(s.id).padStart(3, '0')}</td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-900 text-[13px]">{(s.description || '').slice(0, 50)}{(s.description || '').length > 50 ? '…' : ''}</div>
                              <div className="text-[11.5px] text-slate-400">{s.segment || '—'} · Owner: {s.created_by || '—'}</div>
                            </td>
                            <td className="px-3 py-2.5 hidden sm:table-cell">
                              <span className="flex items-center gap-1 text-[12.5px] text-slate-700 whitespace-nowrap">
                                <span>{s.from_country || '—'}</span>
                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                                <span>{s.to_country || '—'}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="font-semibold text-[12.5px]" style={{ color: BUCKET_HEX[g.key] }}>
                                {days === null ? '—' : days < 0 ? `${-days}d overdue` : `${days}d left`}
                              </div>
                              <div className="text-[11px] text-slate-400">{fmtDate(s.extended_date || s.expiry_date)}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-[12px] whitespace-nowrap text-slate-600 hidden md:table-cell">
                              {usdFmt(s.deposit_usd)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap ${ALERT_PILL[g.key] || ''}`}>
                                {ALERT_LABEL[g.key] || g.key}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-4 text-[12.5px] text-slate-400">No shipments in this bucket.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
