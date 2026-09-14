'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Shared "pin the sidebar open" mechanism.
 *
 * Every NESR tool ships the same slide-over sidebar that can be *pinned* so it
 * docks open on wide screens and pushes page content to the right. This hook
 * owns that mechanism end to end:
 *
 *   - the pinned flag (persisted per browser under `storageKey` as '1' / '0'),
 *   - an injected <style> tag with the `padding-left` rule (once per bodyClass),
 *   - the matching class on <body>, removed again on unmount,
 *   - the scroll lock that stops the page scrolling behind the overlay drawer.
 *
 * The `'1'` / `'0'` encoding is deliberate and must not change: existing users
 * already have preferences stored under `po-sidebar-pinned`, `tite-sidebar-pinned`,
 * `pg-sidebar-pinned`, `sg-sidebar-pinned` and `cm_sidebar_pinned`.
 *
 * Two modes:
 *   - *uncontrolled* (default) — the hook owns the state and persists it.
 *   - *controlled* — pass `options.value` when a parent shell already owns the
 *     flag (its own header chrome needs to react to it). The hook then skips
 *     storage and the body class entirely and only applies the scroll lock,
 *     so there is never more than one writer per storage key.
 */
export interface UsePinnedSidebarOptions {
  /** Value used until the stored preference is read. ProcureGuard pins by default. */
  defaultPinned?: boolean;
  /** Viewport floor (px) for the injected body-padding rule. */
  minWidth?: number;
  /** How far the body is padded when pinned (px) — the sidebar's own width. */
  width?: number;
  /** Controlled pin flag. When supplied, the caller owns state and persistence. */
  value?: boolean;
  /** Whether the drawer is currently open — only used for the scroll lock. */
  isOpen?: boolean;
  /** Lock body scroll while the drawer is open *and* unpinned. */
  lockScroll?: boolean;
}

export interface PinnedSidebar {
  pinned: boolean;
  setPinned: (next: boolean | ((prev: boolean) => boolean)) => void;
  togglePin: () => void;
}

function readStoredPin(storageKey: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === null ? null : stored === '1';
  } catch {
    // Private browsing / blocked storage — fall back to the default.
    return null;
  }
}

export function usePinnedSidebar(
  storageKey: string,
  bodyClass: string | null,
  options: UsePinnedSidebarOptions = {},
): PinnedSidebar {
  const {
    defaultPinned = true,
    minWidth = 1024,
    width = 280,
    value,
    isOpen = false,
    lockScroll = false,
  } = options;

  const [ownPinned, setPinned] = useState(defaultPinned);

  // When a parent shell owns the flag we mirror it instead of holding our own.
  const controlled = value !== undefined;
  const pinned = controlled ? value : ownPinned;

  // Restore the stored preference and inject the content-shifting rule once.
  useEffect(() => {
    if (controlled || !storageKey) return;
    const stored = readStoredPin(storageKey);
    if (stored !== null) setPinned(stored);
    if (!bodyClass) return;
    const styleId = `${bodyClass}-style`;
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = `@media (min-width:${minWidth}px){body.${bodyClass}{padding-left:${width}px}}`;
      document.head.appendChild(el);
    }
  }, [controlled, storageKey, bodyClass, minWidth, width]);

  // Persist the choice and mirror it onto <body>; clean the class up on unmount
  // so navigating to another tool never leaves the page padded.
  useEffect(() => {
    if (controlled || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, pinned ? '1' : '0');
    } catch {
      // Storage unavailable — the sidebar still works, the choice just won't stick.
    }
    if (!bodyClass) return;
    document.body.classList.toggle(bodyClass, pinned);
    return () => {
      document.body.classList.remove(bodyClass);
    };
  }, [controlled, storageKey, bodyClass, pinned]);

  // Only lock scroll for the overlay drawer, never when docked.
  useEffect(() => {
    if (!lockScroll) return;
    if (isOpen && !pinned) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [lockScroll, isOpen, pinned]);

  const togglePin = useCallback(() => setPinned(p => !p), []);

  return { pinned, setPinned, togglePin };
}

export default usePinnedSidebar;
