'use client';

import { signOut } from 'next-auth/react';

interface Props {
  displayName: string;
  requestedCountries: string[];
}

export default function PendingApprovalClient({ displayName, requestedCountries }: Props) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center font-sans px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-sm w-full text-center animate-in fade-in duration-300">
        {/* Clock icon */}
        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-lg font-bold text-slate-900">Access Pending</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Hi <span className="font-medium text-slate-700">{displayName}</span>, your request is under review. You&apos;ll have access once an admin approves it.
        </p>

        {/* Requested countries */}
        {requestedCountries.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Requested countries</p>
            <div className="flex flex-wrap gap-1.5">
              {requestedCountries.map(c => (
                <span
                  key={c}
                  className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium text-slate-600 border border-slate-200"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-7 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
