import { describe, expect, it } from 'vitest';
import {
  COVERED_STATUSES,
  COVERED_STATUS_SQL,
  countsTowardCoverage,
  isAwaitingReply,
  isAwaitingVerification,
  isResolved,
} from '@/lib/soa/status';

const DEADLINE = new Date('2026-10-31T00:00:00Z');
const BEFORE = new Date('2026-10-30T12:00:00Z');
const AFTER = new Date('2026-11-01T09:00:00Z');

/**
 * Coverage is the figure the quarter is judged on, so what does and does not count is pinned here
 * rather than left to whichever screen happens to compute it.
 */
describe('countsTowardCoverage', () => {
  it('counts a statement in hand', () => {
    expect(countsTowardCoverage('received')).toBe(true);
  });

  it('counts a balance the champion established is nil', () => {
    // There was never a statement to collect, so withholding the credit would measure our
    // paperwork rather than the account.
    expect(countsTowardCoverage('nil_balance')).toBe(true);
  });

  it('never counts silence', () => {
    // Counting a vendor who never answered is the one thing the exercise exists to stop.
    expect(countsTowardCoverage('non_responder')).toBe(false);
  });

  it('counts nothing that is still in flight', () => {
    for (const status of ['scoped', 'requested', 'reminded']) {
      expect(countsTowardCoverage(status), status).toBe(false);
    }
  });

  it('builds its SQL list from the same constant it answers from', () => {
    for (const status of COVERED_STATUSES) expect(COVERED_STATUS_SQL).toContain(`'${status}'`);
    expect(COVERED_STATUS_SQL).not.toContain('non_responder');
  });
});

describe('isResolved', () => {
  it('is true for every way a vendor can be closed', () => {
    for (const status of ['received', 'nil_balance', 'non_responder']) {
      expect(isResolved(status), status).toBe(true);
    }
  });

  it('is false while anything is still owed', () => {
    for (const status of ['scoped', 'requested', 'reminded']) {
      expect(isResolved(status), status).toBe(false);
    }
  });
});

describe('isAwaitingVerification', () => {
  it('is false before the deadline, whatever the status', () => {
    expect(isAwaitingVerification('reminded', DEADLINE, BEFORE)).toBe(false);
    expect(isAwaitingVerification('requested', DEADLINE, BEFORE)).toBe(false);
  });

  it('is true after it for a vendor that was asked and stayed silent', () => {
    expect(isAwaitingVerification('requested', DEADLINE, AFTER)).toBe(true);
    expect(isAwaitingVerification('reminded', DEADLINE, AFTER)).toBe(true);
  });

  it('never applies to a vendor nobody wrote to', () => {
    // Calling it a non-responder would hide our own omission inside the supplier's column.
    expect(isAwaitingReply('scoped')).toBe(false);
    expect(isAwaitingVerification('scoped', DEADLINE, AFTER)).toBe(false);
  });

  it('never applies to a vendor that is already closed', () => {
    for (const status of ['received', 'nil_balance', 'non_responder']) {
      expect(isAwaitingVerification(status, DEADLINE, AFTER), status).toBe(false);
    }
  });

  it('does not throw on a cycle with no usable deadline', () => {
    expect(isAwaitingVerification('reminded', null, AFTER)).toBe(false);
    expect(isAwaitingVerification('reminded', new Date('not a date'), AFTER)).toBe(false);
  });
});
