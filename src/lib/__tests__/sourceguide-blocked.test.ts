import { describe, it, expect } from 'vitest';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';

describe('isCentrallyBlocked', () => {
  it('treats the two values the Power BI feed actually emits correctly', () => {
    // The feed maps SAP's Central_purchasing_block to exactly these two strings.
    expect(isCentrallyBlocked('Inactive - Central block')).toBe(true);
    expect(isCentrallyBlocked('Active')).toBe(false);
  });

  it('reads an absent status as not blocked', () => {
    for (const v of [null, undefined, '', '   ']) expect(isCentrallyBlocked(v)).toBe(false);
  });

  it('ignores case and padding on the clear markers', () => {
    for (const v of ['active', '  ACTIVE  ', 'None', 'no', 'Not Blocked'])
      expect(isCentrallyBlocked(v)).toBe(false);
  });

  it('flags anything it does not recognise', () => {
    // The column is free text from an upstream feed nobody here controls, so an
    // unfamiliar value is flagged rather than waved through.
    for (const v of ['X', 'Blocked', 'Inactive', 'pending review', '01'])
      expect(isCentrallyBlocked(v)).toBe(true);
  });

  it('does not mistake a substring for the whole marker', () => {
    expect(isCentrallyBlocked('inactive')).toBe(true);
    expect(isCentrallyBlocked('no longer approved')).toBe(true);
  });
});
