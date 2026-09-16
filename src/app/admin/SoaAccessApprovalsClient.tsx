'use client';

/* ─────────────────────────────────────────────────────────────
   SOA Consolidation · Access Approvals.

   Champion and viewer access is REQUESTED here and granted by an
   admin; manager is appointed in SoaManagersClient and admin comes
   from ADMIN_EMAILS, so neither of those ever appears in this queue.

   The request is a proposal, not an instruction: the approve editor
   opens pre-filled with what the person asked for, and the admin can
   change both the role and the country before confirming. That is why
   `approveSoaAccessRequest` takes the admin's choice rather than
   reading the grant back off `requested_role`.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  approveSoaAccessRequest,
  getSoaAccessRequests,
  getSoaCountries,
  rejectSoaAccessRequest,
  revokeSoaAccess,
  type SoaAccessRequestRow,
  type SoaCountryOption,
} from '@/app/actions/soa/access';
import { formatDate } from '@/lib/format';

/** Only champion and viewer are grantable from a request — see the action's guard. */
const GRANTABLE_ROLES: { value: 'champion' | 'viewer'; label: string }[] = [
  { value: 'champion', label: 'Champion' },
  { value: 'viewer', label: 'Viewer' },
];

function roleLabel(role: string | null): string {
  if (!role) return '—';
  return GRANTABLE_ROLES.find((r) => r.value === role)?.label ?? role;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Approved'
      ? 'bg-[#2A7E4F]/10 text-[#2A7E4F] border-[#2A7E4F]/20'
      : status === 'Pending'
        ? 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]'
        : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  );
}

/** A country id rendered for a human; a null country is every country, not a missing one. */
function ScopePill({ countryId, countryName }: { countryId: string | null; countryName: string }) {
  if (!countryId) {
    return (
      <span className="rounded-full bg-[#2A7E4F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#2A7E4F]">
        All countries
      </span>
    );
  }
  return (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {countryName}
    </span>
  );
}

