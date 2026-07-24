'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  approveLaptopAccess,
  deleteLaptopAccessRequest,
  editLaptopAccess,
  getLaptopAccessRequests,
  rejectLaptopAccess,
  revokeLaptopAccess,
} from '@/app/actions/laptopProcurement';
import { COUNTRY_OPTIONS, PERMISSION_ROLE_OPTIONS, SEGMENT_OPTIONS } from '@/lib/laptopProcurement-utils';
import type { LaptopAccessRequestRow, LaptopPermissionRole } from '@/types/laptopProcurement';

function formatDate(raw: string | null): string {
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function StatusBadge({ status }: { status: LaptopAccessRequestRow['status'] }) {
  const cls = status === 'Approved'
    ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
    : status === 'Pending'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

function ScopePills({ country, segment }: { country: string | null; segment: string | null }) {
  if (!country && !segment) return <span className="text-xs text-slate-400">All countries and segments</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {country && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{country}</span>}
      {segment && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{segment}</span>}
    </div>
  );
}

function RoleSelector({
  row,
  mode,
  loading,
  onCancel,
  onConfirm,
}: {
  row: LaptopAccessRequestRow;
  mode: 'approve' | 'edit';
  loading: boolean;
  onCancel: () => void;
  onConfirm: (role: LaptopPermissionRole, country: string, segment: string) => void;
}) {
  const [role, setRole] = useState<LaptopPermissionRole>(row.approved_role ?? row.requested_role ?? 'Requester');
  const [country, setCountry] = useState(row.country ?? '');
  const [segment, setSegment] = useState(row.segment ?? '');

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold text-slate-600">{mode === 'approve' ? 'Approve role and scope' : 'Edit role and scope'}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Role</span>
          <select value={role} onChange={e => setRole(e.target.value as LaptopPermissionRole)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#307c4c]">
            {PERMISSION_ROLE_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Country Scope</span>
          <select value={country} onChange={e => setCountry(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]">
            <option value="">All countries</option>
            {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Segment Scope</span>
          <select value={segment} onChange={e => setSegment(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]">
            <option value="">All segments</option>
            {SEGMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onConfirm(role, country, segment)}
          className="rounded-lg bg-[#307c4c] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#307c4c]/90 disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Confirm'}
        </button>
        <button type="button" disabled={loading} onClick={onCancel} className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function LaptopAccessApprovalsClient({
  userEmail,
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const [requests, setRequests] = useState<LaptopAccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'approve' | 'edit' | null>(null);
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getLaptopAccessRequests();
      setRequests(data);
      setLastRefreshed(new Date());
      onPendingCountChange?.(data.filter(row => row.status === 'Pending').length);
    } finally {
      setIsRefreshing(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    getLaptopAccessRequests()
      .then(data => {
        setRequests(data);
        setLastRefreshed(new Date());
        onPendingCountChange?.(data.filter(row => row.status === 'Pending').length);
      })
      .finally(() => setLoading(false));
  }, [onPendingCountChange]);

  const pending = useMemo(() => requests.filter(row => row.status === 'Pending'), [requests]);
  const allUsers = requests;

  function openExpand(email: string, mode: 'approve' | 'edit') {
    if (expandedEmail === email && expandMode === mode) {
      setExpandedEmail(null);
      setExpandMode(null);
      return;
    }
    setExpandedEmail(email);
    setExpandMode(mode);
  }

  function handleApprove(row: LaptopAccessRequestRow, role: LaptopPermissionRole, country: string, segment: string) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await approveLaptopAccess({ userEmail: row.user_email, approvedRole: role, reviewedBy: userEmail, country, segment, notes: null });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to approve Laptop Procurement access.');
        setProcessingEmail(null);
        return;
      }
      await refreshData();
      setExpandedEmail(null);
      setExpandMode(null);
      setProcessingEmail(null);
    });
  }

  function handleEdit(row: LaptopAccessRequestRow, role: LaptopPermissionRole, country: string, segment: string) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await editLaptopAccess({ userEmail: row.user_email, approvedRole: role, reviewedBy: userEmail, country, segment });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to edit Laptop Procurement access.');
        setProcessingEmail(null);
        return;
      }
      await refreshData();
      setExpandedEmail(null);
      setExpandMode(null);
      setProcessingEmail(null);
    });
  }

  function handleReject(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await rejectLaptopAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleRevoke(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await revokeLaptopAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleDelete(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await deleteLaptopAccessRequest(email);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function renderRows(rows: LaptopAccessRequestRow[], empty: string) {
    if (rows.length === 0) {
      return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{empty}</div>;
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Scope</th>
                <th className="px-4 py-3 text-left font-semibold">Requested</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => {
                const busy = isPending && processingEmail === row.user_email;
                const expanded = expandedEmail === row.user_email;
                return (
                  <tr key={row.user_email} className="align-top hover:bg-[#307c4c]/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.display_name || row.user_email}</p>
                      <p className="text-xs text-slate-500">{row.user_email}</p>
                      {row.job_title && <p className="mt-1 text-xs text-slate-400">{row.job_title}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{row.approved_role ?? row.requested_role}</p>
                      {row.status === 'Pending' && <p className="text-xs text-slate-500">requested</p>}
                    </td>
                    <td className="px-4 py-3"><ScopePills country={row.country} segment={row.segment} /></td>
                    <td className="px-4 py-3 text-slate-500">
                      <p>{formatDate(row.requested_at)}</p>
                      {row.reviewed_at && <p className="mt-1 text-xs">Reviewed {formatDate(row.reviewed_at)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.status === 'Pending' && (
                          <>
                            <button type="button" disabled={busy} onClick={() => openExpand(row.user_email, 'approve')} className="rounded-lg bg-[#307c4c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Approve</button>
                            <button type="button" disabled={busy} onClick={() => handleReject(row.user_email)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">Reject</button>
                          </>
                        )}
                        {row.status === 'Approved' && (
                          <>
                            <button type="button" disabled={busy} onClick={() => openExpand(row.user_email, 'edit')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">Edit</button>
                            <button type="button" disabled={busy} onClick={() => handleRevoke(row.user_email)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">Revoke</button>
                          </>
                        )}
                        {row.status !== 'Approved' && (
                          <button type="button" disabled={busy} onClick={() => handleDelete(row.user_email)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 disabled:opacity-60">Delete</button>
                        )}
                      </div>
                      {expanded && expandMode && (
                        <RoleSelector
                          row={row}
                          mode={expandMode}
                          loading={busy}
                          onCancel={() => {
                            setExpandedEmail(null);
                            setExpandMode(null);
                          }}
                          onConfirm={(role, country, segment) => {
                            if (expandMode === 'approve') handleApprove(row, role, country, segment);
                            else handleEdit(row, role, country, segment);
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading Laptop Procurement access...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Laptop Procurement Access Requests</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Last updated: {lastRefreshed ? lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
          </p>
        </div>
        <button
          type="button"
          disabled={isRefreshing}
          onClick={refreshData}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {actionError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{actionError}</p>}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Pending Requests</h3>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">{pending.length}</span>
        </div>
        {renderRows(pending, 'No pending Laptop Procurement access requests.')}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">All Laptop Procurement Users</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{allUsers.length}</span>
        </div>
        {renderRows(allUsers, 'No Laptop Procurement access records yet.')}
      </section>
    </div>
  );
}
