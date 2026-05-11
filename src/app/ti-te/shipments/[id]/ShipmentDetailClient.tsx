'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import DocumentUploadSection from '@/components/tite/DocumentUploadSection';
import {
  ALERT_PILL, ALERT_DOT, ALERT_LABEL, fmtDate, usdFmt, calcDays, getStatusBadge,
} from '@/lib/tite-utils';
import { extendShipment, closeShipment, markRefundReceived } from '@/app/actions/tite';
import type { Shipment, ShipmentDocument, ActivityLogRow } from '@/types/tite';

/* ─── Constants ──────────────────────────────────────────────── */

const DEADLINE_BG: Record<string, string> = {
  overdue: 'linear-gradient(135deg, #6F0F0F, #B43A1F)',
  urgent:  'linear-gradient(135deg, #8B2E12, #D9601F)',
  action:  'linear-gradient(135deg, #7E4A0A, #C58414)',
  closed:  'linear-gradient(135deg, #2A4A3A, #1B7F4D)',
  default: 'linear-gradient(135deg, #003D6B, #00558F)',
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  created:         <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />,
  extended:        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />,
  closed:          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />,
  refund_received: <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />,
  document_added:  <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />,
};

/* ─── Helpers ────────────────────────────────────────────────── */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-[13.5px] text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function StatusPill({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${ALERT_PILL[level] || ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ALERT_DOT[level] || 'bg-slate-400'}`} />
      {ALERT_LABEL[level] || level}
    </span>
  );
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'created':         return 'Shipment created';
    case 'extended':        return 'Validity extended';
    case 'closed':          return 'File closed';
    case 'refund_received': return 'Refund received';
    case 'document_added':  return 'Document attached';
    default: return action.replace(/_/g, ' ');
  }
}

/* ─── Modal ──────────────────────────────────────────────────── */

type ModalMode = 'closed' | 'extend' | 'close' | 'refund';

interface ModalProps {
  mode:        ModalMode;
  shipmentId:  number;
  onClose:     () => void;
  onSuccess:   () => void;
}

function ModifyModal({ mode, shipmentId, onClose, onSuccess }: ModalProps) {
  const [working,      setWorking]      = useState(false);
  const [error,        setError]        = useState('');
  const [extendDate,   setExtendDate]   = useState('');
  const [notes,        setNotes]        = useState('');

  const INP = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] bg-white';

  async function handleSubmit() {
    setError('');
    if (mode === 'extend' && !extendDate) {
      setError('Extended date is required.');
      return;
    }
    setWorking(true);
    try {
      let result: { success: boolean; error?: string };
      if (mode === 'extend') {
        result = await extendShipment({ shipmentId, extendedDate: extendDate, notes });
      } else if (mode === 'close') {
        result = await closeShipment({ shipmentId, notes });
      } else {
        result = await markRefundReceived({ shipmentId, notes });
      }
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Action failed.');
      }
    } finally {
      setWorking(false);
    }
  }

  const titles: Record<ModalMode, string> = {
    closed:  '',
    extend:  'Request extension',
    close:   'Close file',
    refund:  'Mark refund received',
  };
  const ctaLabels: Record<ModalMode, string> = {
    closed:  '',
    extend:  'Save extension',
    close:   'Close file',
    refund:  'Mark received',
  };
  const ctaBg: Record<ModalMode, string> = {
    closed:  '',
    extend:  '#006B0C',
    close:   '#475569',
    refund:  '#059669',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-slate-900 mb-4">{titles[mode]}</h3>

        <div className="flex flex-col gap-4">
          {mode === 'extend' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                New expiry date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={INP}
                value={extendDate}
                onChange={e => setExtendDate(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea
              className={`${INP} resize-none`}
              rows={3}
              placeholder="Optional remarks…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={working}
            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={working}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: ctaBg[mode] }}
          >
            {working && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {ctaLabels[mode]}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */

export default function ShipmentDetailClient({
  shipment: s,
  rawId,
  documents: initialDocuments,
  activityLog: initialLog,
}: {
  shipment:    Shipment | null;
  rawId:       string;
  documents:   ShipmentDocument[];
  activityLog: ActivityLogRow[];
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'documents' | 'timeline' | 'compliance'>('overview');

  const [documents,   setDocuments]   = useState<ShipmentDocument[]>(initialDocuments);
  const [activityLog, setActivityLog] = useState<ActivityLogRow[]>(initialLog);
  const [modalMode,   setModalMode]   = useState<ModalMode>('closed');

  /* ── DB unavailable ── */
  if (s === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          </div>
          <p className="font-semibold text-slate-900 mb-1">Shipment #{rawId} not found</p>
          <p className="text-sm text-slate-500 mb-4">It may have been removed or the database is unavailable.</p>
          <button className="text-sm font-medium text-[#006B0C] hover:underline" onClick={() => router.push('/ti-te/shipments')}>
            ← Back to register
          </button>
        </div>
      </div>
    );
  }

  /* ── Computed values ── */
  const days = calcDays(s);
  const eff  = s.extended_date || s.expiry_date;
  const importDate = s.import_date ? new Date(s.import_date) : null;
  const effDate    = eff ? new Date(eff) : null;
  const today      = new Date(); today.setHours(0, 0, 0, 0);

  const totalDays = importDate && effDate ? Math.floor((effDate.getTime() - importDate.getTime()) / 86400000) : 1;
  const elapsed   = importDate ? Math.floor((today.getTime() - importDate.getTime()) / 86400000) : 0;
  const pct       = Math.max(0, Math.min(100, (elapsed / (totalDays || 1)) * 100));

  const deadlineBg = DEADLINE_BG[s.alert_level] || DEADLINE_BG.default;
  const isClosed   = s.status === 'Closed' || s.status === 'Closed - Refund Recovered';

  const notifs = [
    { label: '60 days before', sent: (days ?? 99) <= 60 || isClosed, crit: false },
    { label: '30 days before', sent: (days ?? 99) <= 30 || isClosed, crit: false },
    { label: '14 days before', sent: (days ?? 99) <= 14 || isClosed, crit: false },
    { label: '7 days before',  sent: (days ?? 99) <= 7  || isClosed, crit: false },
    { label: 'Past expiry',    sent: s.alert_level === 'overdue',     crit: true  },
  ];

  const checksAll = [
    { done: !!s.customs_reference_number,                                                           text: 'Customs reference number on file' },
    { done: !!s.invoice_number,                                                                     text: 'Commercial invoice on file' },
    { done: !!s.awb_number,                                                                         text: 'Airway bill / Bill of lading on file' },
    { done: (Number(s.deposit_usd) || 0) > 0 || (s.movement_type || '').toLowerCase().includes('export'), text: 'Customs deposit recorded' },
    { done: s.alert_level !== 'overdue',                                                            text: 'Within re-export deadline' },
    { done: !!s.extended_date,                                                                      text: 'Extension granted (if requested)', optional: true },
    { done: isClosed,                                                                               text: 'Re-export or settlement confirmed' },
  ];

  /* ── Callbacks ── */
  function handleDocUploaded(doc: ShipmentDocument) {
    setDocuments(prev => [doc, ...prev]);
  }
  function handleDocDeleted(id: number) {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }
  function handleModalSuccess() {
    setModalMode('closed');
    router.refresh();
  }

  /* Derive active stage from current shipment status */
  const currentStage: 'creation' | 'extension' | 'closure' | 'refund' =
    s.status === 'Closed - Refund Recovered' ? 'refund'
    : s.status === 'Closed'                  ? 'closure'
    : s.status === 'Open - Extended'         ? 'extension'
    : 'creation';

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Modal */}
      {modalMode !== 'closed' && (
        <ModifyModal
          mode={modalMode}
          shipmentId={s.id}
          onClose={() => setModalMode('closed')}
          onSuccess={handleModalSuccess}
        />
      )}

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
            <h1 className="text-2xl font-bold tracking-tight">
              {s.description || `${s.segment || 'Shipment'} — ${s.from_country} → ${s.to_country}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {s.segment && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-100 text-cyan-700 border border-cyan-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> {s.segment}
                </span>
              )}
              {s.movement_type && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.movement_type.toLowerCase().includes('export') ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-cyan-100 text-cyan-700 border border-cyan-200'}`}>
                  {s.movement_type.toLowerCase().includes('export') ? '↗' : '↘'} {s.movement_type}
                </span>
              )}
              <StatusPill level={s.alert_level} />
              {(() => { const sb = getStatusBadge(s.status); return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${sb.className}`}>
                  {sb.label}
                </span>
              ); })()}
              <span className="text-xs text-slate-400">Logged {fmtDate(s.import_date)} by {s.created_by || '—'}</span>
            </div>
          </div>

          {/* Modify actions */}
          {!isClosed && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setModalMode('extend')}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#006B0C' }}
              >
                Request extension
              </button>
              <div className="relative group">
                <button className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-20 hidden group-hover:block">
                  <button
                    onClick={() => setModalMode('close')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Close file
                  </button>
                  <button
                    onClick={() => setModalMode('refund')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Mark refund received
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Banners */}
        {s.alert_level === 'overdue' && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 text-sm text-red-800">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
            <span><strong>Past re-export deadline by {days !== null ? -days : '?'} days.</strong> Customs deposit ({usdFmt(s.deposit_usd)}) at risk. Contact customs broker and legal immediately.</span>
          </div>
        )}
        {s.alert_level === 'urgent' && (
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5 text-sm text-orange-800">
            <svg className="w-5 h-5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>
            <span><strong>{days} days remaining.</strong> Submit extension request or initiate re-export now.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-slate-200 mb-6">
          {(['overview', 'documents', 'timeline', 'compliance'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[13.5px] font-medium transition-colors border-b-2 -mb-px ${tab === t ? 'text-[#006B0C] border-[#006B0C] font-semibold' : 'text-slate-400 border-transparent hover:text-slate-700'}`}>
              {t === 'documents'
                ? `Documents${documents.length > 0 ? ` (${documents.length})` : ''}`
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          {/* Main column */}
          <div className="space-y-5">

            {/* ── Overview tab ── */}
            {tab === 'overview' && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Shipment information</h2></div>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <Field label="Reference"       value={<span className="font-mono text-[12.5px]">{s.reference_number || '—'}</span>} />
                    <Field label="Movement type"   value={s.movement_type || '—'} />
                    <Field label="Business segment" value={s.segment || '—'} />
                    <Field label="Mode of transport" value={s.mot || '—'} />
                    <Field label="Origin"          value={s.from_country || '—'} />
                    <Field label="Destination"     value={s.to_country || '—'} />
                    <Field label="Owner"           value={s.created_by || '—'} />
                    <Field label="Invoice number"  value={<span className="font-mono text-[12.5px]">{s.invoice_number || '—'}</span>} />
                    <Field label="Invoice value"   value={s.invoice_value_usd != null ? <span className="tabular-nums">{usdFmt(s.invoice_value_usd)}</span> : '—'} />
                    <Field label="PO number"       value={<span className="font-mono text-[12.5px]">{s.po_number || '—'}</span>} />
                    <Field label="Customs Ref. No." value={<span className="font-mono text-[12.5px]">{s.customs_reference_number || '—'}</span>} />
                    <Field label="AWB / BL"        value={<span className="font-mono text-[12.5px]">{s.awb_number || '—'}</span>} />
                    <Field label="Import date"     value={fmtDate(s.import_date)} />
                  </div>
                  {s.comments && (
                    <div className="px-5 pb-5 pt-0 border-t border-slate-100">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-1 mt-4">Comments</p>
                      <p className="text-[13.5px] text-slate-800">{s.comments}</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Customs deposit &amp; duty exposure</h2></div>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <Field label="Deposit (USD)" value={<span className="text-xl font-bold tabular-nums">{usdFmt(s.deposit_usd)}</span>} />
                    <Field label="Refund status" value={
                      s.status === 'Closed - Refund Recovered'
                        ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Refund recovered</span>
                        : s.status === 'Closed'
                          ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />File closed</span>
                          : <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 border border-amber-200"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Held by customs</span>
                    } />
                  </div>
                </div>
              </>
            )}

            {/* ── Documents tab ── */}
            {tab === 'documents' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Documents</h2>
                  <p className="text-[11.5px] text-slate-400 mt-0.5">Files are stored securely in the database. Max 50 MB per file.</p>
                </div>
                <div className="p-5">
                  <DocumentUploadSection
                    shipmentId={s.id}
                    documents={documents}
                    stage={currentStage}
                    onUploaded={handleDocUploaded}
                    onDeleted={handleDocDeleted}
                    readOnly={false}
                  />
                </div>
              </div>
            )}

            {/* ── Timeline tab ── */}
            {tab === 'timeline' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Activity timeline</h2></div>
                {activityLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-sm text-slate-500">No activity recorded yet.</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <ol className="relative border-l border-slate-200 ml-2 space-y-5">
                      {activityLog.map(entry => (
                        <li key={entry.id} className="ml-5">
                          <div className="absolute -left-1.5 mt-1 flex items-center justify-center">
                            {ACTION_ICON[entry.action] ?? <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />}
                          </div>
                          <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                            <div className="flex items-center justify-between gap-3 mb-0.5">
                              <span className="text-[13px] font-semibold text-slate-800">
                                {actionLabel(entry.action)}
                              </span>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                                {fmtTs(entry.performed_at)}
                              </span>
                            </div>
                            {entry.details && (
                              <p className="text-[12.5px] text-slate-500">{entry.details}</p>
                            )}
                            {entry.performed_by && (
                              <p className="text-[11px] text-slate-400 mt-1">by {entry.performed_by}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* ── Compliance tab ── */}
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
                {s.alert_level === 'closed' ? 'Closed' : s.alert_level === 'overdue' ? 'Days overdue' : 'Days to deadline'}
              </p>
              <p className="text-4xl font-bold tabular-nums mt-1 leading-none tracking-tight">
                {s.alert_level === 'closed' ? '✓' : days !== null ? (s.alert_level === 'overdue' ? -days : days) : '—'}
              </p>
              <p className="text-sm mt-1.5 opacity-90">
                {s.alert_level === 'closed' ? 'Re-export confirmed' : `Effective expiry: ${fmtDate(eff)}`}
              </p>
              {s.alert_level !== 'closed' && (
                <div className="mt-3.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 text-[11.5px] opacity-85">
                <span>Imported {fmtDate(s.import_date)}</span>
                <div className="flex-1" />
                <span>{fmtDate(eff)}</span>
              </div>
            </div>

            {/* Key dates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Key dates</h3></div>
              <div className="p-4 space-y-3">
                {[
                  { label: 'Imported',        date: fmtDate(s.import_date),  struck: false,            highlight: false },
                  { label: 'Original expiry', date: fmtDate(s.expiry_date),  struck: !!s.extended_date, highlight: false },
                  ...(s.extended_date ? [{ label: 'Extended to', date: fmtDate(s.extended_date), struck: false, highlight: true }] : []),
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
                  {[s.created_by, 'Customs Manager', 'Finance Lead'].filter(Boolean).map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick actions (mobile) */}
            {!isClosed && (
              <div className="sm:hidden bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Actions</h3></div>
                <div className="p-3 flex flex-col gap-2">
                  <button onClick={() => setModalMode('extend')} className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#006B0C' }}>
                    Request extension
                  </button>
                  <button onClick={() => setModalMode('close')} className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-500 hover:bg-slate-600 transition-colors">
                    Close file
                  </button>
                  <button onClick={() => setModalMode('refund')} className="w-full px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                    Mark refund received
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
