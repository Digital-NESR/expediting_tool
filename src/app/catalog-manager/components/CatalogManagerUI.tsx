'use client';

import Link from 'next/link';
import {
  LayoutDashboard, List, BadgeCheck, Settings, ClipboardList, Search, Plus, Filter,
  Download, Upload, Pin, X, ChevronRight, Clock, Pencil, Check, RotateCcw, FileText,
  History, Building2, Tag, Layers, BarChart3, TrendingUp, DollarSign, AlertTriangle,
  Globe, ArrowRight, User, Users, Table, Trash2, Link2, ExternalLink, LogOut, Home,
  Loader2, Sparkles, Calendar, Info, type LucideIcon,
} from 'lucide-react';
import type { CatalogStatus } from '@/types/catalog-manager';
import { getStatusBadge } from '@/lib/catalog-manager-utils';

/* ---------------- icons (lucide, behind the existing string-name API) ---------------- */

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  catalog: List,
  approve: BadgeCheck,
  admin: Settings,
  audit: ClipboardList,
  search: Search,
  plus: Plus,
  filter: Filter,
  download: Download,
  upload: Upload,
  pin: Pin,
  close: X,
  chevRight: ChevronRight,
  clock: Clock,
  edit: Pencil,
  check: Check,
  x: X,
  revise: RotateCcw,
  file: FileText,
  history: History,
  building: Building2,
  tag: Tag,
  layers: Layers,
  chart: BarChart3,
  trend: TrendingUp,
  money: DollarSign,
  alert: AlertTriangle,
  globe: Globe,
  arrowRight: ArrowRight,
  user: User,
  users: Users,
  sheet: Table,
  trash: Trash2,
  link: Link2,
  external: ExternalLink,
  logout: LogOut,
  home: Home,
  spinner: Loader2,
  sparkles: Sparkles,
  calendar: Calendar,
  info: Info,
};

export function Icon({ name, className = 'h-4 w-4', strokeWidth = 1.75 }: { name: keyof typeof ICONS | string; className?: string; strokeWidth?: number }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** Animated spinner icon (for busy buttons and inline loading). */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} strokeWidth={2} aria-hidden="true" />;
}

/* ---------------- buttons ---------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSoft';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[#307c4c] text-white shadow-sm shadow-[#307c4c]/25 hover:bg-[#2b6f44] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#6aaf8e] hover:text-slate-900 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
  danger:
    'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
  dangerSoft:
    'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: 'sm' | 'md' = 'md'): string {
  const sizing = size === 'sm' ? 'gap-1.5 rounded-lg px-3 py-1.5 text-[13px]' : 'gap-2 rounded-lg px-3.5 py-2 text-sm';
  return `inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#307c4c]/30 ${sizing} ${BUTTON_VARIANTS[variant]}`;
}

export function Button({
  variant = 'primary', size = 'md', icon, busy, className = '', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: string;
  busy?: boolean;
}) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`${buttonClasses(variant, size)} ${className}`}>
      {busy ? <Spinner className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : icon ? <Icon name={icon} className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> : null}
      {children}
    </button>
  );
}

/* ---------------- status / chips ---------------- */

export function StatusPill({ status, sm }: { status: CatalogStatus; sm?: boolean }) {
  const b = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ring-black/[0.04] ${b.pill} ${sm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
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

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{children}</kbd>;
}

export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const ini = (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#307c4c] to-[#2b6f44] font-semibold text-white ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {ini}
    </span>
  );
}

export function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}>{children}</div>;
}

/* ---------------- cards ---------------- */

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>{children}</section>;
}

export function CardHeader({
  title, sub, action, className = '',
}: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h2>
        {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const STAT_TONES = {
  green: { bar: 'from-[#6aaf8e] to-[#307c4c]', icon: 'bg-[#eaf4ef] text-[#1d4f31]', hover: 'hover:border-[#6aaf8e]' },
  amber: { bar: 'from-amber-400 to-amber-600', icon: 'bg-amber-50 text-amber-700', hover: 'hover:border-amber-300' },
  ink:   { bar: 'from-slate-500 to-slate-900', icon: 'bg-slate-100 text-slate-700', hover: 'hover:border-slate-300' },
  cyan:  { bar: 'from-cyan-400 to-sky-700',    icon: 'bg-cyan-50 text-cyan-700',    hover: 'hover:border-cyan-300' },
  red:   { bar: 'from-red-400 to-red-600',     icon: 'bg-red-50 text-red-600',      hover: 'hover:border-red-300' },
} as const;

export type StatTone = keyof typeof STAT_TONES;

/** KPI stat card — optionally a link. Used on dashboard, analytics, suppliers. */
export function StatCard({
  label, value, sub, icon, tone = 'green', href, delta,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  tone?: StatTone;
  href?: string;
  /** Optional trend annotation, e.g. { text: '+12 this month', dir: 'up' } */
  delta?: { text: string; dir: 'up' | 'down' | 'flat' };
}) {
  const t = STAT_TONES[tone];
  const body = (
    <>
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-slate-400">{label}</p>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${t.icon}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${delta.dir === 'up' ? 'text-[#307c4c]' : delta.dir === 'down' ? 'text-red-600' : 'text-slate-400'}`}>
            {delta.dir !== 'flat' && <Icon name="trend" className={`h-3 w-3 ${delta.dir === 'down' ? 'rotate-180 -scale-x-100' : ''}`} />}
            {delta.text}
          </span>
        )}
        {sub && <p className="min-w-0 truncate text-[12px] text-slate-500">{sub}</p>}
      </div>
    </>
  );
  const cls = `group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 ${t.hover} ${href ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/* ---------------- progress / skeletons / empty ---------------- */

/** Horizontal meter bar with the brand gradient (0–100). */
export function Meter({ pct, tone = 'green', className = 'h-2' }: { pct: number; tone?: 'green' | 'amber' | 'red' | 'slate'; className?: string }) {
  const fills = {
    green: 'from-[#6aaf8e] to-[#307c4c]',
    amber: 'from-amber-300 to-amber-500',
    red: 'from-red-400 to-red-600',
    slate: 'from-slate-300 to-slate-500',
  };
  return (
    <span className={`block overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <span
        className={`block h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out ${fills[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}

export function Skeleton({ className = 'h-4 w-24' }: { className?: string }) {
  return <span className={`skeleton-shimmer block ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon = 'search', title, sub, action }: { icon?: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="cm-fade-in px-5 py-14 text-center text-slate-400">
      <div className="relative mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#307c4c]/10 bg-gradient-to-b from-[#eaf4ef] to-white text-[#307c4c] shadow-sm">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="text-[15px] font-semibold text-slate-900">{title}</div>
      {sub && <div className="mx-auto mt-1 max-w-sm text-[13px]">{sub}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ---------------- tables ---------------- */

/** Shared table shell classes so every page's table reads identically. */
export const tableClasses = {
  wrap: 'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm',
  scroller: 'overflow-x-auto',
  table: 'w-full border-collapse text-left',
  thead: 'bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400',
  th: 'whitespace-nowrap px-4 py-3 font-semibold first:pl-5 last:pr-5',
  tbody: 'divide-y divide-slate-100 text-[13px] text-slate-700',
  tr: 'transition-colors hover:bg-[#307c4c]/[0.035]',
  trClickable: 'cursor-pointer transition-colors hover:bg-[#307c4c]/[0.035] focus-visible:bg-[#307c4c]/[0.05] focus-visible:outline-none',
  td: 'px-4 py-3 first:pl-5 last:pr-5',
} as const;
