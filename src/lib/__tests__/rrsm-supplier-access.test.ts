import { describe, expect, it } from 'vitest';
import { maskEmail } from '@/lib/rrsm/supplier-access';
import { canMove, movesFor } from '@/lib/rrsm/cycle';

/**
 * The supplier's way in, and what they may do once they are in.
 *
 * Two separate guarantees, tested together because they fail together: the mask is what stops a
 * forwarded link becoming a directory of the supplier's addresses, and the transition rules are
 * what stop whoever holds the link doing more than confirm their own month.
 */

describe('maskEmail', () => {
  it('keeps enough for the owner to recognise their own address', () => {
    expect(maskEmail('ahmed@arabco.com')).toBe('ahm•••••@ara•••••.com');
  });

  it('distinguishes two addresses that share a first letter', () => {
    /* The whole reason three characters are shown rather than one: a supplier with both of these
       saw the same mask twice and had to guess which inbox the code went to. */
    expect(maskEmail('ahmed@arabco.com')).not.toBe(maskEmail('accounts@arabco.com'));
  });

  it('never shows the last character of either half', () => {
    const masked = maskEmail('abc@xyz.com');
    expect(masked).toBe('ab•••••@xy•••••.com');
  });

  it('shows nothing at all for a one-character part', () => {
    expect(maskEmail('a@b.com')).toBe('•••••@•••••.com');
  });

  it('hides the length, so the mask cannot be counted back into the address', () => {
    /* A fixed run of dots rather than one per hidden character. Two addresses of very different
       lengths must produce masks of the same length. */
    const short = maskEmail('ahmed@arabco.com');
    const long = maskEmail('ahmedalsomethinglong@arabco.com');
    expect(short.length).toBe(long.length);
  });

  it('survives a malformed address without throwing', () => {
    expect(() => maskEmail('not-an-email')).not.toThrow();
    expect(() => maskEmail('')).not.toThrow();
  });
});

describe('what a supplier may do', () => {
  it('can submit a line that is waiting on them', () => {
    expect(canMove('awaiting_supplier', 'submitted', 'supplier')).toBe(true);
  });

  it('can resubmit a line that was returned to them', () => {
    expect(canMove('returned', 'submitted', 'supplier')).toBe(true);
  });

  it('cannot validate its own submission', () => {
    /* The separation the tool exists for. A supplier saying "this is what you used" and also
       "and I confirm it" would make the Ops step decorative. */
    expect(canMove('submitted', 'validated', 'supplier')).toBe(false);
  });

  it('cannot close a line or put it on a PO', () => {
    expect(canMove('validated', 'closed', 'supplier')).toBe(false);
  });

  it('cannot return a line to anyone', () => {
    expect(canMove('submitted', 'returned', 'supplier')).toBe(false);
    expect(canMove('validated', 'returned', 'supplier')).toBe(false);
  });

  it('can do nothing at all once the line is closed', () => {
    expect(movesFor('closed', 'supplier')).toEqual([]);
  });

  it('has exactly one move from each stage it can act on, and none from the rest', () => {
    expect(movesFor('awaiting_supplier', 'supplier')).toEqual(['submitted']);
    expect(movesFor('returned', 'supplier')).toEqual(['submitted']);
    expect(movesFor('submitted', 'supplier')).toEqual([]);
    expect(movesFor('validated', 'supplier')).toEqual([]);
  });
});

describe('Ops are not weakened by the supplier existing', () => {
  it('can still submit on a supplier’s behalf when they do not reply', () => {
    /* A supplier who ignores the email must not be able to stall the cycle: most of the register
       is standing-rate vehicles where there is nothing for them to add anyway. */
    expect(canMove('awaiting_supplier', 'submitted', 'ops')).toBe(true);
  });

  it('still owns validation', () => {
    expect(canMove('submitted', 'validated', 'ops')).toBe(true);
  });
});
