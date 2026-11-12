import { describe, expect, it } from 'vitest';
import { normaliseVendorCode, vendorCodeScore } from '@/lib/sourceguide/vendor-code';

/**
 * Codes pasted out of SAP are the third most common thing people type into SourceGuide search.
 * These pin the padding rule, which is the part the old `code.includes(query)` got wrong.
 */
describe('normaliseVendorCode', () => {
  it('drops padding, case and surrounding space', () => {
    expect(normaliseVendorCode(' 0001103318 ')).toBe('1103318');
    expect(normaliseVendorCode('abc123')).toBe('ABC123');
  });

  it('treats a blank or an all-zero code as nothing', () => {
    expect(normaliseVendorCode('')).toBeNull();
    expect(normaliseVendorCode('  ')).toBeNull();
    expect(normaliseVendorCode('0000')).toBeNull();
    expect(normaliseVendorCode(null)).toBeNull();
  });
});

describe('vendorCodeScore', () => {
  it('matches an unpadded query against a padded code', () => {
    // The whole point: SAP shows 1103318 in one screen and 0001103318 in another.
    expect(vendorCodeScore('1103318', '0001103318')).toBe(10);
    expect(vendorCodeScore('0001103318', '1103318')).toBe(10);
    expect(vendorCodeScore(' 0001100174 ', '0001100174')).toBe(10);
  });

  it('outranks anything a name match can score, so a pasted code wins', () => {
    // matchScore tops out around 3 for a perfect name hit; an identifier match is not a guess.
    expect(vendorCodeScore('1103318', '0001103318')).toBeGreaterThan(3);
  });

  it('allows a partial code only once it is specific enough to mean something', () => {
    expect(vendorCodeScore('1057', '0001105784')).toBe(1.5);
    // Three characters would match a large slice of the register — noise, not a result.
    expect(vendorCodeScore('105', '0001105784')).toBe(0);
    expect(vendorCodeScore('1', '0001105784')).toBe(0);
  });

  it('does not match a different vendor that is one digit away', () => {
    // A code is an identifier, so a near miss is the wrong vendor, not a typo to forgive.
    expect(vendorCodeScore('1103319', '0001103318')).toBe(0);
  });

  it('returns nothing rather than throwing on empty input', () => {
    expect(vendorCodeScore('', '0001103318')).toBe(0);
    expect(vendorCodeScore('1103318', '')).toBe(0);
  });
});
