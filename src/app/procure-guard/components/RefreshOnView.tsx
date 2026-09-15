'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps ProcureGuard list/dashboard views in sync with the database.
 *
 * The list data is read UNCACHED from the DB, but Next's client Router Cache (and link
 * prefetching) can hand a viewer a stale RSC — so a request that another user has already
 * approved keeps showing its old status ("pending with SCM") until that viewer's cache
 * expires or they hard-refresh.
 *
 * This used to call router.refresh() unconditionally on mount, which made EVERY arrival render
 * the server component twice (two actor resolutions, two list queries) even when the payload had
 * just been rendered fresh. Instead the page passes a `renderId` minted on the server during that
 * render: a genuinely fresh RSC carries an id this browser tab has never seen, while a payload
 * replayed out of the Router Cache carries one we have already mounted with. Only the replay
 * refreshes, so the staleness guarantee is unchanged and the fresh path costs one render.
 *
 * A refresh is therefore triggered by exactly three things:
 *   1. mounting on a payload whose renderId was already seen in this tab (a cached/prefetched RSC),
 *   2. the tab becoming visible again after having actually been hidden,
 *   3. the window regaining focus after having lost it.
 * (2) and (3) are throttled together to one refresh per 1.5s.
 */

// Render ids already mounted in this tab. Module scope, so it survives client-side navigation
// (where the Router Cache replays) but resets on a hard reload (always a fresh server render).
const seenRenderIds = new Set<string>();

export default function RefreshOnView({ renderId }: { renderId?: string }) {
  const router = useRouter();
  const last = useRef(0);
  const mountChecked = useRef(false);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - last.current < 1500) return; // throttle bursts (focus + visibility can both fire)
      last.current = now;
      router.refresh();
    };

    if (!mountChecked.current) {
      mountChecked.current = true;
      if (!renderId) {
        // No id from the server: fall back to the old always-refresh behaviour rather than risk
        // showing a stale approval queue.
        refresh();
      } else if (seenRenderIds.has(renderId)) {
        refresh(); // this exact payload has been mounted before => it came from the Router Cache
      } else {
        if (seenRenderIds.size > 50) seenRenderIds.clear();
        seenRenderIds.add(renderId);
      }
    }

    let wasHidden = document.visibilityState === 'hidden';
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        return;
      }
      if (wasHidden) {
        wasHidden = false;
        refresh();
      }
    };
    const onBlur = () => {
      wasHidden = true;
    };
    const onFocus = () => {
      if (wasHidden) {
        wasHidden = false;
        refresh();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, renderId]);

  return null;
}
