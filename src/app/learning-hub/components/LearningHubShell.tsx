'use client';

import { useState } from 'react';
import LearningHubBackButton from './LearningHubBackButton';
import LearningHubHomeButton from './LearningHubHomeButton';
import LearningHubLogo from './LearningHubLogo';
import LearningHubSidebar from './LearningHubSidebar';

/**
 * The frame every Learning Hub screen wears: the slide-out sidebar, the sticky header and the
 * centred main column. Opening the sidebar is the only interactive thing the frame does, so it
 * is the only part that needs to ship to the browser. `title` and `children` arrive as slots
 * that React renders on the server, which is what lets the pages inside stay server components.
 */
export default function LearningHubShell({
  backHref,
  title,
  mainClassName,
  children,
}: {
  /** Parent page for the back button. The dashboard sits at the top of the hub and passes none. */
  backHref?: string;
  /** Whatever follows the logo in the header: a plain label on most pages, a trail on others. */
  title: React.ReactNode;
  /** The page's own width and vertical rhythm, added to the shared main-column classes. */
  mainClassName: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <LearningHubSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {backHref && <LearningHubBackButton href={backHref} />}
        <LearningHubHomeButton />
        <LearningHubLogo size="sm" />
        {title}
      </header>
      <main className={`mx-auto space-y-6 px-4 sm:px-6 ${mainClassName}`}>{children}</main>
    </div>
  );
}
