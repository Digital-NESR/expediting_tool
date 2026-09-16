'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AppSidebar, {
  PinIcon,
  SidebarCloseIcon,
  SidebarProfileFooter,
} from '@/components/AppSidebar';
import type { ViewModel } from '../types';

/**
 * The tool's navigation, as the slide-over drawer every other NESR tool ships.
 *
 * This was a bespoke dark fixed panel — the only one of its kind in the app — so it is rebuilt on
 * `AppSidebar`, which owns the backdrop, the pin mechanism and the escape/scroll behaviour.
 * ProcureGuard's and SourceGuide's are the same component wearing their own accent; this one
 * keeps SOA's green, `sns-green`, rather than borrowing either of theirs.
 *
 * The one thing it cannot reuse is `SidebarNavLink`: this tool is a single route whose screens are
 * client state, so its nav rows are buttons, not links. They are styled to match.
 */

const PIN_KEY = 'soa-sidebar-pinned';

export default function Sidebar({
  vm,
  isOpen,
  onClose,
}: {
  vm: ViewModel;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      storageKey={PIN_KEY}
      bodyClass={PIN_KEY}
      defaultPinned
    >
      {({ pinned, togglePin, closeOnNav }) => (
        <>
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between shrink-0 bg-sns-green">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 shrink-0">
                <span className="text-white font-extrabold text-[11px] tracking-tight leading-none">
                  SOA
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-[13px] tracking-tight leading-tight truncate">
                  SOA Consolidation
                </p>
                <p className="text-white/70 text-[10px] leading-tight truncate">
                  Vendor statement reconciliation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={togglePin}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                aria-pressed={pinned}
                className={`p-1.5 rounded-lg transition-colors ${pinned ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                <PinIcon filled={pinned} />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close menu"
                className={`p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${pinned ? 'lg:hidden' : ''}`}
              >
                <SidebarCloseIcon />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
            <Link
              href="/home"
              onClick={closeOnNav}
              className="mb-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-sns-green/30 hover:bg-sns-green-wash hover:text-sns-green"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"
                />
              </svg>
              <span className="truncate">Back to NESR Home</span>
            </Link>

            <div className="mb-3 rounded-lg border border-sns-green/25 bg-sns-green-wash px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-[1px] text-sns-grey">Active scope</div>
              <div className="text-[13px] font-bold leading-[1.3] text-sns-ink">
                {vm.roleCountry}
              </div>
              <div className="text-[10px] text-sns-grey mt-px">{vm.roleLabel}</div>
            </div>

            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Navigate
            </p>

            {vm.navItems.map((nav) => (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  nav.onClick();
                  closeOnNav();
                }}
                className={`relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all ${
                  nav.isActive
                    ? 'bg-sns-green-wash text-slate-900 font-semibold shadow-sm ring-1 ring-black/5'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {nav.isActive && (
                  <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md bg-sns-green" />
                )}
                <span className="flex-1 text-left truncate">{nav.label}</span>
                {nav.hasBadge && (
                  <span className="shrink-0 rounded-full bg-[#E65100] px-2 py-0.5 text-[10px] font-bold text-white">
                    {nav.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* SOP reference */}
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="text-[9px] uppercase tracking-[1px] text-slate-400">Governed by</div>
            <div className="text-[11px] font-semibold text-slate-600 leading-[1.5]">
              NESR-SC-01-GR2PAY
            </div>
            <div className="text-[10px] text-slate-400">Rev.01 · Jul 2024</div>
          </div>

          {/* Profile */}
          <SidebarProfileFooter
            name={vm.viewerName}
            jobTitle={vm.roleLabel}
            image={session?.user?.image}
            initials={vm.viewerInitials}
            avatar={{
              imageClassName:
                'h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0',
              fallbackClassName:
                'h-10 w-10 flex items-center justify-center rounded-full bg-sns-green font-bold text-white shadow-sm shrink-0',
            }}
          />
        </>
      )}
    </AppSidebar>
  );
}
