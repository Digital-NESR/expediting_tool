'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import ProcureGuardHero from '../components/ProcureGuardHero';
import {
  ADVANCE_STATUS_OPTIONS,
  formatProcureGuardStatusLabel,
  fmtDate,
  getProcureGuardAvailableActions,
  getPriorityBadge,
  getStatusBadge,
  toUsd,
  usdFmt,
} from '@/lib/procureGuard-utils';
import type { AdvancePaymentRequest, ProcureGuardRequestListData } from '@/types/procureGuard';

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function RejectionContext({ request }: { request: AdvancePaymentRequest }) {
  if (request.status !== 'Rejected') return null;
  const reason = request.rejection_reason || request.review_comments || 'No rejection reason recorded.';
  const reviewer = request.reviewed_by_name || request.reviewed_by_email;
  return (
    <div className="mt-2 max-w-xs rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-left">
      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Rejection Reason</p>
      <p className="mt-1 text-xs leading-relaxed text-red-800">{reason}</p>
      {(reviewer || request.reviewed_at) && (
        <p className="mt-1.5 text-[11px] text-red-600">
          {reviewer || 'Reviewer'}{request.reviewed_at ? ` | ${fmtDate(request.reviewed_at)}` : ''}
        </p>
      )}
    </div>
  );
}
function DbError() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center max-w-sm">
        <p className="font-semibold text-slate-900 mb-1">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Check the ProcureGuard advance payment table.</p>
      </div>
    </div>
  );
}

export default function AdvancePaymentsStatusClient({ data }: { data: ProcureGuardRequestListData<AdvancePaymentRequest> | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const router = useRouter();

  const actor = data?.actor ?? null;
  const requests = useMemo(() => data?.requests ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      const matchesSearch = !q ||
        r.reference_number.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q) ||
        (r.requisition_number ?? '').toLowerCase().includes(q) ||
        (r.country ?? '').toLowerCase().includes(q) ||
        (r.requested_by_name ?? '').toLowerCase().includes(q) ||
        r.requested_by_email.toLowerCase().includes(q) ||
        (r.rejection_reason ?? '').toLowerCase().includes(q) ||
        (r.review_comments ?? '').toLowerCase().includes(q);
      const matchesStatus = status === 'All' || r.status === status;
      const matchesPriority = priority === 'All' || r.priority === priority;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [requests, search, status, priority]);

  if (!actor) return <DbError />;

  const pendingCount = requests.filter(r => {
    const actions = getProcureGuardAvailableActions(actor.permissions, 'advance', r.status, r.amount, r.currency);
    return actions.canApprove || actions.canReject;
  }).length;
  const totalAmount = requests.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={pendingCount} accessView={actor.permissions.accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="font-semibold text-slate-900 text-sm">Advance Payment Status</span>
        <button onClick={() => router.push('/procure-guard/advance-payments/new')} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#307c4c' }}>
          New Request
        </button>
      </header>

      <main className="max-w-[1220px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        <ProcureGuardHero title="Advance Payment Status" subtitle="Track and review advance payment requests through the approval workflow." />
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
            <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Requests</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{requests.length}</p>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
            <span className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pending Review</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{pendingCount}</p>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60">
            <span className="absolute inset-x-0 top-0 h-1 bg-[#307c4c]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Requested USD Eq.</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{usdFmt(totalAmount)}</p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Advance Payment Requests</h1>
              <p className="text-sm text-slate-500 mt-1">Supplier advances, prepayments, milestone deposits, and settlement tracking.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, ref, country..." className="w-full sm:w-72 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c]" />
              <select value={status} onChange={e => setStatus(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option>All</option>
                {ADVANCE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{formatProcureGuardStatusLabel(s)}</option>)}
              </select>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option>All</option>
                {['Low', 'Normal', 'High', 'Critical'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>


          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Request</th>
                  <th className="text-left px-5 py-3 font-semibold">Vendor</th>
                  <th className="text-left px-5 py-3 font-semibold">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold">Country</th>
                  <th className="text-left px-5 py-3 font-semibold">Requester</th>
                  <th className="text-right px-5 py-3 font-semibold">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">No advance payment requests found.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-[#307c4c]/5">
                    <td className="px-5 py-4 align-top">
                      <Link href={`/procure-guard/advance-payments/${r.id}`} className="font-bold text-slate-900 hover:text-[#307c4c] hover:underline">
                        {r.reference_number}
                      </Link>
                      <p className="text-xs text-slate-500 mt-1">Req {r.requisition_number || 'N/A'}</p>
                      <p className="text-xs text-slate-400 mt-1">Created {fmtDate(r.created_at)}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-900">{r.vendor_name}</p>
                      <p className="text-xs text-slate-500">{r.vendor_code || 'No vendor code'}</p>
                      <span className={`mt-2 inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${getPriorityBadge(r.priority)}`}>{r.priority}</span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-bold text-slate-900">{usdFmt(r.amount, r.currency)}</p>
                    </td>
                    <td className="px-5 py-4 align-top"><StatusPill status={r.status} /><RejectionContext request={r} /></td>
                    <td className="px-5 py-4 align-top text-slate-600">{r.country || '-'}</td>
                    <td className="px-5 py-4 align-top">
                      <p className="text-slate-900">{r.requested_by_name || '—'}</p>
                      <p className="text-xs text-slate-500">{r.requested_by_email}</p>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <Link href={`/procure-guard/advance-payments/${r.id}`} className="inline-flex min-w-[4.5rem] items-center justify-center whitespace-nowrap rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#25663d]">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}







