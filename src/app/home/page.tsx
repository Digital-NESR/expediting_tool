'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { submitAccessRequest, getCountries } from '@/app/actions/access';
import { submitTiteAccessRequest } from '@/app/actions/tite';
import { Laptop, GitMerge, FileCheck, Sparkles, ScanSearch, BookOpen, Building2 } from 'lucide-react';

type ToolStatus = 'new' | 'pending' | 'approved' | 'denied' | 'revoked' | 'rejected';
type ModalType = 'po-request' | 'po-pending' | 'tite-request' | 'tite-pending' | null;

/* ─── TI-TE static country list ─────────────────────────────── */

const TITE_COUNTRIES = [
  'All Countries - View Only',
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

/* ─── Spinner ────────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

/* ─── Access Request Modal (PO Expediting) ───────────────────── */

function AccessRequestModal({
  userEmail,
  displayName,
  onClose,
  onSubmitted,
}: {
  userEmail: string;
  displayName: string;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const [countries, setCountries] = useState<string[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCountries().then(c => {
      setCountries(c);
      setLoadingCountries(false);
    });
  }, []);

  const filtered = useMemo(
    () => countries.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [countries, search],
  );

  function toggle(c: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(c)) {
        next.delete(c);
      } else {
        next.add(c);
      }
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await submitAccessRequest(userEmail, displayName, [...selected]);
      if (res.success) {
        await onSubmitted();
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Request Access — PO Expediting
              </h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Select the countries you need access to. An admin will review your request.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search countries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors placeholder-slate-400"
            />
          </div>

          {selected.size > 0 && (
            <p className="text-xs text-[#307c4c] font-medium mb-2">
              {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
            </p>
          )}

          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg bg-white">
            {loadingCountries ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <Spinner />
                <span className="text-sm">Loading countries…</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No countries found.</p>
            ) : (
              <div className="p-1 space-y-0.5">
                {filtered.map(c => (
                  <label
                    key={c}
                    className="flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c)}
                      onChange={() => toggle(c)}
                      className="w-4 h-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700">{c}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100">
          {error && (
            <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending || selected.size === 0 || loadingCountries}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
            >
              {isPending ? 'Submitting…' : 'Submit Request'}
            </button>
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── TI-TE Access Request Modal ─────────────────────────────── */

function TiteAccessRequestModal({
  userEmail,
  displayName,
  jobTitle,
  department,
  onClose,
  onSubmitted,
}: {
  userEmail: string;
  displayName: string;
  jobTitle?: string;
  department?: string;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => TITE_COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  function toggle(c: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(c)) {
        next.delete(c);
      } else {
        next.add(c);
      }
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await submitTiteAccessRequest({
        userEmail,
        displayName,
        jobTitle: jobTitle ?? null,
        department: department ?? null,
        requestedCountries: [...selected],
      });
      if (res.success) {
        await onSubmitted();
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Request Access — TI-TE
              </h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Select the countries you need access to. An admin will review your request.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search countries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] transition-colors placeholder-slate-400"
            />
          </div>

          {selected.size > 0 && (
            <p className="text-xs font-medium mb-2" style={{ color: '#006B0C' }}>
              {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
            </p>
          )}

          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg bg-white">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No countries found.</p>
            ) : (
              <div className="p-1 space-y-0.5">
                {filtered.map(c => (
                  <label
                    key={c}
                    className="flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c)}
                      onChange={() => toggle(c)}
                      className="w-4 h-4 rounded border-slate-300 cursor-pointer"
                      style={{ accentColor: '#006B0C' }}
                    />
                    <span className="text-sm font-medium text-slate-700">{c}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100">
          {error && (
            <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending || selected.size === 0}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-sm ${
                isPending || selected.size === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'hover:opacity-90'
              }`}
              style={!isPending && selected.size > 0 ? { background: '#006B0C' } : undefined}
            >
              {isPending ? 'Submitting…' : 'Submit Request'}
            </button>
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── Pending Modal ──────────────────────────────────────────── */

function PendingModal({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm z-10 animate-in fade-in zoom-in-95 duration-200 p-6 text-center">

        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-base font-bold text-slate-900 mb-2">Access Request Pending</h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Your access request is pending admin approval.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          You will be notified once approved. You can also check back here.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {refreshing && <Spinner />}
            {refreshing ? 'Checking…' : 'Refresh Status'}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

/* ─── Access Status Badge ────────────────────────────────────── */

function AccessBadge({ status, isAdmin }: { status: ToolStatus; isAdmin: boolean }) {
  if (isAdmin) {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #bbf7d0' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
        </svg>
        Full Access
      </span>
    );
  }
  if (status === 'approved') {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #bbf7d0' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
        </svg>
        Access Granted
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #fde68a' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Pending Approval
      </span>
    );
  }
  if (status === 'rejected' || status === 'revoked' || status === 'denied') {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #fecaca' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Access Denied
      </span>
    );
  }
  // 'new' → no badge
  return null;
}

/* ─── PO Expediting Card ─────────────────────────────────────── */

function POExpeditingCard({
  status,
  isAdmin,
  onClick,
}: {
  status: ToolStatus;
  isAdmin: boolean;
  onClick: () => void;
}) {
  const canOpen = isAdmin || status === 'approved';
  const isDenied = status === 'denied' || status === 'revoked' || status === 'rejected';

  return (
    <button
      onClick={onClick}
      className="relative bg-white rounded-xl border border-gray-200 p-8 flex flex-col gap-4 transition-all duration-200 text-left w-full cursor-pointer hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10 group"
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#307c4c]/10">
        <svg className="w-6 h-6 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
        </svg>
      </div>

      <div className="flex-1">
        <h3 className="text-[18px] font-semibold text-slate-900">PO Expediting</h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Monitor open purchase orders, expedite delayed lines, and collect supplier delivery updates.
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <AccessBadge status={status} isAdmin={isAdmin} />
        {canOpen ? (
          <span className="text-sm font-semibold text-[#307c4c] group-hover:underline">
            Open →
          </span>
        ) : status === 'new' ? (
          <span className="text-sm font-semibold text-[#307c4c] group-hover:underline">
            Request Access →
          </span>
        ) : isDenied ? (
          <span className="text-xs font-semibold text-red-600 group-hover:underline">
            Reapply for access →
          </span>
        ) : null}
      </div>
    </button>
  );
}

/* ─── TI-TE Card ─────────────────────────────────────────────── */

function TITECard({
  status,
  isAdmin,
  onClick,
}: {
  status: ToolStatus;
  isAdmin: boolean;
  onClick: () => void;
}) {
  const canOpen = isAdmin || status === 'approved';
  const isDenied = status === 'denied' || status === 'revoked' || status === 'rejected';
  const TITE_GREEN = '#006B0C';

  return (
    <button
      onClick={onClick}
      className="relative bg-white rounded-xl border border-gray-200 p-8 flex flex-col gap-4 transition-all duration-200 text-left w-full cursor-pointer hover:border-[#006B0C] hover:shadow-md hover:shadow-[#006B0C]/10 group"
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#006B0C18' }}>
        <svg className="w-6 h-6" style={{ color: TITE_GREEN }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <div className="flex-1">
        <h3 className="text-[18px] font-semibold text-slate-900">TI-TE</h3>
        <p className="text-[13px] text-slate-400 font-medium mt-0.5">Temporary Import / Export</p>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Track temporary import and export shipments, manage customs deadlines, deposits, and re-export compliance.
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <AccessBadge status={status} isAdmin={isAdmin} />
        {canOpen ? (
          <span className="text-sm font-semibold group-hover:underline" style={{ color: TITE_GREEN }}>
            Open →
          </span>
        ) : status === 'new' ? (
          <span className="text-sm font-semibold group-hover:underline" style={{ color: TITE_GREEN }}>
            Request Access →
          </span>
        ) : isDenied ? (
          <span className="text-xs font-semibold text-red-600 group-hover:underline">
            Reapply for access →
          </span>
        ) : null}
      </div>
    </button>
  );
}

/* ─── Coming-Soon Card ───────────────────────────────────────── */

function ProcureGuardCard({
  canOpen,
  onClick,
}: {
  canOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canOpen}
      className={`relative rounded-xl border border-gray-200 bg-white p-8 flex flex-col gap-4 text-left w-full transition-all duration-200 ${
        canOpen
          ? 'opacity-75 cursor-pointer hover:border-gray-400 hover:shadow-md hover:shadow-gray-200'
          : 'opacity-50 cursor-default select-none'
      }`}
    >
      <span className="absolute top-4 right-4 bg-gray-100 text-gray-400 text-[11px] font-medium px-2 py-1 rounded-full">
        Coming Soon
      </span>

      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-100">
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
        </svg>
      </div>

      <div className="flex-1">
        <h3 className="text-[18px] font-semibold text-gray-500">ProcureGuard</h3>
        <p className="text-[13px] text-slate-400 font-medium mt-0.5">Payment exception control</p>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">
          Review adhoc and advance payment exceptions, approval chains, analytics, and notification routing.
        </p>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
          Admin Preview
        </span>
        {canOpen && (
          <span className="text-sm font-semibold text-gray-500 hover:underline">
            Open preview -&gt;
          </span>
        )}
      </div>
    </button>
  );
}

function ComingSoonCard({
  name,
  description,
  icon,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 p-8 flex flex-col gap-4 opacity-60 cursor-default select-none">
      <span className="absolute top-4 right-4 bg-gray-100 text-gray-400 text-[11px] font-medium px-2 py-1 rounded-full">
        Coming Soon
      </span>

      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-100">
        {icon}
      </div>

      <div className="flex-1">
        <h3 className="text-[18px] font-semibold text-gray-400">{name}</h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function HomePage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const [modal, setModal] = useState<ModalType>(null);

  const rawName = session?.user?.name ?? '';
  const firstName = rawName.split(' ')[0] || 'there';
  const userDisplay = session?.user?.name || session?.user?.email || '';
  const userEmail = session?.user?.email ?? '';
  const displayName = session?.user?.name ?? userEmail;
  const jobTitle = session?.user?.jobTitle;
  const department = session?.user?.department;

  const isAdmin = session?.user?.isAdmin ?? false;
  const poStatus: ToolStatus   = session?.user?.toolAccess?.po_expediting?.status ?? 'new';
  const titeStatus: ToolStatus = session?.user?.toolAccess?.tite?.status          ?? 'new';

  function handlePOClick() {
    if (isAdmin || poStatus === 'approved') {
      router.push('/po-expediting');
      return;
    }
    if (poStatus === 'pending') { setModal('po-pending'); return; }
    setModal('po-request');
  }

  function handleTiteClick() {
    if (isAdmin || titeStatus === 'approved') {
      router.push('/ti-te');
      return;
    }
    if (titeStatus === 'pending') { setModal('tite-pending'); return; }
    setModal('tite-request');
  }

  function handleProcureGuardClick() {
    if (isAdmin) {
      router.push('/procure-guard');
    }
  }

  async function handleRefreshStatus() {
    await update();
  }

  async function handleAccessSubmitted() {
    await update();
    setModal(null);
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 font-sans text-slate-900">

      {/* ── Header ── */}
      <header className="h-16 bg-white border-b border-gray-200 px-6 lg:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/nesr-logo-circle.png"
            alt="NESR"
            width={36}
            height={36}
            className="rounded-full"
          />
          <span className="font-semibold text-slate-900 text-sm tracking-tight">
            NESR Digital Supply Chain
          </span>
        </div>

        <div className="flex items-center gap-4">
          {userDisplay && (
            <span className="text-sm text-slate-500 hidden sm:block">{userDisplay}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-8 items-start">

          {/* ── Tool grid ── */}
          <div className="flex-1 min-w-0">

            <div className="mb-10">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Welcome, {firstName}
              </h1>
              <p className="text-slate-500 mt-1 text-base">Select a tool to get started.</p>
              <p className="text-xs text-slate-400 mt-1.5">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

              <POExpeditingCard
                status={poStatus}
                isAdmin={isAdmin}
                onClick={handlePOClick}
              />

              <TITECard
                status={titeStatus}
                isAdmin={isAdmin}
                onClick={handleTiteClick}
              />

              <ProcureGuardCard
                canOpen={isAdmin}
                onClick={handleProcureGuardClick}
              />

              <ComingSoonCard
                name="Laptop Procurement"
                description="Asset request and approval management"
                icon={<Laptop className="w-6 h-6 text-gray-400" />}
              />
              <ComingSoonCard
                name="The Bridge"
                description="Cross-functional project tracking and handoffs"
                icon={<GitMerge className="w-6 h-6 text-gray-400" />}
              />
              <ComingSoonCard
                name="GRN Reconciliation"
                description="Goods receipt and invoice matching"
                icon={<FileCheck className="w-6 h-6 text-gray-400" />}
              />

            </div>
          </div>

          {/* ── SCAI Panel ── */}
          <aside className="hidden lg:flex w-[280px] shrink-0 sticky top-8 flex-col gap-4 bg-[#f0f9f4] border border-[#b6ddc8] rounded-2xl p-6 self-start">

            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#307c4c]" />
              <p className="text-[10px] font-semibold tracking-widest uppercase text-[#307c4c]">
                AI Assistant
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 leading-tight">SCAI — Supply Chain AI</h2>
              <p className="text-xs text-slate-500 mt-0.5">3 specialized agents, one platform</p>
            </div>

            <div className="flex flex-col gap-3">

              <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
                <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
                  <ScanSearch className="w-4 h-4 text-[#307c4c]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">Materials AI</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    Duplicate checks, VDC stock lookups, and new material creation support
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
                <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-[#307c4c]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">SC Policy AI</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    Instant answers from NESR's internal freight, warehouse, compliance, and field operations policies
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
                <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#307c4c]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">SourceGuide AI</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                    Find approved suppliers, check compliance status, and access purchase history across 10 countries
                  </p>
                </div>
              </div>

            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Powered by NESR's internal data and policy documents.
            </p>

            <a
              href="https://scai.nesr.com"
              className="w-full bg-[#307c4c] hover:bg-[#276041] text-white text-sm font-semibold py-3 rounded-xl text-center transition-colors"
            >
              Open SCAI →
            </a>

          </aside>

        </div>
      </main>

      {/* ── Modals ── */}
      {modal === 'po-request' && (
        <AccessRequestModal
          userEmail={userEmail}
          displayName={displayName}
          onClose={() => setModal(null)}
          onSubmitted={handleAccessSubmitted}
        />
      )}
      {modal === 'po-pending' && (
        <PendingModal
          onClose={() => setModal(null)}
          onRefresh={handleRefreshStatus}
        />
      )}
      {modal === 'tite-request' && (
        <TiteAccessRequestModal
          userEmail={userEmail}
          displayName={displayName}
          jobTitle={jobTitle}
          department={department}
          onClose={() => setModal(null)}
          onSubmitted={handleAccessSubmitted}
        />
      )}
      {modal === 'tite-pending' && (
        <PendingModal
          onClose={() => setModal(null)}
          onRefresh={handleRefreshStatus}
        />
      )}

    </div>
  );
}
