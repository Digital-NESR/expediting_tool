import { describe, expect, it } from 'vitest';
import { maxExpiryISO, todayISO, toISODate, parseISODate, addDays } from '../date';
import { isExpiryWithinCap, validateForSubmission } from '../validate';
import type { Draft } from '../types';

/** A draft that is complete apart from whatever the test is varying. */
function draftWithExpiry(expiry: string): Draft {
  return {
    cls: 'SGL',
    country: 'Iraq',
    level: 'Family',
    nodes: [{ cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Cement', com: '' }],
    segments: ['Cementing Services'],
    supplierId: '0001100576',
    supplierName: '3M GULF LTD',
    spend: '1000',
    reason: 'Active contract / master agreement',
    justification: 'Sole licensed distributor in country.',
    expiry,
  };
}

describe('the twelve-month expiry cap', () => {
  const cap = maxExpiryISO();

  it('is twelve calendar months out, not 365 days', () => {
    const t = parseISODate(todayISO());
    const expected = new Date(t.getTime());
    expected.setMonth(expected.getMonth() + 12);
    expect(cap).toBe(toISODate(expected));
  });

  it('accepts today, and the cap date itself', () => {
    expect(isExpiryWithinCap(todayISO())).toBe(true);
    expect(isExpiryWithinCap(cap)).toBe(true);
  });

  it('rejects the day after the cap', () => {
    expect(isExpiryWithinCap(toISODate(addDays(parseISODate(cap), 1)))).toBe(false);
  });

  it('rejects yesterday — an expiry already in the past is no expiry', () => {
    expect(isExpiryWithinCap(toISODate(addDays(parseISODate(todayISO()), -1)))).toBe(false);
  });

  it('rejects a date that does not exist', () => {
    expect(isExpiryWithinCap('2027-02-31')).toBe(false);
  });

  it('rejects a blank or malformed value', () => {
    for (const v of ['', '   ', 'next year', '2027-2-1', null, undefined]) {
      expect(isExpiryWithinCap(v)).toBe(false);
    }
  });
});

describe('validateForSubmission and the cap', () => {
  it('lets a complete draft inside the cap through', () => {
    expect(validateForSubmission(draftWithExpiry(maxExpiryISO()))).toEqual([]);
  });

  it('blocks submission when the expiry is beyond twelve months', () => {
    const tooFar = toISODate(addDays(parseISODate(maxExpiryISO()), 1));
    const missing = validateForSubmission(draftWithExpiry(tooFar));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('twelve months');
  });

  it('still reports a missing expiry as missing, not as out of range', () => {
    expect(validateForSubmission(draftWithExpiry(''))).toEqual(['expiry date']);
  });
});
