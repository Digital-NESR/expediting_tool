import { describe, expect, it } from 'vitest';
import {
  buildTree,
  commodityIdsUnder,
  commodityPath,
  findNode,
  nodeKey,
  suppliersUnder,
  type RollupCommodity,
  type RollupFact,
  type RollupSupplier,
} from '@/lib/sourceguide/rollup';

/**
 * The counts these tests pin are the ones the screen shows, and every one of them is a number
 * that did not exist in SourceGuide before. The two that matter most are the two the obvious
 * implementation gets wrong: a supplier mapped to several commodities under one node is ONE
 * supplier, and two commodities sharing a name in different branches are TWO nodes.
 */

const com = (over: Partial<RollupCommodity> & { id: number }): RollupCommodity => ({
  name: 'Thing',
  code: null,
  category: 'Chemicals',
  subCategory: 'Specialty Chemicals',
  /* Null by default so overriding the sub-category alone cannot leave a stale family behind and
     quietly move the commodity to a different branch than the test reads. */
  family: null,
  spendType: 'Direct',
  ...over,
});

const fact = (
  commodityId: number,
  supplier: string,
  over: Partial<RollupFact> = {},
): RollupFact => ({ commodityId, supplier, country: 'OM', preferred: false, ...over });

const sup = (code: string, over: Partial<RollupSupplier> = {}): RollupSupplier => ({
  code,
  name: `Supplier ${code}`,
  blocked: false,
  ...over,
});

function node(roots: ReturnType<typeof buildTree>, ...path: string[]) {
  const n = findNode(roots, nodeKey(path));
  if (!n) throw new Error(`no node at ${path.join(' > ')}`);
  return n;
}

describe('commodityPath', () => {
  it('renders an empty sub-category and a parent-repeating family as General', () => {
    expect(
      commodityPath(com({ id: 1, name: 'Engine Oil', subCategory: null, family: null })),
    ).toEqual(['Direct', 'Chemicals', 'General', 'General', 'Engine Oil']);

    // `Lubricants > Lubricants` is the shape isRedundantFamily exists for.
    expect(
      commodityPath(
        com({ id: 2, name: 'Engine Oil', subCategory: 'Lubricants', family: 'Lubricants' }),
      ),
    ).toEqual(['Direct', 'Chemicals', 'Lubricants', 'General', 'Engine Oil']);
  });

  it('renders a catch-all commodity as General so it cannot be read as its own parent', () => {
    // The node named after its own sub-category is a leaf bucket, not the sub-category itself.
    expect(
      commodityPath(
        com({ id: 3, name: 'Specialty Chemicals', subCategory: 'Specialty Chemicals' }),
      ),
    ).toEqual(['Direct', 'Chemicals', 'Specialty Chemicals', 'General', 'General']);
  });
});

describe('buildTree', () => {
  it('counts a supplier once per node however many commodities it covers', () => {
    // S1 is mapped to all three commodities in the sub-category. The sub-category holds ONE
    // supplier, not three -- summing children is the bug this pins.
    const commodities = [
      com({ id: 1, name: 'Acid' }),
      com({ id: 2, name: 'Base' }),
      com({ id: 3, name: 'Salt' }),
    ];
    const facts = [fact(1, 'S1'), fact(2, 'S1'), fact(3, 'S1'), fact(3, 'S2')];
    const roots = buildTree(commodities, facts, {});

    expect(node(roots, 'Direct').supplierCount).toBe(2);
    expect(node(roots, 'Direct', 'Chemicals', 'Specialty Chemicals').supplierCount).toBe(2);
    expect(
      node(roots, 'Direct', 'Chemicals', 'Specialty Chemicals', 'General', 'Acid').supplierCount,
    ).toBe(1);
    expect(node(roots, 'Direct', 'Chemicals').commodityCount).toBe(3);
  });

  it('keeps two same-named commodities in different branches apart', () => {
    // Ten commodity names occur in more than one branch. Keying a node by its label would merge
    // these two and report one node with both suppliers.
    const commodities = [
      com({ id: 1, name: 'Valves', category: 'Mechanical', subCategory: 'Flow Control' }),
      com({ id: 2, name: 'Valves', category: 'Drilling', subCategory: 'Wellhead' }),
    ];
    const roots = buildTree(commodities, [fact(1, 'S1'), fact(2, 'S2')], {});

    const a = node(roots, 'Direct', 'Mechanical', 'Flow Control', 'General', 'Valves');
    const b = node(roots, 'Direct', 'Drilling', 'Wellhead', 'General', 'Valves');
    expect(a.key).not.toBe(b.key);
    expect(a.supplierCount).toBe(1);
    expect(b.supplierCount).toBe(1);
    expect(a.commodityId).toBe(1);
    expect(b.commodityId).toBe(2);
  });

  it('narrows every count together when a country is chosen', () => {
    const commodities = [com({ id: 1, name: 'Acid' }), com({ id: 2, name: 'Base' })];
    const facts = [
      fact(1, 'S1', { country: 'OM' }),
      fact(2, 'S2', { country: 'SA' }),
      fact(2, 'S3', { country: 'SA' }),
    ];
    expect(node(buildTree(commodities, facts, {}), 'Direct').supplierCount).toBe(3);
    expect(node(buildTree(commodities, facts, { country: 'OM' }), 'Direct').supplierCount).toBe(1);
    expect(node(buildTree(commodities, facts, { country: 'SA' }), 'Direct').supplierCount).toBe(2);
  });

  it('separates the tier filter from the preferred count', () => {
    const commodities = [com({ id: 1, name: 'Acid' })];
    const facts = [fact(1, 'S1', { preferred: true }), fact(1, 'S2'), fact(1, 'S3')];

    const all = node(buildTree(commodities, facts, {}), 'Direct');
    expect(all.supplierCount).toBe(3);
    expect(all.preferredCount).toBe(1);

    expect(node(buildTree(commodities, facts, { tier: 'preferred' }), 'Direct').supplierCount).toBe(
      1,
    );
    expect(node(buildTree(commodities, facts, { tier: 'backup' }), 'Direct').supplierCount).toBe(2);
  });

  it('keeps a branch with no suppliers in the tree, carrying zero', () => {
    // A branch that exists but is empty in this country must still be visible -- hiding it tells
    // the buyer the category does not exist rather than that nobody is approved here yet.
    const commodities = [com({ id: 1, name: 'Acid' }), com({ id: 2, name: 'Base' })];
    const roots = buildTree(commodities, [fact(1, 'S1', { country: 'OM' })], { country: 'SA' });
    const n = node(roots, 'Direct', 'Chemicals');
    expect(n.commodityCount).toBe(2);
    expect(n.supplierCount).toBe(0);
  });

  it('collects every commodity beneath a node, and just itself at a leaf', () => {
    const commodities = [
      com({ id: 1, name: 'Acid' }),
      com({ id: 2, name: 'Base' }),
      com({ id: 3, name: 'Bit', category: 'Drilling', subCategory: 'Bits' }),
    ];
    const roots = buildTree(commodities, [], {});
    expect(commodityIdsUnder(node(roots, 'Direct')).sort()).toEqual([1, 2, 3]);
    expect(commodityIdsUnder(node(roots, 'Direct', 'Chemicals')).sort()).toEqual([1, 2]);
    expect(
      commodityIdsUnder(
        node(roots, 'Direct', 'Chemicals', 'Specialty Chemicals', 'General', 'Acid'),
      ),
    ).toEqual([1]);
  });
});

