import { describe, expect, it } from 'vitest';
import { summariseTaxonomy } from '@/lib/sourceguide/taxonomy';
import type { SgTaxonomyRow } from '@/lib/sourceguide/types';

const row = (category: string, name: string): SgTaxonomyRow =>
  ['Direct', category, 'Sub', 'Family', name];

/**
 * These two numbers sit on the home page of every employee, so a confident wrong one is worse
 * than no number at all.
 */
describe('summariseTaxonomy', () => {
  it('counts a category once however many commodities sit under it', () => {
    // The rows are one per commodity, so a category repeats. Counting them straight would have
    // reported 1,221 categories against 1,221 commodities.
    const rows = [row('Chemicals', 'A'), row('Chemicals', 'B'), row('Logistics', 'C')];
    expect(summariseTaxonomy(rows)).toEqual({ categories: 2, commodities: 3 });
  });

  it('ignores a blank category rather than counting it as one', () => {
    expect(summariseTaxonomy([row('Chemicals', 'A'), row('', 'B'), row('   ', 'C')])).toEqual({
      categories: 1,
      commodities: 3,
    });
  });

  it('returns zeroes for an empty read, which the panel words differently', () => {
    expect(summariseTaxonomy([])).toEqual({ categories: 0, commodities: 0 });
  });
});
