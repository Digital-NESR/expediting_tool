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
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
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

const METRIC_TONES = {
  green: { chip: 'bg-[#307c4c]/10 text-[#307c4c]', bar: 'bg-[#307c4c]' },
  amber: { chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  blue: { chip: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400' },
  red: { chip: 'bg-red-100 text-red-700', bar: 'bg-red-400' },
} as const;

function MetricCard({ title, value, sub, tone }: { title: string; value: string | number; sub: string; tone?: 'green' | 'amber' | 'blue' | 'red' }) {
  const t = METRIC_TONES[tone ?? 'green'];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
      <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.chip}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 10v2" />
          </svg>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[0.6875rem] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[0.6875rem] font-semibold ${getPriorityBadge(priority)}`}>{priority}</span>;
}

function activityActionLabel(action: string) {
  return action.replace(/^Status updated to\s+(.+)$/i, (_, status: string) => `Status updated to ${formatProcureGuardStatusLabel(status)}`);
}

function RequestRow({ request, type }: { request: AdhocPaymentRequest | AdvancePaymentRequest; type: 'Adhoc' | 'Advance' }) {
  const href = type === 'Adhoc'
    ? `/procure-guard/adhoc-payments/${request.id}`
    : `/procure-guard/advance-payments/${request.id}`;

  return (
    <Link href={href} className="group flex items-center justify-between gap-4 p-3 transition-colors hover:bg-[#307c4c]/5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{request.reference_number}</span>
          <StatusPill status={request.status} />
          <PriorityPill priority={request.priority} />
        </div>
        <p className="text-sm text-slate-600 truncate mt-0.5">{type} request · {request.vendor_name}</p>
        <p className="text-xs text-slate-400 mt-0.5">Created {fmtDate(request.created_at)} by {request.requested_by_name || request.requested_by_email}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="font-bold text-slate-900">{usdFmt(request.amount, request.currency)}</p>
          <p className="text-xs text-slate-400">{request.currency}</p>
        </div>
        <svg className="h-4 w-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function StatCard({ label, value, sub, icon, onClick }: { label: string; value: string | number; sub: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#307c4c]/30 hover:shadow-lg hover:shadow-slate-200/60"
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#307c4c]">{icon}</div>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#307c4c]">
        View status page <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );
}

function SectionHeading({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 h-5 w-1 rounded-full bg-[#307c4c]" />
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
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

  const { stats, activity } = data;

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={stats.pending_review} accessView={data.actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="font-semibold text-slate-900 text-sm">ProcureGuard Dashboard</span>
        <div className="ml-auto text-xs text-slate-500 hidden sm:block">{today}</div>
      </header>

      <main className="max-w-[1220px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] p-4 sm:p-4 text-white shadow-lg shadow-[#307c4c]/25">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-white/70">Guarding every purchase</p>
              <div className="flex items-center gap-3">
                <ProcureGuardLogo size="hero" />
                <div>
                  <h1 className="text-xl font-bold tracking-tight">ProcureGuard</h1>
                  <p className="mt-0.5 max-w-2xl text-sm text-white/80">
                    Track adhoc POs and advance payment requests from submission through review and approval.
                  </p>
                </div>
              </div>
            </div>
            {data.actor.permissions.canCreateRequests && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => router.push('/procure-guard/adhoc-payments/new')} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#1d4f31] shadow-sm transition hover:bg-white/90">
                  New Adhoc PO
                </button>
                <button onClick={() => router.push('/procure-guard/advance-payments/new')} className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                  New Advance Request
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard title="Pending Review" value={stats.pending_review} sub="Active approval chain items" tone="amber" />
          <MetricCard title="Approved" value={stats.approved} sub="Completed approval requests" tone="green" />
          <StatCard
            label="Adhoc POs"
            value={stats.adhoc_total}
            sub={`${usdFmt(stats.adhoc_requested_amount)} USD equivalent`}
            onClick={() => router.push('/procure-guard/adhoc-payments')}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <StatCard
            label="Advance Payments"
            value={stats.advance_total}
            sub={`${usdFmt(stats.advance_requested_amount)} USD equivalent`}
            onClick={() => router.push('/procure-guard/advance-payments')}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm14 5h.01" /></svg>}
          />
        </section>

        <section className="grid grid-cols-3 gap-3">
          <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeading
              title="Action Queue"
              subtitle="Highest priority submitted and under-review items."
              right={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{pendingQueue.length} shown</span>}
            />
            {pendingQueue.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">No pending requests right now.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingQueue.map(r => <RequestRow key={`${r._type}-${r.id}`} request={r} type={r._type} />)}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeading title="Recent Activity" subtitle="Latest workflow movements." />
            <div className="divide-y divide-slate-100">
              {activity.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 text-center">No activity yet.</div>
              ) : activity.map(item => (
                <div key={item.id} className="flex gap-3 p-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#307c4c]/40" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{activityActionLabel(item.action)}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.reference_number} · {item.actor_name || item.actor_email || 'System'}</p>
                    <p className="text-[0.6875rem] text-slate-400 mt-1">{timeAgo(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
