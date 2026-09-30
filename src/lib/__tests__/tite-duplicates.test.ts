import { describe, expect, it } from 'vitest';
import {
  duplicateCustomsReferenceMessage,
  DuplicateCustomsReferenceError,
  normaliseCustomsReference,
} from '@/lib/tite/duplicates';

/**
 * The comparison that decides whether a shipment can be saved. Both write paths, the form and the
 * bulk migration, run through this, so a difference between them starts here.
 */
describe('normaliseCustomsReference', () => {
  it('matches the same declaration however it was typed', () => {
    // The register holds both spellings of the same number today.
    expect(normaliseCustomsReference('  dectim18052510785560 ')).toBe('DECTIM18052510785560');
    expect(normaliseCustomsReference('DECTIM18052510785560')).toBe('DECTIM18052510785560');
  });

  it('treats a blank reference as no reference at all', () => {
    // Otherwise every shipment without one would collide with every other, and hundreds of
    // legitimate rows carry none.
    for (const blank of ['', '   ', '\t', null, undefined]) {
      expect(normaliseCustomsReference(blank), JSON.stringify(blank)).toBeNull();
    }
  });

  it('keeps a purely numeric reference intact', () => {
    // Algeria's are bare numbers; upper-casing must not mangle them.
    expect(normaliseCustomsReference('16720')).toBe('16720');
  });

  it('does not collapse two different references', () => {
    expect(normaliseCustomsReference('16720')).not.toBe(normaliseCustomsReference('167200'));
  });
});

describe('the refusal a person is shown', () => {
  it('names the shipment that already holds the number', () => {
    // "Duplicate detected" alone leaves them hunting; the reference is what they search for.
    const msg = duplicateCustomsReferenceMessage('DECTIM18052510785560', 'OMN-036');
    expect(msg).toContain('DECTIM18052510785560');
    expect(msg).toContain('OMN-036');
  });

  it('says why it matters, not just that it is refused', () => {
    expect(duplicateCustomsReferenceMessage('16720', 'DZA-376')).toContain('twice');
  });

  it('carries the existing reference on the error for the log', () => {
    const err = new DuplicateCustomsReferenceError('16720', 'DZA-376');
    expect(err).toBeInstanceOf(Error);
    expect(err.existingReference).toBe('DZA-376');
    expect(err.name).toBe('DuplicateCustomsReferenceError');
  });
});
