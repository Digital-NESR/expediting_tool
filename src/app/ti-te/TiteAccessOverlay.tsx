'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { submitTiteAccessRequest } from '@/app/actions/tite';

const BRAND = '#006B0C';

const TITE_COUNTRIES = [
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Qatar',
  'Rome',
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

/* ─── Props ──────────────────────────────────────────────────── */

interface Props {
  status: 'new' | 'pending' | 'rejected' | 'revoked' | 'denied';
  userEmail: string;
  userName: string;
  jobTitle?: string;
  department?: string;
}

/* ─── Component ──────────────────────────────────────────────── */

export default function TiteAccessOverlay({
  status: initialStatus,
  userEmail,
  userName,
  jobTitle,
  department,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => TITE_COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  const allVisibleSelected =
    filtered.length > 0 && filtered.every(c => selected.has(c));

  function toggleCountry(c: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach(c => next.delete(c));
      } else {
        filtered.forEach(c => next.add(c));
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setErrorMsg('Please select at least one country.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const result = await submitTiteAccessRequest({
        userEmail,
        displayName: userName,
        jobTitle:    jobTitle    ?? null,
        department:  department  ?? null,
        requestedCountries: [...selected],
      });
      if (result.success) {
        setStatus('pending');
      } else {
        setErrorMsg(result.error ?? 'Failed to submit request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 2500);
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans text-slate-900">

      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: BRAND }}
        >
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">TI-TE Portal</span>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[200px]">
            {userName !== userEmail ? `${userName} · ` : ''}{userEmail}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex items-start justify-center px-4 pt-14 pb-16">
        <div className="w-full max-w-md">

          {/* Branding */}
          <div className="flex items-center gap-3 mb-8">
            <Image
              src="/nesr-logo-circle.png"
              alt="NESR"
              width={40}
              height={40}
              className="rounded-full"
            />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">NESR Supply Chain</p>
              <p className="text-sm font-bold text-slate-800">TI-TE Portal</p>
            </div>
          </div>

          {/* ── NEW: country selection form ── */}
          {status === 'new' && (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100">
                <h1 className="text-lg font-bold text-slate-900">Request Access</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Select the countries you need access to view TI-TE shipment data.
                </p>
              </div>

              <div className="px-6 py-5 flex flex-col gap-4">

                {errorMsg && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                    <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    {errorMsg}
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search countries…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] placeholder:text-slate-400"
                  />
                </div>

                {/* Select-all + count */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-semibold text-[#006B0C] hover:underline"
                  >
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  {selected.size > 0 && (
                    <span className="text-xs font-medium text-slate-500">
                      {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
                    </span>
                  )}
                </div>

                {/* Country list */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No countries found.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filtered.map(c => (
                        <label
                          key={c}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(c)}
                            onChange={() => toggleCountry(c)}
                            className="w-4 h-4 rounded border-slate-300 text-[#006B0C] focus:ring-[#006B0C]/20 cursor-pointer accent-[#006B0C]"
                          />
                          <span className="text-sm font-medium text-slate-700">{c}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || selected.size === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                  style={{ background: BRAND }}
                >
                  {submitting ? 'Submitting…' : 'Submit Access Request'}
                </button>
              </div>
            </form>
          )}

          {/* ── PENDING ── */}
          {status === 'pending' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-slate-900">Access Request Pending</h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xs mx-auto">
                Your request is under review. You'll have access once an administrator approves it.
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all active:scale-95"
                  style={{ background: BRAND }}
                >
                  {refreshing ? 'Checking…' : 'Check Status'}
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* ── REJECTED / REVOKED / DENIED ── */}
          {(status === 'rejected' || status === 'revoked' || status === 'denied') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                {status === 'revoked' ? 'Access Revoked' : 'Access Denied'}
              </h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xs mx-auto">
                {status === 'revoked'
                  ? 'Your access to TI-TE Portal has been revoked. Contact your administrator for more information.'
                  : 'Your access request was not approved. You may re-apply or contact your administrator.'}
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <button
                  onClick={() => { setSelected(new Set()); setSearch(''); setErrorMsg(''); setStatus('new'); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                  style={{ background: BRAND }}
                >
                  Re-apply
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
