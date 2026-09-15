'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { formatDate } from '@/lib/format';
import StatusBadge from './StatusBadge';
import InlineSelector from './InlineSelector';

/**
 * The country-scoped access-approvals table, shared by the PO Expediting and TI-TE
 * admin panels.
 *
 * Both panels render the same two sections (Pending Requests, All Users) over the
 * same row shape, but they are NOT interchangeable, and the differences are all
 * expressed as props rather than flattened:
 *
 *  - the server actions differ in module AND in call shape (TI-TE's approve takes an
 *    object with a `notes` field), so the panel passes plain handlers;
 *  - the country list differs in origin — PO Expediting fetches it from the server on
 *    mount, TI-TE uses a static constant list that must match the migration's
 *    spellings — so `loadOptions` is optional and falls back to `options`;
 *  - the status vocabulary differs (PO Expediting still reads the legacy `'Denied'`),
 *    which is why the generic is only constrained to `status: string`;
 *  - every piece of user-visible copy that differed is a prop.
 *
 * Reviewer identity is taken from the session inside each server action, so nothing
 * here passes the signed-in user's email.
 */

export interface AccessRequestLike {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: string;
  requested_countries: string[];
  approved_countries: string[];
  requested_at: string;
  reviewed_at: string | null;
}

export interface AccessRequestTableProps<TRow extends AccessRequestLike> {
  /* Copy */
  title: string;
  subtitle: string;
  emptyPendingLabel: string;
  emptyAllLabel: string;
  revokeConfirm: (email: string) => string;
  deleteConfirm?: string;

  /* Data */
  loadRequests: () => Promise<TRow[]>;
  /** Fetched once on mount alongside the requests. Omit to use `options` as-is. */
  loadOptions?: () => Promise<string[]>;
  options?: string[];

  /* Actions — each returns once the write has landed; the table then refreshes. */
  onApprove: (email: string, selected: string[]) => Promise<unknown>;
  onReject: (email: string) => Promise<unknown>;
  onRevoke: (email: string) => Promise<unknown>;
  onEdit: (email: string, selected: string[]) => Promise<unknown>;
  onDelete: (email: string) => Promise<unknown>;

  onPendingCountChange?: (count: number) => void;
}

const DEFAULT_DELETE_CONFIRM =
  'Are you sure you want to delete this access request? This cannot be undone.';

/* ─── CountriesDisplay ───────────────────────────────────────── */

function CountriesDisplay({ countries }: { countries: string[] }) {
  if (!countries.length) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {countries.map(c => (
        <span key={c} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-600 border border-slate-200">
          {c}
        </span>
      ))}
    </div>
  );
}

/* ─── Loading ────────────────────────────────────────────────── */

