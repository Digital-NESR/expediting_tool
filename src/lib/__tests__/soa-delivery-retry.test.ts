import { describe, expect, it } from 'vitest';
import { isRetryable } from '@/lib/soa/delivery';

/**
 * Which refused sends "Retry failed sends" actually writes to.
 *
 * The cost of getting this wrong runs in both directions: too narrow and a supplier who was never
 * written to is silently dropped from the quarter, too wide and a supplier who already has their
 * letter is mailed a second copy off the back of a failure that was since made good.
 */
describe('isRetryable', () => {
  it('retries a first letter that never went', () => {
    expect(isRetryable('request', 'scoped')).toBe(true);
  });

  it('retries a reminder that never went', () => {
    expect(isRetryable('reminder', 'requested')).toBe(true);
  });

  it('leaves a failure that a later attempt made good', () => {
    // The request failed once and then succeeded, which is what moved the vendor off `scoped`.
    expect(isRetryable('request', 'requested')).toBe(false);
    expect(isRetryable('reminder', 'reminded')).toBe(false);
  });

  it('never writes to a vendor who has answered or been flagged', () => {
    for (const status of ['received', 'non_responder']) {
      expect(isRetryable('request', status)).toBe(false);
      expect(isRetryable('reminder', status)).toBe(false);
    }
  });

  it('does not treat a refused reminder as owing a first letter', () => {
    expect(isRetryable('reminder', 'scoped')).toBe(false);
  });
});
