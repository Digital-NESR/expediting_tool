'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutGrid, LayoutDashboard, Layers, ListTree, BookOpen } from 'lucide-react';
import { SG_BRAND } from './constants';
import { useSourceGuideAccess } from './SourceGuideAccessContext';

const ACCENT = SG_BRAND;

export default function SourceGuideSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isAdmin, viewOnly, approvedCountries } = useSourceGuideAccess();
  const canManage = isAdmin || (!viewOnly && approvedCountries.length > 0);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const rawName = session?.user?.name || 'Unknown User';
  const nameParts = rawName.split(' ');
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle
    || (isAdmin ? 'Administrator' : 'User');

  const NavLink = ({
    href, icon, label, exact, external,
  }: {
    href: string; icon: React.ReactNode; label: string; exact?: boolean; external?: boolean;
  }) => {
    const isActive = !external && (exact ? pathname === href : pathname.startsWith(href));
    return (
      <Link
        href={href}
        onClick={onClose}
        className={[
          'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group',
          isActive ? 'text-slate-900 shadow-sm ring-1 ring-black/5'
                   : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')}
        style={isActive ? { background: `${ACCENT}18` } : {}}
      >
        {isActive && <div className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md" style={{ background: ACCENT }} />}
        <span style={{ color: isActive ? ACCENT : undefined }} className={isActive ? '' : 'text-slate-400 group-hover:text-slate-600'}>
          {icon}
        </span>
        <span className="flex-1 text-left">{label}</span>
      </Link>
    );
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-slate-200 flex flex-col h-full shadow-[24px_0_40px_rgba(0,0,0,0.1)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="h-14 md:h-16 px-5 flex items-center justify-between shrink-0" style={{ background: ACCENT }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <span className="text-white font-extrabold text-[11px] tracking-tight leading-none">SG</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-tight leading-tight">SourceGuide</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
          <NavLink href="/home" exact label="All Tools" icon={<LayoutGrid className="w-5 h-5" />} />

          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Navigate</p>

          <NavLink href="/sourceguide" exact label="Dashboard" icon={<LayoutDashboard className="w-5 h-5" />} />
          <NavLink href="/sourceguide/browse" label="Browse" icon={<Layers className="w-5 h-5" />} />
          {canManage && (
            <NavLink href="/sourceguide/mappings" label={isAdmin ? 'Mappings' : 'My Mappings'} icon={<ListTree className="w-5 h-5" />} />
          )}

          {isAdmin && (
            <>
              <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Admin</p>
              <NavLink href="/admin?tool=sourceguide-guides" external label="Source Guides" icon={<BookOpen className="w-5 h-5" />} />
            </>
          )}
        </nav>

        {/* Profile */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt={rawName} width={40} height={40} className="h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0" />
            ) : (
              <div className="h-10 w-10 flex items-center justify-center rounded-full font-bold text-white shadow-sm shrink-0" style={{ background: ACCENT }}>
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{rawName}</p>
              <p className="text-xs text-gray-400 truncate">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full py-2.5 px-3 bg-white border border-slate-200 text-slate-600 font-medium text-sm rounded-lg shadow-sm hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
