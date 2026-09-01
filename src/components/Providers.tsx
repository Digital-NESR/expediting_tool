'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';

/**
 * When a page is restored from the browser's back/forward cache (e.g. hitting
 * the native Back button after a hard navigation to a page like /help/*),
 * the whole document — including Next.js's client router state — is a frozen
 * snapshot from before you navigated away. Next's router doesn't resync itself
 * on this restore, so router.push()/Link clicks can silently no-op afterwards.
 * Forcing a reload on a persisted pageshow guarantees the app re-initializes
 * cleanly instead of staying stuck in that stale state.
 */
function BfcacheReload() {
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BfcacheReload />
      {children}
    </SessionProvider>
  );
}
