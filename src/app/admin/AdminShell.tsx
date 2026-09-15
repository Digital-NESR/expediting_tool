'use client';

/* ─────────────────────────────────────────────────────────────
   Persistent admin shell: header + collapsible app-group sidebar.
   Lives in the layout, so it stays mounted while the [app] route
   underneath it swaps. Each app is its own route; clicking a
   section navigates there and only that app's data loads.
   ───────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ADMIN_APPS, COMING_SOON, DEFAULT_APP, findAdminApp, resolveSection, type AdminCounts } from './adminNav';

/* Tailwind equivalents of the two shared style objects this shell used to carry.
   The per-app accent (colour, active background, active border) is data on the
   ADMIN_APPS entries, so those few declarations stay inline — a class name
   cannot be produced from a runtime value without a safelist. */
const NAV_ITEM_BASE =
  'flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm font-medium text-left';

const BADGE =
  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full ' +
  'text-[10px] font-bold bg-[#fef3c7] text-[#b45309] border border-[#fde68a]';

interface AdminShellProps {
  userEmail: string;
  userName: string;
  counts: AdminCounts;
  children: React.ReactNode;
}

export default function AdminShell({ userEmail, userName, counts, children }: AdminShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // /admin/<app> → <app>
  const segments = pathname.split('/').filter(Boolean); // ['admin', '<app>']
  const activeAppId = segments[1] && findAdminApp(segments[1]) ? segments[1] : DEFAULT_APP;
  const activeApp = findAdminApp(activeAppId)!;
  const activeSection = resolveSection(activeApp, searchParams.get('section') ?? undefined);

  // Only the active app is expanded by default; others start collapsed
  // so the (previously long) sidebar reads cleanly.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([activeAppId]));

  // Keep the active app expanded as the route changes.
  useEffect(() => {
    setExpanded(prev => (prev.has(activeAppId) ? prev : new Set(prev).add(activeAppId)));
  }, [activeAppId]);

  // Per-tab document title.
  useEffect(() => {
    const sec = activeApp.sections.find(s => s.id === activeSection);
    document.title = `${sec ? sec.label + ' — ' : ''}${activeApp.label} | Admin | SC Agents`;
  }, [activeApp, activeSection]);

  function toggle(appId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function appPendingSum(appId: string): number {
    const app = findAdminApp(appId);
    if (!app) return 0;
    return app.sections.reduce((sum, s) => sum + (s.countKey ? (counts[s.countKey] ?? 0) : 0), 0);
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900 flex flex-col">

      {/* ── Slim header ── */}
      <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-10 px-6 lg:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/nesr-logo-circle.png" alt="NESR" width={28} height={28} className="rounded-full" />
          <span className="text-sm font-semibold text-slate-900 tracking-tight">NESR</span>
          <span className="text-slate-300 select-none">·</span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[220px]">
            {userName !== userEmail ? `${userName} · ` : ''}{userEmail}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + main ── */}
      <div className="flex flex-1">

        {/* ── Sidebar ── */}
        <aside className="shrink-0 bg-white w-60 border-r border-[#e5e7eb] px-4 py-6">
          <p className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.05em] uppercase mb-2">
            Tools
          </p>

          {ADMIN_APPS.map(app => {
            const isOpen = expanded.has(app.id);
            const isActiveApp = app.id === activeAppId;
            const pendingSum = appPendingSum(app.id);
            return (
              <div key={app.id} className="mb-0.5">
                {/* Group header — click to expand/collapse */}
                <button
                  onClick={() => toggle(app.id)}
                  className={`flex items-center justify-between w-full px-3 py-1.5 rounded-md text-[13px] font-semibold text-left bg-transparent cursor-pointer ${
                    isActiveApp ? 'text-[#111827]' : 'text-[#374151]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <svg
                      width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                      className={`text-[#9ca3af] transition-transform ${isOpen ? 'rotate-90' : 'rotate-0'}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {app.label}
                  </span>
                  {!isOpen && pendingSum > 0 && <span className={BADGE}>{pendingSum}</span>}
                </button>

                {/* Sections */}
                {isOpen && app.sections.map(section => {
                  const isActive = isActiveApp && section.id === activeSection;
                  const count = section.countKey ? (counts[section.countKey] ?? 0) : 0;
                  return (
                    <Link
                      key={section.id}
                      href={`/admin/${app.id}?section=${section.id}`}
                      className={`${NAV_ITEM_BASE} pl-6 no-underline cursor-pointer border-l-[3px] ${
                        isActive ? '' : 'border-l-transparent bg-transparent text-[#6b7280]'
                      }`}
                      /* Per-app accent only — everything static is a class above. */
                      style={isActive ? { borderLeftColor: app.color, background: app.activeBg, color: app.activeColor } : undefined}
                    >
                      <span>{section.label}</span>
                      {count > 0 && <span className={BADGE}>{count}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          <div className="my-2" />

          {/* Coming-soon tools */}
          {COMING_SOON.map(label => (
            <div
              key={label}
              className={`${NAV_ITEM_BASE} border-l-[3px] border-l-transparent text-[#d1d5db] cursor-not-allowed`}
            >
              <span>{label}</span>
              <span className="bg-[#f3f4f6] text-[#9ca3af] text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                Soon
              </span>
            </div>
          ))}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
