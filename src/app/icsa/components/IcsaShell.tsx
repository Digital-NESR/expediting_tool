'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import DemoSwitcher, { type DemoSwitcherProps } from './DemoSwitcher';
import {
  ClipboardCheck,
  Home,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings,
  CalendarRange,
  X,
} from 'lucide-react';

export interface ShellViewer {
  name: string;
  email: string;
  isAdmin: boolean;
  championCountries: string[];
  /** Viewing ICSA as a demo person (see src/lib/icsa/demo.ts). */
  isDemo: boolean;
  /** Also signed in with SSO: false for someone who came in through the demo login only. */
  hasOwnAccount: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  show: (v: ShellViewer) => boolean;
  badge?: number;
}

function isManager(v: ShellViewer) {
  return v.isAdmin || v.championCountries.length > 0;
}

export default function IcsaShell({
  viewer,
  pendingExtensions,
  demo,
  children,
}: {
  viewer: ShellViewer;
  pendingExtensions: number;
  /** The "View as" switcher, for admins and demo people; null hides it. */
  demo: DemoSwitcherProps | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav: NavItem[] = [
    {
      href: '/icsa',
      label: 'My assessments',
      icon: <ClipboardCheck className="h-4 w-4" />,
      show: () => true,
    },
    {
      href: '/icsa/cycles',
      label: 'Cycles',
      icon: <CalendarRange className="h-4 w-4" />,
      show: isManager,
    },
    {
      href: '/icsa/dashboard',
      label: 'Review dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
      show: isManager,
    },
    {
      href: '/icsa/admin',
      label: 'Administration',
      icon: <Settings className="h-4 w-4" />,
      show: (v) => v.isAdmin,
      badge: pendingExtensions,
    },
  ];
  const active = (href: string) =>
    href === '/icsa'
      ? pathname === '/icsa' || pathname.startsWith('/icsa/assessments')
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === '/icsa/cycles' && pathname.startsWith('/icsa/enrollments'));

  const role = viewer.isAdmin
    ? 'Administrator'
    : viewer.championCountries.length
      ? `Champion · ${viewer.championCountries.join(', ')}`
      : 'Respondent';

  const sidebar = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
          <ListChecks className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">ICSA</p>
          <p className="text-[0.6875rem] text-white/70">Internal Control Self-Assessment</p>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-lg p-2 text-white/70 hover:bg-white/15 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {viewer.hasOwnAccount && !viewer.isDemo && (
          <Link
            href="/home"
            className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
          >
            <Home className="h-4 w-4" />
            Back to NESR Home
          </Link>
        )}
        <div className="space-y-1">
          {nav
            .filter((n) => n.show(viewer))
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active(n.href) ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  active(n.href)
                    ? 'bg-[#307c4c] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-[#307c4c]/5 hover:text-[#307c4c]'
                }`}
              >
                {n.icon}
                <span className="flex-1">{n.label}</span>
                {!!n.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      active(n.href) ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {n.badge}
                  </span>
                )}
              </Link>
            ))}
        </div>
      </nav>
      <div className="border-t border-slate-200 p-4">
        {viewer.isDemo && (
          <p className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-amber-800">
            Demo account
          </p>
        )}
        <p className="truncate text-sm font-semibold text-slate-800">{viewer.name}</p>
        <p className="truncate text-xs text-slate-500">{role}</p>
        {demo && <DemoSwitcher {...demo} />}
      </div>
    </>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-bold text-slate-800">ICSA</p>
        </header>
        {/* relative: screen-reader-only (absolute) elements inside the page must stay in this
            scroll area. Otherwise they stretch the window, and focusing one (a radio) scrolls the
            whole window down to blank space. */}
        <main className="relative flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
