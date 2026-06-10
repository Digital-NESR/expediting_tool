'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProcureGuardSidebar from './components/ProcureGuardSidebar';
import ProcureGuardLogo from './components/ProcureGuardLogo';
import ProcureGuardHomeButton from './components/ProcureGuardHomeButton';
import { fmtDate, formatProcureGuardStatusLabel, getPriorityBadge, getStatusBadge, isActiveApprovalStatus, timeAgo, usdFmt } from '@/lib/procureGuard-utils';
import type { AdhocPaymentRequest, AdvancePaymentRequest, ProcureGuardDashboardData } from '@/types/procureGuard';

function DbError() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Check the ProcureGuard tables and database environment variables.</p>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub, tone }: { title: string; value: string | number; sub: string; tone?: 'green' | 'amber' | 'blue' | 'red' }) {
  const tones = {
    green: 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/10',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
        </div>
        <div className={`h-9 w-9 rounded-xl border flex items-center justify-center ${tones[tone ?? 'green']}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 10v2" />
          </svg>
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-3">{sub}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${getPriorityBadge(priority)}`}>{priority}</span>;
}

function activityActionLabel(action: string) {
  return action.replace(/^Status updated to\s+(.+)$/i, (_, status: string) => `Status updated to ${formatProcureGuardStatusLabel(status)}`);
}

function RequestRow({ request, type }: { request: AdhocPaymentRequest | AdvancePaymentRequest; type: 'Adhoc' | 'Advance' }) {
  const href = type === 'Adhoc'
    ? `/procure-guard/adhoc-payments/${request.id}`
    : `/procure-guard/advance-payments/${request.id}`;

  return (
    <Link href={href} className="flex items-center justify-between gap-4 p-4 hover:bg-[#307c4c]/5 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{request.reference_number}</span>
          <StatusPill status={request.status} />
          <PriorityPill priority={request.priority} />
        </div>
        <p className="text-sm text-slate-600 truncate mt-1">{type} request · {request.vendor_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">Created {fmtDate(request.created_at)} by {request.requested_by_name || request.requested_by_email}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-slate-900">{usdFmt(request.amount, request.currency)}</p>
        <p className="text-xs text-slate-400">{request.currency}</p>
      </div>
    </Link>
  );
}

export default function ProcureGuardDashboardClient({ data }: { data: ProcureGuardDashboardData | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pendingQueue = useMemo(() => {
    const adhocForQueue = data?.adhoc ?? [];
    const advanceForQueue = data?.advance ?? [];
    const tagged = [
      ...adhocForQueue.map(r => ({ ...r, _type: 'Adhoc' as const })),
      ...advanceForQueue.map(r => ({ ...r, _type: 'Advance' as const })),
    ];
    return tagged
      .filter(r => isActiveApprovalStatus(r.status))
      .sort((a, b) => {
        const priorityRank: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
        return (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2)
          || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 7);
  }, [data]);

  if (!data) return <DbError />;

  const { stats, activity, actor } = data;

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={stats.pending_review} accessView={data.actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="font-semibold text-slate-900 text-sm">ProcureGuard Dashboard</span>
        <div className="ml-auto text-xs text-slate-500 hidden sm:block">{today}</div>
      </header>

      <main className="max-w-[1220px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-t-4 border-[#307c4c] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400 mb-2">Payment control center</p>
              <div className="flex items-center gap-4">
                <ProcureGuardLogo size="hero" />
                <h1 className="text-lg font-bold tracking-tight text-gray-900">ProcureGuard</h1>
              </div>
              <p className="text-slate-500 max-w-2xl mt-2 text-sm sm:text-base">
                Track adhoc payments and advance payment requests from submission through review and approval.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => router.push('/procure-guard/adhoc-payments/new')} className="px-4 py-2.5 rounded-lg bg-[#307c4c] text-white text-sm font-bold shadow-sm hover:bg-[#307c4c]/80">
                New Adhoc Payment
              </button>
              <button onClick={() => router.push('/procure-guard/advance-payments/new')} className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50">
                New Advance Request
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <MetricCard title="Pending Review" value={stats.pending_review} sub="Active approval chain items" tone="amber" />
          <MetricCard title="Approved" value={stats.approved} sub="Completed approval requests" tone="green" />
          <MetricCard title="Total USD Eq." value={usdFmt(stats.total_requested_amount)} sub="All visible request value normalized to USD" tone="green" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Adhoc Payments</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.adhoc_total}</p>
            <p className="text-sm text-slate-500 mt-1">{usdFmt(stats.adhoc_requested_amount)} USD equivalent</p>
            <button onClick={() => router.push('/procure-guard/adhoc-payments')} className="mt-4 text-sm font-bold text-[#307c4c] hover:text-[#1f1f1d]">View status page →</button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Advance Payments</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{stats.advance_total}</p>
            <p className="text-sm text-slate-500 mt-1">{usdFmt(stats.advance_requested_amount)} USD equivalent</p>
            <button onClick={() => router.push('/procure-guard/advance-payments')} className="mt-4 text-sm font-bold text-[#307c4c] hover:text-[#1f1f1d]">View status page →</button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current User</p>
            <p className="text-lg font-bold text-slate-900 mt-2 truncate">{actor.name}</p>
            <p className="text-sm text-slate-500 truncate">{actor.email}</p>
            <p className="text-xs text-slate-400 mt-3">{actor.isAdmin ? 'Admin view: all requests' : 'User view: your requests only'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Action Queue</h2>
                <p className="text-xs text-slate-500 mt-0.5">Highest priority submitted and under-review items.</p>
              </div>
              <span className="text-xs font-semibold text-slate-400">{pendingQueue.length} shown</span>
            </div>
            {pendingQueue.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No pending requests right now.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingQueue.map(r => <RequestRow key={`${r._type}-${r.id}`} request={r} type={r._type} />)}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Recent Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5">Latest workflow movements.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {activity.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">No activity yet.</div>
              ) : activity.map(item => (
                <div key={item.id} className="p-4">
                  <p className="text-sm font-semibold text-slate-900">{activityActionLabel(item.action)}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.reference_number} · {item.actor_name || item.actor_email || 'System'}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{timeAgo(item.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
