'use client';

/*
 * The frame every RRSM staff page sits in: sidebar, sticky top bar, and the gradient banner.
 *
 * The sidebar and top bar are SourceGuide's (see SourceGuideShell): the shell owns the pin flag,
 * shifts its own content while pinned, and the slim top bar carries the tool mark, the country
 * picker and who is signed in. Each page passes its own title, subtitle and actions for the
 * banner; nothing here knows which page it is framing beyond the sidebar's active item, which it
 * reads from the URL.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Check, ChevronDown, Forklift, MapPin, Menu } from 'lucide-react';
import RrsmSidebar, {
  RRSM_BRAND,
  RRSM_FULL_NAME,
  RRSM_PIN_KEY,
  RrsmMark,
  rrsmRoleLabel,
} from './RrsmSidebar';
import { sidebarInitials } from '@/components/AppSidebar';
import { usePinnedSidebar } from '@/components/usePinnedSidebar';
import { rrsmHref } from '@/lib/rrsm/nav';
import type { RrsmScope } from '@/app/actions/rrsm/overview';

/** SourceGuide's country pill. One country is a label; more open a list. */
function CountryPicker({ scope }: { scope: RrsmScope }) {
  const pathname = usePathname() ?? '/rrsm';
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  if (!scope.country) return null;
  const many = scope.available.length > 1;
  const pill =
    'flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700';

  if (!many)
    return (
      <span className={pill} title="The country you work in">
        <MapPin className="h-4 w-4" style={{ color: RRSM_BRAND }} />
        <span className="hidden sm:inline">{scope.country.name}</span>
      </span>
    );

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="The country these pages show"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${pill} transition-colors hover:border-[#307c4c]/50`}
      >
        <MapPin className="h-4 w-4" style={{ color: RRSM_BRAND }} />
        <span className="hidden sm:inline">{scope.country.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1.5 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
        >
          {scope.available.map((c) => {
            const on = c.code === scope.country?.code;
            return (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setOpen(false);
                  if (!on) router.push(rrsmHref(pathname, c.code));
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-slate-50"
                style={on ? { background: `${RRSM_BRAND}12` } : undefined}
              >
                <span className="flex-1 truncate">{c.name}</span>
                {on && <Check className="h-4 w-4" style={{ color: RRSM_BRAND }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const { data: session } = useSession();
  const userName = session?.user?.name || '';

  // The shell owns the pin flag because the top bar reacts to it too, and shifts its own content
  // (the wrapper below) rather than using the shared body-padding rule. Same as SourceGuide.
  const { pinned, togglePin: togglePinned } = usePinnedSidebar(RRSM_PIN_KEY, null, {
    defaultPinned: false,
  });
  function togglePin() {
    togglePinned();
    setOpen(false);
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f6f5] font-sans text-slate-900">
      <RrsmSidebar
        isOpen={open}
        onClose={() => setOpen(false)}
        pinned={pinned}
        onTogglePin={togglePin}
        scope={scope}
      />

      {/* Content shifts right when the sidebar is pinned (lg+) */}
      <div
        className={`flex min-h-[100dvh] flex-col transition-[padding] duration-300 ${pinned ? 'lg:pl-[280px]' : ''}`}
      >
        {/* Slim top bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className={`grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 ${pinned ? 'lg:hidden' : ''}`}
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              href={rrsmHref('/rrsm', scope.country?.code ?? null)}
              className="flex min-w-0 items-center gap-2.5"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                style={{ background: `${RRSM_BRAND}1a` }}
              >
                <Forklift className="h-[18px] w-[18px]" style={{ color: RRSM_BRAND }} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight text-slate-900">
                  RRSM
                </span>
                <span className="hidden truncate text-[11.5px] text-slate-500 sm:block">
                  {RRSM_FULL_NAME}
                </span>
              </span>
            </Link>

            <div className="flex-1" />

            <CountryPicker scope={scope} />

            <div className="flex items-center gap-2.5">
              {userName && (
                <div className="hidden text-right leading-tight sm:block">
                  <div className="text-[12.5px] font-semibold">{userName}</div>
                  <div className="text-[11px] text-slate-500">{rrsmRoleLabel(scope)}</div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                title="Menu"
                className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white"
                style={{ background: RRSM_BRAND }}
              >
                {sidebarInitials(userName || '?')}
              </button>
            </div>
          </div>
        </header>

        <main
          className={`mx-auto w-full flex-1 space-y-4 px-4 py-4 sm:px-6 ${width === 'wide' ? 'max-w-[1400px]' : 'max-w-[900px]'}`}
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
                      <p className="mt-0.5 max-w-2xl text-xs text-white/80 sm:text-sm">
                        {subtitle}
                      </p>
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
