'use client';

/*
 * RRSM's sidebar.
 *
 * ProcureGuard's, deliberately: same width, same pin, same brand gradient header, same "Back to
 * NESR Home" row and the same profile footer, so somebody moving between the two tools does not
 * have to relearn where anything is. What is RRSM's own is the nav list, which comes from
 * `lib/rrsm/nav.ts`, and the country block under the header.
 *
 * The country block is where the picker lives now. It was at the top right of the board; it
 * moved here because it applies to every page, and a control that applies to every page belongs
 * in the frame that is on every page.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  CalendarClock,
  ChevronDown,
  CircleQuestionMark,
  ClipboardCheck,
  Forklift,
  History,
  Home,
  LayoutDashboard,
  Library,
  Lock,
  LogOut,
  Receipt,
  Send,
  X,
} from 'lucide-react';
import AppSidebar, { sidebarInitials } from '@/components/AppSidebar';
import {
  RRSM_NAV_GROUP_LABEL,
  activeNavId,
  rrsmHref,
  visibleNav,
  type RrsmNavId,
  type RrsmNavItem,
} from '@/lib/rrsm/nav';
import type { RrsmScope } from '@/app/actions/rrsm/overview';

const PIN_KEY = 'rrsm-sidebar-pinned';

const ASIDE_CLASS =
  'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out';

const ICONS: Record<RrsmNavId, typeof Home> = {
  dashboard: LayoutDashboard,
  suppliers: Send,
  validation: ClipboardCheck,
  purchasing: Receipt,
  renewals: CalendarClock,
  register: Library,
  history: History,
  help: CircleQuestionMark,
};

export function RrsmMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
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
      <Forklift className={icon} />
    </span>
  );
}

function roleLabel(scope: RrsmScope): string {
  if (scope.isAdmin) return 'Administrator';
  if (scope.canBuy && scope.canValidate) return 'Buyer & Ops validator';
  if (scope.canBuy) return 'Buyer';
  if (scope.canValidate) return 'Ops validator';
  return 'Viewer';
}

export default function RrsmSidebar({
  isOpen,
  onClose,
  scope,
}: {
  isOpen: boolean;
  onClose: () => void;
  scope: RrsmScope;
}) {
  const pathname = usePathname() ?? '/rrsm';
  const router = useRouter();
  const { data: session } = useSession();

  const active = activeNavId(pathname);
  const items = visibleNav(scope);
  const country = scope.country?.code ?? null;

  const groups: { key: RrsmNavItem['group']; items: RrsmNavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.group) last.items.push(item);
    else groups.push({ key: item.group, items: [item] });
  }

  const rawName = session?.user?.name || 'Unknown User';
  const initials = sidebarInitials(rawName);
  const jobTitle = (session?.user as { jobTitle?: string } | undefined)?.jobTitle || 'User';

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
          aria-label="Close RRSM menu"
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
          {/* ── brand ─────────────────────────────────────────── */}
          <div className="flex h-16 shrink-0 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
            <RrsmMark size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight tracking-tight">RRSM</p>
              <p className="truncate text-[0.6875rem] text-white/70">Rentals &amp; services</p>
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
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── country ───────────────────────────────────────── */}
          {scope.country && (
            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">
                Country
              </p>
              {scope.available.length > 1 ? (
                <div className="relative">
                  <select
                    aria-label="Country"
                    value={scope.country.code}
                    onChange={(e) => router.push(rrsmHref(pathname, e.target.value))}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-[#307c4c]/40 focus:border-[#307c4c]"
                  >
                    {scope.available.map((c) => (
                      /* No flag emoji: Windows draws them as two letters ("KW Kuwait"). */
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              ) : (
                /* One country, nothing to choose: a label, the same rule SOA uses. */
                <div className="flex items-center gap-2 rounded-lg bg-[#307c4c]/[0.07] px-3 py-2 text-sm font-semibold text-[#1d4f31]">
                  <Lock className="h-3.5 w-3.5" />
                  <span className="truncate">{scope.country.name}</span>
                </div>
              )}
              <p className="mt-1.5 text-[0.6875rem] text-slate-500">
                {roleLabel(scope)} · {scope.country.currency}
              </p>
            </div>
          )}

          {/* ── nav ───────────────────────────────────────────── */}
          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href="/home"
              onClick={closeOnNav}
              title="NESR Home"
              aria-label="Back to NESR home"
              className="mb-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
            >
              <Home className="h-4 w-4" />
              <span className="truncate">Back to NESR Home</span>
            </Link>

            {/* No country means none of the pages has anything to show, so only Help is offered. */}
            {(scope.country ? groups : groups.filter((g) => g.key === 'support')).map((g) => (
              <div key={g.key} className="mb-3 last:mb-0">
                {RRSM_NAV_GROUP_LABEL[g.key] && (
                  <p className="mb-1 px-3 pt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">
                    {RRSM_NAV_GROUP_LABEL[g.key]}
                  </p>
                )}
                <div className="space-y-1">
                  {g.items.map((item) => {
                    const Icon = ICONS[item.id];
                    const on = active === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={rrsmHref(item.path, country)}
                        onClick={closeOnNav}
                        aria-current={on ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                          on
                            ? 'bg-gradient-to-r from-[#307c4c] to-[#2b6f44] text-white shadow-sm shadow-[#307c4c]/30'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* ── who ───────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 p-4">
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
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      )}
    </AppSidebar>
  );
}
