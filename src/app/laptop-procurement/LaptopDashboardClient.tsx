'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from './components/LaptopShell';
import { canUseLaptopAnalytics, getStatusBadge, timeAgo } from '@/lib/laptopProcurement-utils';
import type { LaptopDashboardData, LaptopRequest } from '@/types/laptopProcurement';

const AVATAR_GRADIENTS = [
  'bg-[#307c4c]',
  'bg-[#307c4c]',
  'bg-[#307c4c]',
  'bg-[#307c4c]',
];

function Avatar({ name, index }: { name: string; index: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]} text-[11px] font-bold text-white shadow-sm`}>
      {initials}
    </span>
  );
}

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="mb-1 font-semibold text-slate-900">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Check the Laptop Procurement tables and database environment variables.</p>
      </div>
    </div>
  );
}

function KpiIcon({ name }: { name: string }) {
  if (name === 'clock') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (name === 'check') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (name === 'box') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" />
    </svg>
  );
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a4.5 4.5 0 00-6 6L3 18v3h3l5.7-5.7a4.5 4.5 0 006-6l-3 3-2.3-2.3 3-3z" />
    </svg>
  );
}

function KpiCard({ label, value, sub, icon }: { label: string; value: string | number; sub: string; icon: string }) {
  return (
    <div className={`${GLASS} p-5`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#307c4c]`}>
        <KpiIcon name={icon} />
      </span>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xs text-slate-400">{sub}</p>
    </div>
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

function RequestRow({ request, index }: { request: LaptopRequest; index: number }) {
  return (
    <Link href={`/laptop-procurement/requests/${request.id}`} className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-white">
      <Avatar name={request.requested_by_name || request.requested_by_email} index={index} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#307c4c]">{request.reference_number}</span>
          <StatusPill status={request.status} />
        </div>
        <p className="mt-1 truncate text-sm text-slate-600">
          {request.requested_by_name || request.requested_by_email} · {request.type_of_device || 'Device'} · {request.requested_model || '—'}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{request.country || '—'} · {request.request_type || 'Request'}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-slate-500">{timeAgo(request.created_at)}</span>
    </Link>
  );
}

const ACTION_QUEUE_PAGE_SIZE = 5;
const HEADER_BG = 'bg-[#e3f3e6]';

export default function LaptopDashboardClient({ data }: { data: LaptopDashboardData | null }) {
  const router = useRouter();
  const [page, setPage] = useState(0);

  if (!data) return <DbError />;

  const { stats, pendingQueue, activity, actor } = data;
  const pageCount = Math.max(1, Math.ceil(pendingQueue.length / ACTION_QUEUE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedQueue = pendingQueue.slice(currentPage * ACTION_QUEUE_PAGE_SIZE, (currentPage + 1) * ACTION_QUEUE_PAGE_SIZE);
  const firstName = (actor.name || '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <LaptopShell
      title={`Good ${greeting}, ${firstName}`}
      subtitle={`${stats.pending_review} request${stats.pending_review === 1 ? ' is' : 's are'} waiting on a decision`}
      pendingCount={stats.pending_review}
      accessView={actor.effectiveAccessView}
      actions={
        <button onClick={() => router.push('/laptop-procurement/requests/new')} className={CTA}>
          + New Request
        </button>
      }
    >
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Pending review" value={stats.pending_review} sub="Active approval chain items" icon="clock" />
          <KpiCard label="Procure new" value={stats.procure_new} sub="Approved for new device procurement" icon="check" />
          <KpiCard label="From inventory" value={stats.assigned_inventory} sub="Fulfilled from existing stock" icon="box" />
          <KpiCard label="Repaired & closed" value={stats.repaired} sub="Resolved via repair / upgrade" icon="wrench" />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total Requests</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.total}</p>
            <p className="mt-1 text-sm text-slate-500">{stats.laptops} laptops · {stats.desktops} desktops</p>
            <button onClick={() => router.push('/laptop-procurement/requests')} className="mt-4 text-sm font-bold text-[#307c4c] transition hover:text-slate-900">View all requests →</button>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rejected</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.rejected}</p>
            <p className="mt-1 text-sm text-slate-500">Across all approval stages</p>
            {canUseLaptopAnalytics(actor.effectiveAccessView) && (
              <button onClick={() => router.push('/laptop-procurement/analytics')} className="mt-4 text-sm font-bold text-[#307c4c] transition hover:text-slate-900">View analytics →</button>
            )}
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Current User</p>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={actor.name} index={0} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{actor.name}</p>
                <p className="truncate text-xs text-slate-500">{actor.email}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">{actor.role} · {actor.isAdmin ? 'all requests' : actor.permissions.canViewAll ? 'scoped view' : 'your requests only'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className={`${GLASS} overflow-hidden xl:col-span-2`}>
            <div className={`flex items-center justify-between border-b border-slate-100 px-5 py-4 ${HEADER_BG}`}>
              <div>
                <h2 className="text-[15px] font-bold">Action Queue</h2>
                <p className="mt-0.5 text-xs text-slate-500">Requests waiting on your decision.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{pendingQueue.length} shown</span>
            </div>
            {pendingQueue.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No pending requests right now.</div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {pagedQueue.map((r, i) => <RequestRow key={r.id} request={r} index={i} />)}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <p className="text-xs text-slate-500">
                    Showing {currentPage * ACTION_QUEUE_PAGE_SIZE + 1}
                    –{Math.min((currentPage + 1) * ACTION_QUEUE_PAGE_SIZE, pendingQueue.length)} of {pendingQueue.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      aria-label="Previous page"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ‹
                    </button>
                    <span className="text-xs font-semibold text-slate-600">Page {currentPage + 1} of {pageCount}</span>
                    <button
                      onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                      disabled={currentPage >= pageCount - 1}
                      aria-label="Next page"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`${GLASS} overflow-hidden`}>
            <div className={`border-b border-slate-100 px-5 py-4 ${HEADER_BG}`}>
              <h2 className="text-[15px] font-bold">Recent Activity</h2>
              <p className="mt-0.5 text-xs text-slate-500">Latest workflow movements you made.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {activity.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No activity yet.</div>
              ) : activity.map(item => (
                <div key={item.id} className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.reference_number} · {item.actor_name || item.actor_email || 'System'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{timeAgo(item.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </LaptopShell>
  );
}
