'use client';

import Link from 'next/link';
import LaptopShell, { GLASS, GLASS_SOFT } from '../components/LaptopShell';
import { fmtDate, getPriorityBadge, getStatusBadge } from '@/lib/laptopProcurement-utils';
import type { LaptopWorkQueueData } from '@/types/laptopProcurement';

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
  if (!data) return <DbError />;
  const { actor, items, stats } = data;

  return (
    <LaptopShell
      title="My Work"
      subtitle={`${stats.total} item${stats.total === 1 ? '' : 's'} waiting on you as ${actor.role}`}
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
              {items.map(({ request, actions }, i) => (
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
                    {actions.canApprove ? 'Review & Approve' : actions.canAssignInventory ? 'IT Action' : 'Review'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </LaptopShell>
  );
}
