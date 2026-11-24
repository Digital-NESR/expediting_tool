'use client';

/*
 * The frame every SafeSign staff page sits in: sidebar, sticky top bar and the green banner.
 * The same layout as RRSM and ProcureGuard, so the tools feel like one platform.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileSignature,
  Home,
  LayoutDashboard,
  Menu,
  Send,
  Settings,
  Users,
  X,
  CircleQuestionMark,
} from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { setSafeSignViewAs } from '@/app/actions/safesign/view-as';

const PIN_KEY = 'safesign-sidebar-pinned';

const ASIDE_CLASS =
  'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out';

export interface ShellUser {
  name: string;
  email: string;
  /** The role in effect. */
  role: 'admin' | 'manager' | 'viewer';
  /** The role really held; differs from `role` while an admin uses View as. */
  realRole: 'admin' | 'manager' | 'viewer';
}

const NAV = [
  { href: '/safesign', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/safesign/communications', label: 'Communications', icon: Send },
  { href: '/safesign/vendors', label: 'Vendor library', icon: Users },
  { href: '/safesign/settings', label: 'Topics & users', icon: Settings },
  { href: '/help/safesign', label: 'Help', icon: CircleQuestionMark },
];

const SHORT_LABEL: Record<ShellUser['role'], string> = { admin: 'Admin', manager: 'Manager', viewer: 'Viewer' };

const ROLE_LABEL: Record<ShellUser['role'], string> = {
  admin: 'Administrator',
  manager: 'Manager',
  viewer: 'Viewer',
};

export function SafeSignMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9 rounded-xl' : 'h-7 w-7 rounded-lg';
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${box} ${
        size === 'lg'
          ? 'bg-white/15 text-white ring-1 ring-white/25'
          : 'bg-gradient-to-br from-[#307c4c] to-[#1d4f31] text-white'
      }`}
    >
      <FileSignature className={icon} />
    </span>
  );
}

function SafeSignSidebar({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: ShellUser }) {
  const pathname = usePathname() ?? '';
  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      storageKey={PIN_KEY}
      bodyClass={PIN_KEY}
      defaultPinned
      backdrop={({ isOpen: open, pinned, onClose: close }) => (
        <button
          type="button"
          aria-label="Close SafeSign menu"
          className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'} ${pinned ? 'lg:hidden' : ''}`}
          onClick={close}
        />
      )}
      asideClassName={({ isOpen: open, pinned }) =>
        `${ASIDE_CLASS} ${open ? 'translate-x-0' : '-translate-x-full'} ${pinned ? 'lg:translate-x-0 lg:shadow-none' : ''}`
      }
    >
      {({ pinned, togglePin, closeOnNav }) => (
        <>
          <div className="flex h-16 shrink-0 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
            <SafeSignMark size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight tracking-tight">SafeSign</p>
              <p className="truncate text-[0.6875rem] text-white/70">Supplier QHSE acknowledgments</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                onClick={togglePin}
                className="hidden rounded-lg px-2 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white lg:inline-flex"
              >
                {pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className={`rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white ${pinned ? 'lg:hidden' : ''}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href="/home"
              onClick={closeOnNav}
              className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <Home className="h-4 w-4" />
              Back to NESR Home
            </Link>
            <div className="space-y-0.5">
              {NAV.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeOnNav}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#307c4c]/10 font-semibold text-[#1d4f31]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[#307c4c]' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 border-t border-slate-100 px-4 py-3">
            {user.realRole === 'admin' && <ViewAsSwitcher role={user.role} />}
            <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-500">
              {user.role !== user.realRole ? `${ROLE_LABEL[user.realRole]}, viewing as ${ROLE_LABEL[user.role]}` : ROLE_LABEL[user.role]} · {user.email}
            </p>
          </div>
        </>
      )}
    </AppSidebar>
  );
}

/** "View as": an admin sees the tool with a manager's or a viewer's rights, and comes back. */
function ViewAsSwitcher({ role }: { role: ShellUser['role'] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-amber-800">View as</p>
      <div className="grid grid-cols-3 gap-1">
        {(['admin', 'manager', 'viewer'] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending || r === role}
            onClick={() =>
              start(async () => {
                await setSafeSignViewAs(r === 'admin' ? null : r);
                router.refresh();
              })
            }
            className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
              r === role
                ? 'bg-[#307c4c] text-white'
                : 'border border-amber-300 bg-white text-slate-700 hover:text-[#307c4c]'
            }`}
          >
            {SHORT_LABEL[r]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-amber-800/80">
        You stay signed in as yourself; only your rights change.
      </p>
    </div>
  );
}

export default function SafeSignShell({
  user,
  title,
  subtitle,
  actions,
  width = 'wide',
  children,
}: {
  user: ShellUser;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  width?: 'wide' | 'narrow';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <SafeSignSidebar isOpen={open} onClose={() => setOpen(false)} user={user} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button
          type="button"
          aria-label="Open SafeSign menu"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/home"
          title="Back to NESR Home"
          aria-label="Back to NESR home"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </Link>
        <SafeSignMark />
        <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
        {user.role !== user.realRole && (
          <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            Viewing as {ROLE_LABEL[user.role]}
          </span>
        )}
      </header>

      <main className={`mx-auto space-y-4 px-4 py-4 sm:px-6 ${width === 'wide' ? 'max-w-[1400px]' : 'max-w-[900px]'}`}>
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] p-4 text-white shadow-lg shadow-[#307c4c]/25">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <SafeSignMark size="lg" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
                {subtitle && <p className="mt-0.5 max-w-2xl text-xs text-white/80 sm:text-sm">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center shadow-sm">
      <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export const BANNER_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1d4f31] shadow-sm transition-colors hover:bg-white/90';
export const BANNER_BUTTON_GHOST =
  'inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/20';
export const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#276640] disabled:cursor-not-allowed disabled:bg-slate-300';
export const BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/15';
export const LABEL = 'mb-1 block text-xs font-semibold text-slate-600';
export const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
