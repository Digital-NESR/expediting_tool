import type { Shipment } from '@/types/tite';

export const ALERT_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  urgent:  'Urgent',
  action:  "Action req'd",
  plan:    'Plan ext.',
  info:    'Monitor',
  ok:      'On track',
  closed:  'Closed',
};

export const ALERT_PILL: Record<string, string> = {
  overdue: 'bg-red-100 text-red-700 border border-red-200',
  urgent:  'bg-orange-100 text-orange-700 border border-orange-200',
  action:  'bg-amber-100 text-amber-700 border border-amber-200',
  plan:    'bg-blue-100 text-blue-700 border border-blue-200',
  info:    'bg-cyan-100 text-cyan-700 border border-cyan-200',
  ok:      'bg-green-100 text-green-700 border border-green-200',
  closed:  'bg-slate-100 text-slate-500 border border-slate-200',
};

export const ALERT_DOT: Record<string, string> = {
  overdue: 'bg-red-500',
  urgent:  'bg-orange-500',
  action:  'bg-amber-500',
  plan:    'bg-blue-500',
  info:    'bg-cyan-500',
  ok:      'bg-green-600',
  closed:  'bg-slate-400',
};

export const BUCKET_HEX: Record<string, string> = {
  overdue: '#ef4444',
  urgent:  '#f97316',
  action:  '#f59e0b',
  plan:    '#3b82f6',
  info:    '#06b6d4',
  ok:      '#059669',
  closed:  '#94a3b8',
};

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

export function sarFmt(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return 'SAR ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function usdFmt(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Returns days until effective expiry (negative = overdue). null if no date. */
export function calcDays(s: Shipment): number | null {
  const effective = s.extended_date || s.expiry_date;
  if (!effective) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(effective).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}
