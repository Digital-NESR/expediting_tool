'use client';

/*
 * The frame every RRSM staff page sits in: sidebar, sticky top bar, and the gradient banner.
 *
 * ProcureGuard's layout, piece for piece (see ProcureGuardDelegateClient and ProcureGuardHero),
 * so the two tools feel like one platform. Each page passes its own title, subtitle and actions;
 * nothing here knows which page it is framing beyond the sidebar's active item, which it reads
 * from the URL.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Home, Menu } from 'lucide-react';
import RrsmSidebar, { RrsmMark } from './RrsmSidebar';
import type { RrsmScope } from '@/app/actions/rrsm/overview';

export default function RrsmShell({
  scope,
  title,
  subtitle,
  actions,
  hero = true,
  width = 'wide',
  children,
}: {
  scope: RrsmScope;
  /** The page's name, in the top bar and the banner. */
  title: string;
  subtitle?: React.ReactNode;
  /** Buttons on the right of the banner. */
  actions?: React.ReactNode;
  /** Help draws its own heading, so it turns the banner off. */
  hero?: boolean;
  /** Tables want the room; reading pages do not. */
  width?: 'wide' | 'narrow';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <RrsmSidebar isOpen={open} onClose={() => setOpen(false)} scope={scope} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button
          type="button"
          aria-label="Open RRSM menu"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/home"
          title="Back to NESR Home"
          aria-label="Back to NESR home"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </Link>
        <RrsmMark />
        <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
        {scope.country && (
          <span className="ml-auto hidden shrink-0 rounded-full bg-[#307c4c]/[0.08] px-2.5 py-1 text-[11px] font-semibold text-[#1d4f31] sm:inline">
            {scope.country.name}
          </span>
        )}
      </header>

      <main
        className={`mx-auto space-y-4 px-4 py-4 sm:px-6 ${width === 'wide' ? 'max-w-[1400px]' : 'max-w-[900px]'}`}
      >
        {hero && (
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] p-4 text-white shadow-lg shadow-[#307c4c]/25">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <RrsmMark size="lg" />
                <div className="min-w-0">
                  <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
                  {subtitle && (
                    <p className="mt-0.5 max-w-2xl text-xs text-white/80 sm:text-sm">{subtitle}</p>
                  )}
                </div>
              </div>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
          </section>
        )}
        {children}
      </main>
    </div>
  );
}

/** The empty state every RRSM page uses, so "nothing here" reads the same everywhere. */
export function RrsmEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center shadow-sm">
      <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** What a page shows when the reader's role in this country does not cover it. */
export function RrsmNotYourRole({ what }: { what: string }) {
  return (
    <RrsmEmpty
      title="Not part of your role here"
      body={`${what} belongs to a role you do not hold in this country. If you should have it, ask a supply chain administrator to add it in Admin → RRSM.`}
    />
  );
}

/** No live country at all: the pages have nothing to draw. */
export function RrsmNoCountry() {
  return (
    <RrsmEmpty
      title="No country is live for you yet"
      body="RRSM is switched on country by country. You hold a grant, but the country it covers has not been switched on, so there is nothing here to work on."
    />
  );
}
