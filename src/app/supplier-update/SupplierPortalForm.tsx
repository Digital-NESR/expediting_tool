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
        new_delivery_date: line.new_delivery_date ?? '',
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
  const [errors, setErrors] = useState<Record<string, { status: boolean; date: boolean }>>({});

  /* ── Submit state ── */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ── Refs for scroll-to-error ── */
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

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
    setExpandedPOs((prev) => {
      const next = new Set(prev);
      if (next.has(po_number)) next.delete(po_number);
      else next.add(po_number);
      return next;
    });
  }

  /* ── Submit handler ── */
  async function handleSubmit() {
    const newErrors: typeof errors = {};
    let firstErrorKey: string | null = null;

    for (const line of data.lines) {
      const key = lineKey(line.po_number, line.po_line);
      const state = formState[key];
      const statusMissing = !state.delivery_status_code;
      const dateMissing =
        state.delivery_status_code === 'DS05' && !state.new_delivery_date;

      if (statusMissing || dateMissing) {
        newErrors[key] = { status: statusMissing, date: dateMissing };
        if (!firstErrorKey) firstErrorKey = key;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (firstErrorKey) {
        // Expand the PO that contains the first error
        const [poNumber] = firstErrorKey.split(':');
        setExpandedPOs((prev) => new Set([...prev, poNumber]));
        // Wait one tick for the row to render
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
        new_delivery_date:
          state.delivery_status_code === 'DS05' && state.new_delivery_date
            ? state.new_delivery_date
            : null,
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">Updates Submitted Successfully</h2>
        <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-1">
          Thank you, <span className="font-semibold text-slate-700">{data.supplier_name}</span>. Your delivery updates have been recorded and shared with the NESR procurement team.
        </p>
        <p className="text-slate-400 text-xs max-w-sm leading-relaxed mt-3">
          This link has now been deactivated. If you need to make corrections, please contact your assigned buyer directly.
        </p>
        <div className="mt-10 flex items-center gap-2 text-slate-400">
          <img src="/nesr-logo-circle.png" height="20" alt="NESR" className="opacity-50" />
          <span className="text-xs">NESR Procurement</span>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="pb-24">

      {/* Supplier info bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5 text-sm text-gray-500">
        <span>
          Updating for:{' '}
          <span className="font-semibold text-gray-700">{data.supplier_name}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          Buyer:{' '}
          <span className="font-semibold text-gray-700">{data.buyer_name}</span>
        </span>
        <span className="text-gray-300">·</span>
        <span>
          <span className="font-semibold text-gray-700">{data.lines.length}</span> PO line{data.lines.length !== 1 ? 's' : ''} across{' '}
          <span className="font-semibold text-gray-700">{uniquePOCount}</span> PO{uniquePOCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Instructions banner */}
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6 text-sm text-emerald-800">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>
          Review the PO lines below and provide a delivery status update for each line.
          All updates are submitted together when you click <strong>Submit</strong> at the bottom.
        </p>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                <th className="py-3 px-3 w-8" />
                <th className="py-3 px-3 whitespace-nowrap">Line</th>
                <th className="py-3 px-3 whitespace-nowrap">SAP MAT ID</th>
                <th className="py-3 px-3 whitespace-nowrap">Description</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">Open QTY</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">Value (USD)</th>
                <th className="py-3 px-3 whitespace-nowrap">Current Delivery</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[200px]">Status</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[140px]">New Del. Date</th>
                <th className="py-3 px-3 whitespace-nowrap min-w-[200px]">Comments</th>
              </tr>
            </thead>

            {poGroups.map((group) => {
              const isExpanded = expandedPOs.has(group.po_number);

              return (
                <tbody key={group.po_number}>
                  {/* PO parent row */}
                  <tr
                    className="cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
                    onClick={() => togglePO(group.po_number)}
                  >
                    <td className="py-3 px-3" colSpan={10}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-bold text-sm text-gray-800 font-mono">
                            {group.po_number}
                          </span>
                          <span className="text-xs text-gray-400">
                            {group.lines.length} line{group.lines.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-[#059669] tabular-nums">
                          {formatCurrency(group.totalValue)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Line item rows */}
                  {isExpanded && group.lines.map((line) => {
                    const key = lineKey(line.po_number, line.po_line);
                    const state = formState[key];
                    const err = errors[key];
                    const isDS05 = state.delivery_status_code === 'DS05';

                    return (
                      <tr
                        key={key}
                        ref={(el) => {
                          if (el) rowRefs.current.set(key, el);
                          else rowRefs.current.delete(key);
                        }}
                        className={`border-b border-gray-100 transition-colors ${
                          err ? 'bg-red-50/40' : 'hover:bg-gray-50/50'
                        }`}
                      >
                        {/* Indent spacer */}
                        <td className="py-3 px-3 w-8">
                          <div className="w-6 border-l-2 border-gray-200 h-4 ml-2" />
                        </td>

                        {/* Line */}
                        <td className="py-3 px-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {line.po_line || '—'}
                        </td>

                        {/* SAP MAT ID */}
                        <td className="py-3 px-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {line.sap_mat_id || '—'}
                        </td>

                        {/* Description */}
                        <td className="py-3 px-3 text-xs text-gray-500 max-w-[180px] truncate" title={line.item_description ?? ''}>
                          {line.item_description || '—'}
                        </td>

                        {/* Open QTY */}
                        <td className="py-3 px-3 text-xs text-gray-400 text-right tabular-nums whitespace-nowrap">
                          {line.open_qty != null ? Number(line.open_qty).toLocaleString() : '—'}
                        </td>

                        {/* Value */}
                        <td className="py-3 px-3 text-xs text-gray-400 text-right tabular-nums whitespace-nowrap">
                          {formatCurrency(line.open_po_value_usd)}
                        </td>

                        {/* Current Delivery */}
                        <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(line.delivery_date)}
                        </td>

                        {/* Status select */}
                        <td className="py-2 px-3">
                          <select
                            value={state.delivery_status_code}
                            onChange={(e) =>
                              updateLine(key, 'delivery_status_code', e.target.value)
                            }
                            className={`w-full text-xs rounded-lg px-2.5 py-2 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#059669]/30 focus:border-[#059669] ${
                              err?.status
                                ? 'border-2 border-red-500 bg-red-50'
                                : 'border border-gray-200 hover:border-gray-300'
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
                            <p className="mt-1 text-[10px] text-red-500 font-medium">
                              Status required.
                            </p>
                          )}
                        </td>

                        {/* New delivery date — DS05 only */}
                        <td className="py-2 px-3">
                          {isDS05 ? (
                            <>
                              <input
                                type="date"
                                value={state.new_delivery_date}
                                onChange={(e) =>
                                  updateLine(key, 'new_delivery_date', e.target.value)
                                }
                                className={`w-full text-xs rounded-lg px-2.5 py-2 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#059669]/30 focus:border-[#059669] ${
                                  err?.date
                                    ? 'border-2 border-red-500 bg-red-50'
                                    : 'border border-gray-200 hover:border-gray-300'
                                }`}
                              />
                              {err?.date && (
                                <p className="mt-1 text-[10px] text-red-500 font-medium">
                                  Date required for DS05.
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 italic">—</span>
                          )}
                        </td>

                        {/* Comments */}
                        <td className="py-2 px-3">
                          <textarea
                            rows={2}
                            value={state.supplier_comments}
                            onChange={(e) =>
                              updateLine(key, 'supplier_comments', e.target.value)
                            }
                            placeholder="Optional comment…"
                            className="w-full text-xs rounded-lg px-2.5 py-1.5 border border-gray-200 bg-white resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#059669]/30 focus:border-[#059669] transition-colors placeholder-gray-300 focus:rows-4"
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
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 z-20 bg-white border-t border-gray-200 shadow-[0_-2px_16px_rgba(0,0,0,0.06)] -mx-6 px-6 py-4">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400 text-center sm:text-left">
            All changes are saved together on submit.{' '}
            <span className="text-gray-500">This link will expire after submission.</span>
          </p>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold px-8 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md shadow-[#059669]/20"
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
