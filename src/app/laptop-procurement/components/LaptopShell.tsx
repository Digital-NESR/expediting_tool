'use client';

// Glass & Depth shell for all Laptop Procurement pages:
// mint atmosphere, persistent frosted sidebar (drawer on mobile), glass header.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { LaptopAccessView } from '@/types/laptopProcurement';
import LaptopProcurementLogo from './LaptopProcurementLogo';

/* ── Shared design tokens ─────────────────────────────────────── */
export const GLASS = 'rounded-[22px] border border-white/70 bg-white/60 shadow-[0_14px_44px_rgba(24,58,38,0.12)] backdrop-blur-2xl';
export const GLASS_SOFT = 'rounded-2xl border border-white/70 bg-white/50 backdrop-blur-xl';
export const CTA = 'rounded-full bg-gradient-to-br from-[#3a9a5f] to-[#24603f] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(36,96,63,0.42)] transition hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(36,96,63,0.5)] active:translate-y-0';
export const CTA_QUIET = 'rounded-full border border-white/80 bg-white/60 px-4 py-2.5 text-sm font-bold text-[#28714a] shadow-sm backdrop-blur-xl transition hover:bg-white/85';

const NAV = [
  { href: '/laptop-procurement', label: 'Dashboard', icon: 'grid', access: ['requester', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/my-work', label: 'My Work', icon: 'check', access: ['reviewer', 'admin'] },
  { href: '/laptop-procurement/requests', label: 'Requests', icon: 'laptop', access: ['requester', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/requests/new', label: 'New Request', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/admin?tool=laptop-procurement-analytics', label: 'Analytics', icon: 'chart', access: ['analyst', 'reviewer', 'admin'] },
  { href: '/laptop-procurement/delegate', label: 'Delegate', icon: 'delegate', access: ['reviewer', 'admin'] },
  { href: '/admin?tool=laptop-procurement-admin', label: 'Admin Panel', icon: 'grid', access: ['admin'] },
];

function Icon({ name }: { name: string }) {
  if (name === 'home') return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
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
      <div className="flex items-center gap-3 px-2 pb-5 pt-1">
        <LaptopProcurementLogo size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight tracking-tight text-[#182a1f]">Laptop Procurement</p>
          <p className="text-[10px] font-medium text-[#5f7266]">NESR SC Tools</p>
        </div>
      </div>

      <nav className="grid gap-1">
        <Link
          href="/home"
          onClick={onNavigate}
          title="Home"
          className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium text-[#4c5f53] transition hover:bg-white/70"
        >
          <Icon name="home" />
          <span className="truncate">Home</span>
        </Link>
        <div className="mx-2 my-1.5 h-px bg-[#182a1f]/10" />
        {visibleNav.map(item => {
          const active = item.href === '/laptop-procurement'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={item.label}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13px] transition ${
                active
                  ? 'bg-gradient-to-br from-[#3a9a5f] to-[#28714a] font-semibold text-white shadow-[0_8px_20px_rgba(40,113,74,0.38)]'
                  : 'font-medium text-[#4c5f53] hover:bg-white/70'
              }`}
            >
              <Icon name={item.icon} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/80 bg-white/55 p-4 backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7266]">Review Queue</p>
        <p className="mt-1.5 text-3xl font-bold tracking-tight text-[#182a1f] tabular-nums">{pendingCount ?? 0}</p>
        <p className="mt-0.5 text-[11px] text-[#5f7266]">active approval items</p>
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
    <div className="relative min-h-[100dvh] bg-[#edf4ee] font-sans text-[#182a1f]">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-36 -top-44 h-[520px] w-[520px] rounded-full bg-[#60be86]/40 blur-3xl" />
        <div className="absolute -right-32 top-32 h-[460px] w-[460px] rounded-full bg-[#307c4c]/20 blur-3xl" />
        <div className="absolute -bottom-56 left-1/3 h-[420px] w-[420px] rounded-full bg-[#b0e0c0]/50 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1440px] gap-5 px-4 py-4 sm:px-5 sm:py-5">
        {/* Persistent sidebar (desktop) */}
        <aside className={`${GLASS} sticky top-5 hidden h-[calc(100dvh-40px)] w-[248px] shrink-0 flex-col rounded-[26px] p-4 lg:flex`}>
          <SidebarBody accessView={accessView} pendingCount={pendingCount} />
        </aside>

        {/* Drawer (mobile) */}
        <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-[#182a1f]/30 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside
            className={`absolute inset-y-3 left-3 flex w-[264px] flex-col rounded-[26px] border border-white/70 bg-white/85 p-4 shadow-[0_20px_60px_rgba(24,58,38,0.3)] backdrop-blur-2xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-[112%]'}`}
          >
            <SidebarBody accessView={accessView} pendingCount={pendingCount} onNavigate={() => setOpen(false)} />
          </aside>
        </div>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className={`${GLASS} flex items-center gap-3 px-4 py-3.5 sm:px-5`}>
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded-full p-2 text-[#4c5f53] transition hover:bg-white/70 lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="lg:hidden"><LaptopProcurementLogo size="sm" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight sm:text-lg">{title}</h1>
              {subtitle && <p className="truncate text-xs text-[#5f7266]">{subtitle}</p>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {actions}
              <span className="hidden text-xs font-medium text-[#5f7266] md:block">{today}</span>
            </div>
          </header>

          <main className="flex-1 pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
