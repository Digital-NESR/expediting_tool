'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { submitAccessRequest } from '@/app/actions/access';

interface Props {
  userEmail: string;
  displayName: string;
  countries: string[];
}

export default function RequestAccessClient({ userEmail, displayName, countries }: Props) {
  const router = useRouter();
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError]         = useState<string | null>(null);

  const filtered = useMemo(
    () => countries.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [countries, search],
  );

  function toggle(country: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(country) ? next.delete(country) : next.add(country);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await submitAccessRequest(userEmail, displayName, [...selected]);
      if (res.success) {
        router.push('/pending-approval');
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center font-sans px-4 py-10">
      {/* Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md">
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nesr-logo-circle.png" alt="NESR" className="w-8 h-8 rounded-full object-cover" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SC Agents</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">Request Access</h1>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Select the countries you need access to. An admin will review your request.
          </p>
          <p className="text-xs text-slate-400 mt-2">Signed in as <span className="font-medium text-slate-600">{displayName}</span></p>
        </div>

        {/* Search */}
        <div className="px-7 pt-5 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search countries…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors placeholder-slate-400"
            />
          </div>
          {selected.size > 0 && (
            <p className="text-xs text-[#307c4c] font-medium mt-2">
              {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
            </p>
          )}
        </div>

        {/* Country list */}
        <div className="px-7 pb-2 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No countries found.</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(country => {
                const checked = selected.has(country);
                return (
                  <label
                    key={country}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(country)}
                      className="w-4 h-4 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20 cursor-pointer"
                    />
                    <span className={`text-sm font-medium transition-colors ${checked ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-800'}`}>
                      {country}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-slate-100">
          {error && (
            <p className="text-sm text-red-600 mb-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={isPending || selected.size === 0}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
          >
            {isPending ? 'Submitting…' : 'Submit Request'}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full mt-2 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
