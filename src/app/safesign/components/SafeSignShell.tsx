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
  Globe,
  Home,
  LayoutDashboard,
  Menu,
  Send,
  Shield,
  Users,
  X,
  CircleQuestionMark,
} from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { setSafeSignCountry } from '@/app/actions/safesign/country';

const PIN_KEY = 'safesign-sidebar-pinned';

const ASIDE_CLASS =
  'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out';

export interface ShellUser {
  name: string;
  email: string;
  role: 'admin' | 'sender';
  /** Countries this person may work in, and the one being shown. */
  countries: { id: string; name: string }[];
  country: { id: string; name: string };
  /** May open /admin (country team and topics). */
  platformAdmin?: boolean;
}

const NAV = [
  { href: '/safesign', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/safesign/communications', label: 'Communications', icon: Send },
  { href: '/safesign/suppliers', label: 'Supplier library', icon: Users },
  { href: '/help/safesign', label: 'Help', icon: CircleQuestionMark },
];

/**
 * The country being worked on. A dropdown when there is more than one to choose from (admins,
 * and senders in several countries); otherwise just the name. Switching re-renders every page for
 * the new country on the server.
 */
export function CountrySwitch({ user, tone = 'light' }: { user: ShellUser; tone?: 'light' | 'plain' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const box =
    tone === 'light'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-[#307c4c]/25 bg-[#307c4c]/5 px-2.5 py-1.5 text-xs font-semibold text-[#1d4f31]'
      : 'flex items-center gap-1.5 text-sm font-semibold text-slate-800';
  if (user.countries.length <= 1) {
    return (
      <span className={box} title="Country">
        <Globe className="h-3.5 w-3.5" />
        {user.country.name}
      </span>
    );
  }
  return (
    <label className={box}>
      <Globe className="h-3.5 w-3.5" />
      <span className="sr-only">Country</span>
      <select
        value={user.country.id}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const r = await setSafeSignCountry(id);
            if (r.success) router.refresh();
          });
        }}
        className="cursor-pointer bg-transparent pr-1 font-semibold outline-none disabled:opacity-50"
      >
        {user.countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const ROLE_LABEL: Record<ShellUser['role'], string> = {
  admin: 'Administrator',
  sender: 'Sender',
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
            <div className="mb-3 rounded-lg border border-[#307c4c]/20 bg-[#307c4c]/5 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Country</p>
              <div className="mt-1">
                <CountrySwitch user={user} tone="plain" />
              </div>
              {user.role === 'sender' && user.countries.length === 1 && (
                <p className="mt-0.5 text-[11px] text-slate-500">You send for this country only.</p>
              )}
            </div>
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
              {user.platformAdmin && (
                <Link
                  href="/admin/safesign"
                  onClick={closeOnNav}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Shield className="h-4 w-4 text-slate-400" />
                  Admin panel
                </Link>
              )}
            </div>
          </nav>

          <div className="shrink-0 border-t border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-500">
              {ROLE_LABEL[user.role]} · {user.email}
            </p>
          </div>
        </>
      )}
    </AppSidebar>
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
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{title}</span>
        <CountrySwitch user={user} />
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

/* Style constants and Empty live in ./ui, a plain module, so server pages can import them:
   a constant exported from this 'use client' file reaches a server component as a client
   reference, not a string, and the classes silently disappear. */
export { BANNER_BUTTON, BANNER_BUTTON_GHOST, BUTTON, BUTTON_SECONDARY, CARD, Empty, INPUT, LABEL } from './ui';
