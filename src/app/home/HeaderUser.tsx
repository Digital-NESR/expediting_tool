'use client';

/* The only interactive part of the home header: the signed-in name and
   the Sign Out button. The rest of the header is server-rendered. */

import { useSession, signOut } from 'next-auth/react';

export default function HeaderUser() {
  const { data: session } = useSession();
  const displayName = session?.user?.name || session?.user?.email || '';

  return (
    <div className="flex items-center gap-4">
      {displayName && (
        <span className="text-sm text-slate-500 hidden sm:block">{displayName}</span>
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
  );
}
