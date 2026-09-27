import { describe, expect, it } from 'vitest';
import { emptyKindFor } from '@/app/soa-consolidation/lib';

/**
 * The order is the rule. Each state has a different person who fixes it, so reporting the wrong
 * one sends a champion to wait on the wrong colleague.
 */
const READY = {
  hasCycle: true,
  hasCountry: true,
  extracted: true,
  enrolled: true,
  scoped: true,
};

describe('emptyKindFor', () => {
  it('reports nothing wrong when everything is in place', () => {
    expect(emptyKindFor(READY)).toBe('none');
  });

  it('asks for a cycle before anything else', () => {
    // Every other flag is false too; none of them is the thing to tell an admin about first.
    expect(
      emptyKindFor({
        hasCycle: false,
        hasCountry: false,
        extracted: false,
        enrolled: false,
        scoped: false,
      }),
    ).toBe('no-cycle');
  });

  it('separates an open quarter from one whose snapshot has been taken', () => {
    // Opening a cycle and extracting its PO transactions are two admin steps; between them the
    // tool looks open for business with nothing in it.
    expect(emptyKindFor({ ...READY, extracted: false, enrolled: false, scoped: false })).toBe(
      'no-extract',
    );
  });

  it('asks the country to join before it asks it to scope', () => {
    expect(emptyKindFor({ ...READY, enrolled: false, scoped: false })).toBe('not-enrolled');
  });

  it('asks for a vendor list once the country has joined', () => {
    expect(emptyKindFor({ ...READY, scoped: false })).toBe('not-scoped');
  });

  it('does not report a country unscoped when it has not even joined', () => {
    // The regression this guards: with the two conflated, a champion who had not joined was told
    // to go and scope, and found a screen with nothing to scope from.
    expect(emptyKindFor({ ...READY, enrolled: false, scoped: false })).not.toBe('not-scoped');
  });

  it('puts a missing country ahead of anything about the cycle contents', () => {
    expect(emptyKindFor({ ...READY, hasCountry: false, extracted: false })).toBe('no-country');
  });
});
