import type { CycleStage } from './cycle';

/**
 * Which validation steps a country's monthly cycle runs, and where a line goes when one is off.
 *
 * Set per country by an RRSM admin (rrsm_countries.supplier_validation / ops_validation). The
 * stages themselves do not change: a step that is off is simply passed through, so a line that
 * would have waited on it moves straight on. With both off, a cycle opens at "validated" and the
 * buyer goes straight to the PO.
 *
 * Pure, so the open, submit and review actions and the admin's "apply to this month" all move
 * lines by the same rules.
 */

export interface CycleSteps {
  /** Suppliers confirm their month through the emailed link. */
  supplier: boolean;
  /** Ops validate what was used before the buyer puts it on a PO. */
  ops: boolean;
}

export const ALL_STEPS: CycleSteps = { supplier: true, ops: true };

/** Where a line starts when a cycle opens. */
export function openingStage(steps: CycleSteps): CycleStage {
  if (steps.supplier) return 'awaiting_supplier';
  return steps.ops ? 'submitted' : 'validated';
}

/**
 * Where a line goes when the supplier submits it. A proposed rate or pricing unit always waits at
 * "submitted" for a buyer, whatever the steps: nobody should validate terms nobody has agreed.
 */
export function stageAfterSupplier(steps: CycleSteps, pendingChange: boolean): CycleStage {
  if (pendingChange) return 'submitted';
  return steps.ops ? 'submitted' : 'validated';
}

/** After a buyer decides on a supplier's change: on to "validated" only when Ops are not a step. */
export function stageAfterBuyerDecision(steps: CycleSteps): CycleStage | null {
  return steps.ops ? null : 'validated';
}

/**
 * Where an existing line should be once a step is switched off mid-cycle, or null to leave it.
 * Only moves forward, never back: switching a step on again does not un-validate anything.
 */
export function fastForward(
  steps: CycleSteps,
  stage: CycleStage,
  pendingChange: boolean,
): CycleStage | null {
  if (stage === 'awaiting_supplier' && !steps.supplier) {
    return pendingChange ? 'submitted' : steps.ops ? 'submitted' : 'validated';
  }
  if (stage === 'submitted' && !steps.ops && !pendingChange) return 'validated';
  return null;
}

/** One line for the admin screen and the cycle pages. */
export function describeSteps(steps: CycleSteps): string {
  if (steps.supplier && steps.ops) return 'Supplier validation → Ops validation → PR & PO';
  if (steps.supplier) return 'Supplier validation → PR & PO';
  if (steps.ops) return 'Ops validation → PR & PO';
  return 'Straight to PR & PO';
}
