import { maxExpiryISO, todayISO } from './date';
import type { Draft } from './types';

/**
 * A calendar date the app can rely on, as YYYY-MM-DD.
 *
 * Checked by round-trip rather than by regex alone: '2026-02-31' matches the
 * shape but is not a day, and an expiry that does not exist would produce a
 * Registry ID nobody can reconcile.
 */
export function isExpiryDate(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const asDate = new Date(Date.UTC(y, m - 1, d));
  return (
    asDate.getUTCFullYear() === y && asDate.getUTCMonth() === m - 1 && asDate.getUTCDate() === d
  );
}

/**
 * Completeness rules for leaving Draft.
 *
 * Shared deliberately: the wizard uses it to grey out "Submit" and list what is
 * still missing, and the server actions use it to reject a submission that
 * never went through the wizard. A `'use server'` export is a public POST
 * endpoint, so a browser-only check is no check at all — this module is the one
 * place the rules live so the two sides cannot drift apart.
 *
 * Returns the list of missing items, empty when the draft may be submitted.
 */
export function validateForSubmission(draft: Draft): string[] {
  const missing: string[] = [];
  if (!draft.country) missing.push('country');
  if (!draft.nodes.length) missing.push('taxonomy scope');
  if (!draft.segments.length) missing.push('at least one segment tag');
  if (!draft.supplierId.trim() || !draft.supplierName.trim())
    missing.push('supplier SAP ID and name');
  if (!draft.reason) missing.push('reason code');
  if (!draft.justification.trim()) missing.push('justification narrative');
  // Not merely a required field: Level 2 cannot mint a Registry ID without it,
  // because the expiry year and month are part of the ID itself.
  if (!isExpiryDate(draft.expiry)) missing.push('expiry date');
  else if (!isExpiryWithinCap(draft.expiry)) missing.push(expiryCapError());
  return missing;
}

/**
 * Whether an expiry sits inside the twelve-month ceiling, and is not in the
 * past.
 *
 * Kept beside validateForSubmission so the wizard's `max` attribute, the
 * submit gate and the server action all read one rule. The date input's `max`
 * is a convenience — a typed date, a pasted one, or a POST straight to the
 * action bypasses it entirely.
 */
export function isExpiryWithinCap(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!isExpiryDate(v)) return false;
  return v >= todayISO() && v <= maxExpiryISO();
}

export function expiryCapError(): string {
  return `an expiry no later than ${maxExpiryISO()} (twelve months)`;
}

/** The same rules phrased as a single sentence, for a server-side error. */
export function submissionError(missing: string[]): string {
  return `This record cannot be submitted yet — still required: ${missing.join(', ')}.`;
}
