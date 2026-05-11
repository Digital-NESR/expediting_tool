'use client';

import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import {
  getTiteAccessRequests,
  approveTiteAccess,
  rejectTiteAccess,
  revokeTiteAccess,
  editTiteAccess,
} from '@/app/actions/tite';
import type { TiteAccessRequestRow } from '@/app/actions/tite';

/* ─── Static fallback country list ──────────────────────────── */

const TITE_FALLBACK_COUNTRIES = [
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Egypt',
  'Algeria',
  'Iraq',
  'Libya',
  'Chad',
  'Congo',
  'Other',
];

/* ─── Helpers ────────────────────────────────────────────────── */

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

/* ─── StatusBadge ────────────────────────────────────────────── */

function StatusBadge({ status }: { status: 'Pending' | 'Approved' | 'Rejected' | 'Revoked' }) {
  if (status === 'Approved') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
      Approved
    </span>
  );
  if (status === 'Pending') return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      Pending
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
      {status}
    </span>
  );
}

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

/* ─── InlineCountrySelector ──────────────────────────────────── */

function InlineCountrySelector({
  allCountries,
  preselected,
  label,
  onConfirm,
  onCancel,
  loading,
}: {
  allCountries: string[];
  preselected: string[];
  label: string;
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));

  const filtered = useMemo(
    () => allCountries.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [allCountries, search],
  );

  function toggle(c: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  return (
    <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in duration-150">
      <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>

      <div className="relative mb-2">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#307c4c]/30 focus:border-[#307c4c] placeholder-slate-400"
        />
      </div>

      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white mb-3">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No countries found.</p>
        ) : (
          <div className="p-1 space-y-0.5">
            {filtered.map(c => (
              <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={selected.has(c)}
                  onChange={() => toggle(c)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-700">{c}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <p className="text-[11px] text-[#307c4c] font-medium mb-2">
          {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm([...selected])}
          disabled={loading || selected.size === 0}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving…' : 'Confirm'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>
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

/* ─── Main Component ─────────────────────────────────────────── */

export default function TiteAccessApprovalsClient({
  userEmail,
  onPendingCountChange,
}: {
  userEmail: string;
  onPendingCountChange?: (count: number) => void;
}) {
  const [requests, setRequests]           = useState<TiteAccessRequestRow[]>([]);
  const [countries]                        = useState<string[]>(TITE_FALLBACK_COUNTRIES);
  const [loading, setLoading]             = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [expandedEmail, setExpandedEmail]     = useState<string | null>(null);
  const [expandMode, setExpandMode]           = useState<'approve' | 'edit' | null>(null);
  const [isPending, startTransition]          = useTransition();
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getTiteAccessRequests();
      setRequests(data);
      setLastRefreshed(new Date());
      onPendingCountChange?.(data.filter(r => r.status === 'Pending').length);
    } finally {
      setIsRefreshing(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    getTiteAccessRequests()
      .then(reqs => {
        setRequests(reqs);
        setLastRefreshed(new Date());
        onPendingCountChange?.(reqs.filter(r => r.status === 'Pending').length);
      })
      .finally(() => setLoading(false));
  }, [onPendingCountChange]);

  const pending  = useMemo(() => requests.filter(r => r.status === 'Pending'), [requests]);
  const allUsers = requests;

  function openExpand(email: string, mode: 'approve' | 'edit') {
    if (expandedEmail === email && expandMode === mode) {
      setExpandedEmail(null);
      setExpandMode(null);
    } else {
      setExpandedEmail(email);
      setExpandMode(mode);
    }
  }

  function handleApprove(email: string, selected: string[]) {
    setProcessingEmail(email);
    startTransition(async () => {
      await approveTiteAccess({ userEmail: email, approvedCountries: selected, reviewedBy: userEmail, notes: null });
      await refreshData();
      setExpandedEmail(null);
      setExpandMode(null);
      setProcessingEmail(null);
    });
  }

  function handleReject(email: string) {
    setProcessingEmail(email);
    startTransition(async () => {
      await rejectTiteAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleRevoke(email: string) {
    if (!confirm(`Revoke TI-TE access for ${email}?`)) return;
    setProcessingEmail(email);
    startTransition(async () => {
      await revokeTiteAccess(email, userEmail);
      await refreshData();
      setProcessingEmail(null);
    });
  }

  function handleEditAccess(email: string, selected: string[]) {
    setProcessingEmail(email);
    startTransition(async () => {
      await editTiteAccess(email, selected, userEmail);
      await refreshData();
      setExpandedEmail(null);
      setExpandMode(null);
      setProcessingEmail(null);
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">TI-TE Access Approvals</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Review and manage user access requests for TI-TE country-level data.
          </p>
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
            <p className="text-sm text-slate-400 font-medium">No pending TI-TE access requests.</p>
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
                      <td className="py-3 px-4 align-top">
                        <p className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {r.display_name ?? r.user_email}
                        </p>
                        <p className="text-xs text-slate-400 whitespace-nowrap">{r.user_email}</p>
                        {r.job_title && (
                          <p className="text-xs text-slate-400 whitespace-nowrap">{r.job_title}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <CountriesDisplay countries={r.requested_countries} />
                        {isExpanded && (
                          <InlineCountrySelector
                            allCountries={countries}
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
            <p className="text-sm text-slate-400 font-medium">No TI-TE access requests found.</p>
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
                      <td className="py-3 px-4 align-top">
                        <p className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {r.display_name ?? r.user_email}
                        </p>
                        <p className="text-xs text-slate-400 whitespace-nowrap">{r.user_email}</p>
                        {r.job_title && (
                          <p className="text-xs text-slate-400 whitespace-nowrap">{r.job_title}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-3 px-4 align-top">
                        <CountriesDisplay countries={r.approved_countries} />
                        {isEditExpanded && (
                          <InlineCountrySelector
                            allCountries={countries}
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
                          {(r.status === 'Rejected' || r.status === 'Revoked') && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
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
