/**
 * Recurrent services: annual (or half-yearly) contracts, subscriptions and AMCs that are renewed
 * rather than billed month by month. HQ Dubai first.
 *
 * Pure, so the register, the requester's page, the reminder run and the loader agree on what a
 * service's status is and when it is due. Reminder steps are the rentals' own (90, 60, 30, 14, 7
 * and 0 days), which is exactly what was asked for.
 */
import { REMINDER_DAYS, daysUntil } from './renewals';

export { REMINDER_DAYS };

export type RecurrentStoredStatus = 'active' | 'cancelled';

/**
 * What the screen shows. Only active / cancelled are stored; the rest are read off the dates and
 * the open renewal, so nobody has to remember to flip a status on the day a contract runs out.
 */
export type RecurrentStatus =
  'active' | 'due' | 'expired' | 'awaiting_buyer' | 'cancelled' | 'no_expiry';

export const RECURRENT_STATUS_LABEL: Record<RecurrentStatus, string> = {
  active: 'Active',
  due: 'Due for renewal',
  expired: 'Expired',
  awaiting_buyer: 'Renewal decided · with buyer',
  cancelled: 'Cancelled',
  no_expiry: 'No expiry date',
};

export type RenewalDecision = 'renew' | 'renew_changes' | 'cancel';

export const DECISION_LABEL: Record<RenewalDecision, string> = {
  renew: 'Renew as is',
  renew_changes: 'Renew with changes',
  cancel: 'Cancel',
};

export const RENEWAL_PERIODS = ['yearly', 'half_yearly', 'quarterly', 'monthly', 'other'] as const;
export type RenewalPeriod = (typeof RENEWAL_PERIODS)[number];

export const PERIOD_LABEL: Record<RenewalPeriod, string> = {
  yearly: 'Yearly',
  half_yearly: 'Half yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  other: 'Other',
};

/** Months per period, for suggesting the next expiry. Null where there is nothing to add. */
const PERIOD_MONTHS: Record<RenewalPeriod, number | null> = {
  yearly: 12,
  half_yearly: 6,
  quarterly: 3,
  monthly: 1,
  other: null,
};

/** "Yearly", "Half Yearly", "half-yearly" → the stored code. Unknown text → 'other'. */
export function parsePeriod(raw: string | null | undefined): RenewalPeriod | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'yearly' || s === 'annual' || s === 'annually') return 'yearly';
  if (s === 'half_yearly' || s === 'semi_annual' || s === 'six_monthly') return 'half_yearly';
  if (s === 'quarterly') return 'quarterly';
  if (s === 'monthly') return 'monthly';
  return 'other';
}

/** How far ahead a service counts as due: the first reminder step. */
export const DUE_WINDOW_DAYS = REMINDER_DAYS[0];

export function recurrentStatus(input: {
  stored: RecurrentStoredStatus;
  expiry: Date | null;
  today: Date;
  /** The open renewal for the current expiry, if any. */
  renewal: { decision: RenewalDecision | null; completed: boolean } | null;
}): RecurrentStatus {
  if (input.stored === 'cancelled') return 'cancelled';
  if (input.renewal && input.renewal.decision && !input.renewal.completed) return 'awaiting_buyer';
  if (!input.expiry) return 'no_expiry';
  const left = daysUntil(input.expiry, input.today);
  if (left < 0) return 'expired';
  if (left <= DUE_WINDOW_DAYS) return 'due';
  return 'active';
}

/** The next expiry a buyer is offered: the current one plus one renewal period. */
export function suggestNextExpiry(expiry: Date | null, period: RenewalPeriod): Date | null {
  const months = PERIOD_MONTHS[period];
  if (!expiry || months === null) return null;
  const d = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + months, 1));
  // Keep the day of month, clamped to the target month's length (31 Jan + 1 month = 28/29 Feb).
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(expiry.getUTCDate(), last));
  return d;
}

/** Who may record a requester's decision: the service's requester, a buyer, or an admin. */
export function canDecideRenewal(input: {
  actorEmail: string;
  requesterEmail: string | null;
  canBuy: boolean;
}): boolean {
  if (input.canBuy) return true;
  return (
    Boolean(input.requesterEmail) &&
    input.actorEmail.trim().toLowerCase() === String(input.requesterEmail).trim().toLowerCase()
  );
}

/* ─── the record ─────────────────────────────────────────────────────────────────────────── */

export interface RecurrentDraft {
  description: string;
  serviceName: string;
  status: RecurrentStoredStatus;
  renewalPeriod: RenewalPeriod;
  poRenewalPeriod: string;
  department: string;
  contractExpiry: string;
  lastPoNumber: string;
  lastPoValidTill: string;
  supplierCode: string;
  supplierName: string;
  supplierContactName: string;
  supplierContactEmail: string;
  requesterName: string;
  requesterEmail: string;
  buyerName: string;
  buyerEmail: string;
  approver: string;
  requestType: string;
  annualValue: string;
  currency: string;
  comments: string;
}

export const EMPTY_RECURRENT_DRAFT: RecurrentDraft = {
  description: '',
  serviceName: '',
  status: 'active',
  renewalPeriod: 'yearly',
  poRenewalPeriod: '',
  department: '',
  contractExpiry: '',
  lastPoNumber: '',
  lastPoValidTill: '',
  supplierCode: '',
  supplierName: '',
  supplierContactName: '',
  supplierContactEmail: '',
  requesterName: '',
  requesterEmail: '',
  buyerName: '',
  buyerEmail: '',
  approver: '',
  requestType: '',
  annualValue: '',
  currency: '',
  comments: '',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check a draft; returns the first problem in plain words, or null. */
export function checkRecurrent(d: RecurrentDraft): string | null {
  if (!d.description.trim()) return 'Describe the service.';
  if (!RENEWAL_PERIODS.includes(d.renewalPeriod)) return 'Pick a renewal period.';
  if (d.status !== 'active' && d.status !== 'cancelled') return 'Pick a status.';
  for (const [label, v] of [
    ['contract expiry', d.contractExpiry],
    ['last PO valid till', d.lastPoValidTill],
  ] as const) {
    if (v.trim() && !ISO.test(v.trim())) return `The ${label} must be a date.`;
  }
  for (const [label, v] of [
    ['supplier contact email', d.supplierContactEmail],
    ['requester email', d.requesterEmail],
    ['buyer email', d.buyerEmail],
  ] as const) {
    if (v.trim() && !EMAIL.test(v.trim())) return `The ${label} is not an email address.`;
  }
  if (d.annualValue.trim()) {
    const n = Number(d.annualValue.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) return 'The annual value must be a number.';
    if (!d.currency.trim()) return 'Give the currency of the annual value.';
  }
  if (d.lastPoNumber.trim() && !/^\d{6,12}$/.test(d.lastPoNumber.trim())) {
    return 'A PO number is digits only.';
  }
  return null;
}
