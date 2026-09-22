'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import AppSidebar, { sidebarInitials } from '@/components/AppSidebar';
import { ROLE_SHORT } from '../lib/constants';
import { displayStatus } from '../lib/helpers';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { Screen } from '../lib/types';

/**
 * The registry's shell, on the shared AppSidebar the rest of the platform uses.
 *
 * One difference from ProcureGuard and Catalog Manager, which is why this could
 * not simply be copied: those navigate by route, so their items are <Link>s and
 * the active one is decided by `usePathname`. The registry is a single page
 * holding its screen in state — the wizard's half-filled draft would not
 * survive a navigation — so these are buttons that call `app.go`, and `active`
 * comes from `app.screen`.
 */

/** S&S rides the same green as the rest of the platform, #307c4c into #1d4f31. */
const PIN_KEY = 'sns-sidebar-pinned';

const ASIDE_CLASS =
  'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out';

const NAV: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'registry', label: 'Registry', icon: 'grid' },
  { screen: 'new', label: 'New Record', icon: 'plus' },
  { screen: 'inbox', label: 'Validation Inbox', icon: 'check' },
  { screen: 'expiry', label: 'Expiry & Review', icon: 'clock' },
  { screen: 'dash', label: 'Dashboard', icon: 'chart' },
];

export default function SnsRegistrySidebar({
  app,
  isOpen,
  onClose,
}: {
  app: RegistryApp;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const { viewer } = app;

  const rawName = viewer.name || session?.user?.name || viewer.email;
  const initials = sidebarInitials(rawName);
  const roleLabel = viewer.isAdmin
    ? 'Admin — full access'
    : (ROLE_SHORT[viewer.role ?? ''] ?? viewer.role ?? 'S&S Registry');

  /* Badge counts reflect what this viewer can act on, not the whole registry —
     a Level 1 validator approved for Kuwait should not see Oman's queue. */
  const actionable = app.records.filter((r) => app.canActOn(r.countryCode));
  const pendingCount = actionable.filter((r) => {
    const s = displayStatus(r);
    return s === 'Pending Level 1' || s === 'Pending Level 2';
  }).length;
  const expiryCount = actionable.filter((r) => {
    const s = displayStatus(r);
    return s === 'Expiring soon' || s === 'Expired';
  }).length;
  const badges: Partial<Record<Screen, number>> = { inbox: pendingCount, expiry: expiryCount };

  // Absent rather than present-and-rejected. `app.can` is the single source
  // for this — see useRegistryApp.
  const nav = NAV.filter((n) => {
    if (n.screen === 'new') return app.can.create;
    if (n.screen === 'inbox') return app.can.inbox;
    if (n.screen === 'dash') return app.can.dashboard;
    return true;
  });

  const goTo = (screen: Screen) => {
    if (screen === 'new') app.newDraft();
    else app.go(screen);
    onClose();
  };

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      storageKey={PIN_KEY}
      bodyClass={PIN_KEY}
      defaultPinned
      closeOnEscape={false}
      lockScroll={false}
      backdrop={({ isOpen: open, pinned, onClose: close }) => (
        <button
          type="button"
          aria-label="Close S&S Registry menu"
          className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'} ${pinned ? 'lg:hidden' : ''}`}
          onClick={close}
        />
      )}
      asideClassName={({ isOpen: open, pinned }) =>
        `${ASIDE_CLASS} ${open ? 'translate-x-0' : '-translate-x-full'} ${pinned ? 'lg:translate-x-0 lg:shadow-none' : ''}`
      }
    >
      {({ pinned, togglePin }) => (
        <>
          <div className="flex h-16 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
                brand asset; next/image would want its intrinsic size declared
                for no benefit at this size. */}
            <img
              src="/nesr_logo_white.png"
              alt=""
              className="h-7 w-auto shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight tracking-tight">
                S&amp;S Registry
              </p>
              <p className="text-[0.6875rem] text-white/70">Single &amp; sole source</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                onClick={togglePin}
                className="hidden rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white lg:inline-flex"
              >
                {pinned ? (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 3l5 5-1.5 1.5-1-1-3.5 3.5.5 4.5L14 19l-3.5-3.5L5 21l-1-1 5.5-5.5L6 11l2-1 4.5.5L16 7l-1-1L16.5 4.5 16 3z" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 opacity-70"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className={`rounded-lg p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white ${pinned ? 'lg:hidden' : ''}`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
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
              {nav.map((item) => {
                // The detail screen is reached from the registry, so it keeps
                // Registry lit rather than lighting nothing.
                const active =
                  app.screen === item.screen ||
                  (app.screen === 'detail' && item.screen === 'registry');
                const badge = badges[item.screen] ?? 0;
                return (
                  <button
                    key={item.screen}
                    type="button"
                    onClick={() => goTo(item.screen)}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-[#307c4c] to-[#2b6f44] text-white shadow-sm shadow-[#307c4c]/30'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {viewer.isAdmin && (
              <Link
                href="/admin/sns?section=access"
                onClick={onClose}
                className="mt-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-500 transition-all hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
              >
                <Icon name="cog" />
                <span className="truncate">Admin console</span>
              </Link>
            )}
          </nav>

          <div className="border-t border-slate-100 px-3 pb-2 pt-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-4 py-2.5 text-white shadow-sm shadow-[#307c4c]/20">
              <div className="min-w-0">
                <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-white/70">
                  Awaiting validation
                </p>
                <p className="text-[0.6875rem] text-white/70">in your countries</p>
              </div>
              <p className="text-2xl font-bold leading-none">{pendingCount}</p>
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
                <p className="truncate text-xs text-slate-400">{roleLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign out
            </button>
          </div>
        </>
      )}
    </AppSidebar>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
    plus: 'M12 4v16m8-8H4',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    chart: 'M9 19v-6m4 6V5m4 14v-9M4 20h16',
    home: 'M3 12l9-9 9 9M5 10v10h14V10',
    cog: 'M10.3 4.3a1 1 0 011.4 0l.9.9a7.6 7.6 0 012 0l.9-.9a1 1 0 011.4 0l1.8 1.8a1 1 0 010 1.4l-.9.9a7.6 7.6 0 010 2l.9.9a1 1 0 010 1.4l-1.8 1.8a1 1 0 01-1.4 0l-.9-.9a7.6 7.6 0 01-2 0l-.9.9a1 1 0 01-1.4 0L8.5 14.7a1 1 0 010-1.4l.9-.9a7.6 7.6 0 010-2l-.9-.9a1 1 0 010-1.4l1.8-1.8zM12 14a2 2 0 100-4 2 2 0 000 4z',
  };
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name] ?? paths.grid} />
    </svg>
  );
}
