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

const navItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  textAlign: 'left',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 18,
  height: 18,
  padding: '0 5px',
  borderRadius: 9999,
  fontSize: 10,
  fontWeight: 700,
  background: '#fef3c7',
  color: '#b45309',
  border: '1px solid #fde68a',
};

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
        <aside className="shrink-0 bg-white" style={{ width: 240, borderRight: '1px solid #e5e7eb', padding: '24px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tools
          </p>

          {ADMIN_APPS.map(app => {
            const isOpen = expanded.has(app.id);
            const isActiveApp = app.id === activeAppId;
            const pendingSum = appPendingSum(app.id);
            return (
              <div key={app.id} style={{ marginBottom: 2 }}>
                {/* Group header — click to expand/collapse */}
                <button
                  onClick={() => toggle(app.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isActiveApp ? '#111827' : '#374151',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <svg
                      width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: '#9ca3af' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {app.label}
                  </span>
                  {!isOpen && pendingSum > 0 && <span style={badgeStyle}>{pendingSum}</span>}
                </button>

                {/* Sections */}
                {isOpen && app.sections.map(section => {
                  const isActive = isActiveApp && section.id === activeSection;
                  const count = section.countKey ? (counts[section.countKey] ?? 0) : 0;
                  return (
                    <Link
                      key={section.id}
                      href={`/admin/${app.id}?section=${section.id}`}
                      style={{
                        ...navItemBase,
                        paddingLeft: 24,
                        textDecoration: 'none',
                        borderLeft: isActive ? `3px solid ${app.color}` : '3px solid transparent',
                        background: isActive ? app.activeBg : 'transparent',
                        color: isActive ? app.activeColor : '#6b7280',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{section.label}</span>
                      {count > 0 && <span style={badgeStyle}>{count}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          <div style={{ margin: '8px 0' }} />

          {/* Coming-soon tools */}
          {COMING_SOON.map(label => (
            <div
              key={label}
              style={{ ...navItemBase, borderLeft: '3px solid transparent', color: '#d1d5db', cursor: 'not-allowed' }}
            >
              <span>{label}</span>
              <span style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: 10, padding: '2px 6px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                Soon
              </span>
            </div>
          ))}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto" style={{ padding: 32 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
