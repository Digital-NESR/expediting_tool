/**
 * When a renewal is due, who is reminded and when, and what may be decided.
 *
 * Pure, so the parts that are easy to get quietly wrong can be tested against hand-built dates
 * rather than against a database and a clock. Every function here takes `today` rather than
 * reading it, which is what makes "does the 30-day reminder fire on the 30th day or the 31st"
 * a question with a test instead of an argument.
 */

export type RenewalStatus = 'pending' | 'extended' | 'scope_change' | 'not_extended';

export type RenewalDecision = Exclude<RenewalStatus, 'pending'>;

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  pending: 'Awaiting decision',
  extended: 'Extended 12 months',
  scope_change: 'Extended with scope change',
  not_extended: 'Not extended',
};

/**
 * How far ahead a renewal appears, and when each reminder goes out.
 *
 * Ninety days because a decision not to extend has to leave time to source a replacement, and
 * the design's own reminder schedule starts well before the end date rather than at it. The
 * steps are days before expiry, descending, and the last one is the day itself: a contract that
 * expires today with nobody having decided is the loudest case, not a silent one.
 */
export const REMINDER_DAYS = [90, 60, 30, 14, 7, 0] as const;

/** The window in which a line is considered due and a renewal row is worth opening. */
export const WINDOW_DAYS = REMINDER_DAYS[0];

/** Whole days from `today` to `due`. Negative once the date has passed. */
export function daysUntil(due: Date, today: Date): number {
  const a = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

/** Is this line close enough to expiry to need a decision? Overdue counts. */
export function isDue(due: Date, today: Date): boolean {
  return daysUntil(due, today) <= WINDOW_DAYS;
}

/**
 * The reminder that should go out today, or null.
 *
 * Returns the EARLIEST unsent step that is now due, not the closest one. A renewal nobody looked
 * at for two months should send the 60-day notice it missed rather than skipping silently to the
 * 30-day one, because the subject line is the only thing that tells a reader how late this is.
 *
 * Once the date has passed, the 0-day step keeps being the answer until it is sent, so an
 * overdue renewal is chased once and then left alone rather than mailed daily.
 */
export function dueReminder(due: Date, today: Date, sent: readonly number[]): number | null {
  const left = daysUntil(due, today);
  const candidates = REMINDER_DAYS.filter((d) => left <= d && !sent.includes(d));
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

/** How a renewal reads on screen: the nearer the date, the louder. */
export type Urgency = 'overdue' | 'urgent' | 'soon' | 'ahead';

export function urgencyOf(due: Date, today: Date): Urgency {
  const left = daysUntil(due, today);
  if (left < 0) return 'overdue';
  if (left <= 14) return 'urgent';
  if (left <= 60) return 'soon';
  return 'ahead';
}

/**
 * The end date an extension moves a contract to.
 *
 * Twelve months from the date it was due, NOT from today. A renewal decided three weeks late
 * would otherwise quietly push every future anniversary three weeks later, and after a few years
 * of that the contract no longer lines up with the one it was signed alongside.
 */
export function extendedTo(due: Date, months = 12): Date {
  return new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + months, due.getUTCDate()));
}

/**
 * May this actor take this decision?
 *
 * Extending a contract commits money for another year, so it is a buyer's or an admin's call.
 * Ops validate what was used; they do not sign up for another twelve months of it. The design
 * shows the decision taken by whoever the renewal was routed to, and this is the floor under
 * that: a validator can read the whole thing and add a note, and cannot decide it.
 */
export function canDecide(roles: { canBuy: boolean; isAdmin: boolean }): boolean {
  return roles.isAdmin || roles.canBuy;
}

/** A decision is final. Reopening one would lose who decided what, and when. */
export function canChange(status: RenewalStatus): boolean {
  return status === 'pending';
}

/** `yyyy-mm-dd` in UTC, which is how every date crosses into a browser here. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
