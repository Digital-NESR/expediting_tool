import { describe, expect, it } from 'vitest';
import {
  canMove,
  compareToPrevious,
  cycleWindow,
  invoiceMatches,
  isoDate,
  lineValue,
  movesFor,
  periodLabel,
  type CycleStage,
} from '@/lib/rrsm/cycle';

describe('stage transitions', () => {
  it('lets Ops submit and validate, and a buyer close', () => {
    expect(canMove('awaiting_supplier', 'submitted', 'ops')).toBe(true);
    expect(canMove('submitted', 'validated', 'ops')).toBe(true);
    expect(canMove('validated', 'closed', 'buyer')).toBe(true);
  });

  it('does not let a buyer validate their own cycle', () => {
    /* The separation the whole tool exists for: Ops say what was used, the buyer pays for it. */
    expect(canMove('submitted', 'validated', 'buyer')).toBe(false);
  });

  it('does not let Ops close a line', () => {
    expect(canMove('validated', 'closed', 'ops')).toBe(false);
  });

  it('lets either side send a submitted line back', () => {
    expect(canMove('submitted', 'returned', 'ops')).toBe(true);
    expect(canMove('submitted', 'returned', 'buyer')).toBe(true);
  });

  it('makes a buyer return a wrong validated line rather than edit it', () => {
    expect(canMove('validated', 'returned', 'buyer')).toBe(true);
  });

  it('treats closed as terminal for both roles', () => {
    for (const role of ['buyer', 'ops'] as const) {
      expect(movesFor('closed', role)).toEqual([]);
      for (const to of [
        'awaiting_supplier',
        'submitted',
        'validated',
        'returned',
      ] as CycleStage[]) {
        expect(canMove('closed', to, role)).toBe(false);
      }
    }
  });

  it('never allows a move to a stage it does not list', () => {
    expect(canMove('awaiting_supplier', 'closed', 'ops')).toBe(false);
    expect(canMove('awaiting_supplier', 'validated', 'ops')).toBe(false);
    expect(canMove('returned', 'validated', 'ops')).toBe(false);
  });
});

describe('lineValue', () => {
  it('is quantity times rate', () => {
    expect(lineValue(2, 250)).toBe(500);
  });

  it('is not scaled by days — a part month is priced by a person, not by arithmetic', () => {
    // Two vehicles for ten days on a monthly rate is still qty x rate; days sit beside it.
    expect(lineValue(2, 250)).toBe(500);
  });

  it('treats null and nonsense as zero rather than NaN', () => {
    expect(lineValue(null, 250)).toBe(0);
    expect(lineValue(2, null)).toBe(0);
    expect(lineValue(null, null)).toBe(0);
  });
});

describe('compareToPrevious', () => {
  it('calls a line with no previous row new, not a rise from zero', () => {
    const d = compareToPrevious({ qty: 1, rate: 300 }, null);
    expect(d.kind).toBe('new');
    expect(d.amount).toBeNull();
    expect(d.fraction).toBeNull();
  });

  it('reports a rise as an amount and a fraction', () => {
    const d = compareToPrevious({ qty: 1, rate: 330 }, { qty: 1, rate: 300 });
    expect(d.kind).toBe('up');
    expect(d.amount).toBe(30);
    expect(d.fraction).toBeCloseTo(0.1);
  });

  it('reports a fall', () => {
    const d = compareToPrevious({ qty: 1, rate: 270 }, { qty: 1, rate: 300 });
    expect(d.kind).toBe('down');
    expect(d.amount).toBe(-30);
  });

  it('reports no change as same, with a zero rather than a null', () => {
    const d = compareToPrevious({ qty: 2, rate: 250 }, { qty: 2, rate: 250 });
    expect(d.kind).toBe('same');
    expect(d.amount).toBe(0);
    expect(d.fraction).toBe(0);
  });

  it('leaves the fraction null when last month was zero, rather than reporting infinity', () => {
    const d = compareToPrevious({ qty: 1, rate: 300 }, { qty: 0, rate: 300 });
    expect(d.kind).toBe('up');
    expect(d.amount).toBe(300);
    expect(d.fraction).toBeNull();
  });
});

describe('invoiceMatches', () => {
  it('waits when no invoice has arrived', () => {
    expect(invoiceMatches(500, null)).toBe('awaiting');
  });

  it('matches an exact invoice', () => {
    expect(invoiceMatches(500, 500)).toBe('match');
  });

  it('matches within the minor unit, so float noise is not a dispute', () => {
    expect(invoiceMatches(0.1 + 0.2, 0.3)).toBe('match');
  });

  it('flags a real difference', () => {
    expect(invoiceMatches(500, 520)).toBe('mismatch');
    expect(invoiceMatches(500, 499)).toBe('mismatch');
  });
});

describe('cycleWindow', () => {
  it('ends in the month the cycle is named after', () => {
    // The October 2026 cycle runs 26 Sep to 25 Oct, as the Monthly Cost Approval header shows.
    const { opensOn, closesOn } = cycleWindow(new Date(Date.UTC(2026, 9, 1)));
    expect(isoDate(opensOn)).toBe('2026-09-26');
    expect(isoDate(closesOn)).toBe('2026-10-25');
  });

  it('crosses a year boundary without drifting', () => {
    const { opensOn, closesOn } = cycleWindow(new Date(Date.UTC(2027, 0, 1)));
    expect(isoDate(opensOn)).toBe('2026-12-26');
    expect(isoDate(closesOn)).toBe('2027-01-25');
  });

  it('handles February, where the window is shorter than a month', () => {
    const { opensOn, closesOn } = cycleWindow(new Date(Date.UTC(2027, 1, 1)));
    expect(isoDate(opensOn)).toBe('2027-01-26');
    expect(isoDate(closesOn)).toBe('2027-02-25');
  });

  it('names the period after the month it closes in', () => {
    expect(periodLabel(new Date(Date.UTC(2026, 9, 1)))).toBe('October 2026');
  });
});
