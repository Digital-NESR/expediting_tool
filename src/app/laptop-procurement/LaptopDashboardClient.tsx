'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from './components/LaptopShell';
import { getPriorityBadge, getStatusBadge, isActiveApprovalStatus, timeAgo } from '@/lib/laptopProcurement-utils';
import type { LaptopDashboardData, LaptopRequest } from '@/types/laptopProcurement';

const AVATAR_GRADIENTS = [
  'from-[#6fbf92] to-[#307c4c]',
  'from-[#e0b25e] to-[#bd8532]',
  'from-[#7fb6dd] to-[#4a86b4]',
  'from-[#ab9fe4] to-[#7a6cc8]',
];

function Avatar({ name, index }: { name: string; index: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]} text-[11px] font-bold text-white shadow-sm`}>
      {initials}
    </span>
  );
}

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#edf4ee] p-6">
      <div className="max-w-sm rounded-3xl border border-white/70 bg-white/70 p-10 text-center shadow-[0_14px_44px_rgba(24,58,38,0.14)] backdrop-blur-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="mb-1 font-semibold text-[#182a1f]">Database connection unavailable</p>
        <p className="text-sm text-[#5f7266]">Check the Laptop Procurement tables and database environment variables.</p>
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

function KpiCard({ label, value, sub, icon, gradient }: { label: string; value: string | number; sub: string; icon: string; gradient: string }) {
  return (
    <div className={`${GLASS} p-5`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
        <KpiIcon name={icon} />
      </span>
      <p className="mt-3 text-3xl font-bold tracking-tight text-[#182a1f] tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[#5f7266]">{label}</p>
      <p className="mt-2 text-xs text-[#5f7266]/80">{sub}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function RequestRow({ request, index }: { request: LaptopRequest; index: number }) {
  return (
    <Link href={`/laptop-procurement/requests/${request.id}`} className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/50">
      <Avatar name={request.requested_by_name || request.requested_by_email} index={index} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#28714a]">{request.reference_number}</span>
          <StatusPill status={request.status} />
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${getPriorityBadge(request.priority)}`}>{request.priority}</span>
        </div>
        <p className="mt-1 truncate text-sm text-[#4c5f53]">
          {request.requested_by_name || request.requested_by_email} · {request.type_of_device || 'Device'} · {request.requested_model || '—'}
        </p>
        <p className="mt-0.5 text-xs text-[#5f7266]/80">{request.country || '—'} · {request.request_type || 'Request'}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-[#5f7266]">{timeAgo(request.created_at)}</span>
    </Link>
  );
}

export default function LaptopDashboardClient({ data }: { data: LaptopDashboardData | null }) {
  const router = useRouter();
  const pendingQueue = useMemo(() => {
    const all = data?.requests ?? [];
    return all
      .filter(r => isActiveApprovalStatus(r.status))
      .sort((a, b) => {
        const rank: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
        return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2)
          || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 7);
  }, [data]);

  if (!data) return <DbError />;

  const { stats, activity, actor } = data;
  const firstName = (actor.name || '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <LaptopShell
      title={`Good ${greeting}, ${firstName}`}
      subtitle={`${stats.pending_review} request${stats.pending_review === 1 ? ' is' : 's are'} waiting on a decision`}
      pendingCount={stats.pending_review}
      accessView={actor.permissions.accessView}
      actions={
        <button onClick={() => router.push('/laptop-procurement/requests/new')} className={CTA}>
          + New Request
        </button>
      }
    >
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Pending review" value={stats.pending_review} sub="Active approval chain items" icon="clock" gradient="from-[#e8b04b] to-[#c98a2e]" />
          <KpiCard label="Procure new" value={stats.procure_new} sub="Approved for new device procurement" icon="check" gradient="from-[#3a9a5f] to-[#24603f]" />
          <KpiCard label="From inventory" value={stats.assigned_inventory} sub="Fulfilled from existing stock" icon="box" gradient="from-[#58aee0] to-[#3679ad]" />
          <KpiCard label="Repaired & closed" value={stats.repaired} sub="Resolved via repair / upgrade" icon="wrench" gradient="from-[#9a8fe0] to-[#6d5fc0]" />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7266]">Total Requests</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.total}</p>
            <p className="mt-1 text-sm text-[#5f7266]">{stats.laptops} laptops · {stats.desktops} desktops</p>
            <button onClick={() => router.push('/laptop-procurement/requests')} className="mt-4 text-sm font-bold text-[#28714a] transition hover:text-[#182a1f]">View all requests →</button>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7266]">Rejected</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.rejected}</p>
            <p className="mt-1 text-sm text-[#5f7266]">Across all approval stages</p>
            <button onClick={() => router.push('/laptop-procurement/analytics')} className="mt-4 text-sm font-bold text-[#28714a] transition hover:text-[#182a1f]">View analytics →</button>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7266]">Current User</p>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={actor.name} index={0} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{actor.name}</p>
                <p className="truncate text-xs text-[#5f7266]">{actor.email}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-[#5f7266]/90">{actor.role} · {actor.isAdmin ? 'all requests' : actor.permissions.canViewAll ? 'scoped view' : 'your requests only'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className={`${GLASS} overflow-hidden xl:col-span-2`}>
            <div className="flex items-center justify-between border-b border-[#182a1f]/[0.07] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-bold">Action Queue</h2>
                <p className="mt-0.5 text-xs text-[#5f7266]">Highest priority requests in the approval chain.</p>
              </div>
              <span className="text-xs font-semibold text-[#5f7266]">{pendingQueue.length} shown</span>
            </div>
            {pendingQueue.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#5f7266]">No pending requests right now.</div>
            ) : (
              <div className="divide-y divide-[#182a1f]/[0.06]">
                {pendingQueue.map((r, i) => <RequestRow key={r.id} request={r} index={i} />)}
              </div>
            )}
          </div>

          <div className={`${GLASS} overflow-hidden`}>
            <div className="border-b border-[#182a1f]/[0.07] px-5 py-4">
              <h2 className="text-[15px] font-bold">Recent Activity</h2>
              <p className="mt-0.5 text-xs text-[#5f7266]">Latest workflow movements.</p>
            </div>
            <div className="divide-y divide-[#182a1f]/[0.06]">
              {activity.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#5f7266]">No activity yet.</div>
              ) : activity.map(item => (
                <div key={item.id} className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-[#182a1f]">{item.action}</p>
                  <p className="mt-1 text-xs text-[#5f7266]">{item.reference_number} · {item.actor_name || item.actor_email || 'System'}</p>
                  <p className="mt-1 text-[11px] text-[#5f7266]/70">{timeAgo(item.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </LaptopShell>
  );
}
