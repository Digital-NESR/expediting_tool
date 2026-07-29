'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../components/LaptopShell';
import {
  STATUS_OPTIONS,
  fmtDate,
  getLaptopAvailableActions,
  getPriorityBadge,
  getStatusBadge,
} from '@/lib/laptopProcurement-utils';
import type { LaptopRequest, LaptopRequestListData } from '@/types/laptopProcurement';

const INPUT = 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function RejectionContext({ request }: { request: LaptopRequest }) {
  if (!request.status.startsWith('Rejected')) return null;
  const reason = request.rejection_reason || request.review_comments || 'No rejection reason recorded.';
  const reviewer = request.reviewed_by_name || request.reviewed_by_email;
  return (
    <div className="mt-2 max-w-xs rounded-xl border border-red-300 bg-red-100 px-2.5 py-2 text-left">
      <p className="text-[11px] font-bold uppercase tracking-wide text-red-800">Rejection Reason</p>
      <p className="mt-1 text-xs leading-relaxed text-red-900">{reason}</p>
      {(reviewer || request.reviewed_at) && (
        <p className="mt-1.5 text-[11px] text-red-700">
          {reviewer || 'Reviewer'}{request.reviewed_at ? ` | ${fmtDate(request.reviewed_at)}` : ''}
        </p>
      )}
    </div>
  );
}

function DbError() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="mb-1 font-semibold text-slate-900">Database connection unavailable</p>
        <p className="text-sm text-slate-500">Check the Laptop Procurement requests table.</p>
      </div>
    </div>
  );
}

const REQUESTS_PAGE_SIZE = 10;

export default function LaptopRequestsClient({ data }: { data: LaptopRequestListData | null }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [requestType, setRequestType] = useState('All');
  const [page, setPage] = useState(0);
  const router = useRouter();

  const actor = data?.actor ?? null;
  const requests = useMemo(() => data?.requests ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(r => {
      const matchesSearch = !q ||
        r.reference_number.toLowerCase().includes(q) ||
        (r.requested_by_name ?? '').toLowerCase().includes(q) ||
        r.requested_by_email.toLowerCase().includes(q) ||
        (r.country ?? '').toLowerCase().includes(q) ||
        (r.segment ?? '').toLowerCase().includes(q) ||
        (r.requested_model ?? '').toLowerCase().includes(q) ||
        (r.computer_for ?? '').toLowerCase().includes(q);
      const matchesStatus = status === 'All' || r.status === status;
      const matchesType = requestType === 'All' || r.request_type === requestType;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [requests, search, status, requestType]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / REQUESTS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * REQUESTS_PAGE_SIZE, (currentPage + 1) * REQUESTS_PAGE_SIZE);

  if (!actor) return <DbError />;

  const pendingCount = requests.filter(r => {
    const actions = getLaptopAvailableActions(actor.permissions, r.status);
    return actions.canApprove || actions.canReject || actions.canAssignInventory;
  }).length;

  const requestTypes = Array.from(new Set(requests.map(r => r.request_type).filter(Boolean))) as string[];

  return (
    <LaptopShell
      title="Requests"
      subtitle={`${requests.length} laptop & desktop procurement requests`}
      pendingCount={pendingCount}
      accessView={actor.effectiveAccessView}
      actions={
        <button onClick={() => router.push('/laptop-procurement/requests/new')} className={CTA}>
          + New Request
        </button>
      }
    >
      <div className="space-y-5">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Requests</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{requests.length}</p>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pending Review</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{pendingCount}</p>
          </div>
          <div className={`${GLASS} p-5`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Showing</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{filtered.length}</p>
          </div>
        </section>

        <section className={`${GLASS} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold">All Requests</h2>
              <p className="mt-0.5 text-sm text-slate-500">Laptop / desktop procurement and purchase exception requests.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search ref, requester, model..." className={`${INPUT} w-full sm:w-72`} />
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className={INPUT}>
                <option>All</option>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={requestType} onChange={e => { setRequestType(e.target.value); setPage(0); }} className={INPUT}>
                <option>All</option>
                {requestTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left font-semibold">Request</th>
                  <th className="px-5 py-3 text-left font-semibold">Requester</th>
                  <th className="px-5 py-3 text-left font-semibold">Device</th>
                  <th className="px-5 py-3 text-left font-semibold">Status</th>
                  <th className="px-5 py-3 text-left font-semibold">Country</th>
                  <th className="px-5 py-3 text-right font-semibold">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">No requests found.</td></tr>
                ) : paged.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-white">
                    <td className="px-5 py-4 align-top">
                      <Link href={`/laptop-procurement/requests/${r.id}`} className="font-bold text-[#307c4c] hover:underline">
                        {r.reference_number}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{r.request_type || '—'}</p>
                      <p className="mt-1 text-xs text-slate-500/70">Created {fmtDate(r.created_at)}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-900">{r.requested_by_name || '—'}</p>
                      <p className="text-xs text-slate-500">{r.segment || 'No segment'}</p>
                      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getPriorityBadge(r.priority)}`}>{r.priority}</span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold text-slate-900">{r.type_of_device || '—'}</p>
                      <p className="text-xs text-slate-500">{r.requested_model || '—'}</p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusPill status={r.status} />
                      {r.pending_with && <p className="mt-1 text-[11px] text-slate-500/80">With: {r.pending_with}</p>}
                      <RejectionContext request={r} />
                    </td>
                    <td className="px-5 py-4 align-top text-slate-600">{r.country || '-'}</td>
                    <td className="px-5 py-4 text-right align-top">
                      <Link href={`/laptop-procurement/requests/${r.id}`} className="inline-flex min-w-[4.5rem] items-center justify-center whitespace-nowrap rounded-lg bg-[#307c4c] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:-translate-y-px">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500/80">
                Showing {currentPage * REQUESTS_PAGE_SIZE + 1}
                –{Math.min((currentPage + 1) * REQUESTS_PAGE_SIZE, filtered.length)} of {filtered.length} requests
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
