'use client';

import Link from 'next/link';
import { useState } from 'react';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import { fmtDate, formatProcureGuardStatusLabel, getPriorityBadge, getStatusBadge, usdFmt } from '@/lib/procureGuard-utils';
import type { ProcureGuardWorkQueueData, ProcureGuardWorkQueueItem } from '@/types/procureGuard';

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
      <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm">
        <p className="font-semibold text-slate-900">Work queue unavailable</p>
        <p className="mt-1 text-sm text-slate-500">Check the local ProcureGuard database connection.</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${getPriorityBadge(priority)}`}>{priority}</span>;
}

function actionLabel(item: ProcureGuardWorkQueueItem) {
  if (item.actions.nextStatus === 'Under Review') return 'Open request to start review';
  if (item.actions.nextStatus) return `Open request to move to ${formatProcureGuardStatusLabel(item.actions.nextStatus)}`;
  return 'Open request for action';
}

export default function MyWorkClient({ data }: { data: ProcureGuardWorkQueueData | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!data) return <DbError />;

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={data.stats.total} accessView={data.actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">My Work</span>
        <Link href="/admin?tool=procureguard-admin" className="ml-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
          Manage Access
        </Link>
      </header>

      <main className="mx-auto max-w-[1220px] space-y-4 px-4 py-4 sm:px-6">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] p-4 text-white shadow-lg shadow-[#307c4c]/25 sm:p-4">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3.5">
              <ProcureGuardLogo size="lg" />
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/70">Assigned queue</p>
                <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{data.actor.role} Work Queue</h1>
                <p className="mt-1 max-w-2xl text-sm text-white/80">Open a payment to review the details, add comments, and complete your action.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center backdrop-blur-sm"><p className="text-[0.6875rem] text-white/70">Total</p><p className="text-xl font-bold">{data.stats.total}</p></div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center backdrop-blur-sm"><p className="text-[0.6875rem] text-white/70">Adhoc</p><p className="text-xl font-bold">{data.stats.adhoc}</p></div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center backdrop-blur-sm"><p className="text-[0.6875rem] text-white/70">Advance</p><p className="text-xl font-bold">{data.stats.advance}</p></div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {data.items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-semibold text-slate-900">No assigned work right now.</p>
              <p className="mt-1 text-sm text-slate-500">Change your role in the admin permissions tab to test another approval queue.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map(item => {
                const href = item.request_type === 'adhoc'
                  ? `/procure-guard/adhoc-payments/${item.request.id}`
                  : `/procure-guard/advance-payments/${item.request.id}`;
                return (
                  <div key={`${item.request_type}-${item.request.id}`} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={href} className="font-bold text-slate-900 hover:text-[#307c4c] hover:underline">{item.request.reference_number}</Link>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.6875rem] font-bold capitalize text-slate-600">{item.request_type}</span>
                        <StatusPill status={item.request.status} />
                        <PriorityPill priority={item.request.priority} />
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-900">{item.request.vendor_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{actionLabel(item)} | Current owner: {item.actions.ownerLabel} | Created {fmtDate(item.request.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{usdFmt(item.request.amount, item.request.currency)}</p>
                        <p className="text-xs text-slate-400">{item.request.currency}</p>
                      </div>
                      <Link href={href} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white hover:bg-[#307c4c]/80">Open Review</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
