import { describe, expect, it } from 'vitest';
import { masterDataFingerprint } from '@/lib/catalog-seed-fingerprint';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';

/**
 * The fingerprint decides whether Catalog Repo re-seeds its reference data on a cold instance.
 * Two properties matter and they pull against each other: it must not change when nothing
 * meaningful has (or every cold start pays seven round trips again), and it must change when
 * anything the seed writes has (or a renamed country never reaches the database).
 */

const cat = (name: string, subs: string[]): TaxCategory =>
  ({
    name,
    type: 'Goods',
    subs: subs.map((s) => ({ name: s, commodities: [] })),
  }) as unknown as TaxCategory;

const TAXONOMY = [cat('Drilling', ['Bits', 'Mud']), cat('Catering', ['Food'])];

describe('masterDataFingerprint', () => {
  it('is stable across calls', () => {
    expect(masterDataFingerprint(TAXONOMY)).toBe(masterDataFingerprint(TAXONOMY));
  });

  it('ignores the order the constants happen to be written in', () => {
    // Reordering the source must not trigger a re-seed: nothing the seed writes has changed.
    const reordered = [cat('Catering', ['Food']), cat('Drilling', ['Mud', 'Bits'])];
    expect(masterDataFingerprint(reordered)).toBe(masterDataFingerprint(TAXONOMY));
  });

  it('changes when a category is added', () => {
    expect(masterDataFingerprint([...TAXONOMY, cat('Logistics', ['Freight'])])).not.toBe(
      masterDataFingerprint(TAXONOMY),
    );
  });

  it('changes when a subcategory is added', () => {
    expect(
      masterDataFingerprint([cat('Drilling', ['Bits', 'Mud', 'Casing']), TAXONOMY[1]]),
    ).not.toBe(masterDataFingerprint(TAXONOMY));
  });

  it('changes when a category is renamed', () => {
    // The case the count-based check could not see, and the reason this is a hash.
    expect(
      masterDataFingerprint([cat('Drilling Services', ['Bits', 'Mud']), TAXONOMY[1]]),
    ).not.toBe(masterDataFingerprint(TAXONOMY));
  });

  it('ignores commodities, which the seed does not write', () => {
    const withCommodities = [
      {
        name: 'Drilling',
        type: 'Goods',
        subs: [
          { name: 'Bits', commodities: [{ name: 'PDC', code: 'X' }] },
          { name: 'Mud', commodities: [] },
        ],
      },
      TAXONOMY[1],
    ] as unknown as TaxCategory[];
    expect(masterDataFingerprint(withCommodities)).toBe(masterDataFingerprint(TAXONOMY));
  });

  it('is short enough to store and compare cheaply', () => {
    expect(masterDataFingerprint(TAXONOMY).length).toBeLessThan(32);
  });
});
