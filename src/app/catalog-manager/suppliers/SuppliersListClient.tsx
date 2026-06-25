'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CatalogManagerShell from '../components/CatalogManagerShell';
import { Icon, EmptyState } from '../components/CatalogManagerUI';
import type { SupplierStats } from '@/app/actions/catalog-manager';
import { fmtUsd } from '@/lib/catalog-manager-utils';

export default function SuppliersListClient({
  suppliers, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  suppliers: SupplierStats[];
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => suppliers.filter((s) => !q.trim() || `${s.name} ${s.vendor_code}`.toLowerCase().includes(q.trim().toLowerCase())),
    [suppliers, q],
  );

  return (
    <CatalogManagerShell title="Suppliers" roleLabel={roleLabel} canApprove={canApprove} canAdmin={canAdmin} pendingCount={pendingCount} showScope={false}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Suppliers</h1>
            <p className="mt-1 text-[13px] text-slate-500">{suppliers.length} suppliers with catalog rates. Click one for its full rate card.</p>
          </div>
          <div className="relative w-64 max-w-full">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier or code…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.length === 0 ? (
            <EmptyState icon="building" title="No suppliers" sub="Suppliers appear here once they have catalog entries." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Vendor code</th>
                    <th className="px-4 py-3">Manager</th>
                    <th className="px-4 py-3 text-right">Rates</th>
                    <th className="px-4 py-3 text-right">Active</th>
                    <th className="px-4 py-3 text-right">Active value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => router.push(`/catalog-manager/suppliers/${s.id}`)} className="cursor-pointer border-b border-slate-100 hover:bg-[#307c4c]/5">
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{s.vendor_code}</td>
                      <td className="px-4 py-3 text-slate-600">{s.manager ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.entryCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.activeCount}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">${fmtUsd(s.totalActiveUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CatalogManagerShell>
  );
}
