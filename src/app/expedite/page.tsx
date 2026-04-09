'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useExpediteStore } from '@/store/useExpediteStore';
import type { PurchaseOrder } from '@/types/po';

/* ─── Helpers ─────────────────────────────────────────────── */
function formatCurrency(val: number | string | undefined | null) {
  if (val == null) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.valueOf())) return dateStr;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export default function ExpediteReviewPage() {
  const { selectedItems, toggleSelection } = useExpediteStore();

  /* ─── Grouping Logic ────────────────────────────────────── */
  const groupedBySupplier = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const item of selectedItems) {
      const supplier = item['Supplier Name'] || 'Unknown Supplier';
      if (!map.has(supplier)) {
        map.set(supplier, []);
      }
      map.get(supplier)!.push(item);
    }
    
    // Convert to array and sort by supplier name
    return Array.from(map.entries())
      .map(([supplierName, items]) => ({
        supplierName,
        items,
        totalValue: items.reduce((sum, i) => sum + Number(i['Open PO Value USD'] ?? 0), 0)
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [selectedItems]);

  /* ─── Empty State ───────────────────────────────────────── */
  if (selectedItems.length === 0) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center text-slate-900 font-sans p-6">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Cart is empty</h2>
          <p className="text-slate-500 mb-8 max-w-[250px]">
            You haven't selected any line items to expedite yet.
          </p>
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center h-12 bg-[#307c4c] hover:bg-[#26663e] text-white font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#307c4c]/20"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Main Render ───────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 font-sans text-slate-900 pt-8 pb-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-[#307c4c] mb-4 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Review Expedite Request
            </h1>
            <p className="text-slate-500 mt-1">
              {selectedItems.length} line items across {groupedBySupplier.length} distinct suppliers.
            </p>
          </div>
        </header>

        {/* Supplier Cards */}
        <div className="space-y-6">
          {groupedBySupplier.map((group) => (
            <div key={group.supplierName} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{group.supplierName}</h2>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">
                      {group.items.length} Item{group.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-500">Total Value</p>
                  <p className="text-lg font-bold text-[#307c4c] tabular-nums">
                    {formatCurrency(group.totalValue)}
                  </p>
                </div>
              </div>

              {/* Table B */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-6 whitespace-nowrap">PO Number</th>
                      <th className="py-3 px-6 whitespace-nowrap">SAP MAT ID</th>
                      <th className="py-3 px-6 whitespace-nowrap">Description</th>
                      <th className="py-3 px-6 whitespace-nowrap text-right">Open QTY</th>
                      <th className="py-3 px-6 whitespace-nowrap text-right">Value (USD)</th>
                      <th className="py-3 px-6 whitespace-nowrap">Current Delivery</th>
                      <th className="py-3 px-6 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    {group.items.map((item, idx) => (
                      <tr key={`${item['PO Number']}-${item['SAP MAT ID']}-${idx}`} className="hover:bg-slate-50/50 transition-colors group/row">
                        <td className="py-3.5 px-6 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {item['PO Number']}
                        </td>
                        <td className="py-3.5 px-6 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {item['SAP MAT ID'] || '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-slate-600 max-w-[240px] truncate" title={item['Item Description']}>
                          {item['Item Description'] || '—'}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right font-medium text-slate-700 tabular-nums">
                          {Number(item['Open QTY'] || 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-6 text-sm text-right font-semibold text-slate-800 tabular-nums">
                          {formatCurrency(item['Open PO Value USD'])}
                        </td>
                        <td className="py-3.5 px-6 text-sm font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(item['Delivery Date'])}
                        </td>
                        <td className="py-3.5 px-6 right-0">
                          <button
                            onClick={() => toggleSelection(item)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover/row:opacity-100"
                            title="Remove from selection"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Confirm Data Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_32px_rgba(0,0,0,0.05)] p-4 sm:p-6 animate-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-800">
              Ready to generate tokens?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              This will create tracking links and dispatch emails to all {groupedBySupplier.length} suppliers.
            </p>
          </div>
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#1e293b] hover:bg-black text-white text-sm font-semibold px-8 py-3 rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/10">
            Confirm & Generate Expedite Tokens
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
