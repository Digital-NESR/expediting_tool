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

export function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'Open':
      return { label: 'Open', className: 'bg-blue-50 text-blue-700 border border-blue-200' };
    case 'Open - Extended':
      return { label: 'Open · Extended', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
    case 'Closed':
      return { label: 'Closed', className: 'bg-gray-100 text-gray-600 border border-gray-200' };
    case 'Closed - Refund Recovered':
      return { label: 'Closed · Refund Recovered', className: 'bg-green-50 text-green-700 border border-green-200' };
    default:
      return { label: status || 'Unknown', className: 'bg-gray-100 text-gray-500 border border-gray-200' };
  }
}

/** Returns days until effective expiry (negative = overdue). null if no date.
 *  Matches PostgreSQL's (COALESCE(extended_date, expiry_date) - CURRENT_DATE)
 *  exactly: 0 = expires today, -1 = 1 day overdue, 30 = 30 days remaining.
 *  Uses UTC arithmetic so DST transitions never cause an off-by-one.
 *
 *  `today` is injectable so one caller can pin the anchor; it defaults to now.
 */
export function calcDays(s: Shipment, today: Date = new Date()): number | null {
  const effective = s.extended_date || s.expiry_date;
  if (!effective) return null;
  const [ey, em, ed] = effective.split('-').map(Number);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  const todayUtc  = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return (expiryUtc - todayUtc) / 86400000;
}

/** The seven buckets every presentation map above defines a value for. */
export type TiteAlertLevel =
  | 'overdue' | 'urgent' | 'action' | 'plan' | 'info' | 'ok' | 'closed';

/**
 * The ONE alert-level rule for TI-TE.
 *
 * Every page, action and report derives urgency from here, from
 * `COALESCE(extended_date, expiry_date)` — never from the persisted
 * `shipments.alert_level` column, which is only rewritten on create / extend /
 * close and is therefore stale for any row that simply aged. Three separate
 * copies of this rule used to disagree on the no-date case ('ok' vs 'info') and
 * on the day anchor, so the dashboard, the analytics panel and the SQL KPI
 * counts reported different numbers for the same data.
 *
 * Buckets, by days until effective expiry:
 *   < 0 overdue · 0–7 urgent · 8–14 action · 15–30 plan · 31–60 info · 61+ ok
 * A closed shipment is always 'closed'; a shipment with no effective date at all
 * is 'info' ("Monitor") — a missing customs deadline is not "On track".
 *
 * ANCHOR: the UTC calendar day, the same anchor as {@link calcDays} and as
 * Postgres `CURRENT_DATE` on a UTC server. Between 00:00 and 04:00 Gulf time the
 * UTC day is still the previous day, so a shipment that expired yesterday in
 * Gulf terms reads as expiring today ('urgent', not 'overdue') for those four
 * hours. That is accepted deliberately: a Gulf business-day anchor here alone
 * would put this function permanently at odds with `calcDays`, with the
 * ORDER BY / FILTER clauses in `tite.ts`, and with the stored column — the
 * Alerts page would show a card in the "Overdue" group reading "0 days
 * remaining". Moving to a business-day anchor is a one-line change at the
 * `today` argument, but it has to be made on all four at once.
 */
export function alertLevelFor(
  expiry:   string | null | undefined,
  extended: string | null | undefined,
  status:   string | null | undefined,
  today:    Date = new Date(),
): TiteAlertLevel {
  if (status === 'Closed' || status === 'Closed - Refund Recovered') return 'closed';
  const days = calcDays(
    { expiry_date: expiry ?? null, extended_date: extended ?? null } as Shipment,
    today,
  );
  if (days === null) return 'info';
  if (days <   0) return 'overdue';
  if (days <=  7) return 'urgent';
  if (days <= 14) return 'action';
  if (days <= 30) return 'plan';
  if (days <= 60) return 'info';
  return 'ok';
}

/** {@link alertLevelFor} for a whole shipment row. */
/* Takes only the three fields it reads, so callers holding a narrowed row
   (see TiteAnalyticsShipment) can use it as well as callers holding a full
   Shipment — which still satisfy this structurally. */
export function shipmentAlertLevel(
  s: Pick<Shipment, 'expiry_date' | 'extended_date' | 'status'>,
  today?: Date,
): TiteAlertLevel {
  return alertLevelFor(s.expiry_date, s.extended_date, s.status, today);
}
