'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { HelpCircle } from 'lucide-react';
import AppSidebar, {
  PinIcon,
  SidebarCloseIcon,
  SidebarNavLink,
  SidebarProfileFooter,
  sidebarInitials,
} from './AppSidebar';

interface TiteSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeCount?: number;
  urgentCount?: number;
}

const ACCENT = '#006B0C';
const PIN_KEY = 'tite-sidebar-pinned';

export default function TiteSidebar({ isOpen, onClose, activeCount, urgentCount }: TiteSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const rawName = session?.user?.name || 'Unknown User';
  const initials = sidebarInitials(rawName);
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle || 'User';

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      storageKey={PIN_KEY}
      bodyClass={PIN_KEY}
      defaultPinned={false}
    >
      {({ pinned, togglePin, closeOnNav }) => (
        <>
          {/* Header */}
          <div
            className="h-14 md:h-16 px-5 flex items-center justify-between shrink-0"
            style={{ background: ACCENT }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <span className="text-white font-extrabold text-[11px] tracking-tight leading-none">TI·TE</span>
              </div>
              <span className="text-white font-semibold text-sm tracking-tight leading-tight">
                Temporary Import / Export
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={togglePin}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                aria-pressed={pinned}
                className={`hidden lg:inline-flex p-1.5 rounded-lg transition-colors ${pinned ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                <PinIcon filled={pinned} />
              </button>
              <button
                onClick={onClose}
                className={`p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${pinned ? 'lg:hidden' : ''}`}
              >
                <SidebarCloseIcon />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
            <SidebarNavLink
              href="/home"
              accent={ACCENT}
              active={isActive('/home', true)}
              onNavigate={closeOnNav}
              label="All Tools"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              }
            />

            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Navigate
            </p>

            <SidebarNavLink
              href="/ti-te"
              accent={ACCENT}
              active={isActive('/ti-te', true)}
              onNavigate={closeOnNav}
              label="Dashboard"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="9" rx="1.5" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" />
                  <rect x="14" y="12" width="7" height="9" rx="1.5" />
                  <rect x="3" y="16" width="7" height="5" rx="1.5" />
                </svg>
              }
            />

            <SidebarNavLink
              href="/ti-te/shipments"
              accent={ACCENT}
              active={isActive('/ti-te/shipments')}
              onNavigate={closeOnNav}
              label="Shipments"
              badge={activeCount}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="4" cy="6" r="1" />
                  <circle cx="4" cy="12" r="1" />
                  <circle cx="4" cy="18" r="1" />
                </svg>
              }
            />

            <SidebarNavLink
              href="/ti-te/alerts"
              accent={ACCENT}
              active={isActive('/ti-te/alerts')}
              onNavigate={closeOnNav}
              label="Alerts"
              badge={urgentCount}
              badgeDanger
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              }
            />

            <SidebarNavLink
              href="/ti-te/map"
              accent={ACCENT}
              active={isActive('/ti-te/map')}
              onNavigate={closeOnNav}
              label="Map View"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <polygon points="3 6 9 4 15 6 21 4 21 18 15 20 9 18 3 20" />
                  <line x1="9" y1="4" x2="9" y2="18" />
                  <line x1="15" y1="6" x2="15" y2="20" />
                </svg>
              }
            />

            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Support
            </p>

            <SidebarNavLink
              href="/ti-te/help"
              accent={ACCENT}
              active={isActive('/ti-te/help')}
              onNavigate={closeOnNav}
              label="Help"
              icon={<HelpCircle className="w-5 h-5" />}
            />

          </nav>

          {/* Profile Block */}
          <SidebarProfileFooter
            name={rawName}
            jobTitle={jobTitle}
            image={session?.user?.image}
            initials={initials}
            avatar={{
              imageClassName: 'h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0',
              fallbackClassName: 'h-10 w-10 flex items-center justify-center rounded-full font-bold text-white shadow-sm shrink-0',
              fallbackStyle: { background: ACCENT },
            }}
          />
        </>
      )}
    </AppSidebar>
  );
}
