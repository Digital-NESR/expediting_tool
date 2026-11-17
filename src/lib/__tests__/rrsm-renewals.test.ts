import { describe, expect, it } from 'vitest';
import {
  REMINDER_DAYS,
  REMINDER_LABEL,
  canChange,
  canDecide,
  daysUntil,
  dueReminder,
  extendedTo,
  isDue,
  isoDate,
  reachedSteps,
  urgencyOf,
} from '@/lib/rrsm/renewals';

const d = (s: string) => new Date(s + 'T00:00:00Z');
const TODAY = d('2026-11-16');

describe('daysUntil', () => {
  it('counts whole days ahead', () => {
    expect(daysUntil(d('2026-11-26'), TODAY)).toBe(10);
  });

  it('is zero on the day itself', () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil(d('2026-11-09'), TODAY)).toBe(-7);
  });

  it('is not thrown off by a month or year boundary', () => {
    expect(daysUntil(d('2027-01-01'), d('2026-12-31'))).toBe(1);
    expect(daysUntil(d('2026-03-01'), d('2026-02-28'))).toBe(1);
  });
});

describe('isDue', () => {
  it('is false well before the window', () => {
    expect(isDue(d('2027-06-01'), TODAY)).toBe(false);
  });

  it('is true exactly on the 90th day, not the 89th', () => {
    expect(isDue(d('2027-02-14'), TODAY)).toBe(true); // 90 days
    expect(isDue(d('2027-02-15'), TODAY)).toBe(false); // 91
  });

  it('stays true once overdue', () => {
    expect(isDue(d('2026-10-01'), TODAY)).toBe(true);
  });
});

describe('dueReminder', () => {
  it('sends nothing before the first step', () => {
    expect(dueReminder(d('2027-06-01'), TODAY, [])).toBeNull();
  });

  it('sends the 90-day notice when the window opens', () => {
    expect(dueReminder(d('2027-02-14'), TODAY, [])).toBe(90);
  });

  it('sends nothing more once that step is sent', () => {
    expect(dueReminder(d('2027-02-14'), TODAY, [90])).toBeNull();
  });

  it('sends the missed earlier notice rather than skipping to the closer one', () => {
    /* Nobody looked at this for two months. The subject line is the only thing that tells a
       reader how late it is, so it must not quietly start at 30 days. */
    expect(dueReminder(d('2026-12-10'), TODAY, [])).toBe(90);
  });

  it('walks down the steps as each is sent, and stops at the one not yet reached', () => {
    const due = d('2026-12-10'); // 24 days away
    expect(dueReminder(due, TODAY, [90])).toBe(60);
    expect(dueReminder(due, TODAY, [90, 60])).toBe(30);
    /* Nothing more today: 24 days out has not reached the 14-day step, so a renewal that has
       had its 30-day notice goes quiet until it does. */
    expect(dueReminder(due, TODAY, [90, 60, 30])).toBeNull();
    // Nine days out, it is reached.
    expect(dueReminder(due, d('2026-12-01'), [90, 60, 30])).toBe(14);
  });

  it('chases an overdue renewal once, then stops', () => {
    const overdue = d('2026-11-01');
    expect(dueReminder(overdue, TODAY, [90, 60, 30, 14, 7])).toBe(0);
    expect(dueReminder(overdue, TODAY, [90, 60, 30, 14, 7, 0])).toBeNull();
  });

  it('treats the expiry day itself as loud, not silent', () => {
    expect(REMINDER_DAYS).toContain(0);
    expect(dueReminder(TODAY, TODAY, [90, 60, 30, 14, 7])).toBe(0);
  });
});

describe('reachedSteps — what the daily job marks spent', () => {
  it('is empty before the window opens', () => {
    expect(reachedSteps(d('2027-06-01'), TODAY)).toEqual([]);
  });

  it('is every step the clock has passed, not just the closest', () => {
    expect(reachedSteps(d('2026-12-10'), TODAY)).toEqual([90, 60, 30]); // 24 days out
  });

  it('includes the expiry step once the date has gone', () => {
    expect(reachedSteps(d('2026-11-01'), TODAY)).toEqual([90, 60, 30, 14, 7, 0]);
  });

  it('has a label for every step, so no subject line reads "undefined"', () => {
    for (const step of REMINDER_DAYS) expect(REMINDER_LABEL[step]).toBeTruthy();
  });
});

