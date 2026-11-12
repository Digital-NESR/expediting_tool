import type { ReactNode } from 'react';
import {
  ASSESSMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_LABEL,
  complianceBand,
  pct,
  type AssessmentStatus,
  type EnrollmentStatus,
} from '@/lib/icsa/model';

/* Shared look for ICSA: the flat NESR style used by Laptop Procurement and ProcureGuard. */

export const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
export const BTN =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#307c4c]/85 disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_QUIET =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_SM = 'px-3 py-1.5 text-xs';
export const INPUT =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-[#307c4c] focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 disabled:cursor-not-allowed disabled:opacity-70';
export const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';
export const TH =
  'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
export const TD = 'px-3 py-2.5 align-top text-sm text-slate-700';

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-wider text-[#307c4c]">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`${CARD} border-t-4 border-t-[#2a7e4f] p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#2a7e4f]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const ASSESSMENT_TONE: Record<AssessmentStatus, string> = {
  nominated: 'bg-slate-100 text-slate-600 border-slate-200',
  requested: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  returned: 'bg-orange-50 text-orange-700 border-orange-200',
  reviewed: 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20',
  not_completed: 'bg-red-50 text-red-700 border-red-200',
};

export function AssessmentPill({ status }: { status: AssessmentStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${ASSESSMENT_TONE[status]}`}
    >
      {ASSESSMENT_STATUS_LABEL[status]}
    </span>
  );
}

const ENROLLMENT_TONE: Record<EnrollmentStatus, string> = {
  open: 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  force_closed: 'bg-red-50 text-red-700 border-red-200',
};

export function EnrollmentPill({ status }: { status: EnrollmentStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_TONE[status]}`}
    >
      {ENROLLMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function CyclePill({ status }: { status: 'open' | 'closed' }) {
  return <EnrollmentPill status={status} />;
}

/** Response rate against the threshold, with the threshold marked on the bar. */
export function ThresholdBar({
  rate,
  thresholdPct,
  label,
}: {
  rate: number;
  thresholdPct: number;
  label?: ReactNode;
}) {
  const met = rate * 100 >= thresholdPct;
  return (
    <div className="min-w-[160px]">
      {label && <div className="mb-1 flex justify-between text-xs text-slate-500">{label}</div>}
      <div className="relative h-2 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${met ? 'bg-[#2a7e4f]' : 'bg-amber-400'}`}
          style={{ width: `${Math.min(100, Math.round(rate * 100))}%` }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 bg-slate-700"
          style={{ left: `${thresholdPct}%` }}
          title={`Threshold ${thresholdPct}%`}
        />
      </div>
    </div>
  );
}

const BAND_TONE = {
  strong: 'bg-[#2a7e4f]/10 text-[#2a7e4f]',
  watch: 'bg-amber-50 text-amber-700',
  gap: 'bg-red-50 text-red-700',
  none: 'bg-slate-50 text-slate-400',
};

export function RateChip({ rate }: { rate: number | null }) {
  return (
    <span
      className={`inline-block min-w-[3rem] rounded-md px-2 py-0.5 text-center text-xs font-semibold ${BAND_TONE[complianceBand(rate)]}`}
    >
      {pct(rate)}
    </span>
  );
}

const RESPONSE_TONE: Record<string, string> = {
  Yes: 'bg-[#2a7e4f]/10 text-[#2a7e4f] border-[#2a7e4f]/30',
  No: 'bg-red-50 text-red-700 border-red-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  'N/A': 'bg-slate-100 text-slate-600 border-slate-200',
};

export function ResponseChip({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-xs text-slate-400">Unanswered</span>;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${RESPONSE_TONE[value] ?? ''}`}
    >
      {value}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${CARD} p-8 text-center`}>
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'ok' | 'error';
  children: ReactNode;
}) {
  const t = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    ok: 'border-[#307c4c]/30 bg-[#307c4c]/5 text-[#1d4f31]',
    error: 'border-red-200 bg-red-50 text-red-800',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${t}`}>{children}</div>;
}
