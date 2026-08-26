'use client';

// Flat ProcureGuard-style shell for all Laptop Procurement pages:
// white sidebar with green header, flat white cards, solid green actions.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { LaptopAccessView } from '@/types/laptopProcurement';
import LaptopProcurementLogo from './LaptopProcurementLogo';

/* ── Shared design tokens (flat ProcureGuard look) ────────────── */
export const GLASS = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
export const GLASS_SOFT = 'rounded-xl border border-slate-200 bg-white';
export const CTA = 'rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#307c4c]/80';
export const CTA_QUIET = 'rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50';

const NAV = [
  { href: '/laptop-procurement', label: 'Dashboard', icon: 'grid', access: ['requester', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/my-work', label: 'My Work', icon: 'check', access: ['reviewer', 'admin'] },
  { href: '/laptop-procurement/requests', label: 'Requests', icon: 'laptop', access: ['requester', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/requests/new', label: 'New Request', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/analytics', label: 'Analytics', icon: 'chart', access: ['reviewer', 'admin'] },
  { href: '/laptop-procurement/delegate', label: 'Delegate', icon: 'delegate', access: ['reviewer', 'admin'] },
  { href: '/admin?tool=laptop-procurement-admin', label: 'Admin Panel', icon: 'grid', access: ['admin'] },
];

// Whichever nav item's href most specifically matches the current path — so a path
// like /requests/new (itself a valid prefix-match for "Requests") only lights up
// "New Request", the more specific of the two, not both at once.
function bestNavMatch<T extends { href: string }>(items: T[], pathname: string): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best;
}

function Icon({ name }: { name: string }) {
  if (name === 'home') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  );
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
  if (name === 'laptop') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
  if (name === 'chart') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 15V9m4 6V6m4 9v-4" />
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

function SidebarBody({
  accessView,
  pendingCount,
  onNavigate,
}: {
  accessView: LaptopAccessView;
  pendingCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const visibleNav = NAV.filter(item => item.access.includes(accessView));

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
        <LaptopProcurementLogo size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight tracking-tight">Laptop Procurement</p>
          <p className="text-[0.6875rem] text-white/70">Device request control</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onNavigate}
            className="ml-auto rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white lg:hidden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <Link
          href="/home"
          onClick={onNavigate}
          title="NESR Home"
          aria-label="Back to NESR home"
          className="mb-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
        >
          <Icon name="home" />
          <span className="truncate">Back to NESR Home</span>
        </Link>
        <div className="space-y-1">
          {visibleNav.map(item => {
            // Only the single most-specific matching item lights up — otherwise a nav
            // item whose href is a prefix of another's (e.g. "Requests" vs "New
            // Request") would both show active on /requests/new.
            const active = item.href === bestNavMatch(visibleNav, pathname)?.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
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

      <div className="border-t border-slate-100 px-3 pb-3 pt-3">
        <Link
          href="/laptop-procurement/my-work"
          onClick={onNavigate}
          className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-4 py-2.5 text-white shadow-sm shadow-[#307c4c]/20 transition hover:from-[#2b6f44] hover:to-[#193f27]"
        >
          <div className="min-w-0">
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-white/70">Review Queue</p>
            <p className="text-[0.6875rem] text-white/70">active approval items</p>
          </div>
          <p className="text-2xl font-bold leading-none tabular-nums">{pendingCount ?? 0}</p>
        </Link>
      </div>
    </>
  );
}

export default function LaptopShell({
  title,
  subtitle,
  actions,
  pendingCount,
  accessView = 'requester',
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  pendingCount?: number;
  accessView?: LaptopAccessView;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <div className="flex min-h-[100dvh]">
        {/* Persistent sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-[100dvh] w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <SidebarBody accessView={accessView} pendingCount={pendingCount} />
        </aside>

        {/* Drawer (mobile) */}
        <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-slate-950/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <SidebarBody accessView={accessView} pendingCount={pendingCount} onNavigate={() => setOpen(false)} />
          </aside>
        </div>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="lg:hidden"><LaptopProcurementLogo size="sm" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">{title}</h1>
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {actions}
              <span className="hidden text-xs font-medium text-slate-500 md:block">{today}</span>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 pb-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1220px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