describe('suppliersUnder', () => {
  const commodities = [
    com({ id: 1, name: 'Acid' }),
    com({ id: 2, name: 'Base' }),
    com({ id: 3, name: 'Bit', category: 'Drilling', subCategory: 'Bits' }),
  ];
  const suppliers = [sup('S1'), sup('S2'), sup('S3', { blocked: true })];

  it('names the commodities that put each supplier in the list', () => {
    // THE RULE. A rollup may say "approved for something in here" and may never say "approved
    // for this node", so a row with no commodity behind it must be impossible.
    const roots = buildTree(commodities, [fact(1, 'S1'), fact(2, 'S1'), fact(2, 'S2')], {});
    const rows = suppliersUnder(
      node(roots, 'Direct', 'Chemicals'),
      commodities,
      [fact(1, 'S1'), fact(2, 'S1'), fact(2, 'S2')],
      suppliers,
      {},
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.viaCommodities.length).toBeGreaterThan(0);
    expect(rows[0].code).toBe('S1');
    expect(rows[0].viaCommodities.map((v) => v.label)).toEqual(['Acid', 'Base']);
  });

  it('counts one entry per commodity, not per country mapping', () => {
    const facts = [
      fact(1, 'S1', { country: 'OM' }),
      fact(1, 'S1', { country: 'SA' }),
      fact(1, 'S1', { country: 'IQ', preferred: true }),
    ];
    const roots = buildTree(commodities, facts, {});
    const [row] = suppliersUnder(node(roots, 'Direct', 'Chemicals'), commodities, facts, suppliers);
    expect(row.viaCommodities).toHaveLength(1);
    expect(row.countries).toEqual(['IQ', 'OM', 'SA']);
    // Preferred in one country is enough for the badge, and the row says which commodity.
    expect(row.preferred).toBe(true);
  });

  it('sinks a blocked supplier below everyone else even when it is Preferred', () => {
    // Ten blocked vendors are still mapped and twenty-six of those mappings are Preferred.
    const facts = [fact(1, 'S3', { preferred: true }), fact(1, 'S2'), fact(2, 'S1')];
    const roots = buildTree(commodities, facts, {});
    const rows = suppliersUnder(node(roots, 'Direct', 'Chemicals'), commodities, facts, suppliers);
    expect(rows.map((r) => r.code)).toEqual(['S1', 'S2', 'S3']);
    expect(rows[2].blocked).toBe(true);
    expect(rows[2].preferred).toBe(true);
  });

  it('puts Preferred above Backup, then wider coverage first', () => {
    const facts = [fact(1, 'S1'), fact(2, 'S1'), fact(1, 'S2', { preferred: true })];
    const roots = buildTree(commodities, facts, {});
    const rows = suppliersUnder(node(roots, 'Direct', 'Chemicals'), commodities, facts, suppliers);
    expect(rows.map((r) => r.code)).toEqual(['S2', 'S1']);
  });

  it('never reaches outside the selected subtree', () => {
    const facts = [fact(1, 'S1'), fact(3, 'S2')];
    const roots = buildTree(commodities, facts, {});
    const rows = suppliersUnder(node(roots, 'Direct', 'Chemicals'), commodities, facts, suppliers);
    expect(rows.map((r) => r.code)).toEqual(['S1']);
  });

  it('falls back to the vendor code when the supplier is not in the name index', () => {
    // searchSuppliers' index only holds mapped vendors; a mapping to a code missing from it must
    // still render as a row rather than silently vanishing from a count that included it.
    const facts = [fact(1, 'S9')];
    const roots = buildTree(commodities, facts, {});
    expect(node(roots, 'Direct', 'Chemicals').supplierCount).toBe(1);
    const rows = suppliersUnder(node(roots, 'Direct', 'Chemicals'), commodities, facts, suppliers);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('S9');
  });
});
