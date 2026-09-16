'use client';

/* ─── The three drill-down modals. Each opens from a row in one of the tables and fetches its own
   detail, so a closed modal costs nothing. ─── */

import DetailModal from '@/components/DetailModal';
import {
  getAdminSessionDetail,
  getAdminSupplierDetail,
  getBuyerDetail,
} from '@/app/actions/adminAnalytics';
import type {
  AdminSessionDetailLine,
  AdminSupplierDetailLine,
  BuyerRow,
  BuyerSessionRow,
  RecentSession,
} from '@/app/actions/adminAnalytics';
import {
  DSTooltipBadge,
  ModalEmpty,
  ModalLoading,
  RateBadge,
  ResponseBadge,
  StatPill,
} from '@/app/po-expediting/analytics/_components';
import { formatCurrency, formatDate, formatSessionDate } from '@/lib/format';
import { useEffect, useMemo, useState } from 'react';

/* ─── Buyer Detail Modal ─────────────────────────────────────── */

export function BuyerDetailModal({
  buyer,
  onClose,
  onSessionClick,
}: {
  buyer: BuyerRow;
  onClose: () => void;
  onSessionClick: (session: RecentSession) => void;
}) {
  const [rows, setRows] = useState<BuyerSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuyerDetail(buyer.email)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [buyer.email]);

  const totalLines = rows.reduce((s, r) => s + r.total_po_lines, 0);
  const totalSuppliers = rows.reduce((s, r) => s + r.total_suppliers, 0);
  const rates = rows.map((r) => r.response_rate_pct).filter((v): v is number => v != null);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  function handleSessionClick(bsr: BuyerSessionRow) {
    const session: RecentSession = {
      session_ref: bsr.session_ref,
      dispatched_at: bsr.dispatched_at,
      dispatched_by: buyer.email,
      display_name: buyer.display_name,
      total_suppliers: bsr.total_suppliers,
      total_po_lines: bsr.total_po_lines,
      total_emails_sent: bsr.total_emails_sent,
      suppliers_responded: bsr.suppliers_responded,
      response_rate_pct: bsr.response_rate_pct,
      fully_closed: bsr.fully_closed,
    };
    onClose();
    onSessionClick(session);
  }

  return (
    <DetailModal isOpen title={buyer.display_name ?? buyer.email} onClose={onClose}>
      {/* Sub-title + stats */}
      <div className="px-6 pt-1 pb-3 border-b border-slate-100">
        {buyer.job_title && <p className="text-sm text-slate-500 mb-2">{buyer.job_title}</p>}
        <div className="flex flex-wrap gap-2">
          <StatPill label="Sessions" value={rows.length} />
          <StatPill label="Total Lines" value={totalLines.toLocaleString()} />
          <StatPill label="Total Suppliers" value={totalSuppliers.toLocaleString()} />
          <StatPill label="Avg Response Rate" value={avgRate != null ? `${avgRate}%` : '—'} />
        </div>
      </div>

      {/* Sessions list */}
      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && rows.length === 0 && (
          <ModalEmpty message="No sessions found for this buyer." />
        )}
        {!loading && rows.length > 0 && (
          <div className="rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Suppliers</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">PO Lines</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Emails Sent</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Responded</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Response Rate</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.session_ref}
                    onClick={() => handleSessionClick(r)}
                    className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                  >
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      <span className="group inline-flex items-center gap-1.5">
                        {formatSessionDate(r.dispatched_at)}
                        <svg
                          className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity text-slate-500"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                      {r.total_suppliers}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                      {r.total_po_lines}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                      {r.total_emails_sent}
                    </td>
                    <td className="py-3 px-4 text-sm text-center font-medium text-slate-700 tabular-nums">
                      {r.suppliers_responded != null
                        ? `${r.suppliers_responded} / ${r.total_suppliers}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <RateBadge rate={r.response_rate_pct} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.fully_closed === true ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
                          Closed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                          Open
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DetailModal>
  );
}

/* ─── Admin Supplier Detail Modal ────────────────────────────── */

export function AdminSupplierDetailModal({
  supplierName,
  onClose,
}: {
  supplierName: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<AdminSupplierDetailLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAdminSupplierDetail(supplierName)
      .then((data) => {
        setLines(data);
        const pos = new Set(data.map((l) => l.po_number));
        setExpanded(pos);
      })
      .finally(() => setLoading(false));
  }, [supplierName]);

  const groups = useMemo(() => {
    const map = new Map<string, AdminSupplierDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.po_number) ?? [];
      arr.push(l);
      map.set(l.po_number, arr);
    }
    return Array.from(map.entries()).map(([po, poLines]) => ({ po, lines: poLines }));
  }, [lines]);

  const totalLines = lines.length;
  const totalResponded = lines.filter((l) => l.workflow_state === 'Submitted').length;

  function togglePO(po: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(po)) {
        next.delete(po);
      } else {
        next.add(po);
      }
      return next;
    });
  }

  const colHeaders = [
    'Line',
    'Buyer',
    'SAP MAT ID',
    'Description',
    'Open QTY',
    'Value (USD)',
    'Original Del. Date',
    'New Del. Date',
    'DS Status',
    'Supplier Comments',
    'Response',
  ];

  return (
    <DetailModal isOpen title={supplierName} onClose={onClose}>
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="POs" value={groups.length} />
      </div>

      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && (
          <ModalEmpty message="No lines found for this supplier." />
        )}

        {!loading &&
          groups.map(({ po, lines: poLines }) => {
            const isOpen = expanded.has(po);
            const responded = poLines.filter((l) => l.workflow_state === 'Submitted').length;
            return (
              <div key={po} className="mb-3 border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => togglePO(po)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-bold text-sm text-slate-800">PO {po}</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {poLines.length} line{poLines.length !== 1 ? 's' : ''}
                  </span>
                  <span className="ml-auto text-xs font-medium text-slate-500">
                    {responded} / {poLines.length} responded
                  </span>
                </button>

                {isOpen && (
                  <div>
                    <table
                      className="w-full text-left border-collapse"
                      style={{ tableLayout: 'fixed' }}
                    >
                      <colgroup>
                        <col style={{ width: 60 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 110 }} />
                        <col />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 100 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 100 }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {colHeaders.map((h) => (
                            <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {poLines.map((line, i) => (
                          <tr
                            key={line.po_line}
                            className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                          >
                            <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">
                              {line.po_line}
                            </td>
                            <td
                              className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate"
                              title={line.buyer_display_name ?? line.buyer_email}
                            >
                              {line.buyer_display_name ?? line.buyer_email}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {line.sap_mat_id || '—'}
                            </td>
                            <td
                              className="py-2.5 px-3 text-xs text-slate-700 overflow-hidden truncate"
                              title={line.item_description ?? undefined}
                            >
                              {line.item_description || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                              {line.open_qty != null ? line.open_qty.toLocaleString() : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                              {formatCurrency(line.open_po_value_usd)}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {formatDate(line.original_delivery_date)}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {formatDate(line.new_delivery_date)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <DSTooltipBadge code={line.sap_delivery_code} />
                            </td>
                            <td
                              className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate"
                              title={line.supplier_comments ?? undefined}
                            >
                              {line.supplier_comments || '—'}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <ResponseBadge state={line.workflow_state} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </DetailModal>
  );
}

/* ─── Admin Session Detail Modal ─────────────────────────────── */

export function AdminSessionDetailModal({
  session,
  onClose,
}: {
  session: RecentSession;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<AdminSessionDetailLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getAdminSessionDetail(session.session_ref)
      .then((data) => {
        setLines(data);
        const suppliers = new Set(data.map((l) => l.supplier_name));
        setExpanded(suppliers);
      })
      .finally(() => setLoading(false));
  }, [session.session_ref]);

  const groups = useMemo(() => {
    const map = new Map<string, AdminSessionDetailLine[]>();
    for (const l of lines) {
      const arr = map.get(l.supplier_name) ?? [];
      arr.push(l);
      map.set(l.supplier_name, arr);
    }
    return Array.from(map.entries()).map(([supplier, supplierLines]) => ({
      supplier,
      lines: supplierLines,
    }));
  }, [lines]);

  const totalLines = lines.length;
  const totalResponded = lines.filter((l) => l.workflow_state === 'Submitted').length;

  function toggleSupplier(supplier: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(supplier)) {
        next.delete(supplier);
      } else {
        next.add(supplier);
      }
      return next;
    });
  }

  const colHeaders = [
    'PO Number',
    'Line',
    'SAP MAT ID',
    'Description',
    'Open QTY',
    'Value (USD)',
    'Original Del. Date',
    'New Del. Date',
    'DS Status',
    'Supplier Comments',
    'Response',
  ];

  return (
    <DetailModal
      isOpen
      title={`Session — ${formatSessionDate(session.dispatched_at)}`}
      onClose={onClose}
    >
      <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        <StatPill label="PO Lines" value={totalLines} />
        <StatPill label="Responded" value={totalResponded} />
        <StatPill label="Suppliers" value={groups.length} />
        <StatPill label="Emails Sent" value={session.total_emails_sent} />
        {(session.display_name ?? session.dispatched_by) && (
          <StatPill label="Dispatched By" value={session.display_name ?? session.dispatched_by} />
        )}
      </div>

      <div className="px-6 py-4">
        {loading && <ModalLoading />}
        {!loading && lines.length === 0 && (
          <ModalEmpty message="No lines found for this session." />
        )}

        {!loading &&
          groups.map(({ supplier, lines: supplierLines }) => {
            const isOpen = expanded.has(supplier);
            const responded = supplierLines.filter((l) => l.workflow_state === 'Submitted').length;
            return (
              <div
                key={supplier}
                className="mb-3 border border-slate-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleSupplier(supplier)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-bold text-sm text-slate-800 truncate max-w-[300px]">
                    {supplier}
                  </span>
                  <span className="text-xs text-slate-500 font-medium shrink-0">
                    {supplierLines.length} line{supplierLines.length !== 1 ? 's' : ''}
                  </span>
                  <span className="ml-auto text-xs font-medium text-slate-500 shrink-0">
                    {responded} / {supplierLines.length} responded
                  </span>
                </button>

                {isOpen && (
                  <div>
                    <table
                      className="w-full text-left border-collapse"
                      style={{ tableLayout: 'fixed' }}
                    >
                      <colgroup>
                        <col style={{ width: 110 }} />
                        <col style={{ width: 60 }} />
                        <col style={{ width: 110 }} />
                        <col />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 100 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 100 }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {colHeaders.map((h) => (
                            <th key={h} className="py-2 px-3 whitespace-nowrap font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {supplierLines.map((line, i) => (
                          <tr
                            key={`${line.po_number}-${line.po_line}`}
                            className={`border-b border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                          >
                            <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">
                              {line.po_number}
                            </td>
                            <td className="py-2.5 px-3 text-sm font-medium text-slate-700 whitespace-nowrap">
                              {line.po_line}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {line.sap_mat_id || '—'}
                            </td>
                            <td
                              className="py-2.5 px-3 text-xs text-slate-700 overflow-hidden truncate"
                              title={line.item_description ?? undefined}
                            >
                              {line.item_description || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                              {line.open_qty != null ? line.open_qty.toLocaleString() : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                              {formatCurrency(line.open_po_value_usd)}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {formatDate(line.original_delivery_date)}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                              {formatDate(line.new_delivery_date)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <DSTooltipBadge code={line.sap_delivery_code} />
                            </td>
                            <td
                              className="py-2.5 px-3 text-xs text-slate-600 overflow-hidden truncate"
                              title={line.supplier_comments ?? undefined}
                            >
                              {line.supplier_comments || '—'}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <ResponseBadge state={line.workflow_state} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </DetailModal>
  );
}
