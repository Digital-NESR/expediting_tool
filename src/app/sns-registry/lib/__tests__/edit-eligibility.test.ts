import { describe, expect, it } from 'vitest';
import type { BaseStatus } from '../types';

/**
 * Which statuses a record may be edited in, and what an edit costs.
 *
 * Mirrors updateSnsRecord. The line is the Registry ID: before one exists
 * nothing outside the registry can be referencing the record, so there is
 * nothing to break. After it exists the record is the documented justification
 * for bypassing the three-quote policy — two named people validated a specific
 * text, and the ID encodes the classification, country, supplier and validity
 * window it was minted with.
 */
function isEditable(base: BaseStatus): boolean {
  return (
    base === 'Draft' ||
    base === 'Rejected' ||
    base === 'Pending Level 1' ||
    base === 'Pending Level 2'
  );
}

/** Where an edited record lands. */
function statusAfterEdit(base: BaseStatus): BaseStatus {
  return base === 'Pending Level 2' ? 'Pending Level 1' : base;
}

/** A record in a validator's queue is held to the full submission rules. */
function mustBeComplete(base: BaseStatus): boolean {
  return base === 'Pending Level 1' || base === 'Pending Level 2';
}

const ALL: BaseStatus[] = [
  'Draft',
  'Pending Level 1',
  'Pending Level 2',
  'Rejected',
  'Active',
  'Extended',
  'Expired',
  'Closed',
];

describe('which records can be edited', () => {
  it('allows everything that has no Registry ID yet', () => {
    expect(ALL.filter(isEditable)).toEqual([
      'Draft',
      'Pending Level 1',
      'Pending Level 2',
      'Rejected',
    ]);
  });

  it('refuses every published status', () => {
    for (const base of ['Active', 'Extended', 'Expired', 'Closed'] as BaseStatus[]) {
      expect(isEditable(base)).toBe(false);
    }
  });
});

describe('what an edit does to the status', () => {
  it('sends a record that cleared Level 1 back to Level 1', () => {
    // Otherwise the Country Supply Chain Manager's validation would stand
    // against text they never read, and Level 2 would sign off a record only
    // one of its two validators had seen.
    expect(statusAfterEdit('Pending Level 2')).toBe('Pending Level 1');
  });

  it('leaves a record still awaiting its first validation where it is', () => {
    // Nothing has been validated yet, so there is nothing to invalidate.
    expect(statusAfterEdit('Pending Level 1')).toBe('Pending Level 1');
  });

  it('does not resubmit a draft or a rejected record', () => {
    // Submitting stays the requestor's own explicit decision.
    expect(statusAfterEdit('Draft')).toBe('Draft');
    expect(statusAfterEdit('Rejected')).toBe('Rejected');
  });
});

describe('how complete an edit has to leave the record', () => {
  it('holds a queued record to the submission rules', () => {
    // Editing it down to something incomplete would leave it in the queue in a
    // state that could never be signed off.
    expect(mustBeComplete('Pending Level 1')).toBe(true);
    expect(mustBeComplete('Pending Level 2')).toBe(true);
  });

  it('lets a draft or a rejected record stay half-finished', () => {
    expect(mustBeComplete('Draft')).toBe(false);
    expect(mustBeComplete('Rejected')).toBe(false);
  });
});