function SectionLoading() {
  return (
    <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
      <svg className="w-5 h-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

/* ─── UserCell ───────────────────────────────────────────────── */

function UserCell({ row }: { row: AccessRequestLike }) {
  return (
    <td className="py-3 px-4 align-top">
      <p className="text-sm font-semibold text-slate-800 whitespace-nowrap">
        {row.display_name ?? row.user_email}
      </p>
      <p className="text-xs text-slate-400 whitespace-nowrap">{row.user_email}</p>
      {row.job_title && (
        <p className="text-xs text-slate-400 whitespace-nowrap">{row.job_title}</p>
      )}
    </td>
  );
}

/* ─── DeleteButton ───────────────────────────────────────────── */

function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Delete request"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}

/* ─── Main ───────────────────────────────────────────────────── */

export default function AccessRequestTable<TRow extends AccessRequestLike>({
  title,
  subtitle,
  emptyPendingLabel,
  emptyAllLabel,
  revokeConfirm,
  deleteConfirm = DEFAULT_DELETE_CONFIRM,
  loadRequests,
  loadOptions,
  options: initialOptions = [],
  onApprove,
  onReject,
  onRevoke,
  onEdit,
  onDelete,
  onPendingCountChange,
}: AccessRequestTableProps<TRow>) {
  const [requests, setRequests]           = useState<TRow[]>([]);
  const [countries, setCountries]         = useState<string[]>(initialOptions);
  const [loading, setLoading]             = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Which row is in approve/edit expand mode: email | null
  const [expandedEmail, setExpandedEmail]   = useState<string | null>(null);
  const [expandMode, setExpandMode]         = useState<'approve' | 'edit' | null>(null);
  const [isPending, startTransition]        = useTransition();
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await loadRequests();
      setRequests(data);
      setLastRefreshed(new Date());
      onPendingCountChange?.(data.filter(r => r.status === 'Pending').length);
    } finally {
      setIsRefreshing(false);
    }
    // `loadRequests` is a stable closure in both callers; the pending-count callback
    // is the only dependency that meaningfully changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPendingCountChange]);

  useEffect(() => {
    Promise.all([loadRequests(), loadOptions?.()])
      .then(([reqs, ctrs]) => {
        setRequests(reqs);
        if (ctrs) setCountries(ctrs);
        setLastRefreshed(new Date());
        onPendingCountChange?.(reqs.filter(r => r.status === 'Pending').length);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPendingCountChange]);

  const pending  = useMemo(() => requests.filter(r => r.status === 'Pending'), [requests]);
  const allUsers = requests; // already sorted by server: Pending → Approved → Denied

  function openExpand(email: string, mode: 'approve' | 'edit') {
    if (expandedEmail === email && expandMode === mode) {
      setExpandedEmail(null);
      setExpandMode(null);
    } else {
      setExpandedEmail(email);
      setExpandMode(mode);
    }
  }

  /** Runs one write then refreshes; `collapse` clears the expanded row afterwards. */
  function run(email: string, write: () => Promise<unknown>, collapse = false) {
    setProcessingEmail(email);
    startTransition(async () => {
      await write();
      await refreshData();
      if (collapse) {
        setExpandedEmail(null);
        setExpandMode(null);
      }
      setProcessingEmail(null);
    });
  }

  const handleApprove = (email: string, selected: string[]) =>
    run(email, () => onApprove(email, selected), true);

  const handleReject = (email: string) => run(email, () => onReject(email));

  function handleRevoke(email: string) {
    if (!confirm(revokeConfirm(email))) return;
    run(email, () => onRevoke(email));
  }

  const handleEditAccess = (email: string, selected: string[]) =>
    run(email, () => onEdit(email, selected), true);

  function handleDelete(email: string) {
    if (!confirm(deleteConfirm)) return;
    run(email, () => onDelete(email));
  }

  return (
    <div className="space-y-8">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>
          {lastRefreshed && (
            <p className="text-[12px] text-gray-400 mt-0.5">
              Last updated: {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={refreshData}
          disabled={isRefreshing || loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
        >
          <svg
            className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Pending Requests ── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-amber-400 rounded-full inline-block shrink-0" />
          Pending Requests
          {pending.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
              {pending.length}
            </span>
          )}
        </h2>

        {loading ? (
          <SectionLoading />
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center">
            <svg className="w-10 h-10 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-slate-400 font-medium">{emptyPendingLabel}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">User</th>
                  <th className="py-3 px-4 whitespace-nowrap">Requested Countries</th>
                  <th className="py-3 px-4 whitespace-nowrap">Submitted</th>
                  <th className="py-3 px-4 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r, idx) => {
                  const isExpanded = expandedEmail === r.user_email && expandMode === 'approve';
                  const isProcessing = processingEmail === r.user_email && isPending;
                  return (
                    <tr
                      key={r.user_email}
                      className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                    >
                      <UserCell row={r} />
                      <td className="py-3 px-4 align-top">
                        <CountriesDisplay countries={r.requested_countries} />
                        {isExpanded && (
                          <InlineSelector
                            options={countries}
                            preselected={r.requested_countries}
                            label="Select countries to approve:"
                            onConfirm={selected => handleApprove(r.user_email, selected)}
                            onCancel={() => { setExpandedEmail(null); setExpandMode(null); }}
                            loading={isProcessing}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap align-top">
                        {formatDate(r.requested_at)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => openExpand(r.user_email, 'approve')}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isExpanded ? 'Cancel' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(r.user_email)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isProcessing && !isExpanded ? 'Rejecting…' : 'Reject'}
                          </button>
                          <DeleteButton onClick={() => handleDelete(r.user_email)} disabled={isProcessing} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── All Users ── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
          All Users
        </h2>

        {loading ? (
          <SectionLoading />
        ) : allUsers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-12 text-center">
            <p className="text-sm text-slate-400 font-medium">{emptyAllLabel}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">User</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Approved Countries</th>
                  <th className="py-3 px-4 whitespace-nowrap">Requested Countries</th>
                  <th className="py-3 px-4 whitespace-nowrap">Updated</th>
                  <th className="py-3 px-4 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((r, idx) => {
                  const isEditExpanded = expandedEmail === r.user_email && expandMode === 'edit';
                  const isProcessing = processingEmail === r.user_email && isPending;
                  return (
                    <tr
                      key={r.user_email}
                      className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                    >
                      <UserCell row={r} />
                      <td className="py-3 px-4 align-top">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <CountriesDisplay countries={r.approved_countries} />
                        {isEditExpanded && (
                          <InlineSelector
                            options={countries}
                            preselected={r.approved_countries}
                            label="Edit approved countries:"
                            onConfirm={selected => handleEditAccess(r.user_email, selected)}
                            onCancel={() => { setExpandedEmail(null); setExpandMode(null); }}
                            loading={isProcessing}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <CountriesDisplay countries={r.requested_countries} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap align-top">
                        {r.reviewed_at ? formatDate(r.reviewed_at) : '—'}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.status === 'Approved' && (
                            <>
                              <button
                                onClick={() => openExpand(r.user_email, 'edit')}
                                disabled={isProcessing}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                              >
                                {isEditExpanded ? 'Cancel' : 'Edit Access'}
                              </button>
                              <button
                                onClick={() => handleRevoke(r.user_email)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                              >
                                {isProcessing ? 'Revoking…' : 'Revoke'}
                              </button>
                            </>
                          )}
                          {r.status === 'Pending' && (
                            <>
                              <button
                                onClick={() => openExpand(r.user_email, 'approve')}
                                disabled={isProcessing}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isEditExpanded ? 'Cancel' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReject(r.user_email)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {isProcessing ? 'Rejecting…' : 'Reject'}
                              </button>
                            </>
                          )}
                          <DeleteButton onClick={() => handleDelete(r.user_email)} disabled={isProcessing} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
