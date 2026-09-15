'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { usePinnedSidebar } from './usePinnedSidebar';

/**
 * The slide-over drawer every NESR tool's sidebar is built from.
 *
 * It owns only what all five tools genuinely share — the backdrop, the fixed
 * <aside>, the pin mechanism (via `usePinnedSidebar`), escape-to-close and the
 * scroll lock. Everything visible inside the drawer (brand block, header
 * buttons, navigation, footer) comes from the caller through the `children`
 * render prop, so each tool keeps its own markup and accent colour rather than
 * this component branching on which tool it is rendering for.
 */

export const SIDEBAR_BACKDROP_CLASS =
  'fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300';

export const SIDEBAR_ASIDE_CLASS =
  'fixed inset-y-0 left-0 z-50 w-[280px] bg-white border-r border-slate-200 flex flex-col h-full shadow-[24px_0_40px_rgba(0,0,0,0.1)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

export interface SidebarChromeContext {
  isOpen: boolean;
  pinned: boolean;
  onClose: () => void;
}

export interface SidebarRenderContext extends SidebarChromeContext {
  togglePin: () => void;
  /** Close the drawer on navigation — a no-op while pinned. */
  closeOnNav: () => void;
}

export interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * localStorage key holding the pin preference, encoded '1' / '0'.
   * Omit it when `pinned` is controlled — the owning shell persists it instead.
   */
  storageKey?: string;
  /**
   * Class toggled on <body>, paired with an injected
   * `@media (min-width:…){body.<class>{padding-left:280px}}` rule so page
   * content shifts right while pinned. Pass `null` when the tool's own shell
   * already shifts its content (SourceGuide and Catalog Manager do).
   */
  bodyClass?: string | null;
  defaultPinned?: boolean;
  /** Viewport floor for the injected padding rule. */
  minWidth?: number;
  /** Controlled pin flag — supply with `onTogglePin` when a shell owns the state. */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Close the unpinned drawer on Escape. Default true. */
  closeOnEscape?: boolean;
  /** Lock page scroll while the unpinned drawer is open. Default true. */
  lockScroll?: boolean;
  /** Replace the default dimmed backdrop. */
  backdrop?: (ctx: SidebarChromeContext) => ReactNode;
  asideClassName?: string | ((ctx: { isOpen: boolean; pinned: boolean }) => string);
  asideStyle?: CSSProperties | ((ctx: { isOpen: boolean; pinned: boolean }) => CSSProperties);
  children: (ctx: SidebarRenderContext) => ReactNode;
}

function defaultAsideClassName({ isOpen, pinned }: { isOpen: boolean; pinned: boolean }) {
  return `${SIDEBAR_ASIDE_CLASS} ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${pinned ? 'lg:translate-x-0 lg:shadow-none' : ''}`;
}

function defaultBackdrop({ isOpen, pinned, onClose }: SidebarChromeContext) {
  if (!isOpen) return null;
  return (
    <div className={`${SIDEBAR_BACKDROP_CLASS} ${pinned ? 'lg:hidden' : ''}`} onClick={onClose} />
  );
}

export default function AppSidebar({
  isOpen,
  onClose,
  storageKey = '',
  bodyClass = null,
  defaultPinned = true,
  minWidth,
  pinned: pinnedProp,
  onTogglePin,
  closeOnEscape = true,
  lockScroll = true,
  backdrop = defaultBackdrop,
  asideClassName = defaultAsideClassName,
  asideStyle,
  children,
}: AppSidebarProps) {
  const managed = usePinnedSidebar(storageKey, bodyClass, {
    defaultPinned,
    minWidth,
    value: pinnedProp,
    isOpen,
    lockScroll,
  });

  const pinned = managed.pinned;
  const togglePin = onTogglePin ?? managed.togglePin;
  const closeOnNav = () => {
    if (!pinned) onClose();
  };

  useEffect(() => {
    if (!closeOnEscape) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pinned) onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeOnEscape, isOpen, onClose, pinned]);

  const chrome: SidebarChromeContext = { isOpen, pinned, onClose };

  return (
    <>
      {backdrop(chrome)}
      <aside
        className={
          typeof asideClassName === 'function' ? asideClassName({ isOpen, pinned }) : asideClassName
        }
        style={typeof asideStyle === 'function' ? asideStyle({ isOpen, pinned }) : asideStyle}
      >
        {children({ ...chrome, togglePin, closeOnNav })}
      </aside>
    </>
  );
}

/** The pin glyph shared by PO Expediting, TI-TE and SourceGuide. */
export function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a2 2 0 0 0 .59 1.41l1 1A2 2 0 0 1 17 14.59V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1.41a2 2 0 0 1 .41-1.42l1-1A2 2 0 0 0 9 10.76z" />
    </svg>
  );
}

/** The close (×) glyph shared by PO Expediting, TI-TE and SourceGuide. */
export function SidebarCloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** The sign-out glyph shared by all five sidebars' footers. */
export function SidebarSignOutIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

/**
 * Accent-driven nav row: a left rail, a tinted background and a tinted icon
 * when active. Shared by TI-TE and SourceGuide, which render it identically.
 */
export function SidebarNavLink({
  href,
  icon,
  label,
  accent,
  active,
  onNavigate,
  badge,
  badgeDanger,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  accent: string;
  active: boolean;
  onNavigate?: () => void;
  badge?: number;
  badgeDanger?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        'w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group',
        active
          ? 'text-slate-900 shadow-sm ring-1 ring-black/5'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
      ].join(' ')}
      style={active ? { background: `${accent}18` } : {}}
    >
      {active && (
        <div
          className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md"
          style={{ background: accent }}
        />
      )}
      <span
        style={{ color: active ? accent : undefined }}
        className={active ? '' : 'text-slate-400 group-hover:text-slate-600'}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center"
          style={
            badgeDanger
              ? { background: '#fee2e2', color: '#b91c1c' }
              : { background: `${accent}18`, color: accent }
          }
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

/** The shared profile + sign-out footer used by PO Expediting, TI-TE and SourceGuide. */
export function SidebarProfileFooter({
  name,
  jobTitle,
  image,
  initials,
  avatar,
}: {
  name: string;
  jobTitle: string;
  image?: string | null;
  initials: string;
  /** Class/styling for the fallback initials avatar and the photo's border. */
  avatar: { imageClassName: string; fallbackClassName: string; fallbackStyle?: CSSProperties };
}) {
  return (
    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-3 mb-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} width={40} height={40} className={avatar.imageClassName} />
        ) : (
          <div className={avatar.fallbackClassName} style={avatar.fallbackStyle}>
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-gray-400 truncate">{jobTitle}</p>
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="w-full py-2.5 px-3 bg-white border border-slate-200 text-slate-600 font-medium text-sm rounded-lg shadow-sm hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        <SidebarSignOutIcon />
        Sign Out
      </button>
    </div>
  );
}

/** "Mohammed Farhan" → "MF". Shared by every sidebar's avatar fallback. */
export function sidebarInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.substring(0, 2).toUpperCase();
}
