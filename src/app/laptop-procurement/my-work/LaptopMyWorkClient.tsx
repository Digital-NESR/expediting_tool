'use client';

import Link from 'next/link';
import { useState } from 'react';
import LaptopShell, { GLASS, GLASS_SOFT } from '../components/LaptopShell';
import { fmtDate, getPriorityBadge, getStatusBadge } from '@/lib/laptopProcurement-utils';
import type { LaptopWorkQueueData } from '@/types/laptopProcurement';

const PAGE_SIZE = 10;

const AVATAR_GRADIENTS = [
  'bg-[#307c4c]',
  'bg-[#307c4c]',
  'bg-[#307c4c]',
  'bg-[#307c4c]',
];

function Avatar({ name, index }: { name: string; index: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]} text-[12px] font-bold text-white shadow-sm`}>
      {initials}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="mb-1 font-semibold text-slate-900">No reviewer access</p>
        <p className="text-sm text-slate-500">Your role does not have an approval queue.</p>
      </div>
    </div>
  );
}

export default function LaptopMyWorkClient({ data }: { data: LaptopWorkQueueData | null }) {
  const [page, setPage] = useState(0);
  if (!data) return <DbError />;
  const { actor, items, stats } = data;

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedItems = items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <LaptopShell
      title="My Work"
      pendingCount={stats.total}
      accessView={actor.effectiveAccessView}
    >
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Awaiting You</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.total}</p>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Approvals</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.approval}</p>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">IT Review</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.it_review}</p>
          </div>
        </section>

        <section className={`${GLASS} p-5`}>
          <div className="mb-4">
            <h2 className="text-lg font-bold">Approval Queue</h2>
            <p className="mt-0.5 text-sm text-slate-500">Requests waiting for your decision, highest priority first.</p>
          </div>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Nothing is waiting on you right now.
            </div>
          ) : (
            <div className="grid gap-3">
              {pagedItems.map(({ request, actions }, i) => (
                <Link
                  key={request.id}
                  href={`/laptop-procurement/requests/${request.id}`}
                  className={`${GLASS_SOFT} flex items-center gap-4 p-4 transition hover:-translate-y-px hover:bg-white hover:shadow-md`}
                >
                  <Avatar name={request.requested_by_name || request.requested_by_email} index={i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-bold text-[#307c4c]">{request.reference_number}</span>
                      <StatusPill status={request.status} />
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getPriorityBadge(request.priority)}`}>{request.priority}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">{request.request_type || 'Request'} · {request.type_of_device || 'Device'} · {request.requested_model || '—'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{request.requested_by_name || request.requested_by_email} · {request.country || '—'} · Created {fmtDate(request.created_at)}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[#307c4c] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
                    {actions.canApprove ? 'Review & Approve' : actions.canSubmitProcureDetails ? 'Add Device Details' : actions.canAssignInventory ? 'IT Action' : 'Review'}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500/80">
                Showing {currentPage * PAGE_SIZE + 1}
                –{Math.min((currentPage + 1) * PAGE_SIZE, items.length)} of {items.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  aria-label="Previous page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-xs font-semibold text-slate-600">Page {currentPage + 1} of {pageCount}</span>
                <button
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  disabled={currentPage >= pageCount - 1}
                  aria-label="Next page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </LaptopShell>
  );
}
