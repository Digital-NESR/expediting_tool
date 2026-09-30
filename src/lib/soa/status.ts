/**
 * What a vendor's status means for the coverage figure.
 *
 * A plain module with no imports, so there is exactly one answer to "does this vendor count" and
 * the screens, the SQL, the compliance check and the evidence pack all read it. Coverage is the
 * number the quarter is judged on; two implementations of it would disagree eventually, and the
 * one that disagreed would be found by an auditor rather than by us.
 */

export type VendorCycleStatus =
  | 'scoped'
  | 'requested'
  | 'reminded'
  | 'received'
  | 'nil_balance'
  | 'non_responder';

/**
 * The two ways a vendor's balance can be settled.
 *
 * `received` is a statement in hand. `nil_balance` is the champion having established there is
 * nothing outstanding, which is a reconciliation that came out at nil rather than a gap: there was
 * never a statement to collect, so withholding the credit would measure our paperwork instead of
 * the account.
 *
 * `non_responder` is deliberately not here. A supplier who never answered leaves their balance
 * unconfirmed, and counting silence as agreement is the one thing this exercise exists to stop.
 */
export const COVERED_STATUSES = ['received', 'nil_balance'] as const;

/** The same list as a SQL literal, built from the same constant rather than retyped beside it. */
export const COVERED_STATUS_SQL = COVERED_STATUSES.map((s) => `'${s}'`).join(', ');

export function countsTowardCoverage(status: string): boolean {
  return (COVERED_STATUSES as readonly string[]).includes(status);
}

/** Closed one way or another: nothing further is owed from this vendor or about it. */
export function isResolved(status: string): boolean {
  return countsTowardCoverage(status) || status === 'non_responder';
}

/**
 * Asked, and still silent.
 *
 * `scoped` is excluded on purpose. A vendor nobody wrote to has not failed to respond, and calling
 * it one past the deadline would hide our own omission inside the supplier's column.
 */
export function isAwaitingReply(status: string): boolean {
  return status === 'requested' || status === 'reminded';
}

/**
 * Past the date suppliers were given, and still silent.
 *
 * Derived, never written. Nothing flips a status on a schedule: there is no job to install or
 * monitor, and a statement that arrives a day late lands normally because no status was ever
 * overwritten to say the supplier had gone quiet.
 */
export function isAwaitingVerification(status: string, deadline: Date | null, now: Date): boolean {
  if (!deadline || Number.isNaN(deadline.getTime())) return false;
  return isAwaitingReply(status) && now.getTime() > deadline.getTime();
}
