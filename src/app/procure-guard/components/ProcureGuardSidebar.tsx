'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import type { ProcureGuardAccessView } from '@/types/procureGuard';
import ProcureGuardLogo from './ProcureGuardLogo';

const NAV = [
  { href: '/procure-guard', label: 'Dashboard', icon: 'grid', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/my-work', label: 'My Work', icon: 'check', access: ['reviewer', 'admin'] },
  { href: '/procure-guard/adhoc-payments', label: 'Adhoc POs', icon: 'bolt', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/adhoc-payments/new', label: 'New Adhoc PO', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/advance-payments', label: 'Advance Requests', icon: 'wallet', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/advance-payments/new', label: 'New Advance Request', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/analytics', label: 'Analytics', icon: 'chart', access: ['analyst', 'reviewer', 'admin'] },
  { href: '/procure-guard/delegate', label: 'Delegate', icon: 'delegate', access: ['reviewer', 'admin'] },
  { href: '/procure-guard/help', label: 'Help & Training', icon: 'help', access: ['requester', 'reviewer', 'admin', 'analyst'] },
  { href: '/admin?tool=procureguard-admin', label: 'Admin Panel', icon: 'grid', access: ['admin'] },
  { href: '/admin?tool=procureguard-usage', label: 'Admin Analytics', icon: 'chart', access: ['admin'] },
];

function Icon({ name }: { name: string }) {
  if (name === 'grid') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  );
  if (name === 'check') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (name === 'bolt') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
  if (name === 'wallet') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm14 5h.01" />
    </svg>
  );
  if (name === 'chart') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4" />
    </svg>
  );
  if (name === 'home') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  );
  if (name === 'help') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (name === 'delegate') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  );
}

export default function ProcureGuardSidebar({
  isOpen,
  onClose,
  pendingCount,
  accessView = 'requester',
}: {
  isOpen: boolean;
  onClose: () => void;
  pendingCount?: number;
  accessView?: ProcureGuardAccessView;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const visibleNav = NAV.filter(item => item.access.includes(accessView));

  const rawName = session?.user?.name || 'Unknown User';
  const nameParts = rawName.split(' ').filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle || 'User';

  // Pinned by default: on large screens the sidebar docks open and shifts page content right.
  // Users can unpin it (collapses back to the slide-over drawer). Choice persists per browser.
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem('pg-sidebar-pinned');
    if (stored !== null) setPinned(stored === '1');
    if (!document.getElementById('pg-sidebar-pin-style')) {
      const el = document.createElement('style');
      el.id = 'pg-sidebar-pin-style';
      el.textContent = '@media (min-width:1024px){body.pg-sidebar-pinned{padding-left:280px}}';
      document.head.appendChild(el);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem('pg-sidebar-pinned', pinned ? '1' : '0');
    document.body.classList.toggle('pg-sidebar-pinned', pinned);
    return () => { document.body.classList.remove('pg-sidebar-pinned'); };
  }, [pinned]);

  return (
    <>
      <button
        type="button"
        aria-label="Close ProcureGuard menu"
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'} ${pinned ? 'lg:hidden' : ''}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${pinned ? 'lg:translate-x-0 lg:shadow-none' : ''}`}
      >
        <div className="flex h-16 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
          <ProcureGuardLogo size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight">ProcureGuard</p>
            <p className="text-[11px] text-white/70">Payment request control</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              onClick={() => setPinned(p => !p)}
              className="hidden rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white lg:inline-flex"
            >
              {pinned ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 3l5 5-1.5 1.5-1-1-3.5 3.5.5 4.5L14 19l-3.5-3.5L5 21l-1-1 5.5-5.5L6 11l2-1 4.5.5L16 7l-1-1L16.5 4.5 16 3z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6" />
                </svg>
              )}
            </button>
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className={`rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white ${pinned ? 'lg:hidden' : ''}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <Link
            href="/home"
            onClick={onClose}
            title="NESR Home"
            aria-label="Back to NESR home"
            className="mb-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
          >
            <Icon name="home" />
            <span className="truncate">Back to NESR Home</span>
          </Link>
          <div className="space-y-1">
            {visibleNav.map(item => {
              const active = item.href === '/procure-guard'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  title={item.label}
                  aria-label={item.label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#307c4c] to-[#2b6f44] text-white shadow-sm shadow-[#307c4c]/30'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon name={item.icon} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 px-3 pb-2 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-4 py-2.5 text-white shadow-sm shadow-[#307c4c]/20">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Review Queue</p>
              <p className="text-[11px] text-white/70">active approval items</p>
            </div>
            <p className="text-2xl font-bold leading-none">{pendingCount ?? 0}</p>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-3">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={rawName}
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#307c4c] to-[#1d4f31] text-xs font-bold text-white shadow-sm">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{rawName}</p>
              <p className="truncate text-xs text-slate-400">{jobTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
