'use client';

import { signOut } from 'next-auth/react';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center font-sans px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-sm w-full text-center animate-in fade-in duration-300">
        {/* Lock icon */}
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-lg font-bold text-slate-900">Access Denied</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Your access request was not approved. Please contact your administrator if you believe this is a mistake.
        </p>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}
