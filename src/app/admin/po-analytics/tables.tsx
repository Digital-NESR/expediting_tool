'use client';

/* ─── The three sortable tables. Sorting is shared through useSortable from the analytics kit, so
   the three behave identically rather than nearly identically. ─── */

import type { BuyerRow, RecentSession, SupplierRow } from '@/app/actions/adminAnalytics';
import { RateBadge, SortIcon, useSortable } from '@/app/po-expediting/analytics/_components';
import { formatDate, formatSessionDate } from '@/lib/format';

/* ─── Buyer Activity Table ────────────────────────────────────── */

export function BuyerTable({
  rows,
  onBuyerClick,
}: {
  rows: BuyerRow[];
  onBuyerClick: (buyer: BuyerRow) => void;
}) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(rows, 'total_lines');
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'display_name', label: 'Buyer' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'total_sessions', label: 'Sessions', align: 'right' },
    { key: 'total_lines', label: 'PO Lines', align: 'right' },
    { key: 'total_suppliers', label: 'Suppliers', align: 'right' },
    { key: 'total_emails', label: 'Emails Sent', align: 'right' },
    { key: 'avg_response_rate', label: 'Avg Response', align: 'center' },
    { key: 'last_active_at', label: 'Last Active' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 360, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={[
                    'py-3 px-4 font-semibold cursor-pointer select-none hover:text-[#307c4c] transition-colors whitespace-nowrap',
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : '',
                    sortKey === col.key ? 'text-[#307c4c]' : '',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="py-10 text-center text-sm text-slate-400">
                  No buyer data yet.
                </td>
              </tr>
            )}
            {sorted.map((r, idx) => {
              return (
                <tr
                  /* Stable identity: an index key re-used a row's DOM node for a
                     different buyer after every sort. `idx` is still the zebra stripe. */
                  key={r.email}
                  onClick={() => onBuyerClick(r)}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold whitespace-nowrap">
                    <span className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline">
                      {r.display_name ?? r.email ?? '—'}
                      <svg
                        className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {r.job_title ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_sessions.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-slate-800 tabular-nums">
                    {r.total_lines.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_suppliers.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_emails.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <RateBadge rate={r.avg_response_rate} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.last_active_at)}
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

/* ─── Supplier Response Table ─────────────────────────────────── */

export function SupplierTable({
  rows,
  onSupplierClick,
}: {
  rows: SupplierRow[];
  onSupplierClick: (name: string) => void;
}) {
  const { sorted, sortKey, sortDir, handleSort } = useSortable(rows, 'response_rate');
  type Col = { key: string; label: string; align?: 'right' | 'center' };
  const cols: Col[] = [
    { key: 'supplier_name', label: 'Supplier Name' },
    { key: 'times_expedited', label: 'Times Expedited', align: 'right' },
    { key: 'total_lines', label: 'Lines Sent', align: 'right' },
    { key: 'lines_responded', label: 'Lines Responded', align: 'right' },
    { key: 'response_rate', label: 'Response Rate', align: 'center' },
    { key: 'last_response', label: 'Last Response' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 420, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={[
                    'py-3 px-4 font-semibold cursor-pointer select-none hover:text-[#307c4c] transition-colors whitespace-nowrap',
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : '',
                    sortKey === col.key ? 'text-[#307c4c]' : '',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="py-10 text-center text-sm text-slate-400">
                  No supplier data yet.
                </td>
              </tr>
            )}
            {sorted.map((r, idx) => {
              return (
                <tr
                  key={r.supplier_name}
                  onClick={() => onSupplierClick(r.supplier_name)}
                  className={`border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 text-sm font-semibold max-w-[240px]">
                    <span
                      className="group inline-flex items-center gap-1.5 text-[#307c4c] hover:underline truncate"
                      title={r.supplier_name}
                    >
                      {r.supplier_name || '—'}
                      <svg
                        className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                      </svg>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.times_expedited.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.total_lines.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums">
                    {r.lines_responded.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <RateBadge rate={r.response_rate} />
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.last_response)}
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

/* ─── Recent Sessions Table ───────────────────────────────────── */

export function SessionsTable({
  rows,
  onSessionClick,
}: {
  rows: RecentSession[];
  onSessionClick: (session: RecentSession) => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div style={{ height: 400, overflowY: 'auto', overflowX: 'hidden' }}>
        <table className="w-full text-left border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 whitespace-nowrap">Date</th>
              <th className="py-3 px-4 whitespace-nowrap">Dispatched By</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Suppliers</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">PO Lines</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Emails Sent</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Responded</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Response Rate</th>
              <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                  No sessions yet.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr
                key={r.session_ref}
                onClick={() => onSessionClick(r)}
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
                <td className="py-3 px-4 text-sm font-medium text-slate-800 whitespace-nowrap">
                  {r.display_name ?? r.dispatched_by}
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
    </div>
  );
}
