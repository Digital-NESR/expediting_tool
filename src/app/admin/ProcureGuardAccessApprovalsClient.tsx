'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  approveProcureGuardAccess,
  deleteProcureGuardAccessRequest,
  editProcureGuardAccess,
  getProcureGuardAccessRequests,
  rejectProcureGuardAccess,
  revokeProcureGuardAccess,
  type ProcureGuardAccessRequestRow,
} from '@/app/actions/procureGuard';
import { COUNTRY_OPTIONS, PERMISSION_ROLE_OPTIONS, SEGMENT_OPTIONS, roleRequiresProcureGuardCountryScope } from '@/lib/procureGuard-utils';
import type { ProcureGuardPermissionRole } from '@/types/procureGuard';

function formatDate(raw: string | null): string {
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function StatusBadge({ status }: { status: ProcureGuardAccessRequestRow['status'] }) {
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

function countryScopeParts(country: string | null): string[] {
  return (country ?? '').split(',').map(item => item.trim()).filter(Boolean);
}

function ScopePills({ role, country, segment }: { role: ProcureGuardPermissionRole; country: string | null; segment: string | null }) {
  const countries = countryScopeParts(country);
  if (roleRequiresProcureGuardCountryScope(role) && countries.length === 0) {
    return <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Country scope required</span>;
  }
  if (countries.length === 0 && !segment) return <span className="text-xs text-slate-400">All countries and segments</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {countries.map(item => <span key={item} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{item}</span>)}
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
  row: ProcureGuardAccessRequestRow;
  mode: 'approve' | 'edit';
  loading: boolean;
  onCancel: () => void;
  onConfirm: (role: ProcureGuardPermissionRole, country: string, segment: string) => void;
}) {
  const [role, setRole] = useState<ProcureGuardPermissionRole>(row.approved_role ?? row.requested_role ?? 'Requester');
  const [country, setCountry] = useState(row.country ?? '');
  const [segment, setSegment] = useState(row.segment ?? '');
  const [error, setError] = useState('');
  const countryRequired = roleRequiresProcureGuardCountryScope(role);
  const selectedCountries = countryScopeParts(country);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold text-slate-600">{mode === 'approve' ? 'Approve role and scope' : 'Edit role and scope'}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Role</span>
          <select value={role} onChange={e => setRole(e.target.value as ProcureGuardPermissionRole)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#307c4c]">
            {PERMISSION_ROLE_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Country Scope</span>
          {countryRequired ? (
            <select
              multiple
              value={selectedCountries}
              onChange={e => {
                const values = Array.from(e.currentTarget.selectedOptions, option => option.value);
                setCountry(values.join(', '));
                setError('');
              }}
              className="h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]"
            >
              {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          ) : (
            <select value={country} onChange={e => setCountry(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]">
              <option value="">All countries</option>
              {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
            </select>
          )}
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
          onClick={() => {
            if (countryRequired && selectedCountries.length === 0) {
              setError('Choose at least one country for this role.');
              return;
            }
            onConfirm(role, country, segment);
          }}
          className="rounded-lg bg-[#307c4c] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#307c4c]/90 disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Confirm'}
        </button>
        <button type="button" disabled={loading} onClick={onCancel} className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-amber-700">{error}</p>}
    </div>
  );
}

/* ── Approvers pivot: countries (rows) × approval roles (columns) → responsible person(s) ── */

const APPROVER_ROLES: ProcureGuardPermissionRole[] = [
  'SCM Manager', 'Country Controller', 'Supply Chain Director', 'Treasury Director', 'Corporate Controller', 'CFO',
];
const ROLE_COLUMN_LABEL: Partial<Record<ProcureGuardPermissionRole, string>> = {
  'SCM Manager': 'Country SCM',
  'Supply Chain Director': 'SC Director',
};

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return s.toUpperCase() || '?';
}

function PersonChip({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[10px] font-bold text-[#307c4c]">{personInitials(name)}</span>
      <span className="truncate text-[13px] font-medium text-slate-700">{name}</span>
    </div>
  );
}

function ApprovalMatrix({ approved }: { approved: ProcureGuardAccessRequestRow[] }) {
  function personsFor(country: string, role: ProcureGuardPermissionRole): string[] {
    const names = approved
      .filter(row => (row.approved_role ?? row.requested_role) === role
        && (roleRequiresProcureGuardCountryScope(role) ? countryScopeParts(row.country).includes(country) : true))
      .map(row => row.display_name || row.user_email);
    return [...new Set(names)];
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Country</th>
              {APPROVER_ROLES.map(role => (
                <th key={role} className="whitespace-nowrap px-4 py-3">{ROLE_COLUMN_LABEL[role] ?? role}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {COUNTRY_OPTIONS.map(country => (
              <tr key={country} className="hover:bg-[#307c4c]/5">
                <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-900">{country}</td>
                {APPROVER_ROLES.map(role => {
                  const people = personsFor(country, role);
                  return (
                    <td key={role} className="px-4 py-3 align-top">
                      {people.length === 0
                        ? <span className="text-xs text-slate-300">—</span>
                        : <div className="space-y-1.5">{people.map((p, i) => <PersonChip key={i} name={p} />)}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProcureGuardAccessApprovalsClient({
  userEmail,
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const [requests, setRequests] = useState<ProcureGuardAccessRequestRow[]>([]);
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
      const data = await getProcureGuardAccessRequests();
      setRequests(data);
      setLastRefreshed(new Date());
      onPendingCountChange?.(data.filter(row => row.status === 'Pending').length);
    } finally {
      setIsRefreshing(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    getProcureGuardAccessRequests()
      .then(data => {
        setRequests(data);
        setLastRefreshed(new Date());
        onPendingCountChange?.(data.filter(row => row.status === 'Pending').length);
      })
      .finally(() => setLoading(false));
  }, [onPendingCountChange]);

  const pending = useMemo(() => requests.filter(row => row.status === 'Pending'), [requests]);
  const approvedUsers = useMemo(() => requests.filter(row => row.status === 'Approved'), [requests]);

  function openExpand(email: string, mode: 'approve' | 'edit') {
    if (expandedEmail === email && expandMode === mode) {
      setExpandedEmail(null);
      setExpandMode(null);
      return;
    }
    setExpandedEmail(email);
    setExpandMode(mode);
  }

  function handleApprove(row: ProcureGuardAccessRequestRow, role: ProcureGuardPermissionRole, country: string, segment: string) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await approveProcureGuardAccess({ userEmail: row.user_email, approvedRole: role, reviewedBy: userEmail, country, segment, notes: null });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to approve ProcureGuard access.');
        setProcessingEmail(null);
        return;
      }
      await refreshData();
      setExpandedEmail(null);
      setExpandMode(null);
      setProcessingEmail(null);
    });
  }

  function handleEdit(row: ProcureGuardAccessRequestRow, role: ProcureGuardPermissionRole, country: string, segment: string) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await editProcureGuardAccess({ userEmail: row.user_email, approvedRole: role, reviewedBy: userEmail, country, segment });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to edit ProcureGuard access.');
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
      await rejectProcureGuardAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleRevoke(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await revokeProcureGuardAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleDelete(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await deleteProcureGuardAccessRequest(email);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function renderRows(rows: ProcureGuardAccessRequestRow[], empty: string) {
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
                    <td className="px-4 py-3"><ScopePills role={row.approved_role ?? row.requested_role} country={row.country} segment={row.segment} /></td>
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
        <span className="text-sm font-medium">Loading ProcureGuard access...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">ProcureGuard Approval Access</h2>
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
        {renderRows(pending, 'No pending ProcureGuard access requests.')}
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Approvers by Country &amp; Role</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{approvedUsers.length} approved</span>
        </div>
        <p className="mb-3 text-[12px] text-slate-400">Who holds each approval role in each country. Country roles (Country SCM, Country Controller) vary by country; Director / Treasury / Corporate Controller / CFO are global.</p>
        <ApprovalMatrix approved={approvedUsers} />
      </section>
    </div>
  );
}
