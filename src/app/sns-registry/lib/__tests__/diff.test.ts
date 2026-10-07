import { describe, expect, it } from 'vitest';
import { diffDraft } from '../diff';
import type { Draft } from '../types';

function draft(over: Partial<Draft> = {}): Draft {
  return {
    cls: 'SGL',
    country: 'Iraq',
    level: 'Family',
    nodes: [{ cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Cement', com: '' }],
    segments: ['Cementing Services'],
    supplierId: '0001100576',
    supplierName: '3M GULF LTD',
    spend: '1000',
    reason: 'Active contract / master agreement',
    justification: 'Sole licensed distributor in country.',
    expiry: '2027-03-15',
    ...over,
  };
}

describe('what an edit writes to the audit trail', () => {
  it('says nothing when nothing changed', () => {
    expect(diffDraft(draft(), draft())).toEqual([]);
  });

  it('records both the old and the new value', () => {
    const changes = diffDraft(draft(), draft({ supplierName: 'MCCOY GLOBAL FZE' }));
    expect(changes).toEqual(['Supplier name: 3M GULF LTD → MCCOY GLOBAL FZE']);
  });

  it('keeps the justification the approver rejected, in full', () => {
    const before = 'Sole licensed distributor in country.';
    const after = 'Sole licensed distributor; OEM letter attached.';
    const changes = diffDraft(draft({ justification: before }), draft({ justification: after }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain(before);
    expect(changes[0]).toContain(after);
  });

  it('lists every changed field, not just the first', () => {
    const changes = diffDraft(
      draft(),
      draft({ cls: 'SOL', country: 'Oman', reason: 'Proprietary technology' }),
    );
    expect(changes).toHaveLength(3);
  });

  it('names a value that was emptied rather than printing a gap', () => {
    expect(diffDraft(draft(), draft({ expiry: '' }))).toEqual([
      'Expiry date: 2027-03-15 → (blank)',
    ]);
  });

  it('ignores whitespace-only edits', () => {
    expect(
      diffDraft(draft(), draft({ justification: '  Sole licensed distributor in country. ' })),
    ).toEqual([]);
  });

  it('reports a scope change by what was selected', () => {
    const changes = diffDraft(
      draft(),
      draft({
        nodes: [
          { cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Cement', com: '' },
          { cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Additives', com: '' },
        ],
      }),
    );
    expect(changes).toEqual(['Taxonomy scope: Cement → Cement, Additives']);
  });

  it('treats reordered segments as unchanged, but reordered scope as changed', () => {
    const twoSegs = ['Cementing Services', 'Drilling Services'];
    expect(
      diffDraft(draft({ segments: twoSegs }), draft({ segments: [...twoSegs].reverse() })),
    ).toEqual([]);

    const nodes = [
      { cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Cement', com: '' },
      { cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Additives', com: '' },
    ];
    expect(diffDraft(draft({ nodes }), draft({ nodes: [...nodes].reverse() }))).toHaveLength(1);
  });

  it('prefers the commodity over the family when both are set', () => {
    const changes = diffDraft(
      draft(),
      draft({
        level: 'Family',
        nodes: [{ cat: 'Cement', sub: 'Commodities Chemicals', fam: 'Cement', com: 'Class G' }],
      }),
    );
    expect(changes).toEqual(['Taxonomy scope: Cement → Class G']);
  });
});
