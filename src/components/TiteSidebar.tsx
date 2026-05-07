'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { SHIPMENTS } from '@/data/ti-te-mock-data';

interface TiteSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT = '#006B0C';

export default function TiteSidebar({ isOpen, onClose }: TiteSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

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
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle || 'User';

  const open = SHIPMENTS.filter(s => s.status !== 'Closed');
  const activeCount = open.length;
  const urgentCount = open.filter(s => ['overdue', 'urgent', 'action', 'plan'].includes(s.alert)).length;

  const NavLink = ({
    href,
    icon,
    label,
    badge,
    badgeDanger,
    exact,
  }: {
    href: string;
    icon: React.ReactNode;
    label: string;
    badge?: number;
    badgeDanger?: boolean;
    exact?: boolean;
  }) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        onClick={onClose}
        className={[
          'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group',
          isActive
            ? 'text-slate-900 shadow-sm ring-1 ring-black/5'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')}
        style={isActive ? { background: `${ACCENT}18` } : {}}
      >
        {isActive && (
          <div
            className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md"
            style={{ background: ACCENT }}
          />
        )}
        <span style={{ color: isActive ? ACCENT : undefined }} className={isActive ? '' : 'text-slate-400 group-hover:text-slate-600'}>
          {icon}
        </span>
        <span className="flex-1 text-left">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center"
            style={badgeDanger
              ? { background: '#fee2e2', color: '#b91c1c' }
              : { background: `${ACCENT}18`, color: ACCENT }}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-slate-200 flex flex-col h-full shadow-[24px_0_40px_rgba(0,0,0,0.1)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
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
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
          <NavLink
            href="/home"
            exact
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

          <NavLink
            href="/ti-te"
            exact
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

          <NavLink
            href="/ti-te/shipments"
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

          <NavLink
            href="/ti-te/alerts"
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

          <NavLink
            href="/ti-te/map"
            label="Map View"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polygon points="3 6 9 4 15 6 21 4 21 18 15 20 9 18 3 20" />
                <line x1="9" y1="4" x2="9" y2="18" />
                <line x1="15" y1="6" x2="15" y2="20" />
              </svg>
            }
          />

          <NavLink
            href="/ti-te/reports"
            label="Reports"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            }
          />

          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Workspace
          </p>

          {[
            { label: 'Documents Library', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
            { label: 'Templates', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg> },
            { label: 'Settings', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg> },
          ].map(({ label, icon }) => (
            <div
              key={label}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-slate-400 cursor-not-allowed select-none"
            >
              <span className="text-slate-300">{icon}</span>
              <span>{label}</span>
            </div>
          ))}
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
                className="h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm shrink-0"
              />
            ) : (
              <div
                className="h-10 w-10 flex items-center justify-center rounded-full font-bold text-white shadow-sm shrink-0"
                style={{ background: ACCENT }}
              >
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
