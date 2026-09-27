import { describe, expect, it } from 'vitest';
import { maskEmail } from '@/lib/soa/upload-access';

/**
 * The masked list is shown to whoever holds the link, including somebody it was forwarded to. It
 * has to be recognisable to the real recipient and useless to anybody else.
 */
describe('maskEmail', () => {
  it('keeps enough for the owner to recognise their own address', () => {
    expect(maskEmail('ahmed@arabco.com')).toBe('a••••@a•••••.com');
  });

  it('never reveals the local part beyond its first character', () => {
    const masked = maskEmail('accounts.payable@supplier.co.uk');
    expect(masked.startsWith('a')).toBe(true);
    expect(masked).not.toContain('ccounts');
    expect(masked).not.toContain('payable');
  });

  it('never reveals the domain beyond its first character', () => {
    const masked = maskEmail('ap@arabcointernational.com');
    expect(masked).not.toContain('rabcointernational');
  });

  it('keeps the top-level domain, which is not a secret and aids recognition', () => {
    expect(maskEmail('ap@vendor.co.uk').endsWith('.uk')).toBe(true);
    expect(maskEmail('ap@vendor.com').endsWith('.com')).toBe(true);
  });

  it('does not leak the length of a short local part', () => {
    // Two addresses differing only in length must not be distinguishable by counting dots.
    expect(maskEmail('a@vendor.com')).toBe(maskEmail('ab@vendor.com'));
  });

  it('distinguishes two different addresses at the same vendor', () => {
    // The whole point is that the recipient can pick theirs out of the list.
    expect(maskEmail('ahmed@arabco.com')).not.toBe(maskEmail('bilal@arabco.com'));
  });

  it('does not throw on a malformed address', () => {
    expect(() => maskEmail('not-an-email')).not.toThrow();
    expect(() => maskEmail('')).not.toThrow();
  });
});
