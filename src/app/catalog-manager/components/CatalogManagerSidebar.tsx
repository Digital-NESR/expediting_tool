'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Icon } from './CatalogManagerUI';
import { CatalogLogoMark } from './CatalogManagerLogo';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  section: 'Workspace' | 'System';
  badge?: number;
  show?: boolean;
}

export default function CatalogManagerSidebar({
  isOpen,
  onClose,
  pinned = false,
  onTogglePin,
  canApprove,
  canAdmin,
  pendingCount,
  roleLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const nav: NavItem[] = ([
    { href: '/catalog-manager', label: 'Dashboard', icon: 'dashboard', section: 'Workspace' },
    { href: '/catalog-manager/catalog', label: 'Catalog', icon: 'catalog', section: 'Workspace' },
    { href: '/catalog-manager/suppliers', label: 'Suppliers', icon: 'building', section: 'Workspace' },
    { href: '/catalog-manager/approvals', label: 'Approvals', icon: 'approve', section: 'Workspace', badge: canApprove ? pendingCount : 0 },
    { href: '/catalog-manager/analytics', label: 'Analytics', icon: 'chart', section: 'Workspace' },
    { href: '/catalog-manager/admin', label: 'Administration', icon: 'admin', section: 'System', show: canAdmin },
    { href: '/catalog-manager/audit', label: 'Audit log', icon: 'audit', section: 'System' },
  ] satisfies NavItem[]).filter((n) => n.show !== false);

  const rawName = session?.user?.name || 'Catalog User';
  const nameParts = rawName.split(' ').filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const image = session?.user?.image;

  const isActive = (href: string) =>
    href === '/catalog-manager' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const sections: ('Workspace' | 'System')[] = ['Workspace', 'System'];

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity ${isOpen && !pinned ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out ${pinned ? 'shadow-none' : 'shadow-2xl'}`}
        style={{ transform: isOpen || pinned ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex h-16 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 text-[#307c4c]"><CatalogLogoMark className="h-full w-full" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">NESR Catalog Manager</p>
            <p className="truncate text-[11px] text-white/70">Supplier Catalog Management</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {onTogglePin && (
              <button
                type="button"
                aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                onClick={onTogglePin}
                className={`hidden rounded-lg p-2 md:block ${pinned ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/15 hover:text-white'}`}
              >
                <Icon name="pin" className="h-4 w-4" />
              </button>
            )}
            <button type="button" aria-label="Close menu" onClick={onClose} className={`rounded-lg p-2 text-white/70 hover:bg-white/15 hover:text-white ${pinned ? 'md:hidden' : ''}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <Link href="/home" onClick={onClose} className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]">
            <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
            Back to NESR Home
          </Link>

          {sections.map((section) => {
            const items = nav.filter((n) => n.section === section);
            if (!items.length) return null;
            return (
              <div key={section} className="mt-2">
                <div className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section}</div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                          active ? 'bg-gradient-to-r from-[#307c4c] to-[#2b6f44] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon name={item.icon} className="h-[18px] w-[18px]" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge ? (
                          <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white text-[#1d4f31]' : 'bg-[#307c4c] text-white'}`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={rawName} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#307c4c] to-[#2b6f44] text-xs font-semibold text-white">{initials}</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{rawName}</p>
              <p className="truncate text-xs text-slate-400">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Icon name="external" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
