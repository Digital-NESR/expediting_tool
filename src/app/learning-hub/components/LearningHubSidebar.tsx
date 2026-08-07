'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutGrid, Boxes, Building2, ListChecks } from 'lucide-react';

const NAV = [
  { href: '/learning-hub', label: 'Dashboard', icon: LayoutGrid },
  { href: '/learning-hub/supply_chain', label: 'Supply Chain', icon: Boxes },
  { href: '/learning-hub/sap', label: 'SAP', icon: LayoutGrid },
  { href: '/learning-hub/nesr_supply_chain', label: 'NESR Supply Chain', icon: Building2 },
  { href: '/learning-hub/my-work', label: 'My Work', icon: ListChecks },
];

export default function LearningHubSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const rawName = session?.user?.name || 'Unknown User';
  const nameParts = rawName.split(' ').filter(Boolean);
  const initials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : rawName.substring(0, 2).toUpperCase();
  const jobTitle = (session?.user as { jobTitle?: string })?.jobTitle || 'User';

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[280px] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex h-16 items-center gap-3 bg-gradient-to-br from-[#307c4c] to-[#1d4f31] px-5 text-white">
          <p className="truncate text-sm font-bold tracking-tight">Learning Hub</p>
          <button type="button" aria-label="Close menu" onClick={onClose} className="ml-auto rounded-lg p-2 text-white/70 hover:bg-white/15 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <Link href="/home" onClick={onClose} className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]">
            Back to NESR Home
          </Link>
          <div className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active ? 'bg-gradient-to-r from-[#307c4c] to-[#1d4f31] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#307c4c] to-[#1d4f31] text-[11px] font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{rawName}</p>
              <p className="truncate text-[11px] text-slate-400">{jobTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
