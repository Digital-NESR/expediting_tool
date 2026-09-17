import { describe, expect, it } from 'vitest';
import {
  complianceCriteria,
  reminderGapDays,
  reminderInWindow,
  type ComplianceVendor,
} from '@/lib/soa/compliance';

/**
 * These four criteria decide whether a country's quarter may be handed to Finance, and the same
 * verdicts are printed into the evidence pack an auditor reads. Three of them were hardcoded to
 * pass in the prototype, so the cases below are chosen to prove each one can actually FAIL, and
 * that a criterion which cannot be measured says so rather than passing quietly.
 */

const day = 86_400_000;
const at = (offsetDays: number) => new Date(Date.UTC(2026, 6, 1) + offsetDays * day).toISOString();

function vendor(overrides: Partial<ComplianceVendor> = {}): ComplianceVendor {
  return {
    status: 'requested',
    reqDate: '01 Jul',
    remDate: '13 Jul',
    requestedAt: at(0),
    remindedAt: at(12),
    ...overrides,
  };
}

const state = (vendors: ComplianceVendor[], pct = 80, target = 70) =>
  Object.fromEntries(
    complianceCriteria(vendors, pct, pct >= target, target, 95).map((c) => [c.label, c.state]),
  );

describe('reminderGapDays', () => {
  it('counts whole elapsed days', () => {
    expect(reminderGapDays(vendor({ requestedAt: at(0), remindedAt: at(12) }))).toBe(12);
  });

  it('floors a part day rather than rounding it up', () => {
    // Nine days and twenty-three hours has not waited ten.
    const nearly = new Date(Date.UTC(2026, 6, 1) + 10 * day - 3600_000).toISOString();
    expect(reminderGapDays(vendor({ requestedAt: at(0), remindedAt: nearly }))).toBe(9);
  });

  it('is null when either moment is missing', () => {
    expect(reminderGapDays(vendor({ remindedAt: null }))).toBeNull();
    expect(reminderGapDays(vendor({ requestedAt: null }))).toBeNull();
  });
});

describe('reminderInWindow', () => {
  it('accepts both boundaries', () => {
    expect(reminderInWindow(vendor({ remindedAt: at(10) }))).toBe(true);
    expect(reminderInWindow(vendor({ remindedAt: at(14) }))).toBe(true);
  });

  it('rejects a reminder sent too soon, not only one sent too late', () => {
    // The window exists to give the vendor a fair chance to answer, so early is also a breach.
    expect(reminderInWindow(vendor({ remindedAt: at(9) }))).toBe(false);
    expect(reminderInWindow(vendor({ remindedAt: at(15) }))).toBe(false);
  });
});

describe('complianceCriteria', () => {
  it('fails coverage when the cycle target is not met', () => {
    expect(state([vendor()], 55, 70)['18-Month PO Coverage']).toBe('fail');
    expect(state([vendor()], 70, 70)['18-Month PO Coverage']).toBe('pass');
  });

  it('judges coverage against the cycle target, not a hardcoded 70', () => {
    // A quarter opened at 95% must not pass on 80 just because 80 clears the usual number.
    expect(state([vendor()], 80, 95)['18-Month PO Coverage']).toBe('fail');
  });

  it('fails 2-request evidence when an unanswered vendor has no reminder', () => {
    const v = [vendor({ status: 'requested', remDate: null, remindedAt: null })];
    expect(state(v)['2-Request Evidence']).toBe('fail');
  });

  it('does not demand a second request from a vendor who already responded', () => {
    const v = [vendor({ status: 'received', remDate: null, remindedAt: null })];
    expect(state(v)['2-Request Evidence']).toBe('pass');
  });

  it('fails the gap test when a reminder fell outside the window', () => {
    expect(state([vendor({ remindedAt: at(20) })])['10–14 Day Gap Compliance']).toBe('fail');
  });

  it('reports the gap test as unknown when no reminder has been sent', () => {
    // Unknown, never pass: an unmeasurable control must not report success.
    const v = [vendor({ remDate: null, remindedAt: null })];
    expect(state(v)['10–14 Day Gap Compliance']).toBe('unknown');
  });

  it('does not count a vendor twice for one missing reminder', () => {
    // Missing reminder is the 2-request test's finding; the gap test abstains rather than piling on.
    const v = [vendor({ remDate: null, remindedAt: null })];
    const s = state(v);
    expect(s['2-Request Evidence']).toBe('fail');
    expect(s['10–14 Day Gap Compliance']).toBe('unknown');
  });

  it('fails non-responder documentation when one was flagged without a full trail', () => {
    const v = [vendor({ status: 'non_responder', reqDate: '—', requestedAt: null })];
    expect(state(v)['Non-Responder Documentation']).toBe('fail');
  });

  it('passes non-responder documentation when the trail is complete', () => {
    expect(state([vendor({ status: 'non_responder' })])['Non-Responder Documentation']).toBe(
      'pass',
    );
  });

  it('reports unknown rather than pass when no vendor is in scope', () => {
    const s = state([]);
    expect(s['2-Request Evidence']).toBe('unknown');
    expect(s['10–14 Day Gap Compliance']).toBe('unknown');
  });

  it('always returns the four criteria the SOP names', () => {
    expect(complianceCriteria([], 0, false, 70, 95).map((c) => c.label)).toEqual([
      '18-Month PO Coverage',
      '2-Request Evidence',
      '10–14 Day Gap Compliance',
      'Non-Responder Documentation',
    ]);
  });
});
