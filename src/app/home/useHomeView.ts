'use client';

/**
 * Which of the home page's two views is showing, remembered per browser.
 *
 * localStorage rather than the `home_favourites` table beside it, and the difference is
 * deliberate. A favourite is a statement about the person: it should follow them from a laptop
 * to a workshop machine to a phone, which is exactly why that one went to Postgres. A view
 * toggle is a statement about the screen in front of them, and somebody who leaves the chain up
 * on a wide monitor does not want it waiting for them on a phone.
 *
 * Read through `useSyncExternalStore` rather than an effect that calls setState. localStorage
 * is external mutable state and this is what that hook is for: the server snapshot is 'grid',
 * so the markup React renders on the server and the markup it hydrates with agree, and the
 * stored value is picked up on the first client render instead of a frame later. It also makes
 * two tabs agree for free, through the `storage` event.
 *
 * The encoding and the try/catch follow `src/components/usePinnedSidebar.ts`: one literal under
 * one key, every access guarded, because localStorage throws rather than returning null in a
 * locked-down or private window.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type HomeView = 'grid' | 'chain';

const KEY = 'home-view';

/* Module scope, so every instance of the hook shares one subscriber list and one write path. */
let listeners: (() => void)[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange);
  /* The other tab's write arrives as a `storage` event, which fires on every window except the
     one that made the change -- hence `emit()` in `choose` as well. */
  window.addEventListener('storage', onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
    window.removeEventListener('storage', onChange);
  };
}

/* Returns a primitive, so React's referential check compares by value and this can read
   storage on every call without causing a re-render loop. */
/**
 * The grid is what you get unless you have asked for the chain.
 *
 * The chain is open to everyone -- it is not an admin experiment any more, and the toggle
 * is on every home page -- but it is not what the building lands on. The grid answers the
 * question most visits actually arrive with, which is "open the thing I use", in one
 * glance and one click. The chain answers the two it cannot: where does a tool sit in the
 * process, and what have we got. Making it the default was a bet that the second pair of
 * questions is the common one, and it is not.
 *
 * So: published for all, chosen by each. The choice is one click and it sticks per
 * browser; flipping the building back is these two literals.
 */
function getSnapshot(): HomeView {
  try {
    return window.localStorage.getItem(KEY) === 'chain' ? 'chain' : 'grid';
  } catch {
    return 'grid';
  }
}

/* The same default on the server, so the first paint reserves the layout the client is
   about to render rather than drawing one view and replacing it. */
function getServerSnapshot(): HomeView {
  return 'grid';
}

export function useHomeView(): [HomeView, (next: HomeView) => void] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = useCallback((next: HomeView) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* A browser that refuses to remember is not a reason to refuse to switch: the emit below
         still moves this tab, it just will not survive a reload. */
    }
    emit();
  }, []);

  return [stored, choose];
}
