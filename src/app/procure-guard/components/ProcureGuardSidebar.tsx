'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ProcureGuardAccessView } from '@/types/procureGuard';
import ProcureGuardLogo from './ProcureGuardLogo';

const NAV = [
  { href: '/procure-guard', label: 'Dashboard', icon: 'grid', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/my-work', label: 'My Work', icon: 'check', access: ['reviewer', 'admin'] },
  { href: '/procure-guard/adhoc-payments', label: 'Adhoc Payments', icon: 'bolt', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/adhoc-payments/new', label: 'New Adhoc Payment', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/advance-payments', label: 'Advance Requests', icon: 'wallet', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/advance-payments/new', label: 'New Advance Request', icon: 'plus', access: ['requester', 'reviewer', 'admin'] },
  { href: '/procure-guard/analytics', label: 'Analytics', icon: 'chart', access: ['analyst', 'reviewer', 'admin'] },
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
  const visibleNav = NAV.filter(item => item.access.includes(accessView));

  return (
    <>
      <button
        type="button"
        aria-label="Close ProcureGuard menu"
        className={`fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-gray-100 bg-gray-50 shadow-2xl transition-transform duration-200 ease-in-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-5">
          <ProcureGuardLogo size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight tracking-tight text-gray-900">ProcureGuard</p>
            <p className="text-[11px] text-gray-500">Payment request control</p>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
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
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all ${
                    active ? 'bg-[#307c4c]/10 text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {active && <div className="absolute bottom-1 left-0 top-1 w-1 rounded-r-md bg-[#307c4c]" />}
                  <Icon name={item.icon} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-gray-100 p-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Review Queue</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{pendingCount ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">active approval items</p>
          </div>
        </div>
      </aside>
    </>
  );
}

