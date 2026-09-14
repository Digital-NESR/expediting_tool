import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useExpediteStore } from '@/store/useExpediteStore';
import AppSidebar, {
  PinIcon,
  SidebarCloseIcon,
  SidebarProfileFooter,
  sidebarInitials,
} from './AppSidebar';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/** PO Expediting rides the main app green, #307c4c. */
const PIN_KEY = 'po-sidebar-pinned';

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { selectedItems } = useExpediteStore();

  // Profile data parsing
  const rawName = session?.user?.name || 'Unknown User';
  const initials = sidebarInitials(rawName);
  const jobTitle = session?.user?.jobTitle || 'Admin';

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      storageKey={PIN_KEY}
      bodyClass={PIN_KEY}
      defaultPinned={false}
    >
      {({ pinned, togglePin, closeOnNav }) => {
        const NavLink = ({ href, icon, label, badge }: { href: string; icon: React.ReactNode; label: string; exact?: boolean; badge?: number }) => {
          const isActive = pathname === href;
          return (
            <Link
              href={href}
              onClick={closeOnNav}
              className={[
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group',
                isActive
                  ? 'bg-[#307c4c]/10 text-slate-900 shadow-sm ring-1 ring-black/5'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              ].join(' ')}
            >
              {isActive && <div className="absolute left-0 top-1 bottom-1 w-1 bg-[#307c4c] rounded-r-md" />}
              <span className={isActive ? 'text-[#307c4c]' : 'text-slate-400 group-hover:text-slate-600'}>
                {icon}
              </span>
              <span className="flex-1 text-left">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="bg-[#307c4c]/10 text-[#307c4c] text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                  {badge}
                </span>
              )}
            </Link>
          );
        };

        return (
          <>
            {/* Header / Brand */}
            <div className="h-14 md:h-16 px-6 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c] shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                    <line x1="12" y1="3" x2="12" y2="21" />
                  </svg>
                </span>
                <span className="text-lg font-bold text-slate-900 tracking-tight">NESR</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={togglePin}
                  title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                  aria-pressed={pinned}
                  className={`hidden lg:inline-flex p-1.5 rounded-lg transition-colors ${pinned ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                >
                  <PinIcon filled={pinned} />
                </button>
                <button
                  onClick={onClose}
                  className={`p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ${pinned ? 'lg:hidden' : ''}`}
                >
                  <SidebarCloseIcon />
                </button>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              <NavLink
                href="/home"
                exact
                label="All Tools"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
              />
              <NavLink
                href="/po-expediting"
                exact
                label="Dashboard"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>}
              />
              <NavLink
                href="/po-expediting/queue"
                label="Expedite Queue"
                badge={selectedItems.length}
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>}
              />
              <NavLink
                href="/po-expediting/reconciliation"
                label="Reconciliation"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
              />
              <NavLink
                href="/po-expediting/analytics"
                label="My Analytics"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              />
              <NavLink
                href="/po-expediting/team-analytics"
                label="All Analytics"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" /></svg>}
              />
            </nav>

            {/* Profile Block */}
            <SidebarProfileFooter
              name={rawName}
              jobTitle={jobTitle}
              image={session?.user?.image}
              initials={initials}
              avatar={{
                // Literal classes — Tailwind scans source statically, so these
                // can never be built from the ACCENT constant.
                imageClassName: 'h-10 w-10 rounded-full object-cover border border-[#307c4c]/20 shadow-sm shrink-0',
                fallbackClassName: 'h-10 w-10 flex items-center justify-center rounded-full bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c] font-bold shadow-sm shrink-0',
              }}
            />
          </>
        );
      }}
    </AppSidebar>
  );
}
