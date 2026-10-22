/**
 * What actually happened at each step of an approval chain.
 *
 * The chain's steps are keyed by the status a request SITS IN while it waits for that approver,
 * not the status it reaches when the approver acts. That is a sensible key and a terrible thing to
 * show a reader: the first block's key is 'Submitted', so for its whole life it announced "new
 * request submitted; awaiting country finance controller approval", including long after the
 * controller had approved and the request had moved two steps past her.
 *
 * So the blocks are given their outcomes instead, and the outcomes come from the activity log,
 * which has carried the actor, the timestamp, the comment and the delegation all along and was
 * only ever shown as a flat list at the bottom of the page.
 *
 * Pure, and separately tested: it reconstructs history by replaying transitions, and the ways that
 * can go wrong (a resubmission after rejection, a legacy record that passed through 'Under Review')
 * are exactly the ones nobody would notice on screen.
 */

import type { ProcureGuardWorkflowStep } from '@/lib/procureGuard-utils';

/** Only the fields of an activity row this needs, so a test does not have to forge the rest. */
export interface ChainActivityRow {
  action: string;
  actor_name?: string | null;
  actor_email?: string | null;
  notes?: string | null;
  on_behalf_of_name?: string | null;
  created_at: string;
}

/**
 * The chain, and which pass through it the reader is looking at.
 *
 * `round` is 1 until a rejected request is fixed and sent round again, then 2, and so on. It
 * exists because "awaiting Country SCM" and "awaiting Country SCM AGAIN, after the SAP team
 * sent it back" are different sentences, and the screen was only able to say the first.
 */
export interface ChainProgress {
  outcomes: Map<number, StepOutcome>;
  round: number;
  /** The rejection that ended the previous round. Null on the first pass. */
  lastRejection: StepOutcome | null;
}

export interface StepOutcome {
  kind: 'approved' | 'rejected' | 'cancelled';
  /** Who acted. Falls back to the email, then to 'Unknown', so a block never renders blank. */
  actor: string;
  /** Set only when the actor used somebody else's delegated authority. */
  onBehalfOf: string | null;
  at: string;
  comment: string | null;
}

const TRANSITION = /^Status updated to\s+(.+)$/i;

/**
 * What a resubmission after rejection looks like in the log.
 *
 * This is the row that starts a new round, and getting it wrong is what made a request read
 * "Country SCM: Approved / SAP Team: Rejected" while it sat waiting for the SCM again.
 *
 * The reset used to key on a transition to 'Submitted'. Nothing writes one. A resubmission
 * does NOT go through updateStatusCommon: `updateAdhocPaymentRequest` calls
 * `resetRejectedRequest`, which sets the status with a direct UPDATE, and logs
 * "Adhoc PO resubmitted after rejection". So the chain never saw a reason to clear, and
 * carried the dead round forever.
 *
 * Matched on the tail rather than the whole string because the prefix names the request type
 * -- "Adhoc PO" or "Advance payment" -- and a third type would otherwise be missed in the same
 * silent way.
 */
const RESUBMISSION = /resubmitted after rejection$/i;

/**
 * Replay the log and hand each step the decision that closed it.
 *
 * Returned by step index rather than by status, because two steps of a legacy adhoc chain can
 * share a label and the index is the only thing that is certainly unique.
 */
export function resolveChainProgress(
  steps: ProcureGuardWorkflowStep[],
  activity: ChainActivityRow[],
): ChainProgress {
  const outcomes = new Map<number, StepOutcome>();
  let round = 1;
  let lastRejection: StepOutcome | null = null;
  if (!steps.length) return { outcomes, round, lastRejection };

  const indexByStatus = new Map<string, number>();
  steps.forEach((step, i) => {
    if (!indexByStatus.has(step.status)) indexByStatus.set(step.status, i);
  });

  // Oldest first. The caller holds them newest-first for the activity list.
  const ordered = [...activity].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  let cursor = 0;
  /* Set by a rejection or a cancellation. The round is over at that point, so nothing is read
     again until a resubmission starts a new one. Breaking out of the loop instead would mean a
     request that was rejected, fixed and sent round again still showed the old rejection on a
     step that is now waiting. */
  let halted = false;

  for (const row of ordered) {
    const action = row.action.trim();

    /* The real reset. Checked before the transition regex, which this row does not match. */
    if (RESUBMISSION.test(action)) {
      lastRejection = [...outcomes.values()].find((o) => o.kind === 'rejected') ?? lastRejection;
      outcomes.clear();
      cursor = 0;
      halted = false;
      round += 1;
      continue;
    }

    const match = TRANSITION.exec(action);
    if (!match) continue;
    const to = match[1].trim();

    /* A legacy record moving from 'Submitted' to 'Under Review' changed hands with nobody: it is
       the same reviewer picking the request up, and the two were collapsed into one step. Treating
       it as an approval would credit the first approver with a decision they had not yet made. */
    if (to === 'Under Review' && !indexByStatus.has('Under Review')) continue;

    /* A rejected request can be fixed and sent round again, which starts the chain over. The
       previous round stays in the activity log, where a history belongs; the chain shows the round
       that is live, or it would claim a step was rejected while the request sits awaiting it. */
    if (to === 'Submitted') {
      outcomes.clear();
      cursor = 0;
      halted = false;
      round += 1;
      continue;
    }

    if (halted || cursor >= steps.length) continue;

    const decision: StepOutcome = {
      kind: to === 'Rejected' ? 'rejected' : to === 'Cancelled' ? 'cancelled' : 'approved',
      actor: row.actor_name || row.actor_email || 'Unknown',
      onBehalfOf: row.on_behalf_of_name || null,
      at: row.created_at,
      comment: row.notes?.trim() || null,
    };
    outcomes.set(cursor, decision);

    // A rejection or a cancellation ends the round where it stands; nothing below it was reached.
    if (decision.kind !== 'approved') {
      halted = true;
      continue;
    }
    cursor = indexByStatus.get(to) ?? cursor + 1;
  }

  return { outcomes, round, lastRejection };
}

/** How long a step has been waiting, in whole days, for the "waiting 6 days" line. */
export function daysWaiting(since: string, now: Date = new Date()): number {
  const from = new Date(since).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((now.getTime() - from) / 86_400_000));
}

/**
 * When the step that is waiting now started waiting: the moment the step before it was approved,
 * or the request's own creation for the first step.
 */
export function waitingSince(
  outcomes: Map<number, StepOutcome>,
  currentIndex: number,
  createdAt: string | null | undefined,
): string | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const previous = outcomes.get(i);
    if (previous) return previous.at;
  }
  return createdAt ?? null;
}
