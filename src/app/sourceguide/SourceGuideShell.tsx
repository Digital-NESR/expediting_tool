'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Search, Lock } from 'lucide-react';
import { SG_BRAND } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';
import { initials } from './constants';

export default function SourceGuideShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, viewOnly, approvedCountries } = useSourceGuideAccess();
  const [q, setQ] = useState('');

  const canManage = isAdmin || (!viewOnly && approvedCountries.length > 0);

  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
    { href: '/sourceguide', label: 'Home', match: p => p === '/sourceguide' },
    { href: '/sourceguide/browse', label: 'Browse', match: p => p.startsWith('/sourceguide/browse') },
  ];
  if (canManage) {
    tabs.push({
      href: '/sourceguide/mappings',
      label: isAdmin ? 'Mappings' : 'My Mappings',
      match: p => p.startsWith('/sourceguide/mappings'),
    });
  }
  if (isAdmin) {
    tabs.push({ href: '/admin?tool=sourceguide-guides', label: 'Source Guides', match: () => false });
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/sourceguide/search?q=${encodeURIComponent(q.trim())}`);
  }

  const showHeaderSearch = pathname !== '/sourceguide';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f5f6f5] font-sans text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-5 px-6 lg:px-8">
          <Link href="/sourceguide" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: SG_BRAND }}>
              <span className="text-white font-extrabold text-[10px] tracking-tight">SG</span>
            </span>
            <span className="flex flex-col leading-none">
              <b className="text-[15px] font-bold tracking-tight">NESR</b>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">SourceGuide</span>
            </span>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            {tabs.map(t => {
              const active = t.match(pathname);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors"
                  style={active
                    ? { background: '#eaf4ef', color: '#1f5d3a' }
                    : { color: '#58595B' }}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          {showHeaderSearch && (
            <form onSubmit={runSearch} className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-slate-400 focus-within:border-[#6AAF8E] sm:flex">
              <Search className="h-4 w-4" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search…"
                className="w-44 bg-transparent text-[13.5px] text-slate-900 outline-none placeholder:text-slate-400"
              />
            </form>
          )}

          <div className="flex items-center gap-2.5">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[12.5px] font-semibold">{userName}</div>
              <div className="text-[11px] text-slate-500">
                {isAdmin ? 'Administrator' : viewOnly ? 'Viewer' : approvedCountries.length ? 'Champion' : 'Viewer'}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign out"
              className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: SG_BRAND }}
            >
              {initials(userName)}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-5 lg:px-8">
          <span className="flex items-center gap-2 text-[12.5px] text-slate-500">
            <span className="h-6 w-6 rounded-md" style={{ background: SG_BRAND }} />
            NESR SourceGuide · Sourcing Intelligence Portal
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
            <Lock className="h-3 w-3" /> Internal Use Only · TLS 1.2+ · AES-256
          </span>
        </div>
      </footer>
    </div>
  );
}
