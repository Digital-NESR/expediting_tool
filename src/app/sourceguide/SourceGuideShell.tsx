'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Menu } from 'lucide-react';
import { SG_BRAND } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';
import { initials } from './constants';
import SourceGuideSidebar from './SourceGuideSidebar';

export default function SourceGuideShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, viewOnly, approvedCountries } = useSourceGuideAccess();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const role = isAdmin ? 'Administrator' : viewOnly ? 'Viewer' : approvedCountries.length ? 'Champion' : 'Viewer';
  const showHeaderSearch = pathname !== '/sourceguide';

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/sourceguide/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f5f6f5] font-sans text-slate-900">
      <SourceGuideSidebar isOpen={open} onClose={() => setOpen(false)} />

      {/* Slim top bar with hamburger */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/sourceguide" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: SG_BRAND }}>
              <span className="text-[10px] font-extrabold tracking-tight text-white">SG</span>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">SourceGuide</span>
          </Link>

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
              <div className="text-[11px] text-slate-500">{role}</div>
            </div>
            <button
              onClick={() => setOpen(true)}
              title="Menu"
              className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: SG_BRAND }}
            >
              {initials(userName)}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
