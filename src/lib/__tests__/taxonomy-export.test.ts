import { describe, expect, it } from 'vitest';
import {
  tallyBy,
  taxonomyTotals,
  taxonomyExportFileName,
  type TaxonomyExportRow,
} from '@/lib/sourceguide/taxonomy-export';

const row = (
  spendType: string,
  category: string,
  subCategory: string,
  family: string,
  commodity: string,
  code = '',
): TaxonomyExportRow => ({
  spendType,
  category,
  subCategory,
  family,
  commodity,
  code,
  description: '',
});

/*
 * Two categories that each contain a sub-category called "General", which each contain a family
 * called "General". This is the real shape: the reader of `sg_commodities` fills a blank level in
 * with "General", so the name repeats all over the taxonomy and means something different in each
 * place. Counting bare names instead of paths is the one way these tallies can be wrong, so it is
 * what the fixture is built to catch.
 */
const ROWS: TaxonomyExportRow[] = [
  row('Direct', 'Cement', 'General', 'General', 'Class G Cement', '11111111'),
  row('Direct', 'Cement', 'General', 'General', 'Lightweight Cement'),
  row('Direct', 'Cement', 'Additives', 'Retarders', 'Sodium Lignosulfonate'),
  row('Direct', 'Drilling', 'General', 'General', 'Drill Bit'),
  row('Indirect', 'Facility', 'Cleaning', 'General', 'Janitorial Service'),
];

describe('taxonomyTotals', () => {
  it('counts each level on its full path, so a repeated name is not collapsed', () => {
    expect(taxonomyTotals(ROWS)).toEqual({
      spendTypes: 2,
      // Cement, Drilling, Facility
      categories: 3,
      // Cement>General, Cement>Additives, Drilling>General, Facility>Cleaning
      subCategories: 4,
      // ...>General x3 under different parents, Cement>Additives>Retarders
      families: 4,
      commodities: 5,
    });
  });

  it('reports zeroes rather than throwing on an empty taxonomy', () => {
    expect(taxonomyTotals([])).toEqual({
      spendTypes: 0,
      categories: 0,
      subCategories: 0,
      families: 0,
      commodities: 0,
    });
  });
});

describe('tallyBy', () => {
  it('counts what sits under each spend type', () => {
    const [direct, indirect] = tallyBy(ROWS, 1);

    expect(direct.path).toEqual(['Direct']);
    // 2 categories, 3 sub-categories (Cement>General, Cement>Additives, Drilling>General),
    // 3 families, 4 commodities.
    expect(direct.deeper).toEqual([2, 3, 3]);
    expect(direct.commodities).toBe(4);
    expect(direct.share).toBeCloseTo(0.8);

    expect(indirect.path).toEqual(['Indirect']);
    expect(indirect.deeper).toEqual([1, 1, 1]);
    expect(indirect.commodities).toBe(1);
  });

  it('keeps a category inside its spend type', () => {
    const cement = tallyBy(ROWS, 2).find((t) => t.path[1] === 'Cement');
    expect(cement?.path).toEqual(['Direct', 'Cement']);
    expect(cement?.deeper).toEqual([2, 2]);
    expect(cement?.commodities).toBe(3);
  });

  it('does not merge two "General" families that sit under different parents', () => {
    const families = tallyBy(ROWS, 4);
    const generals = families.filter((t) => t.path[3] === 'General');

    expect(generals).toHaveLength(3);
    expect(generals.map((t) => t.commodities).reduce((a, b) => a + b)).toBe(4);
    // A family is the last groupable level, so nothing is counted beneath it.
    expect(generals.every((t) => t.deeper.length === 0)).toBe(true);
  });

  it('orders by size, then by name, so the sheet opens on what matters', () => {
    expect(tallyBy(ROWS, 2).map((t) => t.path[1])).toEqual(['Cement', 'Drilling', 'Facility']);
  });

  it('shares sum to one', () => {
    for (const depth of [1, 2, 3, 4] as const) {
      const sum = tallyBy(ROWS, depth).reduce((acc, t) => acc + t.share, 0);
      expect(sum).toBeCloseTo(1);
    }
  });

  it('survives an empty taxonomy without dividing by zero', () => {
    expect(tallyBy([], 1)).toEqual([]);
  });
});

describe('taxonomyExportFileName', () => {
  it('carries the export date so two downloads do not collide', () => {
    expect(taxonomyExportFileName(new Date('2026-10-04T09:30:00Z'))).toBe(
      'NESR Spend Taxonomy 2026-10-04.xlsx',
    );
  });
});
