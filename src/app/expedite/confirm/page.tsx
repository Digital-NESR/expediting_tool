'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useExpediteStore } from '@/store/useExpediteStore';
import type { PurchaseOrder } from '@/types/po';
import {
  prepareExpediteDispatch,
  type DispatchResult,
  type SupplierDispatchParams,
} from '@/app/actions/expediteDispatch';

/* ─── Template defaults ──────────────────────────────────── */
const DEFAULT_SUBJECT = 'Purchase Order Follow-Up – Action Required';

const DEFAULT_BODY =
  `Dear {Supplier Name},\n\nWe are following up on the below open purchase orders assigned to your account. Please review the listed items and provide an update on the current delivery status.\n\nTo submit your updates, please use the secure link below:\n{Supplier Link}\n\nThis link is unique to your account and will allow you to update delivery dates, statuses, and comments for all listed POs in one submission.\n\nPlease respond by end of week.\n\nFor any queries, contact your assigned NESR buyer directly.\n\nBest regards,\nNESR Procurement Team`;

/* ─── Placeholder pill ───────────────────────────────────── */
function PlaceholderPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 border border-teal-200 text-[#307c4c] text-xs font-semibold rounded-md">
      <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {label}
    </span>
  );
}

/* ─── Send phase state ───────────────────────────────────── */
type SendPhase =
  | { phase: 'idle' }
  | { phase: 'sending'; current: number; total: number }
  | { phase: 'done'; results: DispatchResult[] };

/* ─── Group shape (mirrors expedite queue) ───────────────── */
interface SupplierGroup {
  supplierName: string;
  supplierId: string;
  items: PurchaseOrder[];
}

