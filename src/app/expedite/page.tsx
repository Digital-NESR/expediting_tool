'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      <div className="min-h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center text-slate-900 font-sans p-6 relative overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        {/* Sticky Nav Bar for Empty State */}
        <header className="absolute top-0 left-0 right-0 h-14 md:h-16 px-4 md:px-8 flex items-center border-b border-gray-100 bg-white/80 backdrop-blur-md z-10 shrink-0">
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

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-12 max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500 mt-16">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Expedite Queue is empty</h2>
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
    <div className="min-h-[100dvh] w-full bg-slate-50 font-sans text-slate-900 pt-16 pb-32 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {/* ── Sticky top nav ── */}
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
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

              {/* ── Supplier Contact Info ── */}
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5 shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-slate-100 border border-slate-200 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Supplier Contact</p>
                    <p className="text-sm text-slate-400 italic">— not yet configured —</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5 shrink-0 h-7 w-7 flex items-center justify-center rounded-md bg-slate-100 border border-slate-200 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                      CC: Buyer Email
                    </p>
                    {group.items[0]?.['Buyer Email'] ? (
                      <p className="text-sm font-medium text-slate-700">{group.items[0]['Buyer Email']}</p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">— not available —</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
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
