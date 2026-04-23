'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import { saveBuyerComment, getMyExpeditingSessions } from '@/app/actions/reconciliation';
import type { SessionData, SupplierGroup, LineData } from '@/app/actions/reconciliation';

/* ─── DS-code colour sets ────────────────────────────────────── */
const DS_GREEN  = new Set(['DS04', 'DS11', 'DS12', 'DS13', 'DS18']);
const DS_AMBER  = new Set(['DS05', 'DS14', 'DS15', 'DS16', 'DS17']);
const DS_RED    = new Set(['DS01', 'DS02', 'DS03', 'DS06', 'DS07', 'DS08', 'DS09', 'DS10']);

/* ─── Helper functions ───────────────────────────────────────── */

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const date = `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${date} ${time}`;
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val);
}

function toSapDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function toFileDate(d: Date): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}${MONTHS[d.getMonth()]}${d.getFullYear()}`;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildCsvContent(rows: string[][]): string {
  return rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}

/** A line counts as a meaningful supplier update only if it was submitted
 *  AND the supplier actually selected a DS status code. */
function isExportable(line: LineData): boolean {
  if (line.workflow_state !== 'Submitted') return false;
  const s = (line.current_status ?? '').trim();
  return s !== '' && s !== 'Pending Supplier Response';
}

/* ─── Badge components ───────────────────────────────────────── */

function DsStatusBadge({ code }: { code: string | null }) {
  if (!code) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
        Pending
      </span>
    );
  }
  const base = code.split(' ')[0].toUpperCase();
  if (DS_GREEN.has(base)) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">{base}</span>
  );
  if (DS_AMBER.has(base)) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">{base}</span>
  );
  if (DS_RED.has(base)) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">{base}</span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">{code}</span>
  );
}

function ResponseRateBadge({ responded, total, rate }: { responded: number; total: number; rate: number }) {
  const cls = rate >= 70
    ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
    : rate >= 30
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${cls} whitespace-nowrap`}>
      {responded} / {total} lines responded ({rate}%)
    </span>
  );
}

function WorkflowBadge({ state }: { state: string }) {
  if (state === 'Submitted') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
      Submitted
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      Email Sent
    </span>
  );
}

/* ─── Buyer comment inline cell ──────────────────────────────── */

