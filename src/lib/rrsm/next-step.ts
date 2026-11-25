import type { CycleStage } from './cycle';
import { prNeedsCheck, type PrAutoReason } from './sap';

/**
 * What the buyer should do next on PR & PO (user request, 25 Nov 2026).
 *
 * Pure: from the month's lines and the country's steps, the open actions in the order they
 * unblock the month. The page shows the first one as the banner, with the button that does it,
 * and the rest as "also waiting". Order: things only the buyer can unblock first (returned lines,
 * rate decisions, sending to Ops), then the PR work, then closing; waiting on others last.
 */

export interface NextLine {
  stage: CycleStage;
  changeStatus: 'pending' | 'accepted' | 'rejected' | null;
  returnedTo: 'buyer' | 'ops' | 'supplier' | null;
  opsSentAt: string | null;
  opsValidator: { email: string } | null;
  prNumber: string;
  prAuto: PrAutoReason | null;
  poNumber: string;
}

/** What the banner's button does. The page maps each to its own handler. */
export type NextDo =
  | { kind: 'sendUsual' }
  | { kind: 'filter'; filter: 'supplier_change' | 'pr_check' | 'no_pr' | 'returned' | 'to_send' }
  | { kind: 'close' }
  | { kind: 'page'; path: '/rrsm/suppliers' }
  | { kind: 'none' };

export interface NextAction {
  key: string;
  /** 'act' = the buyer has to do it; 'wait' = it is with somebody else; 'done' = finished. */
  tone: 'act' | 'wait' | 'done';
  title: string;
  detail: string;
  button: string;
  do: NextDo;
  count: number;
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function nextActions(
  lines: NextLine[],
  steps: { supplier: boolean; ops: boolean },
): NextAction[] {
  const live = lines.filter((l) => l.stage !== 'closed');
  const out: NextAction[] = [];

  if (lines.length && !live.length) {
    return [
      {
        key: 'done',
        tone: 'done',
        title: 'The month is closed',
        detail: 'Every line has a PO and is closed. Nothing left to do until next month opens.',
        button: '',
        do: { kind: 'none' },
        count: 0,
      },
    ];
  }

  const returned = live.filter((l) => l.stage === 'returned' && l.returnedTo === 'buyer');
  if (returned.length) {
    out.push({
      key: 'returned',
      tone: 'act',
      title: `${plural(returned.length, 'line')} returned by Ops`,
      detail: 'Read the reason on each line, sort it out, then send it to Ops again.',
      button: 'Show them',
      do: { kind: 'filter', filter: 'returned' },
      count: returned.length,
    });
  }

  const changes = live.filter((l) => l.changeStatus === 'pending');
  if (changes.length) {
    out.push({
      key: 'changes',
      tone: 'act',
      title: `${plural(changes.length, 'supplier rate change')} to decide`,
      detail: 'Accept or reject each one; nothing can be validated until you do.',
      button: 'Show them',
      do: { kind: 'filter', filter: 'supplier_change' },
      count: changes.length,
    });
  }

  if (steps.ops) {
    /* Ready for Ops: past the supplier step, not yet sent, not returned to the buyer (above). */
    const toSend = live.filter(
      (l) => l.stage === 'submitted' && !l.opsSentAt && l.changeStatus !== 'pending',
    );
    const usual = toSend.filter((l) => l.opsValidator).length;
    if (usual) {
      out.push({
        key: 'send-usual',
        tone: 'act',
        title: `${plural(usual, 'line')} ready for Ops`,
        detail:
          toSend.length > usual
            ? `Send them to their usual validators; ${toSend.length - usual} more need a validator picked.`
            : 'Send them to their usual validators in one click.',
        button: `Send ${usual} to usual validators`,
        do: { kind: 'sendUsual' },
        count: usual,
      });
    } else if (toSend.length) {
      out.push({
        key: 'send-pick',
        tone: 'act',
        title: `${plural(toSend.length, 'line')} ready for Ops, with no validator yet`,
        detail: 'Tick them and pick who validates them from the directory.',
        button: 'Show them',
        do: { kind: 'filter', filter: 'to_send' },
        count: toSend.length,
      });
    }
  }

  const check = live.filter((l) => prNeedsCheck(l.prAuto));
  if (check.length) {
    out.push({
      key: 'pr-check',
      tone: 'act',
      title: `${plural(check.length, 'PR')} linked by RRSM to check`,
      detail: 'RRSM was not certain of these. Confirm each one, or Change it.',
      button: 'Show them',
      do: { kind: 'filter', filter: 'pr_check' },
      count: check.length,
    });
  }

  /* Lines still at a supplier (or Ops) have their PR linked later; count only the ones the buyer
     could link now, and all of them where nobody validates. */
  const noPr = live.filter((l) => !l.prNumber);
  if (noPr.length) {
    out.push({
      key: 'no-pr',
      tone: 'act',
      title: `${plural(noPr.length, 'line')} with no PR`,
      detail:
        'RRSM links a PR once SAP has a PO from the supplier. Link the rest by hand: Link PR on the line.',
      button: 'Show them',
      do: { kind: 'filter', filter: 'no_pr' },
      count: noPr.length,
    });
  }

  const ready = live.filter((l) => l.stage === 'validated' && l.poNumber);
  if (ready.length) {
    out.push({
      key: 'close',
      tone: 'act',
      title: `${plural(ready.length, 'line')} ready to close`,
      detail: 'Validated and on a PO.',
      button: `Close ${ready.length}`,
      do: { kind: 'close' },
      count: ready.length,
    });
  }

  /* Waiting on others: shown so the buyer knows, after everything they can act on. */
  if (steps.supplier) {
    const atSupplier = live.filter((l) => l.stage === 'awaiting_supplier').length;
    if (atSupplier) {
      out.push({
        key: 'suppliers',
        tone: 'wait',
        title: `${plural(atSupplier, 'line')} waiting on suppliers`,
        detail: 'Invite anyone not asked yet, and remind anyone who has not submitted.',
        button: 'Supplier validation',
        do: { kind: 'page', path: '/rrsm/suppliers' },
        count: atSupplier,
      });
    }
  }
  if (steps.ops) {
    const atOps = live.filter(
      (l) =>
        l.opsSentAt &&
        (l.stage === 'submitted' || (l.stage === 'returned' && l.returnedTo === 'ops')),
    ).length;
    if (atOps) {
      out.push({
        key: 'ops',
        tone: 'wait',
        title: `${plural(atOps, 'line')} with Ops validators`,
        detail: 'Sent and waiting for them to validate.',
        button: '',
        do: { kind: 'none' },
        count: atOps,
      });
    }
  }
  const awaitingPo = live.filter(
    (l) => l.stage === 'validated' && !l.poNumber && l.prNumber,
  ).length;
  if (awaitingPo) {
    out.push({
      key: 'po',
      tone: 'wait',
      title: `${plural(awaitingPo, 'line')} waiting for a PO in SAP`,
      detail: 'Their PR is linked; the PO fills in once SAP has it.',
      button: '',
      do: { kind: 'none' },
      count: awaitingPo,
    });
  }
  return out;
}
