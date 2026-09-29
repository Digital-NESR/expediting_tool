import { describe, expect, it } from 'vitest';
import { buildTaxonomyTree } from '@/lib/sourceguide/taxonomy';

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  code: '20122501',
  name: 'Shaped Charges',
  category: 'Field Technical Equipment & Services',
  category_id: 'field-technical',
  sub_category: 'Completion Tools',
  family: 'Perforating Equipment',
  countries: 3,
  ...over,
});

describe('buildTaxonomyTree', () => {
  it('nests four levels from flat rows', () => {
    const tree = buildTaxonomyTree([row()]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Field Technical Equipment & Services');
    expect(tree[0].subs[0].name).toBe('Completion Tools');
    expect(tree[0].subs[0].families[0].name).toBe('Perforating Equipment');
    expect(tree[0].subs[0].families[0].items[0].name).toBe('Shaped Charges');
  });

  it('counts commodities at every level above them', () => {
    const tree = buildTaxonomyTree([
      row({ id: 1, name: 'A' }),
      row({ id: 2, name: 'B' }),
      row({ id: 3, name: 'C', family: 'Explosives' }),
    ]);
    expect(tree[0].count).toBe(3);
    expect(tree[0].subs[0].count).toBe(3);
    expect(tree[0].subs[0].families).toHaveLength(2);
  });

  it('leads with the largest category, because the list is scanned', () => {
    const tree = buildTaxonomyTree([
      row({ id: 1, category: 'Small', category_id: 's' }),
      row({ id: 2, category: 'Big', category_id: 'b' }),
      row({ id: 3, category: 'Big', category_id: 'b', name: 'Another' }),
    ]);
    expect(tree.map((c) => c.name)).toEqual(['Big', 'Small']);
  });

  it('keeps two commodities that share a name under different codes', () => {
    // Shaped Charges is filed twice on purpose, as perforating equipment and as an explosive.
    const tree = buildTaxonomyTree([
      row({ id: 540, code: '20122501' }),
      row({ id: 589, code: '20122103', sub_category: 'Regulated Materials', family: 'Explosives' }),
    ]);
    expect(tree[0].count).toBe(2);
    expect(tree[0].subs.map((s) => s.name)).toEqual(['Completion Tools', 'Regulated Materials']);
  });

  it('does not drop a row that is missing its sub-category or family', () => {
    const tree = buildTaxonomyTree([row({ sub_category: null, family: null })]);
    expect(tree[0].subs[0].name).toBe('General');
    expect(tree[0].subs[0].families[0].name).toBe('General');
  });

  it('returns nothing for nothing, rather than a category of nothing', () => {
    expect(buildTaxonomyTree([])).toEqual([]);
  });
});
