import { describe, expect, it } from 'vitest';
import { formatSharePct, spendShares } from '@/lib/soa/spend-share';

const ROWS = [
  { key: 'c', value: 100 },
  { key: 'a', value: 600 },
  { key: 'b', value: 300 },
];

describe('spendShares', () => {
  it('ranks by value however the caller ordered the rows', () => {
    const shares = spendShares(ROWS, 1000);
    expect(shares.get('a')?.rank).toBe(1);
    expect(shares.get('b')?.rank).toBe(2);
    expect(shares.get('c')?.rank).toBe(3);
  });

  it('gives each supplier their own share', () => {
    const shares = spendShares(ROWS, 1000);
    expect(shares.get('a')?.sharePct).toBe(60);
    expect(shares.get('b')?.sharePct).toBe(30);
    expect(shares.get('c')?.sharePct).toBe(10);
  });

  it('accumulates down the value order, not the input order', () => {
    const shares = spendShares(ROWS, 1000);
    expect(shares.get('a')?.cumulativePct).toBe(60);
    expect(shares.get('b')?.cumulativePct).toBe(90);
    expect(shares.get('c')?.cumulativePct).toBe(100);
  });

  /*
   * The reason share carries a decimal and cumulative does not. A country of 600 suppliers has
   * most of them under 1%, and rounding those to whole percent prints a column of zeroes against
   * suppliers who are really there.
   */
  it('keeps a decimal, so a small supplier is not rounded to nothing', () => {
    const shares = spendShares([{ key: 'tiny', value: 4 }], 1000);
    expect(shares.get('tiny')?.sharePct).toBe(0.4);
  });

  it('reports nothing rather than dividing by a denominator it does not have', () => {
    for (const total of [0, -1]) {
      const shares = spendShares(ROWS, total);
      expect(shares.get('a')?.sharePct).toBeNull();
      expect(shares.get('a')?.cumulativePct).toBeNull();
      // The rank still means something: it is a position in the list, not a share of anything.
      expect(shares.get('a')?.rank).toBe(1);
    }
  });

  it('does not reorder what it was given', () => {
    const input = [...ROWS];
    spendShares(input, 1000);
    expect(input.map((r) => r.key)).toEqual(['c', 'a', 'b']);
  });

  it('handles an empty list', () => {
    expect(spendShares([], 1000).size).toBe(0);
  });
});

describe('formatSharePct', () => {
  it.each([
    [null, ''],
    [0, '0%'],
    [0.04, '<0.1%'],
    [0.4, '0.4%'],
    [12.35, '12.3%'],
    [100, '100.0%'],
  ])('writes %s as %s', (pct, expected) => {
    expect(formatSharePct(pct)).toBe(expected);
  });

  /* A supplier with a real balance that rounds below a tenth would otherwise read "0.0%", which
     is indistinguishable from nothing at all. */
  it('separates a very small share from no share', () => {
    expect(formatSharePct(0.04)).not.toBe('0%');
  });
});
