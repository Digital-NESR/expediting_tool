import { describe, expect, it } from 'vitest';
import { buildPath } from '@/lib/sourceguide/internals';
import {
  familyLabel,
  familySql,
  isRedundantFamily,
  subCategorySql,
} from '@/lib/sourceguide/taxonomy-levels';

/**
 * When a taxonomy level says nothing.
 *
 * 15 commodities carry a family that is just their own sub-category again, which reached readers
 * as `Lubricants > Lubricants > Engine Oil` on the breadcrumb and as a drill-down column offering
 * the one choice already clicked. What is pinned here is that a repeat and a blank are the same
 * fact, and that each surface says it the way that surface already says it: `General` where there
 * is a column to fill, nothing at all where there is a list.
 */

describe('isRedundantFamily', () => {
  it('holds a family that repeats its own sub-category', () => {
    expect(isRedundantFamily('Lubricants', 'Lubricants')).toBe(true);
    expect(isRedundantFamily('Radiators', 'Radiators')).toBe(true);
  });

  it('holds a blank one, which is the same fact', () => {
    expect(isRedundantFamily(null, 'Lubricants')).toBe(true);
    expect(isRedundantFamily('', 'Lubricants')).toBe(true);
    expect(isRedundantFamily('   ', 'Lubricants')).toBe(true);
  });

  it('leaves a family that says something', () => {
    expect(isRedundantFamily('Industrial Gases', 'Gases')).toBe(false);
    expect(isRedundantFamily('MRO or Distributor Services', 'Filters')).toBe(false);
  });

  /* Nothing in the table differs by case today. The rule is written this way because the
     comparison that only catches an exact match is the one that stops working silently the day
     somebody retypes a level. */
  it('is not fooled by case or padding', () => {
    expect(isRedundantFamily(' lubricants ', 'Lubricants')).toBe(true);
  });

  /* Three commodities read `Cement > Commodities Chemicals > Cement`. The level between is doing
     real work, so that is not this defect and must not be swept up in it. */
  it('leaves a family that matches a grandparent rather than its parent', () => {
    expect(isRedundantFamily('Cement', 'Commodities Chemicals')).toBe(false);
  });
});

describe('familyLabel', () => {
  it('fills the column with the same word the blanks have always shown', () => {
    expect(familyLabel('Lubricants', 'Lubricants')).toBe('General');
    expect(familyLabel(null, 'Lubricants')).toBe('General');
  });

  it('passes a real family through, trimmed', () => {
    expect(familyLabel(' Industrial Gases ', 'Gases')).toBe('Industrial Gases');
  });
});

describe('buildPath', () => {
  /* The breadcrumb is a list, so a level that says nothing is left out rather than filled in.
     'General' here would read as a family somebody chose. */
  it('drops a family that repeats its sub-category', () => {
    expect(
      buildPath({
        category: 'Fuel, Lubricants and Gases',
        subCategory: 'Lubricants',
        family: 'Lubricants',
        name: 'Engine Oil',
      }),
    ).toEqual(['Fuel, Lubricants and Gases', 'Lubricants', 'Engine Oil']);
  });

  it('still drops a blank one, as it always did', () => {
    expect(
      buildPath({ category: 'Manpower', subCategory: 'Manpower', family: null, name: 'Manpower' }),
    ).toEqual(['Manpower', 'Manpower', 'Manpower']);
  });

  it('keeps a family that says something', () => {
    expect(
      buildPath({
        category: 'Fuel, Lubricants and Gases',
        subCategory: 'Gases',
        family: 'Industrial Gases',
        name: 'Oxygen',
      }),
    ).toEqual(['Fuel, Lubricants and Gases', 'Gases', 'Industrial Gases', 'Oxygen']);
  });
});

/*
 * The SQL is the same rule for the four queries that read these columns. It is checked for shape
 * rather than executed: what it returns is pinned against the database in the verification run,
 * and what matters here is that every call site gets one fragment rather than its own spelling.
 */
describe('the SQL fragments', () => {
  it('alias an unaliased table by default', () => {
    expect(subCategorySql()).toContain('TRIM(sub_category)');
    expect(familySql()).toContain('TRIM(family)');
  });

  it('carry an alias through every column they touch', () => {
    const sql = familySql('c.', 'family');
    expect(sql).toContain('TRIM(c.family)');
    expect(sql).toContain('c.sub_category');
    // The failure that matters: an unaliased column reference, which a join with more than one
    // of these tables rejects at run time rather than here.
    expect(sql).not.toContain('TRIM(family)');
    expect(sql).not.toContain('TRIM(sub_category)');
    expect(sql.trimEnd().endsWith('AS family')).toBe(true);
  });

  it('compare the family against its sub-category, not against a literal', () => {
    expect(familySql()).toContain("lower(TRIM(family)) = lower(TRIM(COALESCE(sub_category, '')))");
  });

  /* The empty string is the case `getTaxonomy` used to miss: it compared against NULL only, so a
     family stored as '' reached the screen as an empty cell. */
  it('treat an empty string as blank, not as a family', () => {
    expect(subCategorySql()).toContain("NULLIF(TRIM(sub_category), '')");
    expect(familySql()).toContain("NULLIF(TRIM(family), '')");
  });
});
