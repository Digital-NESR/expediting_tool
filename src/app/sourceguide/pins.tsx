'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star } from 'lucide-react';
import { SG_BRAND } from './constants';

export type PinItem = { kind: 'commodity' | 'supplier'; key: string; name: string; sub?: string; href: string };

const RECENT_KEY = 'sg-recent';
const BOOK_KEY = 'sg-bookmarks';
const MAX_RECENT = 8;
const MAX_BOOK = 40;
const EVENT = 'sg-pins-changed';

function read(k: string): PinItem[] {
  if (typeof window === 'undefined') return [];
  try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(k: string, v: PinItem[]) {
  try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
}
const idOf = (kind: string, key: string) => `${kind}:${key}`;

export function recordView(item: PinItem) {
  if (typeof window === 'undefined') return;
  const id = idOf(item.kind, item.key);
  const next = [item, ...read(RECENT_KEY).filter(x => idOf(x.kind, x.key) !== id)].slice(0, MAX_RECENT);
  write(RECENT_KEY, next);
}

export function toggleBookmark(item: PinItem): boolean {
  const id = idOf(item.kind, item.key);
  const cur = read(BOOK_KEY);
  const exists = cur.some(x => idOf(x.kind, x.key) === id);
  write(BOOK_KEY, exists ? cur.filter(x => idOf(x.kind, x.key) !== id) : [item, ...cur].slice(0, MAX_BOOK));
  return !exists;
}

/** Subscribe to recent + bookmark lists (updates live within the tab). */
export function usePins() {
  const [recent, setRecent] = useState<PinItem[]>([]);
  const [bookmarks, setBookmarks] = useState<PinItem[]>([]);
  const refresh = useCallback(() => { setRecent(read(RECENT_KEY)); setBookmarks(read(BOOK_KEY)); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [refresh]);
  return { recent, bookmarks };
}

/** Star toggle for a commodity/supplier. */
export function BookmarkButton({ item, className = '' }: { item: PinItem; className?: string }) {
  const [on, setOn] = useState(false);
  const refresh = useCallback(() => {
    setOn(read(BOOK_KEY).some(x => idOf(x.kind, x.key) === idOf(item.kind, item.key)));
  }, [item.kind, item.key]);
  useEffect(() => {
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);

  return (
    <button
      onClick={() => setOn(toggleBookmark(item))}
      title={on ? 'Remove bookmark' : 'Bookmark'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${className}`}
      style={on ? { borderColor: SG_BRAND, background: '#eaf4ef', color: '#1f5d3a' } : { borderColor: '#D1D3D4', background: '#fff', color: '#58595B' }}
    >
      <Star className="h-3.5 w-3.5" fill={on ? SG_BRAND : 'none'} style={{ color: on ? SG_BRAND : undefined }} />
      {on ? 'Bookmarked' : 'Bookmark'}
    </button>
  );
}