describe('the daily run, walked day by day', () => {
  /* The property that matters operationally. `dueReminder` returns the earliest MISSED step, so
     a job that stamped only the step it sent would mail the 90-day notice today, the 60-day
     tomorrow and the 30-day the day after: three emails in three days about one contract. That
     is the ProcureGuard mistake. Stamping `reachedSteps` is what prevents it, and this walks the
     clock to prove it. */
  function walk(due: Date, days: number): string[] {
    let sent: number[] = [];
    const sentOn: string[] = [];
    for (let i = 0; i < days; i += 1) {
      const today = new Date(TODAY.getTime() + i * 86_400_000);
      const step = dueReminder(due, today, sent);
      if (step === null) continue;
      sentOn.push(`${isoDate(today)}:${step}`);
      sent = [...new Set([...sent, ...reachedSteps(due, today)])];
    }
    return sentOn;
  }

  it('sends one email, not three, for a renewal nobody has looked at', () => {
    /* 24 days out with nothing sent: steps 90, 60 and 30 have all been missed. */
    expect(walk(d('2026-12-10'), 10)).toEqual(['2026-11-16:90']);
  });

  it('still says 90 rather than quietly starting at 30', () => {
    /* The subject line is the only thing that tells a reader how late the process is. */
    expect(walk(d('2026-12-10'), 1)[0]).toContain(':90');
  });

  it('speaks again only when the clock reaches a step it has not used', () => {
    // Ten more days takes it to 14 days out, which is the next unreached step.
    expect(walk(d('2026-12-10'), 15)).toEqual(['2026-11-16:90', '2026-11-26:14']);
  });

  it('runs the full schedule for a renewal caught at the start of the window', () => {
    const due = d('2027-02-14'); // exactly 90 days away
    expect(walk(due, 95)).toEqual([
      '2026-11-16:90',
      '2026-12-16:60',
      '2027-01-15:30',
      '2027-01-31:14',
      '2027-02-07:7',
      '2027-02-14:0',
    ]);
  });

  it('chases an expired contract once and then stops', () => {
    /* Everything is missed at once; it says so, and never mails again. */
    expect(walk(d('2026-11-10'), 30)).toEqual(['2026-11-16:90']);
  });
});

describe('urgencyOf', () => {
  it('ranks by how close the date is', () => {
    expect(urgencyOf(d('2026-11-01'), TODAY)).toBe('overdue');
    expect(urgencyOf(d('2026-11-25'), TODAY)).toBe('urgent');
    expect(urgencyOf(d('2026-12-20'), TODAY)).toBe('soon');
    expect(urgencyOf(d('2027-02-01'), TODAY)).toBe('ahead');
  });

  it('calls the day itself urgent rather than overdue', () => {
    expect(urgencyOf(TODAY, TODAY)).toBe('urgent');
  });
});

describe('extendedTo', () => {
  it('moves twelve months from the due date', () => {
    expect(isoDate(extendedTo(d('2026-12-31')))).toBe('2027-12-31');
  });

  it('runs from the due date, not from today, so anniversaries do not drift', () => {
    /* A renewal decided three weeks late must still land on the original anniversary. Otherwise
       a few years of late decisions walk the date away from the contract it was signed beside. */
    const due = d('2026-10-01');
    expect(isoDate(extendedTo(due))).toBe('2027-10-01');
  });

  it('handles a leap day by rolling into March, rather than failing', () => {
    expect(isoDate(extendedTo(d('2028-02-29')))).toBe('2029-03-01');
  });
});

describe('who may decide', () => {
  it('lets a buyer and an admin decide', () => {
    expect(canDecide({ canBuy: true, isAdmin: false })).toBe(true);
    expect(canDecide({ canBuy: false, isAdmin: true })).toBe(true);
  });

  it('does not let a validator commit another twelve months', () => {
    /* Ops confirm what was used. Signing up for another year is a commercial decision. */
    expect(canDecide({ canBuy: false, isAdmin: false })).toBe(false);
  });

  it('makes a decision final', () => {
    expect(canChange('pending')).toBe(true);
    expect(canChange('extended')).toBe(false);
    expect(canChange('scope_change')).toBe(false);
    expect(canChange('not_extended')).toBe(false);
  });
});
