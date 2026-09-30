import { describe, expect, it } from 'vitest';
import { searchTaxonomy } from '@/lib/sourceguide/taxonomy-search';
import type { SgTaxonomyRow } from '@/lib/sourceguide/types';

const r = (
  spend: string,
  cat: string,
  sub: string,
  fam: string,
  name: string,
): SgTaxonomyRow => [spend, cat, sub, fam, name];

const ROWS: SgTaxonomyRow[] = [
  r('Direct', 'Field Technical', 'Completion Tools', 'Perforating Equipment', 'Shaped Charges'),
  r('Direct', 'Field Technical', 'Regulated Materials', 'Explosives', 'Shaped Charges'),
  r('Direct', 'Field Technical', 'Regulated Materials', 'Explosives', 'Detonators & Boosters'),
  r('Direct', 'Cement', 'Bulk Cement', 'General', 'Class G Cement'),
  r('Direct', 'Natural Sand', 'Proppant', 'General', 'Fracturing Sands'),
  r('Indirect', 'Facility', 'Insulation', 'Insulation Materials', 'Thermal Insulation Materials'),
];

describe('searchTaxonomy', () => {
  it('says nothing until there is enough to go on', () => {
    // One character matches most of the catalogue, and a dropdown of everything helps nobody.
    expect(searchTaxonomy(ROWS, 'c')).toEqual([]);
    expect(searchTaxonomy(ROWS, ' ')).toEqual([]);
  });

  it('finds a commodity by part of its name', () => {
    const hits = searchTaxonomy(ROWS, 'detonat');
    expect(hits[0].value).toBe('Detonators & Boosters');
    expect(hits[0].level).toBe(4);
  });

  it('returns the whole path, which is what opens the columns', () => {
    const [hit] = searchTaxonomy(ROWS, 'detonat');
    expect(hit.path).toEqual([
      'Direct',
      'Field Technical',
      'Regulated Materials',
      'Explosives',
      'Detonators & Boosters',
    ]);
  });

  it('keeps two nodes that share a name under different parents', () => {
    // Shaped Charges is filed twice on purpose, and each is a different place to land.
    const hits = searchTaxonomy(ROWS, 'shaped');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.path[2]).sort()).toEqual(['Completion Tools', 'Regulated Materials']);
  });

  it('puts an exact name above a name that merely contains it', () => {
    // Somebody typing "cement" wants Cement, not Class G Cement.
    const hits = searchTaxonomy(ROWS, 'cement');
    expect(hits[0].value).toBe('Cement');
  });

  it('ranks a word start above a match buried mid-word', () => {
    const rows: SgTaxonomyRow[] = [
      r('Direct', 'C', 'S', 'F', 'Natural Sand'),
      r('Direct', 'C', 'S', 'F', 'Unsanded Grout'),
    ];
    const hits = searchTaxonomy(rows, 'sand');
    expect(hits[0].value).toBe('Natural Sand');
  });

  it('matches at any level, not only the commodity', () => {
    const levels = searchTaxonomy(ROWS, 'insulation').map((h) => h.level);
    // Sub-Category, Family and Commodity all carry the word.
    expect(new Set(levels)).toEqual(new Set([2, 3, 4]));
  });

  it('counts what sits under a node', () => {
    const [explosives] = searchTaxonomy(ROWS, 'explosives');
    expect(explosives.count).toBe(2);
  });

  it('does not throw on a query full of regex punctuation', () => {
    // The search box takes whatever somebody types, brackets and all.
    expect(() => searchTaxonomy(ROWS, 'a(b[c*')).not.toThrow();
    expect(() => searchTaxonomy(ROWS, String.fromCharCode(92))).not.toThrow();
  });

  it('caps what it hands back, so the dropdown stays a list', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      r('Direct', 'C', 'S', 'F', `Cement Item ${i}`),
    );
    expect(searchTaxonomy(many, 'cement').length).toBeLessThanOrEqual(40);
  });
});
