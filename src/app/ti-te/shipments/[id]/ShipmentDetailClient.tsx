'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import {
  SHIPMENTS, DOCS_BY_ID, TIMELINE_BY_ID, TODAY, fmtDate, sarFmt, usdFmt, ALERT_LABEL,
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

const DEADLINE_BG: Record<string, string> = {
  overdue: 'linear-gradient(135deg, #6F0F0F, #B43A1F)',
  urgent:  'linear-gradient(135deg, #8B2E12, #D9601F)',
  action:  'linear-gradient(135deg, #7E4A0A, #C58414)',
  closed:  'linear-gradient(135deg, #2A4A3A, #1B7F4D)',
  default: 'linear-gradient(135deg, #003D6B, #00558F)',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-[13.5px] text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function StatusPill({ alert }: { alert: AlertLevel }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${ALERT_PILL[alert]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ALERT_DOT[alert]}`} />
      {ALERT_LABEL[alert]}
    </span>
  );
}

const TIMELINE_DOT: Record<string, string> = {
  created:   'border-[#006B0C] bg-white',
  document:  'border-blue-500 bg-white',
  system:    'border-slate-400 bg-white',
  extension: 'border-amber-500 bg-white',
  alert:     'border-red-500 bg-red-500',
  closed:    'border-green-600 bg-green-600',
};

export default function ShipmentDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'documents' | 'timeline' | 'compliance'>('overview');

  const id = Number(params.id);
  const s = SHIPMENTS.find(x => x.id === id);

  if (!s) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 text-slate-500">
        Shipment #{id} not found.{' '}
        <button className="ml-2 underline" onClick={() => router.push('/ti-te/shipments')}>Back</button>
      </div>
    );
  }

  const docs = DOCS_BY_ID[s.id] || [];
  const events = TIMELINE_BY_ID[s.id] || [];
  const eff = s.extended || s.expiry;
  const totalDays = Math.floor((eff.getTime() - s.importDate.getTime()) / 86400000);
  const elapsed = Math.floor((TODAY.getTime() - s.importDate.getTime()) / 86400000);
  const pct = Math.max(0, Math.min(100, (elapsed / (totalDays || 1)) * 100));

  const deadlineBg = DEADLINE_BG[s.alert] || DEADLINE_BG.default;

  const related = SHIPMENTS.filter(x => x.id !== s.id && x.po === s.po && s.po && s.po !== 'N/A').slice(0, 4);

  const checksAll = [
    { done: true,                                       text: 'Bayan registered with customs' },
    { done: !!s.invoice,                                text: 'Commercial invoice on file' },
    { done: !!s.awb,                                    text: 'Airway bill / Bill of lading on file' },
    { done: s.depositSAR > 0 || s.movement === 'Export', text: 'Customs deposit recorded' },
    { done: s.alert !== 'overdue',                      text: 'Within re-export deadline' },
    { done: !!s.extended,                               text: 'Extension granted (if requested)', optional: true },
    { done: s.status === 'Closed',                      text: 'Re-export confirmed & deposit refunded' },
  ];

  const notifs = [
    { label: '60 days before', sent: (s.daysToExpiry ?? 99) <= 60 || s.status === 'Closed', crit: false },
    { label: '30 days before', sent: (s.daysToExpiry ?? 99) <= 30 || s.status === 'Closed', crit: false },
    { label: '14 days before', sent: (s.daysToExpiry ?? 99) <= 14 || s.status === 'Closed', crit: false },
    { label: '7 days before',  sent: (s.daysToExpiry ?? 99) <= 7  || s.status === 'Closed', crit: false },
    { label: 'Past expiry',    sent: s.alert === 'overdue',                                  crit: true },
  ];

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
        <span className="font-semibold text-slate-900 text-sm">Shipment Detail</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 pb-16 pt-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-1">
              <button className="hover:underline text-[#006B0C]" onClick={() => router.push('/ti-te/shipments')}>Shipment register</button>
              {' / '}Shipment #{String(s.id).padStart(3, '0')}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{s.description || `${s.segment} — ${s.from} → ${s.to}`}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-100 text-cyan-700 border border-cyan-200`}>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> {s.segment}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.movement === 'Export' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-cyan-100 text-cyan-700 border border-cyan-200'}`}>
                {s.movement === 'Export' ? '↗' : '↘'} {s.movement}
              </span>
              <StatusPill alert={s.alert} />
              <span className="text-xs text-slate-400">Logged {fmtDate(s.importDate)} by {s.owner}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {s.alert !== 'closed' && (
              <button
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#006B0C' }}
              >
                Request extension
              </button>
            )}
          </div>
        </div>

        {/* Banners */}
        {s.alert === 'overdue' && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-800">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
            <span><strong>Past re-export deadline by {-(s.daysToExpiry ?? 0)} days.</strong> Customs deposit ({sarFmt(s.depositSAR)}) at risk. Contact customs broker and legal immediately.</span>
          </div>
        )}
        {s.alert === 'urgent' && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5 text-sm text-orange-800">
            <svg className="w-5 h-5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
            <span><strong>{s.daysToExpiry} days remaining.</strong> Submit extension request or initiate re-export now.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-slate-200 mb-6">
          {(['overview', 'documents', 'timeline', 'compliance'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[13.5px] font-medium transition-colors border-b-2 -mb-px ${tab === t ? 'text-[#006B0C] border-[#006B0C] font-semibold' : 'text-slate-400 border-transparent hover:text-slate-700'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'documents' && <span className="ml-1.5 text-slate-400">({docs.length})</span>}
              {t === 'timeline' && <span className="ml-1.5 text-slate-400">({events.length})</span>}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          {/* Main column */}
          <div className="space-y-5">
            {tab === 'overview' && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Shipment information</h2></div>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <Field label="Movement type" value={s.movement} />
                    <Field label="Business segment" value={s.segment} />
                    <Field label="Mode of transport" value={s.mot || '—'} />
                    <Field label="Origin" value={s.from || '—'} />
                    <Field label="Destination" value={s.to || '—'} />
                    <Field label="Owner" value={s.owner} />
                    <Field label="Invoice number" value={<span className="font-mono text-[12.5px]">{s.invoice || '—'}</span>} />
                    <Field label="Invoice value" value={s.invoiceValue ? <span className="tabular-nums">{sarFmt(s.invoiceValue)}</span> : '—'} />
                    <Field label="PO number" value={<span className="font-mono text-[12.5px]">{s.po || '—'}</span>} />
                    <Field label="Bayan number" value={<span className="font-mono text-[12.5px]">{s.bayan || '—'}</span>} />
                    <Field label="AWB / BL" value={<span className="font-mono text-[12.5px]">{s.awb || '—'}</span>} />
                    <Field label="Import date" value={fmtDate(s.importDate)} />
                  </div>
                  {s.comments && (
                    <div className="px-5 pb-5 pt-0 border-t border-slate-100 mt-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-1 mt-4">Comments</p>
                      <p className="text-[13.5px] text-slate-800">{s.comments}</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Customs deposit & duty exposure</h2></div>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <Field label="Deposit (SAR)" value={<span className="text-xl font-bold tabular-nums">{sarFmt(s.depositSAR)}</span>} />
                    <Field label="Deposit (USD)" value={<span className="tabular-nums">{usdFmt(s.depositSAR / 3.75)}</span>} />
                    <Field label="Refund status" value={
                      s.status === 'Closed'
                        ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Refund initiated</span>
                        : <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Held by customs</span>
                    } />
                  </div>
                </div>

                {related.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">Related shipments</h2>
                      <span className="text-xs text-slate-400">Same PO {s.po}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {related.map(r => (
                          <tr key={r.id} onClick={() => router.push(`/ti-te/shipments/${r.id}`)} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors">
                            <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500 w-14">#{String(r.id).padStart(3, '0')}</td>
                            <td className="px-4 py-2.5 text-[13px] text-slate-700">{r.description.slice(0, 40)}</td>
                            <td className="px-4 py-2.5 text-[12.5px] text-slate-500">{fmtDate(r.extended || r.expiry)}</td>
                            <td className="px-4 py-2.5"><StatusPill alert={r.alert} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'documents' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Documents</h2>
                  <button className="text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">Upload</button>
                </div>
                <div className="p-5 space-y-2">
                  {docs.length === 0 && <p className="text-sm text-slate-400">No documents attached.</p>}
                  {docs.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[#006B0C]" style={{ background: 'rgba(0,107,12,0.08)' }}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{d.name}</p>
                        <p className="text-[11.5px] text-slate-400">{d.kind} · {d.size} · uploaded by {d.uploadedBy} on {fmtDate(d.uploadedAt)}</p>
                      </div>
                      <button className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'timeline' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Activity timeline</h2></div>
                <div className="p-5">
                  <div className="relative pl-5">
                    <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-slate-200" />
                    {events.map((ev, i) => (
                      <div key={i} className="relative pb-4">
                        <span className={`absolute -left-[18px] top-[3px] w-3 h-3 rounded-full border-2 ${TIMELINE_DOT[ev.kind] || TIMELINE_DOT.system}`} />
                        <p className="text-[11.5px] text-slate-400">{ev.who}</p>
                        <p className="text-[13px] text-slate-800 mt-0.5">{ev.text}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(ev.at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'compliance' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Compliance checklist</h2></div>
                <div className="p-5 space-y-0">
                  {checksAll.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-50">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${c.done ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                        {c.done
                          ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                          : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                      </span>
                      <span className={`text-[13.5px] ${c.done ? 'text-slate-800' : 'text-slate-500'}`}>{c.text}</span>
                      {c.optional && <span className="text-[11px] text-slate-400">· optional</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Side rail */}
          <div className="space-y-4">
            {/* Deadline card */}
            <div className="rounded-xl p-5 text-white relative overflow-hidden" style={{ background: deadlineBg }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                {s.alert === 'closed' ? 'Closed' : s.alert === 'overdue' ? 'Days overdue' : 'Days to deadline'}
              </p>
              <p className="text-4xl font-bold tabular-nums mt-1 leading-none tracking-tight">
                {s.alert === 'closed' ? '✓' : s.alert === 'overdue' ? -(s.daysToExpiry ?? 0) : s.daysToExpiry}
              </p>
              <p className="text-sm mt-1.5 opacity-90">
                {s.alert === 'closed' ? 'Re-export confirmed' : `Effective expiry: ${fmtDate(eff)}`}
              </p>
              {s.alert !== 'closed' && (
                <div className="mt-3.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 text-[11.5px] opacity-85">
                <span>Imported {fmtDate(s.importDate)}</span>
                <div className="flex-1" />
                <span>{fmtDate(eff)}</span>
              </div>
            </div>

            {/* Key dates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Key dates</h3></div>
              <div className="p-4 space-y-3">
                {[
                  { label: 'Imported', date: fmtDate(s.importDate), struck: false, highlight: false },
                  { label: 'Original expiry', date: fmtDate(s.expiry), struck: !!s.extended, highlight: false },
                  ...(s.extended ? [{ label: 'Extended to', date: fmtDate(s.extended), struck: false, highlight: true }] : []),
                ].map((kd, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <span className="text-slate-500 text-[12px]">{kd.label}</span>
                    <div className="flex-1" />
                    <span className={`tabular-nums text-[12.5px] ${kd.highlight ? 'font-bold text-[#006B0C]' : 'font-medium text-slate-700'} ${kd.struck ? 'line-through text-slate-400' : ''}`}>{kd.date}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Notifications</h3></div>
              <div className="p-4 space-y-2">
                {notifs.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <svg className={`w-3.5 h-3.5 shrink-0 ${n.crit && n.sent ? 'text-red-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" /></svg>
                    <span className="text-[12.5px] text-slate-700">{n.label}</span>
                    <div className="flex-1" />
                    <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${n.sent ? (n.crit ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700') : 'bg-slate-100 text-slate-500'}`}>
                      {n.sent ? 'sent' : 'queued'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                <p className="text-[11.5px] text-slate-400 mb-2">Recipients</p>
                <div className="flex flex-wrap gap-1.5">
                  {[s.owner, 'Customs Manager', 'Finance Lead'].map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
