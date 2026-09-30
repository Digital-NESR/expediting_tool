import { describe, expect, it } from 'vitest';
import { maskEmail } from '@/lib/soa/upload-access';

/**
 * The masked list is shown to whoever holds the link, including somebody it was forwarded to. It
 * has to be recognisable to the real recipient and useless to anybody else.
 *
 * It showed one character of each half, which is not enough to choose by: a supplier whose two
 * addresses are `ahmed@` and `accounts@` saw the same thing twice. It shows three now, which is
 * more than it did, so the properties that keep it from becoming a directory are pinned here.
 */
describe('maskEmail', () => {
  it('keeps enough for the owner to recognise their own address', () => {
    expect(maskEmail('ahmed@arabco.com')).toBe('ahm•••••@ara•••••.com');
  });

  it('never reveals the local part beyond its first three characters', () => {
    const masked = maskEmail('accounts.payable@supplier.co.uk');
    expect(masked.startsWith('acc•')).toBe(true);
    expect(masked).not.toContain('ount');
    expect(masked).not.toContain('payable');
  });

  it('never reveals the domain beyond its first three characters', () => {
    const masked = maskEmail('ap@arabcointernational.com');
    expect(masked).not.toContain('bcointernational');
  });

  it('never shows the last character of a short part', () => {
    // 'ap' and 'ar' are real AP mailboxes. Three characters would print them whole.
    expect(maskEmail('ap@vendor.com')).toBe('a•••••@ven•••••.com');
    expect(maskEmail('a@vendor.com').startsWith('•')).toBe(true);
  });

  it('does not leak the length of the address', () => {
    // A fixed run of dots, so two addresses sharing a prefix are not told apart by counting them.
    expect(maskEmail('ahmed@arabco.com')).toBe(maskEmail('ahmedx@arabco.com'));
    expect(maskEmail('accounts@arabco.com')).toBe(maskEmail('accounting@arabco.com'));
  });

  it('keeps the top-level domain, which is not a secret and aids recognition', () => {
    expect(maskEmail('ap@vendor.co.uk').endsWith('.uk')).toBe(true);
    expect(maskEmail('ap@vendor.com').endsWith('.com')).toBe(true);
  });

  it('distinguishes two different addresses at the same vendor', () => {
    // The whole point is that the recipient can pick theirs out of the list.
    expect(maskEmail('ahmed@arabco.com')).not.toBe(maskEmail('bilal@arabco.com'));
    // The pair that defeated the old one-character form.
    expect(maskEmail('ahmed@arabco.com')).not.toBe(maskEmail('accounts@arabco.com'));
  });

  it('does not throw on a malformed address', () => {
    expect(() => maskEmail('not-an-email')).not.toThrow();
    expect(() => maskEmail('')).not.toThrow();
  });
});