/* ─── Page ───────────────────────────────────────────────── */
export default function ConfirmDispatchPage() {
  const router = useRouter();
  const { selectedItems, supplierEmails, setSupplierEmails, clearSelection } =
    useExpediteStore();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sendPhase, setSendPhase] = useState<SendPhase>({ phase: 'idle' });
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Which cell is being edited: { supplierId, field, value }
  const [editingCell, setEditingCell] = useState<{
    supplierId: string;
    field: 'to' | 'cc';
    value: string;
  } | null>(null);

  /* ── Group items by supplier ── */
  const groups = useMemo<SupplierGroup[]>(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const item of selectedItems) {
      const key = item['Supplier Name'] || 'Unknown Supplier';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([supplierName, items]) => ({
        supplierName,
        supplierId: items[0]?.['Supplier ID'] ?? '',
        items,
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [selectedItems]);

  const totalLines = selectedItems.length;

  /* ── Email helpers ── */
  function getEmails(supplierId: string, field: 'to' | 'cc'): string[] {
    return supplierEmails[supplierId]?.[field] ?? [];
  }

  function commitEdit() {
    if (!editingCell) return;
    const { supplierId, field, value } = editingCell;
    const parsed = value.split(',').map((e) => e.trim()).filter(Boolean);
    const current = supplierEmails[supplierId] ?? { to: [], cc: [] };
    setSupplierEmails(supplierId, { ...current, [field]: parsed });
    // Clear validation error when a TO email is added
    if (field === 'to' && parsed.length > 0) {
      setValidationErrors((prev) => {
        const next = new Set(prev);
        next.delete(supplierId);
        return next;
      });
    }
    setEditingCell(null);
  }

  /* ── Core dispatch loop (reusable for retry) ── */
  async function dispatchGroups(toDispatch: SupplierGroup[]): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (let i = 0; i < toDispatch.length; i++) {
      const g = toDispatch[i];
      setSendPhase({ phase: 'sending', current: i + 1, total: toDispatch.length });
      const params: SupplierDispatchParams = {
        supplierId: g.supplierId,
        supplierName: g.supplierName,
        toEmails: getEmails(g.supplierId, 'to'),
        ccEmails: getEmails(g.supplierId, 'cc'),
        subject,
        emailBodyTemplate: body,
        items: g.items,
      };
      results.push(await prepareExpediteDispatch(params));
    }
    return results;
  }

  async function handleSendAll() {
    // Validate: every supplier needs at least one TO email
    const missing = new Set<string>();
    for (const g of groups) {
      if (getEmails(g.supplierId, 'to').length === 0) missing.add(g.supplierId);
    }
    if (missing.size > 0) {
      setValidationErrors(missing);
      return;
    }
    setValidationErrors(new Set());
    setSendPhase({ phase: 'sending', current: 0, total: groups.length });
    const results = await dispatchGroups(groups);
    setSendPhase({ phase: 'done', results });
  }

  async function handleRetryFailed() {
    if (sendPhase.phase !== 'done') return;
    const prevResults = sendPhase.results;
    const failedNames = new Set(prevResults.filter((r) => !r.success).map((r) => r.supplierName));
    const failedGroups = groups.filter((g) => failedNames.has(g.supplierName));
    if (failedGroups.length === 0) return;

    setSendPhase({ phase: 'sending', current: 0, total: failedGroups.length });
    const newResults = await dispatchGroups(failedGroups);

    // Merge: keep prior successes, replace failed rows with fresh results
    setSendPhase({
      phase: 'done',
      results: [...prevResults.filter((r) => r.success), ...newResults],
    });
  }

  /* ── Empty state ── */
  if (selectedItems.length === 0) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50 p-6">
        <p className="text-slate-500 mb-4 text-sm">No items in the expedite queue.</p>
        <Link href="/" className="text-sm font-semibold text-[#307c4c] hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  /* ── Full success state ── */
  if (sendPhase.phase === 'done' && sendPhase.results.every((r) => r.success)) {
    const count = sendPhase.results.length;
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-[#307c4c]/10 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Emails dispatched successfully.</h2>
          <p className="text-slate-500 mb-8">
            {count} supplier{count !== 1 ? 's' : ''} notified.
          </p>
          <button
            onClick={() => { clearSelection(); router.push('/'); }}
            className="w-full inline-flex items-center justify-center h-12 bg-[#307c4c] hover:bg-[#26663e] text-white font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#307c4c]/20"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* ── Partial / full failure state ── */
  if (sendPhase.phase === 'done') {
    const succeeded = sendPhase.results.filter((r) => r.success);
    const failed = sendPhase.results.filter((r) => !r.success);
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-lg w-full animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Partial dispatch</h2>
              <p className="text-xs text-slate-500">
                {succeeded.length} succeeded · {failed.length} failed
              </p>
            </div>
          </div>
          <div className="space-y-2 mb-6">
            {failed.map((r) => (
              <div key={r.supplierName} className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-red-700">{r.supplierName}</p>
                  {r.error && (
                    <p className="text-[10px] text-red-500 mt-0.5 font-mono">{r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetryFailed}
              className="flex-1 h-10 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Retry Failed
            </button>
            <button
              onClick={() => { clearSelection(); router.push('/'); }}
              className="flex-1 h-10 bg-[#1e293b] hover:bg-black text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSending = sendPhase.phase === 'sending';

  /* ── Main render ── */
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900 pt-16 pb-24 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 md:h-16 px-4 md:px-8 flex items-center border-b border-gray-100 bg-white/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          </span>
          <span className="text-sm font-bold text-slate-900 tracking-tight hidden sm:block">NESR</span>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Page header */}
        <header className="mb-8">
          <Link
            href="/expedite"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-[#307c4c] mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Expedite Queue
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Confirm &amp; Dispatch</h1>
          <p className="text-slate-500 mt-1">
            Review the email template and recipients before sending to{' '}
            {groups.length} supplier{groups.length !== 1 ? 's' : ''}.
          </p>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── LEFT: Email Template ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h2 className="text-sm font-bold text-slate-700">Email Template</h2>
            </div>

            <div className="p-6 space-y-5">
              {/* Subject */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/25 focus:border-[#307c4c] transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={17}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#307c4c]/25 focus:border-[#307c4c] transition-colors"
                />
              </div>

              {/* Placeholder legend */}
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Auto-substituted per recipient
                </p>
                <div className="flex flex-wrap gap-2">
                  <PlaceholderPill label="{Supplier Name}" />
                  <PlaceholderPill label="{Supplier Link}" />
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  These placeholders are replaced automatically for each supplier before sending. The supplier link is a unique, token-protected URL generated per batch.
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Dispatch Summary ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h2 className="text-sm font-bold text-slate-700">Dispatch Summary</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 whitespace-nowrap">Supplier</th>
                    <th className="py-3 px-4 whitespace-nowrap">To</th>
                    <th className="py-3 px-4 whitespace-nowrap">CC</th>
                    <th className="py-3 px-4 whitespace-nowrap text-center">Lines</th>
                    <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {groups.map((g) => {
                    const toList = getEmails(g.supplierId, 'to');
                    const ccList = getEmails(g.supplierId, 'cc');
                    const hasError = validationErrors.has(g.supplierId);
                    const isReady = toList.length > 0;
                    const rowKey = g.supplierId || g.supplierName;

                    return (
                      <tr
                        key={rowKey}
                        className={`transition-colors ${hasError ? 'bg-amber-50/70' : 'hover:bg-slate-50/50'}`}
                      >
                        {/* Supplier */}
                        <td className="py-3 px-4 align-top">
                          <p
                            className="text-xs font-semibold text-slate-700 max-w-[110px] truncate"
                            title={g.supplierName}
                          >
                            {g.supplierName}
                          </p>
                          {g.supplierId && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{g.supplierId}</p>
                          )}
                        </td>

                        {/* TO — click to edit */}
                        <td className="py-2 px-4 align-middle w-[160px]">
                          {editingCell?.supplierId === g.supplierId && editingCell.field === 'to' ? (
                            <input
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null
                                )
                              }
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-full text-xs border border-[#307c4c] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#307c4c]"
                              placeholder="email1@x.com, email2@x.com"
                            />
                          ) : (
                            <button
                              onClick={() =>
                                setEditingCell({
                                  supplierId: g.supplierId,
                                  field: 'to',
                                  value: toList.join(', '),
                                })
                              }
                              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-100 group ${hasError ? 'text-amber-700' : 'text-slate-600'}`}
                              title="Click to edit"
                            >
                              {toList.length > 0 ? (
                                <span className="truncate block leading-snug">{toList.join(', ')}</span>
                              ) : (
                                <span className={`italic flex items-center gap-1 ${hasError ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {hasError ? (
                                    <>
                                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                                      </svg>
                                      Required
                                    </>
                                  ) : (
                                    'Click to add'
                                  )}
                                </span>
                              )}
                            </button>
                          )}
                        </td>

                        {/* CC — click to edit */}
                        <td className="py-2 px-4 align-middle w-[160px]">
                          {editingCell?.supplierId === g.supplierId && editingCell.field === 'cc' ? (
                            <input
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null
                                )
                              }
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
                              placeholder="cc@email.com"
                            />
                          ) : (
                            <button
                              onClick={() =>
                                setEditingCell({
                                  supplierId: g.supplierId,
                                  field: 'cc',
                                  value: ccList.join(', '),
                                })
                              }
                              className="w-full text-left text-xs text-slate-500 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                              title="Click to edit"
                            >
                              {ccList.length > 0 ? (
                                <span className="truncate block leading-snug">{ccList.join(', ')}</span>
                              ) : (
                                <span className="italic text-slate-400">None</span>
                              )}
                            </button>
                          )}
                        </td>

                        {/* Lines */}
                        <td className="py-3 px-4 text-center align-middle">
                          <span className="text-xs font-semibold text-slate-600">{g.items.length}</span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 align-middle">
                          {isReady ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              Missing Email
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{groups.length}</span>{' '}
                supplier{groups.length !== 1 ? 's' : ''}
                {' · '}
                <span className="font-semibold text-slate-700">{totalLines}</span>{' '}
                PO line{totalLines !== 1 ? 's' : ''} total
              </p>
              {validationErrors.size > 0 && (
                <p className="mt-1 text-[10px] text-amber-600 font-medium">
                  {validationErrors.size} supplier{validationErrors.size !== 1 ? 's are' : ' is'} missing a To email — click the cell to add one.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_32px_rgba(0,0,0,0.05)] px-4 sm:px-6 py-4 animate-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">

          {/* Back */}
          <Link
            href="/expedite"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>

          {/* Send All */}
          <button
            onClick={handleSendAll}
            disabled={isSending}
            className="flex items-center gap-2 bg-[#1e293b] hover:bg-black text-white text-sm font-semibold px-8 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-black/10"
          >
            {isSending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending ({sendPhase.current}/{sendPhase.total})…
              </>
            ) : (
              <>
                Send All
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
