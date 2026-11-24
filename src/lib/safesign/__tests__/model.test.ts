import { describe, expect, it } from 'vitest';
import { compliance, daysBetween, displayStatus, reminderDue } from '../model';

const base = {
  status: 'pending' as const,
  deadline: '2026-12-10',
  remindDaysBefore: [3, 1],
  overdueEveryDays: 2,
  lastRemindedDay: null,
};

describe('reminderDue', () => {
  it('reminds on the listed days before the deadline only', () => {
    expect(reminderDue({ ...base, today: '2026-12-07' })).toBe(true);
    expect(reminderDue({ ...base, today: '2026-12-08' })).toBe(false);
    expect(reminderDue({ ...base, today: '2026-12-09' })).toBe(true);
    expect(reminderDue({ ...base, today: '2026-12-10' })).toBe(false);
  });

  it('reminds every N days once overdue, counted from the deadline', () => {
    expect(reminderDue({ ...base, today: '2026-12-11' })).toBe(false);
    expect(reminderDue({ ...base, today: '2026-12-12' })).toBe(true);
    expect(reminderDue({ ...base, today: '2026-12-14' })).toBe(true);
    expect(reminderDue({ ...base, overdueEveryDays: 0, today: '2026-12-12' })).toBe(false);
  });

  it('never reminds twice on one day, nor once the supplier has answered', () => {
    expect(reminderDue({ ...base, today: '2026-12-07', lastRemindedDay: '2026-12-07' })).toBe(false);
    expect(reminderDue({ ...base, status: 'completed', today: '2026-12-07' })).toBe(false);
    expect(reminderDue({ ...base, status: 'under_review', today: '2026-12-12' })).toBe(false);
    expect(reminderDue({ ...base, status: 'changes_requested', today: '2026-12-12' })).toBe(true);
  });
});

describe('displayStatus and compliance', () => {
  it('derives overdue from the deadline', () => {
    expect(displayStatus('pending', '2026-12-10', '2026-12-11')).toBe('overdue');
    expect(displayStatus('pending', '2026-12-10', '2026-12-10')).toBe('pending');
    expect(displayStatus('completed', '2026-12-10', '2026-12-20')).toBe('completed');
    expect(displayStatus('pending', '2026-12-10', '2026-12-20', false)).toBe('not_sent');
  });

  it('counts completed out of sent', () => {
    expect(compliance(['completed', 'pending', 'under_review', 'completed'])).toEqual({ done: 2, total: 4, pct: 50 });
    expect(compliance([])).toEqual({ done: 0, total: 0, pct: 0 });
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