function GrantEditor({
  row,
  countries,
  loading,
  onCancel,
  onConfirm,
}: {
  row: SoaAccessRequestRow;
  countries: SoaCountryOption[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: (role: 'champion' | 'viewer', countryId: string | null) => void;
}) {
  // Pre-filled with what was asked for (or last granted) — a starting point the admin may override.
  const [role, setRole] = useState<'champion' | 'viewer'>(
    (row.approved_role ?? row.requested_role) === 'champion' ? 'champion' : 'viewer',
  );
  const [country, setCountry] = useState(row.approved_country ?? row.requested_country ?? '');

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
      <p className="mb-3 text-xs font-semibold text-slate-600">
        Grant role and country — you can change what was asked for
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'champion' | 'viewer')}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#2A7E4F]"
          >
            {GRANTABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">
            Country
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A7E4F]"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onConfirm(role, country || null)}
          className="rounded-lg bg-[#2A7E4F] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2A7E4F]/90 disabled:opacity-60"
        >
          {loading ? 'Saving...' : 'Confirm approval'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// No userEmail prop: the reviewer identity on every approve/reject/revoke comes from the
// authenticated actor inside the server action, not from the client.
export default function SoaAccessApprovalsClient() {
  const [requests, setRequests] = useState<SoaAccessRequestRow[]>([]);
  const [countries, setCountries] = useState<SoaCountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getSoaAccessRequests();
      setRequests(data);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([getSoaAccessRequests(), getSoaCountries()])
      .then(([reqs, countryOptions]) => {
        setRequests(reqs);
        setCountries(countryOptions);
        setLastRefreshed(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  const countryName = useCallback(
    (id: string | null) => (id ? (countries.find((c) => c.id === id)?.name ?? id) : ''),
    [countries],
  );

  const pending = requests.filter((r) => r.status === 'Pending');
  const reviewed = requests.filter((r) => r.status !== 'Pending');

  function handleApprove(
    row: SoaAccessRequestRow,
    role: 'champion' | 'viewer',
    country: string | null,
  ) {
    setActionError('');
    setProcessingEmail(row.user_email);
    startTransition(async () => {
      const result = await approveSoaAccessRequest({
        email: row.user_email,
        role,
        countryId: country,
      });
      if (!result.success) {
        setActionError(result.error ?? 'Failed to approve the request.');
        setProcessingEmail(null);
        return;
      }
      await refreshData();
      setExpandedEmail(null);
      setProcessingEmail(null);
    });
  }

  function handleReject(email: string) {
    setActionError('');
    setProcessingEmail(email);
    startTransition(async () => {
      const result = await rejectSoaAccessRequest(email);
      if (!result.success) setActionError(result.error ?? 'Failed to reject the request.');
      await refreshData();
      setExpandedEmail(null);
      setProcessingEmail(null);
    });
  }

  function handleRevoke(email: string) {
    setActionError('');
    setProcessingEmail(email);
    startTransition(async () => {
      const result = await revokeSoaAccess(email);
      if (!result.success) setActionError(result.error ?? 'Failed to revoke access.');
      await refreshData();
      setExpandedEmail(null);
      setProcessingEmail(null);
    });
  }

  function renderRows(rows: SoaAccessRequestRow[], empty: string) {
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {empty}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">User</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Asked for</th>
                <th className="px-4 py-3 text-left font-semibold">Granted</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Requested</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const busy = isPending && processingEmail === row.user_email;
                const expanded = expandedEmail === row.user_email;
                return (
                  <tr key={row.user_email} className="align-top hover:bg-[#2A7E4F]/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">
                        {row.display_name || row.user_email}
                      </p>
                      <p className="text-xs text-slate-500">{row.user_email}</p>
                      {row.job_title && (
                        <p className="mt-1 text-xs text-slate-400">{row.job_title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">
                        {roleLabel(row.requested_role)}
                      </p>
                      <div className="mt-1">
                        <ScopePill
                          countryId={row.requested_country}
                          countryName={countryName(row.requested_country)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'Approved' && row.approved_role ? (
                        <>
                          <p className="font-semibold text-slate-900">
                            {roleLabel(row.approved_role)}
                          </p>
                          <div className="mt-1">
                            <ScopePill
                              countryId={row.approved_country}
                              countryName={countryName(row.approved_country)}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-xs leading-relaxed text-slate-600">
                      {row.reason || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <p>{formatDate(row.requested_at)}</p>
                      {row.reviewed_at && (
                        <p className="mt-1 text-xs">
                          Reviewed {formatDate(row.reviewed_at)}
                          {row.reviewed_by ? ` · ${row.reviewed_by}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.status === 'Approved' ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setExpandedEmail(expanded ? null : row.user_email)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                            >
                              Change role / country
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRevoke(row.user_email)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60"
                            >
                              Revoke
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setExpandedEmail(expanded ? null : row.user_email)}
                              className="rounded-lg bg-[#2A7E4F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2A7E4F]/90 disabled:opacity-60"
                            >
                              Approve...
                            </button>
                            {row.status === 'Pending' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleReject(row.user_email)}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-60"
                              >
                                Reject
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {expanded && (
                        <GrantEditor
                          row={row}
                          countries={countries}
                          loading={busy}
                          onCancel={() => setExpandedEmail(null)}
                          onConfirm={(role, country) => handleApprove(row, role, country)}
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
        <svg className="h-5 w-5 animate-spin text-[#2A7E4F]" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading SOA Consolidation access...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            SOA Consolidation Access
          </h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Last updated:{' '}
            {lastRefreshed
              ? lastRefreshed.toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '-'}
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

      <p className="text-[12px] text-slate-400">
        Champions run a country&apos;s vendor chase; viewers read its progress and evidence and
        change nothing. What someone asked for is a proposal — change the role or the country in the
        approve editor before confirming. Managers are appointed under Managers, never requested,
        and emails listed in{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">ADMIN_EMAILS</code> already
        have full access and never appear here.
      </p>

      {actionError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {actionError}
        </p>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Pending Requests</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              pending.length > 0
                ? 'bg-[#fef3c7] text-[#b45309] border border-[#fde68a]'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {pending.length}
          </span>
        </div>
        {renderRows(pending, 'No pending SOA Consolidation access requests.')}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Reviewed</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {reviewed.length}
          </span>
        </div>
        {renderRows(reviewed, 'Nothing reviewed yet.')}
      </section>
    </div>
  );
}
