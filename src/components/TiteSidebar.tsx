'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { HelpCircle } from 'lucide-react';

interface TiteSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeCount?: number;
  urgentCount?: number;
}

const ACCENT = '#006B0C';
const PIN_KEY = 'tite-sidebar-pinned';

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a2 2 0 0 0 .59 1.41l1 1A2 2 0 0 1 17 14.59V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1.41a2 2 0 0 1 .41-1.42l1-1A2 2 0 0 0 9 10.76z" />
    </svg>
  );
}

export default function TiteSidebar({ isOpen, onClose, activeCount, urgentCount }: TiteSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem(PIN_KEY);
    if (stored !== null) setPinned(stored === '1');
    if (!document.getElementById('tite-sidebar-pin-style')) {
      const el = document.createElement('style');
      el.id = 'tite-sidebar-pin-style';
      el.textContent = '@media (min-width:1024px){body.tite-sidebar-pinned{padding-left:280px}}';
      document.head.appendChild(el);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(PIN_KEY, pinned ? '1' : '0');
    document.body.classList.toggle('tite-sidebar-pinned', pinned);
    return () => { document.body.classList.remove('tite-sidebar-pinned'); };
  }, [pinned]);

  const closeOnNav = () => { if (!pinned) onClose(); };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pinned) onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, pinned]);

  useEffect(() => {
    if (isOpen && !pinned) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, pinned]);

  const rawName = session?.user?.name || 'Unknown User';
  const nameParts = rawName.split(' ');
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle || 'User';

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
        onClick={closeOnNav}
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
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${pinned ? 'lg:hidden' : ''}`}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-slate-200 flex flex-col h-full shadow-[24px_0_40px_rgba(0,0,0,0.1)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${pinned ? 'lg:translate-x-0 lg:shadow-none' : ''}`}
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPinned(p => !p)}
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
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
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

          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Support
          </p>

          <NavLink
            href="/ti-te/help"
            label="Help"
            icon={<HelpCircle className="w-5 h-5" />}
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