function BuyerCommentCell({
  value,
  onChange,
  onBlur,
  saveStatus,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const showHint = value.includes('[DATE]');
  return (
    <div className="min-w-[140px]">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        rows={2}
        placeholder="Add comments…"
        className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#307c4c] focus:border-[#307c4c] resize-none transition-colors"
      />
      <div className="h-3.5 mt-0.5">
        {saveStatus === 'saving' && <span className="text-[10px] text-slate-400">Saving…</span>}
        {saveStatus === 'saved'  && <span className="text-[10px] text-[#307c4c] font-medium">Saved ✓</span>}
        {saveStatus === 'error'  && <span className="text-[10px] text-red-500">Failed to save</span>}
      </div>
      {showHint && (
        <span className="text-[11px] text-gray-400">[DATE] will be replaced with today&apos;s date on export</span>
      )}
    </div>
  );
}

/* ─── Supplier sub-section ───────────────────────────────────── */

function SupplierSection({
  supplier,
  buyerComments,
  onCommentChange,
  onCommentBlur,
  saveStates,
}: {
  supplier: SupplierGroup;
  buyerComments: Record<string, string>;
  onCommentChange: (key: string, val: string) => void;
  onCommentBlur: (key: string, po_number: string, po_line: string, expedite_token: string) => void;
  saveStates: Record<string, 'idle' | 'saving' | 'saved' | 'error'>;
}) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      {/* Supplier header */}
      <div className="px-6 py-3 bg-slate-50/70 flex items-center gap-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800">{supplier.supplier_name}</span>
        <WorkflowBadge state={supplier.workflow_state} />
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" style={{ minWidth: '1380px' }}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-3 whitespace-nowrap">PO Number</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Line</th>
              <th className="py-2.5 px-3 whitespace-nowrap">SAP MAT ID</th>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Open QTY</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Value (USD)</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Original Del. Date</th>
              <th className="py-2.5 px-3 whitespace-nowrap">New Del. Date</th>
              <th className="py-2.5 px-3 whitespace-nowrap">DS Status</th>
              <th className="py-2.5 px-3">Supplier Comments</th>
              <th className="py-2.5 px-3">Buyer Comments</th>
              <th className="py-2.5 px-3 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {supplier.lines.map((line, idx) => {
              const commentKey = `${line.po_number}|${line.po_line}|${supplier.expedite_token}`;
              return (
                <tr key={idx} className="hover:bg-[#307c4c]/5 transition-colors">
                  {/* PO Number */}
                  <td className="py-3 px-3 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {line.po_number}
                  </td>
                  {/* Line */}
                  <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                    {line.po_line || '—'}
                  </td>
                  {/* SAP MAT ID */}
                  <td className="py-3 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                    {line.sap_mat_id?.trim() ? line.sap_mat_id : <span className="text-slate-400 italic">Service</span>}
                  </td>
                  {/* Description */}
                  <td className="py-3 px-3 text-xs text-slate-600 max-w-[200px]">
                    <span className="block truncate" title={line.item_description ?? ''}>
                      {line.item_description || '—'}
                    </span>
                  </td>
                  {/* Open QTY */}
                  <td className="py-3 px-3 text-xs text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                    {line.open_qty != null ? line.open_qty.toLocaleString() : '—'}
                  </td>
                  {/* Value USD */}
                  <td className="py-3 px-3 text-xs text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                    {formatCurrency(line.open_po_value_usd)}
                  </td>
                  {/* Original Del. Date */}
                  <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                    {formatDate(line.delivery_date)}
                  </td>
                  {/* New Del. Date */}
                  <td className="py-3 px-3 text-xs whitespace-nowrap">
                    {line.new_delivery_date
                      ? <span className="font-medium text-[#307c4c]">{formatDate(line.new_delivery_date)}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  {/* DS Status */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <DsStatusBadge code={line.current_status} />
                  </td>
                  {/* Supplier Comments */}
                  <td className="py-3 px-3 text-xs text-slate-600 max-w-[180px]">
                    <span className="block whitespace-pre-wrap break-words leading-relaxed">
                      {line.supplier_comments || <span className="text-slate-400 italic">—</span>}
                    </span>
                  </td>
                  {/* Buyer Comments — editable */}
                  <td className="py-3 px-3 align-top">
                    <BuyerCommentCell
                      value={buyerComments[commentKey] ?? ''}
                      onChange={val => onCommentChange(commentKey, val)}
                      onBlur={() => onCommentBlur(commentKey, line.po_number, line.po_line, supplier.expedite_token)}
                      saveStatus={saveStates[commentKey] ?? 'idle'}
                    />
                  </td>
                  {/* Actions — placeholder */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="text-slate-300 text-xs">—</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Session card ───────────────────────────────────────────── */

function SessionCard({
  session,
  isExpanded,
  onToggle,
  isSelected,
  onSelectToggle,
  buyerComments,
  onCommentChange,
  onCommentBlur,
  saveStates,
  onExportCsv,
}: {
  session: SessionData;
  isExpanded: boolean;
  onToggle: () => void;
  isSelected: boolean;
  onSelectToggle: () => void;
  buyerComments: Record<string, string>;
  onCommentChange: (key: string, val: string) => void;
  onCommentBlur: (key: string, po_number: string, po_line: string, expedite_token: string) => void;
  saveStates: Record<string, 'idle' | 'saving' | 'saved' | 'error'>;
  onExportCsv: () => void;
}) {
  const exportableCount = session.suppliers.reduce(
    (s, sup) => s + sup.lines.filter(isExportable).length, 0
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden transition-shadow duration-200 hover:shadow-md">

      {/* ── Card header ── */}
      <div className="px-5 py-4 flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-center gap-3 min-w-0">
          {/* Session checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelectToggle}
            onClick={e => e.stopPropagation()}
            className="h-4 w-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c] cursor-pointer shrink-0"
          />
          {/* Session title */}
          <button
            onClick={onToggle}
            className="flex items-center gap-2 text-left group min-w-0"
          >
            <svg
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 20 20" fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-slate-800 group-hover:text-[#307c4c] transition-colors truncate">
              Session — {formatSessionDate(session.dispatched_at)}
            </span>
          </button>
        </div>

        {/* Response rate badge */}
        <ResponseRateBadge
          responded={session.responded_lines}
          total={session.total_lines}
          rate={session.response_rate}
        />
      </div>

      {/* ── Stats pills ── */}
      <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600">
          {session.total_suppliers} Supplier{session.total_suppliers !== 1 ? 's' : ''}
        </span>
        <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600">
          {session.total_lines} PO Line{session.total_lines !== 1 ? 's' : ''}
        </span>
        <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600">
          {session.total_emails_sent} Email{session.total_emails_sent !== 1 ? 's' : ''} Sent
        </span>
      </div>

      {/* ── Expandable body ── */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          {session.suppliers.map(supplier => (
            <SupplierSection
              key={supplier.expedite_token}
              supplier={supplier}
              buyerComments={buyerComments}
              onCommentChange={onCommentChange}
              onCommentBlur={onCommentBlur}
              saveStates={saveStates}
            />
          ))}

          {/* Export button row */}
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/40 flex justify-end">
            <button
              onClick={onExportCsv}
              disabled={exportableCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#307c4c] hover:bg-[#26663e] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-sm"
            >
              {exportableCount > 0 && (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {exportableCount === 0
                ? 'No supplier updates to export'
                : `Export CSV (${exportableCount} updated line${exportableCount !== 1 ? 's' : ''})`
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main client component ──────────────────────────────────── */

export default function ReconciliationClient({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [isSidebarOpen, setIsSidebarOpen]     = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set()); // all collapsed
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  /* ── Session data — fetched client-side so refresh is possible ── */
  const [sessions, setSessions]           = useState<SessionData[]>([]);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  /* ── Buyer comment state ── */
  const [buyerComments, setBuyerComments] = useState<Record<string, string>>({});

  const [saveStates, setSaveStates] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  /* ── Fetch / refresh sessions ─────────────────────────────── */
  const fetchSessions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getMyExpeditingSessions(userEmail);
      setSessions(data);
      setBuyerComments(() => {
        const map: Record<string, string> = {};
        const defaultComment = `Updated by ${userName} on [DATE]`;
        for (const session of data) {
          for (const supplier of session.suppliers) {
            for (const line of supplier.lines) {
              const key = `${line.po_number}|${line.po_line}|${supplier.expedite_token}`;
              map[key] = line.buyer_comments || defaultComment;
            }
          }
        }
        return map;
      });
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [userEmail, userName]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  /* ── Select-all logic ─────────────────────────────────────── */
  const selectAllRef  = useRef<HTMLInputElement>(null);
  const allSelected   = sessions.length > 0 && sessions.every(s => selectedSessions.has(s.session_ref));
  const someSelected  = sessions.some(s => selectedSessions.has(s.session_ref));
  const isIndeterminate = someSelected && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedSessions(e.target.checked
      ? new Set(sessions.map(s => s.session_ref))
      : new Set()
    );
  }

  /* ── Expand / collapse ────────────────────────────────────── */
  function toggleExpanded(ref: string) {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });
  }

  /* ── Buyer comment handlers ───────────────────────────────── */
  const handleCommentChange = useCallback((key: string, val: string) => {
    setBuyerComments(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleCommentBlur = useCallback(async (
    key: string,
    po_number: string,
    po_line: string,
    expedite_token: string,
  ) => {
    const comment = buyerComments[key] ?? '';
    setSaveStates(prev => ({ ...prev, [key]: 'saving' }));
    const result = await saveBuyerComment(po_number, po_line, expedite_token, comment);
    setSaveStates(prev => ({ ...prev, [key]: result.success ? 'saved' : 'error' }));
    if (result.success) {
      setTimeout(() => {
        setSaveStates(prev => {
          if (prev[key] === 'saved') return { ...prev, [key]: 'idle' };
          return prev;
        });
      }, 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerComments]);

  /* ── Per-session CSV export ───────────────────────────────── */
  function exportSessionCsv(session: SessionData) {
    const exportDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });

    const CSV_HEADERS = [
      'Purchase Order', 'Purchase Order Item', 'New Delivery Date',
      'Delivery Status Code', 'Delivery Comments',
    ];
    const rows: string[][] = [CSV_HEADERS];

    for (const supplier of session.suppliers) {
      for (const line of supplier.lines) {
        if (!isExportable(line)) continue;
        const key        = `${line.po_number}|${line.po_line}|${supplier.expedite_token}`;
        const buyerNote  = (buyerComments[key] ?? '').replace('[DATE]', exportDate);
        const comments   = [line.supplier_comments, buyerNote].filter(Boolean).join(' | ');
        rows.push([
          line.po_number,
          line.po_line,
          toSapDate(line.new_delivery_date || line.delivery_date),
          line.current_status ?? '',
          comments,
        ]);
      }
    }

    const dateStr      = toFileDate(new Date());
    const supplierCnt  = session.suppliers.length;
    downloadCsv(buildCsvContent(rows), `NESR_Expediting_${dateStr}_${supplierCnt}suppliers.csv`);
  }

  /* ── Multi-session CSV export (with deduplication) ───────── */
  function exportSelectedCsv() {
    const selectedList = sessions.filter(s => selectedSessions.has(s.session_ref));
    if (selectedList.length === 0) return;

    const exportDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });

    // Deduplicate by po_number + po_line — keep row from most recent session
    const lineMap = new Map<string, { line: LineData; expedite_token: string; dispatched_at: string }>();

    for (const session of selectedList) {
      for (const supplier of session.suppliers) {
        for (const line of supplier.lines) {
          if (!isExportable(line)) continue;
          const key      = `${line.po_number}|${line.po_line}`;
          const existing = lineMap.get(key);
          // ISO strings compare lexicographically in the correct chronological order
          if (!existing || session.dispatched_at > existing.dispatched_at) {
            lineMap.set(key, { line, expedite_token: supplier.expedite_token, dispatched_at: session.dispatched_at });
          }
        }
      }
    }

    const CSV_HEADERS = [
      'Purchase Order', 'Purchase Order Item', 'New Delivery Date',
      'Delivery Status Code', 'Delivery Comments',
    ];
    const rows: string[][] = [CSV_HEADERS];

    for (const { line, expedite_token } of lineMap.values()) {
      const key       = `${line.po_number}|${line.po_line}|${expedite_token}`;
      const buyerNote = (buyerComments[key] ?? '').replace('[DATE]', exportDate);
      const comments  = [line.supplier_comments, buyerNote].filter(Boolean).join(' | ');
      rows.push([
        line.po_number,
        line.po_line,
        toSapDate(line.new_delivery_date || line.delivery_date),
        line.current_status ?? '',
        comments,
      ]);
    }

    const dateStr      = toFileDate(new Date());
    const sessionCnt   = selectedSessions.size;
    const lineCnt      = lineMap.size;
    downloadCsv(
      buildCsvContent(rows),
      `NESR_Expediting_Export_${dateStr}_${sessionCnt}sessions_${lineCnt}lines.csv`,
    );
  }

  const selectedCount = selectedSessions.size;

  /* Deduplicated exportable line count across selected sessions — used for button label */
  const selectedExportableCount = useMemo(() => {
    if (selectedSessions.size === 0) return 0;
    const seen = new Map<string, string>(); // lineKey -> dispatched_at
    for (const session of sessions) {
      if (!selectedSessions.has(session.session_ref)) continue;
      for (const supplier of session.suppliers) {
        for (const line of supplier.lines) {
          if (!isExportable(line)) continue;
          const key = `${line.po_number}|${line.po_line}`;
          const existing = seen.get(key);
          if (!existing || session.dispatched_at > existing) {
            seen.set(key, session.dispatched_at);
          }
        }
      }
    }
    return seen.size;
  }, [sessions, selectedSessions]);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 flex flex-col h-full relative bg-white">

        {/* ── Sticky header ── */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c] shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">NESR</span>
            <span className="hidden sm:inline text-gray-300 select-none">·</span>
            <span className="hidden sm:inline text-sm font-medium text-gray-500">Reconciliation</span>
          </div>
        </header>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scroll-smooth">

          {/* Page title */}
          <div className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Reconciliation</h1>
              <button
                onClick={fetchSessions}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Your expediting sessions and supplier responses.
            </p>
            {lastRefreshed && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                Last updated: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>

          {/* ── Empty state ── */}
          {!isRefreshing && sessions.length === 0 && (
            <div className="flex justify-center mt-16 animate-in fade-in duration-500">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 max-w-md w-full text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-slate-800">No expediting sessions found.</p>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Sessions appear here after you send emails from the Confirm &amp; Dispatch page.
                </p>
              </div>
            </div>
          )}

          {sessions.length > 0 && (
            <>
              {/* ── Multi-session export bar ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 mb-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between gap-3">
                  {/* Select all */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c] cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700">Select All</span>
                  </label>

                  {/* Export selected button */}
                  <button
                    onClick={exportSelectedCsv}
                    disabled={selectedCount === 0 || selectedExportableCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-150 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed bg-[#307c4c] hover:bg-[#26663e] text-white shadow-sm hover:scale-[1.02] active:scale-95"
                  >
                    {!(selectedCount > 0 && selectedExportableCount === 0) && (
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {selectedCount === 0
                      ? 'Export Selected'
                      : selectedExportableCount === 0
                        ? 'No supplier updates to export'
                        : `Export Selected (${selectedExportableCount} line${selectedExportableCount !== 1 ? 's' : ''} across ${selectedCount} session${selectedCount !== 1 ? 's' : ''})`
                    }
                  </button>
                </div>

                {/* Info note */}
                <p className="mt-2.5 text-[11px] text-slate-400 leading-relaxed">
                  Duplicate PO lines across sessions use the most recent supplier response. Only responded lines are included.
                </p>
              </div>

              {/* ── Session cards ── */}
              <div className="space-y-4 animate-in fade-in duration-500">
                {sessions.map(session => (
                  <SessionCard
                    key={session.session_ref}
                    session={session}
                    isExpanded={expandedSessions.has(session.session_ref)}
                    onToggle={() => toggleExpanded(session.session_ref)}
                    isSelected={selectedSessions.has(session.session_ref)}
                    onSelectToggle={() => {
                      setSelectedSessions(prev => {
                        const next = new Set(prev);
                        next.has(session.session_ref) ? next.delete(session.session_ref) : next.add(session.session_ref);
                        return next;
                      });
                    }}
                    buyerComments={buyerComments}
                    onCommentChange={handleCommentChange}
                    onCommentBlur={handleCommentBlur}
                    saveStates={saveStates}
                    onExportCsv={() => exportSessionCsv(session)}
                  />
                ))}
              </div>

              {/* Footer */}
              <p className="text-center text-xs text-gray-400 mt-8 pb-8">
                NESR Expediting Tool · Reconciliation
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
