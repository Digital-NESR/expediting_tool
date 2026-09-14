'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LayoutGrid, LayoutDashboard, Layers, ListTree, Grid3x3 } from 'lucide-react';
import { SG_BRAND } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';
import AppSidebar, {
  PinIcon,
  SidebarCloseIcon,
  SidebarNavLink,
  SidebarProfileFooter,
  sidebarInitials,
} from '@/components/AppSidebar';

const ACCENT = SG_BRAND;

export default function SourceGuideSidebar({
  isOpen, onClose, pinned, onTogglePin,
}: {
  isOpen: boolean;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isAdmin, viewOnly, approvedCountries } = useSourceGuideAccess();
  const canManage = isAdmin || (!viewOnly && approvedCountries.length > 0);

  const rawName = session?.user?.name || 'Unknown User';
  const initials = sidebarInitials(rawName);
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle
    || (isAdmin ? 'Administrator' : 'User');

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <AppSidebar
      isOpen={isOpen}
      onClose={onClose}
      // The SourceGuide shell owns and persists the pin flag (its top bar reacts
      // to it too) and shifts its own content, so no storage key or body class here.
      bodyClass={null}
      pinned={pinned}
      onTogglePin={onTogglePin}
    >
      {({ closeOnNav }) => (
        <>
          {/* Header */}
          <div className="h-14 md:h-16 px-5 flex items-center justify-between shrink-0" style={{ background: ACCENT }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <span className="text-white font-extrabold text-[11px] tracking-tight leading-none">SG</span>
              </div>
              <span className="text-white font-semibold text-sm tracking-tight leading-tight">SourceGuide</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onTogglePin}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                aria-pressed={pinned}
                className={`p-1.5 rounded-lg transition-colors ${pinned ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                <PinIcon filled={pinned} />
              </button>
              <button
                onClick={onClose}
                title="Close"
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
              icon={<LayoutGrid className="w-5 h-5" />}
            />

            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Navigate</p>

            <SidebarNavLink
              href="/sourceguide"
              accent={ACCENT}
              active={isActive('/sourceguide', true)}
              onNavigate={closeOnNav}
              label="Dashboard"
              icon={<LayoutDashboard className="w-5 h-5" />}
            />
            <SidebarNavLink
              href="/sourceguide/taxonomy"
              accent={ACCENT}
              active={isActive('/sourceguide/taxonomy')}
              onNavigate={closeOnNav}
              label="Spend Taxonomy"
              icon={<Grid3x3 className="w-5 h-5" />}
            />
            <SidebarNavLink
              href="/sourceguide/browse"
              accent={ACCENT}
              active={isActive('/sourceguide/browse')}
              onNavigate={closeOnNav}
              label="Browse"
              icon={<Layers className="w-5 h-5" />}
            />
            {canManage && (
              <SidebarNavLink
                href="/sourceguide/mappings"
                accent={ACCENT}
                active={isActive('/sourceguide/mappings')}
                onNavigate={closeOnNav}
                label={isAdmin ? 'Mappings' : 'My Mappings'}
                icon={<ListTree className="w-5 h-5" />}
              />
            )}
          </nav>

          {/* Profile */}
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
