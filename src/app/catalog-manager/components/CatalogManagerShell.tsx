'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import CatalogManagerSidebar from './CatalogManagerSidebar';
import CatalogManagerHomeButton from './CatalogManagerHomeButton';
import CatalogManagerLogo from './CatalogManagerLogo';
import CommandPalette from './CommandPalette';
import { Icon } from './CatalogManagerUI';

export interface ScopeCountry {
  code: string;
  name: string;
  flag: string | null;
}

export default function CatalogManagerShell({
  title,
  roleLabel,
  canApprove,
  canAdmin,
  pendingCount,
  scope,
  countries,
  showScope = true,
  headerAction,
  fill = false,
  children,
}: {
  title: string;
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
  scope?: string;
  countries?: ScopeCountry[];
  showScope?: boolean;
  headerAction?: React.ReactNode;
  /** Fill the viewport (full width + height) with internal scrolling — for the catalog list. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Restore the saved pin preference after mount (keeps SSR markup stable → no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(localStorage.getItem('cm_sidebar_pinned') === '1');
  }, []);

  function togglePin() {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem('cm_sidebar_pinned', next ? '1' : '0');
      return next;
    });
  }

  function onScopeChange(value: string) {
    const qs = value && value !== 'ALL' ? `?country=${value}` : '';
    router.push(`${pathname}${qs}`);
  }

  return (
    <div className={`bg-slate-50 font-sans text-slate-900 transition-[padding] duration-200 ${pinned ? 'md:pl-[280px]' : ''} ${fill ? 'flex h-[100dvh] flex-col overflow-hidden' : 'min-h-[100dvh]'}`}>
      <CatalogManagerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pinned={pinned}
        onTogglePin={togglePin}
        canApprove={canApprove}
        canAdmin={canAdmin}
        pendingCount={pendingCount}
        roleLabel={roleLabel}
      />

      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className={`rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 ${pinned ? 'md:hidden' : ''}`} aria-label="Open menu">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <CatalogManagerHomeButton />
        <CatalogManagerLogo size="sm" />
        <span className="hidden text-sm font-semibold text-slate-900 sm:inline">{title}</span>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('cm:palette'))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-400 hover:border-[#307c4c]/30 hover:text-slate-600"
            aria-label="Search (Ctrl/Cmd K)"
            title="Search (Ctrl/⌘ K)"
          >
            <Icon name="search" className="h-4 w-4" />
            <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold lg:inline">⌘K</kbd>
          </button>
          {showScope && countries && (
            <div className="relative">
              <Icon name="globe" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#307c4c]" />
              <select
                value={scope ?? 'ALL'}
                onChange={(e) => onScopeChange(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20"
              >
                <option value="ALL">All operating countries</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>
                ))}
              </select>
              <Icon name="chevRight" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
            </div>
          )}
          {headerAction}
        </div>
      </header>

      <main className={fill ? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 lg:overflow-hidden' : 'mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8'}>{children}</main>
      <CommandPalette />
    </div>
  );
}
