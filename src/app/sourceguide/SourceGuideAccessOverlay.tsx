'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { submitSourceGuideAccessRequest } from '@/app/actions/sourceguide';
import type { SgCountry } from '@/types/sourceguide';

const BRAND = '#2A7E4F';
const VIEW_ONLY = 'All Countries - View Only';

interface Props {
  status: 'new' | 'pending' | 'rejected' | 'revoked' | 'denied';
  userEmail: string;
  userName: string;
  jobTitle?: string;
  department?: string;
  countries: SgCountry[];
}

export default function SourceGuideAccessOverlay({
  status: initialStatus, userEmail, userName, jobTitle, department, countries,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const options = useMemo(
    () => [{ code: VIEW_ONLY, name: VIEW_ONLY }, ...countries.map(c => ({ code: c.code, name: c.name }))],
    [countries],
  );
  const filtered = useMemo(
    () => options.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );

  function toggle(code: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) { setErrorMsg('Please select at least one country.'); return; }
    setSubmitting(true); setErrorMsg('');
    try {
      const result = await submitSourceGuideAccessRequest({
        userEmail, displayName: userName,
        jobTitle: jobTitle ?? null, department: department ?? null,
        requestedCountries: [...selected],
      });
      if (result.success) setStatus('pending');
      else setErrorMsg(result.error ?? 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 2500);
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: BRAND }}>
          <span className="text-white font-extrabold text-[9px] tracking-tight">SG</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">SourceGuide Portal</span>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[200px]">
            {userName !== userEmail ? `${userName} · ` : ''}{userEmail}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-14 pb-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <Image src="/nesr-logo-circle.png" alt="NESR" width={40} height={40} className="rounded-full" />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">NESR Supply Chain</p>
              <p className="text-sm font-bold text-slate-800">SourceGuide Portal</p>
            </div>
          </div>

          {status === 'new' && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <h1 className="text-lg font-bold text-slate-900">Request Access</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Select the country guides you need. Choose <b>{VIEW_ONLY}</b> for read-only access across all guides.
                </p>
              </div>
              <div className="px-6 py-5 flex flex-col gap-4">
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{errorMsg}</div>
                )}
                <input
                  type="text" placeholder="Search countries…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ ['--tw-ring-color' as string]: `${BRAND}33` }}
                />
                {selected.size > 0 && (
                  <span className="text-xs font-medium" style={{ color: BRAND }}>
                    {selected.size} selected
                  </span>
                )}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filtered.map(c => (
                    <label key={c.code} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)}
                        className="w-4 h-4 rounded border-slate-300 cursor-pointer" style={{ accentColor: BRAND }}
                      />
                      <span className="text-sm font-medium text-slate-700">{c.name}</span>
                    </label>
                  ))}
                  {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No countries found.</p>}
                </div>
                <button
                  type="submit" disabled={submitting || selected.size === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                  style={{ background: BRAND }}
                >
                  {submitting ? 'Submitting…' : 'Submit Access Request'}
                </button>
              </div>
            </form>
          )}

          {status === 'pending' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-slate-900">Access Request Pending</h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xs mx-auto">
                Your request is under review. You&apos;ll have access once an administrator approves it.
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <button onClick={handleRefresh} disabled={refreshing}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all active:scale-95" style={{ background: BRAND }}>
                  {refreshing ? 'Checking…' : 'Check Status'}
                </button>
                <button onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {(status === 'rejected' || status === 'revoked' || status === 'denied') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                {status === 'revoked' ? 'Access Revoked' : 'Access Denied'}
              </h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xs mx-auto">
                {status === 'revoked'
                  ? 'Your access to SourceGuide has been revoked. Contact your administrator for more information.'
                  : 'Your access request was not approved. You may re-apply or contact your administrator.'}
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <button onClick={() => { setSelected(new Set()); setSearch(''); setErrorMsg(''); setStatus('new'); }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95" style={{ background: BRAND }}>
                  Re-apply
                </button>
                <button onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
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
