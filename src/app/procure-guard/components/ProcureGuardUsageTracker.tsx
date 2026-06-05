'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type PageState = {
  path: string;
  title: string;
  start: number;
  flushed: boolean;
};

type TrackingPayload = {
  event_type: 'page_view' | 'click';
  path: string;
  page_title?: string;
  target_tag?: string;
  target_text?: string;
  target_href?: string;
  target_role?: string;
  duration_ms?: number;
  occurred_at: string;
  metadata?: Record<string, unknown>;
};

const SESSION_KEY = 'procureguard_usage_session_id';

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const sessionId = makeSessionId();
  window.sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

function normaliseText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function elementLabel(element: HTMLElement): string {
  const explicit = element.getAttribute('data-track-label');
  const aria = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const text = 'innerText' in element ? element.innerText : '';
  const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.placeholder
    : '';

  return normaliseText(explicit || aria || title || text || placeholder || element.tagName.toLowerCase());
}

function sendTrackingEvent(sessionId: string, payload: TrackingPayload): void {
  const body = JSON.stringify({ session_id: sessionId, ...payload });
  const blob = new Blob([body], { type: 'application/json' });

  if (navigator.sendBeacon && navigator.sendBeacon('/api/procure-guard/tracking', blob)) {
    return;
  }

  void fetch('/api/procure-guard/tracking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export default function ProcureGuardUsageTracker() {
  const pathname = usePathname();
  const sessionIdRef = useRef<string | null>(null);
  const pageRef = useRef<PageState | null>(null);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    const sessionId = sessionIdRef.current ?? getSessionId();
    sessionIdRef.current = sessionId;
    const page: PageState = {
      path: `${pathname}${window.location.search || ''}`,
      title: document.title,
      start: performance.now(),
      flushed: false,
    };
    pageRef.current = page;

    function flushPageView() {
      if (page.flushed) return;
      page.flushed = true;
      const duration = Math.round(performance.now() - page.start);
      if (duration < 300) return;

      sendTrackingEvent(sessionId, {
        event_type: 'page_view',
        path: page.path,
        page_title: page.title,
        duration_ms: duration,
        occurred_at: new Date().toISOString(),
        metadata: {
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
        },
      });
    }

    const handlePageHide = () => flushPageView();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPageView();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      flushPageView();
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pathname]);

  useEffect(() => {
    const sessionId = sessionIdRef.current ?? getSessionId();
    sessionIdRef.current = sessionId;

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('a, button, input, select, textarea, [role="button"], [data-track-label]')
        : null;
      const page = pageRef.current;
      if (!target || !page) return;

      const href = target instanceof HTMLAnchorElement ? target.href : target.getAttribute('href');
      const duration = Math.round(performance.now() - page.start);

      sendTrackingEvent(sessionId, {
        event_type: 'click',
        path: page.path,
        page_title: page.title,
        target_tag: target.tagName.toLowerCase(),
        target_text: elementLabel(target),
        target_href: href || undefined,
        target_role: target.getAttribute('role') || undefined,
        duration_ms: Math.max(0, duration),
        occurred_at: new Date().toISOString(),
        metadata: {
          button: event.button,
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
        },
      });
    }

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  return null;
}
