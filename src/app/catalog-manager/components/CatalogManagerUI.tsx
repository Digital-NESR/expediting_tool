'use client';

import type { CatalogStatus } from '@/types/catalog-manager';
import { getStatusBadge } from '@/lib/catalog-manager-utils';

/* ---------------- icons (inline svg, ported from the design) ---------------- */

const ICON_PATHS: Record<string, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  catalog: 'M4 5h16M4 12h16M4 19h16',
  approve: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  admin: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z',
  plus: 'M12 5v14M5 12h14',
  filter: 'M4 5h16l-6.5 8v6l-3 1.5V13z',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  upload: 'M12 20V8m0 0l-4 4m4-4l4 4M4 4h16',
  pin: 'M9 3h6l-1 7 3 3v2h-4v6l-1 1-1-1v-6H6v-2l3-3z',
  close: 'M6 6l12 12M18 6L6 18',
  chevRight: 'M9 6l6 6-6 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z',
  check: 'M20 6L9 17l-5-5',
  x: 'M6 6l12 12M18 6L6 18',
  revise: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 4v4h4',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 4v4h4M12 7v5l3 2',
  building: 'M3 21h18M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M15 21V9h2a2 2 0 012 2v10M8 7h2M8 11h2M8 15h2',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V5a2 2 0 012-2h7a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6zM7.5 7.5h.01',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  chart: 'M3 3v18h18M8 17V9M13 17V5M18 17v-6',
  trend: 'M3 17l6-6 4 4 8-8M21 7h-5M21 7v5',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 000 18a14 14 0 000-18z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  sheet: 'M4 4h16v16H4zM4 9.5h16M4 15h16M9.5 4v16M15 4v16',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6',
  link: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  external: 'M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5',
};

export function Icon({ name, className = 'h-4 w-4', strokeWidth = 1.7 }: { name: keyof typeof ICON_PATHS | string; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

/* ---------------- status / chips ---------------- */

export function StatusPill({ status, sm }: { status: CatalogStatus; sm?: boolean }) {
  const b = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${b.pill} ${sm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${b.dot}`} />
      {status}
    </span>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' }) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600',
    green: 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#1d4f31]',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const ini = (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#307c4c] to-[#2b6f44] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {ini}
    </span>
  );
}

export function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}>{children}</div>;
}

export function EmptyState({ icon = 'search', title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="px-5 py-14 text-center text-slate-400">
      <div className="mx-auto mb-3.5 inline-flex h-13 w-13 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-[#307c4c]">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="text-[15px] font-semibold text-slate-900">{title}</div>
      {sub && <div className="mt-1 text-[13px]">{sub}</div>}
    </div>
  );
}
