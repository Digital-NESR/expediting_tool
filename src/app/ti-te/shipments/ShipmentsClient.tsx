'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import {
  SHIPMENTS, fmtDate, sarFmt, ALERT_LABEL,
  type AlertLevel,
} from '@/data/ti-te-mock-data';

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
  overdue: 'bg-red-500', urgent: 'bg-orange-500', action: 'bg-amber-500',
  plan: 'bg-blue-500', info: 'bg-cyan-500', ok: 'bg-green-600', closed: 'bg-slate-400',
};

function StatusPill({ alert }: { alert: AlertLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${ALERT_PILL[alert]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ALERT_DOT[alert]}`} />
      {ALERT_LABEL[alert]}
    </span>
  );
}

function MotIcon({ mot }: { mot: string }) {
  const m = (mot || '').toLowerCase();
  if (m.includes('air')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z" />
    </svg>
  );
  if (m.includes('sea')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1M19 13V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6M12 10v4M12 2v3" />
    </svg>
  );
  if (m.includes('land') || m.includes('lnad')) return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

const ALERT_FILTERS: AlertLevel[] = ['overdue', 'urgent', 'action', 'plan', 'info', 'ok', 'closed'];

export default function ShipmentsClient() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('All');
  const [movement, setMovement] = useState('All');
  const [alertFilter, setAlertFilter] = useState<AlertLevel | 'All'>('All');
  const [country, setCountry] = useState('All');

  const segments = useMemo(() => ['All', ...Array.from(new Set(SHIPMENTS.map(s => s.segment).filter(Boolean)))], []);
  const countries = useMemo(() => ['All', ...Array.from(new Set(SHIPMENTS.flatMap(s => [s.from, s.to]).filter(Boolean)))], []);

  const rows = useMemo(() => SHIPMENTS.filter(s => {
    if (q) {
      const hay = `${s.id} ${s.invoice} ${s.bayan} ${s.description} ${s.po} ${s.awb}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (seg !== 'All' && s.segment !== seg) return false;
    if (movement !== 'All' && s.movement !== movement) return false;
    if (alertFilter !== 'All' && s.alert !== alertFilter) return false;
    if (country !== 'All' && s.from !== country && s.to !== country) return false;
    return true;
  }), [q, seg, movement, alertFilter, country]);

  const totalDep = rows.reduce((a, s) => a + (s.depositSAR || 0), 0);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Shipment Register</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 pb-16 pt-6">
        {/* Page header */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-1">Home / Shipment register</p>
            <h1 className="text-2xl font-bold tracking-tight">Shipment register</h1>
            <p className="text-sm text-slate-500 mt-1">
              {rows.length} of {SHIPMENTS.length} records · Customs deposit on view: <strong className="tabular-nums">{sarFmt(totalDep)}</strong>
            </p>
          </div>
          <button
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#006B0C' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New shipment
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              className="flex-1 text-sm outline-none placeholder-slate-400 bg-transparent"
              placeholder="Search invoice, Bayan, PO, AWB…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="w-px h-5 bg-slate-200 hidden sm:block" />
          <select className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20" value={seg} onChange={e => setSeg(e.target.value)}>
            {segments.map(x => <option key={x}>{x === 'All' ? 'Segment: All' : x}</option>)}
          </select>
          <select className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20" value={movement} onChange={e => setMovement(e.target.value)}>
            <option>All</option><option>Import</option><option>Export</option>
          </select>
          <select className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20" value={country} onChange={e => setCountry(e.target.value)}>
            {countries.map(x => <option key={x}>{x === 'All' ? 'Country: All' : x}</option>)}
          </select>
          <div className="flex-1" />
          <div className="flex flex-wrap gap-1">
            {(['All', ...ALERT_FILTERS] as const).map(a => (
              <button
                key={a}
                onClick={() => setAlertFilter(a as AlertLevel | 'All')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${alertFilter === a ? 'bg-[#006B0C] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {a === 'All' ? 'All status' : ALERT_LABEL[a as AlertLevel]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['#', 'Segment / Description', 'Route', 'MOT', 'Bayan', 'Deposit (SAR)', 'Import date', 'Effective expiry', 'Owner', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-2.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/ti-te/shipments/${s.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono text-[12px] text-slate-500">{String(s.id).padStart(3, '0')}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">{s.segment}</div>
                      <div className="text-[11.5px] text-slate-400 max-w-[220px] truncate">{s.description.slice(0, 55)}{s.description.length > 55 ? '…' : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1 text-[12.5px] text-slate-700">
                        <span>{s.from || '—'}</span>
                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <span>{s.to || '—'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-slate-500 text-[12.5px]">
                        <MotIcon mot={s.mot} />
                        {s.mot || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-slate-500">{s.bayan || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] whitespace-nowrap">{s.depositSAR ? s.depositSAR.toLocaleString() : '—'}</td>
                    <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap">{fmtDate(s.importDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="text-[12.5px]">{fmtDate(s.extended || s.expiry)}</div>
                      {s.extended && (
                        <div className="text-[11px] text-slate-400 line-through">{fmtDate(s.expiry)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full text-white font-bold text-[9px] flex items-center justify-center shrink-0"
                          style={{ background: '#006B0C' }}
                        >
                          {(s.owner || '').split(' ').map(p => p[0]).slice(0, 2).join('')}
                        </span>
                        <span className="text-[12px] text-slate-600">{(s.owner || '').split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><StatusPill alert={s.alert} /></td>
                    <td className="px-3 py-2.5">
                      <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">No shipments match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
