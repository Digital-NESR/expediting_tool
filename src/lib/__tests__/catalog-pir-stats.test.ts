import { describe, expect, it } from 'vitest';
import { subFor } from '@/app/catalog-manager/pir/PirCatalogClient';

/**
 * The line under each PIR stat card.
 *
 * The cards now show what the filters match rather than the whole mirror, which means a figure
 * on its own is ambiguous: "94 suppliers" reads identically whether it is every supplier in SAP
 * or the nineteen in Saudi Arabia. This line is the only thing that distinguishes them, so what
 * it does and does not say is worth pinning.
 */
describe('the stat card sub-line', () => {
  it('keeps the plain description when nothing has been narrowed', () => {
    expect(subFor(5267, 5267, 'Purchasing info records')).toBe('Purchasing info records');
  });

  it('gives the whole-mirror figure as context once the number is a subset', () => {
    expect(subFor(1095, 5267, 'Purchasing info records')).toBe('of 5,267 · filtered');
  });

  it('keys on the figures, not on whether a filter is set', () => {
    /* A filter that happens to match everything has narrowed nothing, and "5,267 of 5,267"
       is noise. This is why the helper takes two numbers rather than a boolean. */
    expect(subFor(94, 94, 'Distinct suppliers')).toBe('Distinct suppliers');
  });

  it('leaves a card alone when its own dimension was not narrowed', () => {
    /* Filtering to one material group can cut the records hard while still touching every
       country. Nothing was excluded from the Countries card, so it should not claim otherwise
       — this is the case a single "is a filter active?" flag would get wrong. */
    expect(subFor(11, 11, 'Operating countries')).toBe('Operating countries');
  });

  it('thousand-separates the denominator, as the value above it is', () => {
    expect(subFor(1, 5267, 'Purchasing info records')).toContain('5,267');
  });

  it('handles a filter that matches nothing', () => {
    /* Zero is a real answer, and the card should still say what it is zero out of. */
    expect(subFor(0, 5267, 'Purchasing info records')).toBe('of 5,267 · filtered');
  });

  it('says nothing odd when the mirror itself is empty', () => {
    /* Before the first sync everything is zero, which is not "filtered". */
    expect(subFor(0, 0, 'Purchasing info records')).toBe('Purchasing info records');
  });
});
