'use client';

import { useState, useMemo, useRef } from 'react';
import type { PortalData, LineUpdate } from '@/app/actions/supplierPortal';
import { submitSupplierUpdates } from '@/app/actions/supplierPortal';

/* ─── DS code list ───────────────────────────────────────── */
const DS_CODES = [
  { code: 'DS01', label: 'DS01 – PO Copy Not Received' },
  { code: 'DS02', label: 'DS02 – PO Rejected' },
  { code: 'DS03', label: 'DS03 – PO Pending Revision' },
  { code: 'DS04', label: 'DS04 – PO Acknowledged - Delivery On Time' },
  { code: 'DS05', label: 'DS05 – PO Acknowledged - Delivery Delay' },
  { code: 'DS06', label: 'DS06 – Delivery On Hold - Pending Import Permit' },
  { code: 'DS07', label: 'DS07 – Delivery On Hold - Pending LC' },
  { code: 'DS08', label: 'DS08 – Delivery On Hold - Pending Advance Payment' },
  { code: 'DS09', label: 'DS09 – Delivery On Hold - Others' },
  { code: 'DS10', label: 'DS10 – Delivery On-Hold - Payment Issues' },
  { code: 'DS11', label: 'DS11 – Delivered & Invoiced' },
  { code: 'DS12', label: 'DS12 – Service Ongoing' },
  { code: 'DS13', label: 'DS13 – Service Completed' },
  { code: 'DS14', label: 'DS14 – Shipped - In Transit' },
  { code: 'DS15', label: 'DS15 – Ready for Collection' },
  { code: 'DS16', label: 'DS16 – Collected by Freight Forwarder' },
  { code: 'DS17', label: 'DS17 – Customs Clearance' },
  { code: 'DS18', label: 'DS18 – Products Delivered to Base' },
];

/* ─── Helpers ────────────────────────────────────────────── */
function formatCurrency(val: number | string | null | undefined) {
  const n = Number(val);
  if (val == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return dateStr;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d);
}

function toInputDate(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return '';
  return d.toISOString().split('T')[0];
}

const formatMatId = (id: string | null | undefined) =>
  id?.trim() ? id : <span className="text-gray-400 italic">Service</span>;

function lineKey(po_number: string, po_line: string) {
  return `${po_number}:${po_line}`;
}

/* ─── Line form state type ───────────────────────────────── */
interface LineFormState {
  delivery_status_code: string;
  new_delivery_date: string;
  supplier_comments: string;
}

/* ─── Props ──────────────────────────────────────────────── */
interface Props {
  token: string;
  data: PortalData;
}

