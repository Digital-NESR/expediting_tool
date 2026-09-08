'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps ProcureGuard list/dashboard views in sync with the database.
 *
 * The list data is read UNCACHED from the DB, but Next's client Router Cache (and link
 * prefetching) can hand a viewer a stale RSC — so a request that another user has already
 * approved keeps showing its old status ("pending with SCM") until that viewer's cache
 * expires or they hard-refresh. Mounting this on a list/dashboard page forces a fresh
 * server fetch on arrival (even when the initial paint came from a stale cache) and again
 * whenever the tab regains focus, so approvals show up promptly without changing any workflow.
 */
export default function RefreshOnView() {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - last.current < 1500) return; // throttle bursts (focus + visibility can both fire)
      last.current = now;
      router.refresh();
    };

    refresh(); // fresh on arrival — defeats a stale prefetched/cached RSC

    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
