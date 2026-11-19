'use client';

/*
 * RRSM's sidebar.
 *
 * SourceGuide's, deliberately: same flat brand header with pin and close, the same "All Tools"
 * row, the same accent-rail nav links and the same profile footer, all from the shared
 * `AppSidebar` pieces. What is RRSM's own is the nav list, which comes from `lib/rrsm/nav.ts`.
 *
 * The shell owns the pin flag (its top bar reacts to it too) and shifts its own content, so this
 * is rendered controlled. The country picker lives in the top bar, as SourceGuide's does.
 */

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  CalendarClock,
  CircleQuestionMark,
  ClipboardCheck,
  Forklift,
  History,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Receipt,
  Send,
} from 'lucide-react';
import AppSidebar, {
  PinIcon,
  SidebarCloseIcon,
  SidebarNavLink,
  SidebarProfileFooter,
  sidebarInitials,
} from '@/components/AppSidebar';
import {
  RRSM_NAV_GROUP_LABEL,
  activeNavId,
  rrsmHref,
  visibleNav,
  type RrsmNavId,
  type RrsmNavItem,
} from '@/lib/rrsm/nav';
import type { RrsmScope } from '@/app/actions/rrsm/overview';

export const RRSM_BRAND = '#307c4c';
/** The tool's full name, beside "RRSM" in the sidebar and the top bar. */
export const RRSM_FULL_NAME = 'Rental & Recurrent Services Management';
export const RRSM_PIN_KEY = 'rrsm-sidebar-pinned';

const ICONS: Record<RrsmNavId, typeof LayoutGrid> = {
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

export function rrsmRoleLabel(scope: RrsmScope): string {
  if (scope.isAdmin) return 'Administrator';
  if (scope.canBuy && scope.canValidate) return 'Buyer & Ops validator';
  if (scope.canBuy) return 'Buyer';
  if (scope.canValidate) return 'Ops validator';
  return 'Viewer';
}

export default function RrsmSidebar({
  isOpen,
  onClose,
  pinned,
  onTogglePin,
  scope,
}: {
  isOpen: boolean;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  scope: RrsmScope;
}) {
  const pathname = usePathname() ?? '/rrsm';
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
  const jobTitle =
    (session?.user as { jobTitle?: string } | undefined)?.jobTitle || rrsmRoleLabel(scope);

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      bodyClass={null}
      pinned={pinned}
      onTogglePin={onTogglePin}
    >
      {({ closeOnNav }) => (
        <>
          {/* Header */}
          <div
            className="flex h-14 shrink-0 items-center justify-between px-5 md:h-16"
            style={{ background: RRSM_BRAND }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Forklift className="h-4 w-4 text-white" />
              </div>
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold tracking-tight text-white">RRSM</span>
                <span className="block text-[10.5px] leading-snug text-white/75">
                  {RRSM_FULL_NAME}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onTogglePin}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                aria-pressed={pinned}
                className={`rounded-lg p-1.5 transition-colors ${pinned ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <PinIcon filled={pinned} />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                className={`rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white ${pinned ? 'lg:hidden' : ''}`}
              >
                <SidebarCloseIcon />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 py-4">
            <SidebarNavLink
              href="/home"
              accent={RRSM_BRAND}
              active={false}
              onNavigate={closeOnNav}
              label="All Tools"
              icon={<LayoutGrid className="h-5 w-5" />}
            />

            {/* No country means none of the pages has anything to show, so only Help is offered. */}
            {(scope.country ? groups : groups.filter((g) => g.key === 'support')).map((g, i) => (
              <div key={g.key}>
                {RRSM_NAV_GROUP_LABEL[g.key] || i === 0 ? (
                  <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {RRSM_NAV_GROUP_LABEL[g.key] || 'Navigate'}
                  </p>
                ) : (
                  <div className="mx-3 my-3 border-t border-slate-100" />
                )}
                {g.items.map((item) => {
                  const Icon = ICONS[item.id];
                  return (
                    <SidebarNavLink
                      key={item.id}
                      href={rrsmHref(item.path, country)}
                      accent={RRSM_BRAND}
                      active={active === item.id}
                      onNavigate={closeOnNav}
                      label={item.label}
                      icon={<Icon className="h-5 w-5" />}
                    />
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Profile */}
          <SidebarProfileFooter
            name={rawName}
            jobTitle={jobTitle}
            image={session?.user?.image}
            initials={sidebarInitials(rawName)}
            avatar={{
              imageClassName:
                'h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0',
              fallbackClassName:
                'h-10 w-10 flex items-center justify-center rounded-full font-bold text-white shadow-sm shrink-0',
              fallbackStyle: { background: RRSM_BRAND },
            }}
          />
        </>
      )}
    </AppSidebar>
  );
}
