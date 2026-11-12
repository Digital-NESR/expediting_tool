/**
 * The rules of a monthly cycle, with no database in sight.
 *
 * Pure so the parts that are easy to get quietly wrong — which stage may move where, what "vs
 * last month" means when there was no last month, how a part-month is priced — can be tested
 * against hand-built rows instead of against a seeded database. Same reason `rollup.ts` is pure
 * on the SourceGuide side.
 */

export type CycleStage = 'awaiting_supplier' | 'submitted' | 'validated' | 'returned' | 'closed';

export type ErpStatus =
  | 'pr_under_approval'
  | 'approved'
  | 'po_under_approval'
  | 'pending_grn'
  | 'grn_completed'
  | 'cancelled';

export const STAGE_LABEL: Record<CycleStage, string> = {
  awaiting_supplier: 'Awaiting supplier',
  submitted: 'Submitted',
  validated: 'Validated',
  returned: 'Returned',
  closed: 'Closed',
};

export const ERP_STATUS_LABEL: Record<ErpStatus, string> = {
  pr_under_approval: 'PR under approval',
  approved: 'Approved',
  po_under_approval: 'PO under approval',
  pending_grn: 'Pending GRN',
  grn_completed: 'GRN completed',
  cancelled: 'Cancelled',
};

/**
 * Where a line may go next, and who may move it.
 *
 * Written as data rather than as `if` statements in the action, because the thing that goes wrong
 * is not one bad transition — it is the fourth caller that forgets a rule the first three
 * enforced. `canMove` is the only thing allowed to answer this question.
 *
 * `closed` is terminal here. Nothing reopens a closed line; a correction after close is a new
 * cycle's problem, which is what the 25th-to-25th boundary is for.
 */
const MOVES: Record<CycleStage, { to: CycleStage; by: ('buyer' | 'ops')[] }[]> = {
  awaiting_supplier: [
    /* Ops can fill a line in themselves. Most of the Kuwait register is vehicles on a standing
       rate where the supplier has nothing to add, and the tracker's own flow is "copy last
       month, Ops confirm" with no supplier step at all. */
    { to: 'submitted', by: ['ops'] },
  ],
  submitted: [
    { to: 'validated', by: ['ops'] },
    { to: 'returned', by: ['ops', 'buyer'] },
  ],
  validated: [
    { to: 'closed', by: ['buyer'] },
    /* A buyer who finds a validated line wrong sends it back rather than editing it: the
       validation is somebody's statement about what was used, and silently overwriting it loses
       who said what. */
    { to: 'returned', by: ['buyer'] },
  ],
  returned: [{ to: 'submitted', by: ['ops'] }],
  closed: [],
};

export function canMove(from: CycleStage, to: CycleStage, role: 'buyer' | 'ops'): boolean {
  return MOVES[from].some((m) => m.to === to && m.by.includes(role));
}

/** Every stage this role can move a line to from here. Drives which buttons are drawn. */
export function movesFor(from: CycleStage, role: 'buyer' | 'ops'): CycleStage[] {
  return MOVES[from].filter((m) => m.by.includes(role)).map((m) => m.to);
}

/* ─── money ──────────────────────────────────────────────────────────────────────────────── */

/**
 * What a line costs this cycle.
 *
 * Quantity times rate, and NOT scaled by days. The tracker shows Days and Qty as separate
 * columns and multiplies neither into the other: two vehicles for ten days is qty 2, days 10, on
 * a monthly rate. Pro-rating a part month is a commercial decision somebody takes and types into
 * the quantity, not an arithmetic one this function is entitled to make on their behalf.
 *
 * Mirrors the generated `value` column in rrsm_cycle_lines, so the browser and the database agree
 * without a round trip.
 */
export function lineValue(qty: number | null, rate: number | null): number {
  return (Number(qty) || 0) * (Number(rate) || 0);
}

export interface Comparable {
  qty: number | null;
  rate: number | null;
}

export interface Delta {
  /** Positive when this cycle is dearer. Null when there is nothing to compare against. */
  amount: number | null;
  /** Fractional change, so 0.1 is ten percent dearer. Null when last month was zero or absent. */
  fraction: number | null;
  /** 'new' when the line did not exist last cycle — not a 100% rise. */
  kind: 'new' | 'same' | 'up' | 'down';
}

/**
 * This cycle against last, as the tracker's "vs last month" column reads it.
 *
 * A line with no previous row is `new`, NOT a rise from zero. The distinction is the whole point
 * of the column: a hundred percent increase and an asset that has never been billed before are
 * different things, and a reader scanning for runaway cost should not have to tell them apart by
 * eye. Same for a previous value of zero — the fraction would be infinite, so it stays null and
 * the amount carries the story.
 */
export function compareToPrevious(now: Comparable, previous: Comparable | null): Delta {
  const current = lineValue(now.qty, now.rate);
  if (!previous) return { amount: null, fraction: null, kind: 'new' };

  const before = lineValue(previous.qty, previous.rate);
  const amount = current - before;
  const fraction = before === 0 ? null : amount / before;

  if (amount === 0) return { amount: 0, fraction: 0, kind: 'same' };
  return { amount, fraction, kind: amount > 0 ? 'up' : 'down' };
}

/**
 * Does the supplier's invoice match what Ops validated?
 *
 * The tracker states the rule in one sentence and leaves the tolerance unsaid, so a tolerance is
 * taken rather than invented: equality to the minor unit. Rates in the register carry three
 * decimals and currencies here have two or three, so comparing raw floats would report a mismatch
 * on 0.0000000001 and send somebody to argue with a supplier about nothing.
 */
export function invoiceMatches(
  validated: number | null,
  invoice: number | null,
  tolerance = 0.005,
): 'match' | 'mismatch' | 'awaiting' {
  if (invoice === null || invoice === undefined) return 'awaiting';
  return Math.abs((Number(validated) || 0) - Number(invoice)) <= tolerance ? 'match' : 'mismatch';
}

/* ─── the cycle window ───────────────────────────────────────────────────────────────────── */

/**
 * The 25th-to-25th window a month's cycle runs over.
 *
 * `period` is the month the cycle is NAMED after, and the window ENDS in it: the October cycle
 * runs 26 September to 25 October, which is what the Monthly Cost Approval header shows. Getting
 * this backwards would label every cycle a month early, and the error is invisible until somebody
 * reconciles against an invoice.
 *
 * Dates are built in UTC. A cycle boundary is a date on a calendar, not an instant, and letting
 * the server's timezone decide it would move the 25th by a day for anyone east of London.
 */
export function cycleWindow(period: Date): { opensOn: Date; closesOn: Date } {
  const year = period.getUTCFullYear();
  const month = period.getUTCMonth();
  return {
    opensOn: new Date(Date.UTC(year, month - 1, 26)),
    closesOn: new Date(Date.UTC(year, month, 25)),
  };
}

/** `yyyy-mm-dd`, which is how every date crosses into a browser here. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'October 2026', for a heading. */
export function periodLabel(period: Date): string {
  return period.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