/* ─── Component ──────────────────────────────────────────── */
export function SupplierPortalForm({ token, data }: Props) {
  /* ── Form state — keyed by "po_number:po_line" ── */
  const [formState, setFormState] = useState<Record<string, LineFormState>>(() => {
    const init: Record<string, LineFormState> = {};
    for (const line of data.lines) {
      init[lineKey(line.po_number, line.po_line)] = {
        delivery_status_code: line.current_status ?? '',
        new_delivery_date: toInputDate(line.delivery_date),
        supplier_comments: line.supplier_comments ?? '',
      };
    }
    return init;
  });

  /* ── Expanded POs — all start open ── */
  const allPONumbers = useMemo(
    () => [...new Set(data.lines.map((l) => l.po_number))],
    [data.lines]
  );
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(
    () => new Set(allPONumbers)
  );

  /* ── Validation errors — keyed by line key ── */
  const [errors, setErrors] = useState<Record<string, { status: boolean }>>({});

  /* ── Submit state ── */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ── Refs for scroll-to-error ── */
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  /* ── Bulk-apply state ── */
  const [bulkApplyPO, setBulkApplyPO] = useState<string | null>(null);
  const [bulkForm, setBulkForm] = useState<{ status: string; date: string; comments: string }>(
    { status: '', date: '', comments: '' }
  );

  /* ── PO groups ── */
  const poGroups = useMemo(() => {
    const map = new Map<string, typeof data.lines>();
    for (const line of data.lines) {
      if (!map.has(line.po_number)) map.set(line.po_number, []);
      map.get(line.po_number)!.push(line);
    }
    return Array.from(map.entries()).map(([po_number, lines]) => ({
      po_number,
      lines,
      totalValue: lines.reduce((s, l) => s + Number(l.open_po_value_usd ?? 0), 0),
    }));
  }, [data.lines]);

  const uniquePOCount = poGroups.length;

  /* ── Helpers ── */
  function updateLine(key: string, field: keyof LineFormState, value: string) {
    setFormState((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function togglePO(po_number: string) {
    if (expandedPOs.has(po_number) && bulkApplyPO === po_number) setBulkApplyPO(null);
    setExpandedPOs((prev) => {
      const next = new Set(prev);
      if (next.has(po_number)) next.delete(po_number);
      else next.add(po_number);
      return next;
    });
  }

  function openBulkApply(po_number: string, lines: typeof data.lines) {
    const earliest = lines.map((l) => l.delivery_date).filter(Boolean).sort()[0] ?? '';
    setBulkForm({ status: '', date: toInputDate(earliest), comments: '' });
    setBulkApplyPO(po_number);
    setExpandedPOs((prev) => new Set([...prev, po_number]));
  }

  function applyBulk(po_number: string, lines: typeof data.lines) {
    setFormState((prev) => {
      const next = { ...prev };
      for (const line of lines) {
        const key = lineKey(line.po_number, line.po_line);
        next[key] = {
          delivery_status_code: bulkForm.status,
          new_delivery_date: bulkForm.date,
          supplier_comments: bulkForm.comments,
        };
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const line of lines) delete next[lineKey(line.po_number, line.po_line)];
      return next;
    });
    setBulkApplyPO(null);
  }

  /* ── Submit handler ── */
  async function handleSubmit() {
    const newErrors: typeof errors = {};
    let firstErrorKey: string | null = null;

    for (const line of data.lines) {
      const key = lineKey(line.po_number, line.po_line);
      const state = formState[key];
      const statusMissing = !state.delivery_status_code;

      if (statusMissing) {
        newErrors[key] = { status: statusMissing };
        if (!firstErrorKey) firstErrorKey = key;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (firstErrorKey) {
        const [poNumber] = firstErrorKey.split(':');
        setExpandedPOs((prev) => new Set([...prev, poNumber]));
        setTimeout(() => {
          rowRefs.current
            .get(firstErrorKey!)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setSubmitError(null);

    const updates: LineUpdate[] = data.lines.map((line) => {
      const key = lineKey(line.po_number, line.po_line);
      const state = formState[key];
      return {
        po_number: line.po_number,
        po_line: line.po_line,
        delivery_status_code: state.delivery_status_code,
        new_delivery_date: state.new_delivery_date || null,
        supplier_comments: state.supplier_comments,
      };
    });

    const result = await submitSupplierUpdates(token, updates);
    setIsSubmitting(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      setSubmitError(result.error ?? 'Submission failed. Please try again.');
    }
  }

  /* ── Success state ── */
  if (submitted) {
    return (
      <div style={{ maxWidth: '480px', margin: '80px auto', background: '#fff', borderRadius: '16px', padding: '48px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginTop: '24px' }}>
          Updates Submitted Successfully
        </h2>
        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginTop: '12px' }}>
          Thank you, <strong style={{ color: '#374151' }}>{data.supplier_name}</strong>. Your delivery updates have been recorded and shared with the NESR procurement team.
        </p>
        <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '24px 0' }} />
        <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
          This link has now been deactivated. If you need to make corrections, please contact your assigned buyer directly.
        </p>
        <div style={{ marginTop: '20px' }}>
          <img
            src="/nesr-logo-circle.png"
            alt="NESR"
            style={{ height: '24px', width: 'auto', opacity: 0.4, margin: '0 auto' }}
          />
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="pb-24">

      {/* Supplier info bar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-6 text-sm text-gray-500">
        <span>
          Updating for:{' '}
          <span className="font-semibold text-gray-800">{data.supplier_name}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          Buyer:{' '}
          <span className="font-semibold text-gray-800">{data.buyer_name}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="font-semibold text-gray-800">{data.lines.length}</span>{' '}
          PO line{data.lines.length !== 1 ? 's' : ''} across{' '}
          <span className="font-semibold text-gray-800">{uniquePOCount}</span>{' '}
          PO{uniquePOCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Instructions banner */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg mb-6 text-sm text-[#065f46]">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>
          Review the PO lines below and provide a delivery status update for each line.
          All updates are submitted together when you click <strong>Submit</strong> at the bottom.
        </p>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-xl border border-[#e2e8f0] shadow-sm mb-6">
        <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-[#f1f5f9] text-[11px] font-semibold text-gray-500 uppercase tracking-[0.05em]"
                style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th className="py-2.5 px-3 w-8" />
              <th className="py-2.5 px-3 whitespace-nowrap text-left">Line</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left">SAP MAT ID</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left">Description</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">Open QTY</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">Value (USD)</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left">Current Delivery</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left min-w-[200px]">Status</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left min-w-[140px]">New Del. Date</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-left min-w-[180px]">Comments</th>
            </tr>
          </thead>

          {poGroups.map((group) => {
            const isExpanded = expandedPOs.has(group.po_number);

            return (
              <tbody key={group.po_number}>
                {/* PO parent row */}
                <tr
                  className="cursor-pointer bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
                  style={{ borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}
                  onClick={() => togglePO(group.po_number)}
                >
                  <td className="py-3 px-4" colSpan={10}>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2.5">
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-bold text-gray-800 font-mono">
                          {group.po_number}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.lines.length} line{group.lines.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 ml-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); openBulkApply(group.po_number, group.lines); }}
                          className="text-xs font-medium text-[#059669] hover:text-[#047857] hover:underline transition-colors"
                        >
                          Set all lines →
                        </button>
                        <span className="text-sm font-semibold text-[#059669] tabular-nums">
                          {formatCurrency(group.totalValue)}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Bulk-apply banner */}
                {isExpanded && bulkApplyPO === group.po_number && (
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td colSpan={10} className="p-0">
                      <div className="bg-slate-50 border-y border-slate-200 px-6 py-4">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                          Apply to all {group.lines.length} lines in PO {group.po_number}
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                          {/* Status */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-slate-500">Status</label>
                            <select
                              value={bulkForm.status}
                              onChange={(e) => setBulkForm((p) => ({ ...p, status: e.target.value }))}
                              className="text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] min-w-[220px]"
                            >
                              <option value="">Select status…</option>
                              {DS_CODES.map((ds) => (
                                <option key={ds.code} value={ds.code}>{ds.label}</option>
                              ))}
                            </select>
                          </div>
                          {/* Date */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium text-slate-500">New Delivery Date</label>
                            <input
                              type="date"
                              value={bulkForm.date}
                              onChange={(e) => setBulkForm((p) => ({ ...p, date: e.target.value }))}
                              className="text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] min-w-[150px]"
                            />
                          </div>
                          {/* Comments */}
                          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <label className="text-[11px] font-medium text-slate-500">Comments (optional)</label>
                            <textarea
                              rows={1}
                              value={bulkForm.comments}
                              onChange={(e) => setBulkForm((p) => ({ ...p, comments: e.target.value }))}
                              placeholder="Optional comment…"
                              className="text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] placeholder-gray-300"
                            />
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            <button
                              onClick={() => applyBulk(group.po_number, group.lines)}
                              disabled={!bulkForm.status}
                              className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-md px-4 py-1.5 transition-colors"
                            >
                              Apply to all {group.lines.length} lines
                            </button>
                            <button
                              onClick={() => setBulkApplyPO(null)}
                              className="text-[13px] text-slate-500 hover:text-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Line item rows */}
                {isExpanded && group.lines.map((line) => {
                  const key = lineKey(line.po_number, line.po_line);
                  const state = formState[key];
                  const err = errors[key];

                  return (
                    <tr
                      key={key}
                      ref={(el) => {
                        if (el) rowRefs.current.set(key, el);
                        else rowRefs.current.delete(key);
                      }}
                      className={`transition-colors ${err ? 'bg-red-50/40' : 'bg-white hover:bg-[#fafafa]'}`}
                      style={{ borderBottom: '1px solid #f1f5f9' }}
                    >
                      {/* Indent spacer */}
                      <td className="py-2.5 px-3 w-8">
                        <div className="w-5 h-4 border-l-2 border-gray-100 ml-2" />
                      </td>

                      {/* Line */}
                      <td className="py-2.5 px-3 font-mono text-[13px] text-gray-500 whitespace-nowrap">
                        {line.po_line || '—'}
                      </td>

                      {/* SAP MAT ID */}
                      <td className="py-2.5 px-3 font-mono text-[13px] text-gray-500 whitespace-nowrap">
                        {formatMatId(line.sap_mat_id)}
                      </td>

                      {/* Description */}
                      <td className="py-2.5 px-3 text-[13px] text-gray-500" style={{ minWidth: '200px' }}>
                        {line.item_description || '—'}
                      </td>

                      {/* Open QTY */}
                      <td className="py-2.5 px-3 text-[13px] text-gray-500 text-right tabular-nums whitespace-nowrap">
                        {line.sap_mat_id?.trim()
                          ? Number(line.open_qty ?? 0).toLocaleString()
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Value */}
                      <td className="py-2.5 px-3 text-[13px] text-gray-500 text-right tabular-nums whitespace-nowrap">
                        {formatCurrency(line.open_po_value_usd)}
                      </td>

                      {/* Current Delivery */}
                      <td className="py-2.5 px-3 text-[13px] text-gray-500 whitespace-nowrap">
                        {formatDate(line.delivery_date)}
                      </td>

                      {/* Status select */}
                      <td className="py-2 px-3">
                        <select
                          value={state.delivery_status_code}
                          onChange={(e) => updateLine(key, 'delivery_status_code', e.target.value)}
                          className={`w-full min-w-[200px] text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white transition-colors focus:outline-none focus:ring-2 focus:border-[#059669] focus:ring-[#059669]/20 ${
                            err?.status
                              ? 'border border-red-400 focus:ring-red-400/20'
                              : 'border border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <option value="">Select status…</option>
                          {DS_CODES.map((ds) => (
                            <option key={ds.code} value={ds.code}>
                              {ds.label}
                            </option>
                          ))}
                        </select>
                        {err?.status && (
                          <p className="mt-1 text-[11px] text-red-500 font-medium">
                            Status required.
                          </p>
                        )}
                      </td>

                      {/* New delivery date */}
                      <td className="py-2 px-3">
                        <input
                          type="date"
                          value={state.new_delivery_date}
                          onChange={(e) => updateLine(key, 'new_delivery_date', e.target.value)}
                          className="w-full min-w-[140px] text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669]"
                        />
                      </td>

                      {/* Comments */}
                      <td className="py-2 px-3">
                        <textarea
                          rows={2}
                          value={state.supplier_comments}
                          onChange={(e) => updateLine(key, 'supplier_comments', e.target.value)}
                          placeholder="Optional comment…"
                          className="w-full min-w-[180px] text-[13px] text-gray-800 rounded-md px-2.5 py-1.5 bg-white border border-gray-300 hover:border-gray-400 resize-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] placeholder-gray-300"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 z-20 bg-white -mx-8 px-8 py-4"
           style={{ borderTop: '1px solid #e5e7eb' }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            All changes are saved together on submit.{' '}
            <span style={{ color: '#4b5563', fontWeight: 500 }}>
              This link will expire after submission.
            </span>
          </p>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#059669] hover:bg-[#047857] text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting…
              </>
            ) : (
              <>
                Submit Updates
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
