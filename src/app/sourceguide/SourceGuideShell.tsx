'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Menu } from 'lucide-react';
import { SG_BRAND } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';
import { initials } from './constants';
import SourceGuideSidebar from './SourceGuideSidebar';
import SourceGuideCommandPalette from './SourceGuideCommandPalette';

const PIN_KEY = 'sg-sidebar-pinned';

export default function SourceGuideShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const { isAdmin, viewOnly, approvedCountries } = useSourceGuideAccess();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // restore pin preference
  useEffect(() => {
    try { if (localStorage.getItem(PIN_KEY) === '1') setPinned(true); } catch { /* ignore */ }
  }, []);

  // Cmd/Ctrl-K opens the command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function togglePin() {
    setPinned(p => {
      const next = !p;
      try { localStorage.setItem(PIN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
    setOpen(false);
  }

  const role = isAdmin ? 'Administrator' : viewOnly ? 'Viewer' : approvedCountries.length ? 'Champion' : 'Viewer';
  const showHeaderSearch = pathname !== '/sourceguide';

  return (
    <div className="min-h-[100dvh] bg-[#f5f6f5] font-sans text-slate-900">
      <SourceGuideSidebar isOpen={open} onClose={() => setOpen(false)} pinned={pinned} onTogglePin={togglePin} />
      <SourceGuideCommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Content shifts right when the sidebar is pinned (lg+) */}
      <div className={`flex min-h-[100dvh] flex-col transition-[padding] duration-300 ${pinned ? 'lg:pl-[280px]' : ''}`}>
        {/* Slim top bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className={`grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 ${pinned ? 'lg:hidden' : ''}`}
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
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-slate-400 transition-colors hover:border-[#6AAF8E] sm:flex"
              >
                <Search className="h-4 w-4" />
                <span className="w-32 text-left text-[13.5px]">Search…</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘K</kbd>
              </button>
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
    </div>
  );
}
