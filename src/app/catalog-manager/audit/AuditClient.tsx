'use client';

import { useMemo, useState } from 'react';
import CatalogManagerShell from '../components/CatalogManagerShell';
import { Icon, EmptyState, Avatar } from '../components/CatalogManagerUI';
import type { AuditEvent } from '@/types/catalog-manager';

const ACTION_BADGE: Record<string, { dot: string; pill: string }> = {
  Create: { dot: 'bg-[#307c4c]', pill: 'bg-[#307c4c]/10 text-[#1d4f31]' },
  Edit: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700' },
  'Status change': { dot: 'bg-[#6aaf8e]', pill: 'bg-[#eaf4ef] text-[#1d4f31]' },
  Approve: { dot: 'bg-[#307c4c]', pill: 'bg-[#307c4c]/10 text-[#1d4f31]' },
  Reject: { dot: 'bg-red-500', pill: 'bg-red-50 text-red-700' },
  Export: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' },
  Login: { dot: 'bg-slate-300', pill: 'bg-slate-50 text-slate-400' },
  'Master data': { dot: 'bg-cyan-500', pill: 'bg-cyan-50 text-cyan-700' },
};
const DEFAULT_BADGE = { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600' };

export default function AuditClient({
  log, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  log: AuditEvent[];
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const [type, setType] = useState('All');
  const [q, setQ] = useState('');
  const types = useMemo(() => ['All', ...Array.from(new Set(log.map((l) => l.action)))], [log]);
  const rows = useMemo(
    () => log.filter((l) => (type === 'All' || l.action === type) && (!q.trim() || `${l.user_name} ${l.target} ${l.detail ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    [log, type, q],
  );

  return (
    <CatalogManagerShell title="Audit log" roleLabel={roleLabel} canApprove={canApprove} canAdmin={canAdmin} pendingCount={pendingCount} showScope={false}>
      <div className="cm-stagger mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Audit log</h1>
          <p className="mt-1 text-sm text-slate-500">Immutable record of every system action · retained 5 years</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user, target, or detail…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Action</th>
                <th className="px-3 py-3">Target</th>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Detail</th>
                <th className="px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const b = ACTION_BADGE[l.action] ?? DEFAULT_BADGE;
                return (
                  <tr key={l.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ring-black/[0.04] ${b.pill}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.dot}`} />
                        {l.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-slate-500">{l.target}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-slate-700"><Avatar name={l.user_name} size={22} />{l.user_name}</span>
                    </td>
                    <td className="max-w-[340px] px-3 py-2.5 text-slate-500"><span className="block truncate" title={l.detail ?? undefined}>{l.detail}</span></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[12px] text-slate-400">{l.occurred_at}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState icon="audit" title="No matching events" sub="Try a different action type or search term." />}
        </div>
      </div>
    </CatalogManagerShell>
  );
}
