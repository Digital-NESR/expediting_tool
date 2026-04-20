import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useExpediteStore } from '@/store/useExpediteStore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { selectedItems } = useExpediteStore();
  
  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Profile data parsing
  const rawName = session?.user?.name || 'Unknown User';
  const nameParts = rawName.split(' ');
  const initials = nameParts.length > 1 
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const jobTitle = (session?.user as any)?.jobTitle || 'Admin';

  const NavLink = ({ href, icon, label, exact = false, badge }: { href: string; icon: React.ReactNode; label: string; exact?: boolean; badge?: number }) => {
    const isActive = pathname === href;
    return (
      <Link 
        href={href} 
        onClick={onClose}
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
      {/* ── Backdrop ── */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300" 
          onClick={onClose}
        />
      )}

      {/* ── Drawer ── */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-slate-200 flex flex-col h-full shadow-[24px_0_40px_rgba(0,0,0,0.1)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
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
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
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
            href="/"
            exact
            label="Dashboard"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>}
          />
          <NavLink
            href="/expedite"
            label="Expedite Queue"
            badge={selectedItems.length}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>}
          />
          <NavLink
            href="/expedite/reconciliation"
            label="Reconciliation"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
          />
        </nav>

        {/* Profile Block */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={rawName}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover border border-[#307c4c]/20 shadow-sm shrink-0"
              />
            ) : (
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c] font-bold shadow-sm shrink-0">
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
