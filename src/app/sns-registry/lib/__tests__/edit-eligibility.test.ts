import { describe, expect, it } from 'vitest';
import type { BaseStatus } from '../types';

/**
 * Which statuses an unapproved record may be edited in, and why the rest may
 * not.
 *
 * Mirrors the gate in updateSnsRecord. A published record is the documented
 * justification for bypassing the three-quote policy: two named people
 * validated a specific text, and the Registry ID encodes the classification,
 * country, supplier and validity window it was minted with. Editing one after
 * the fact leaves an ID contradicting its own record and a sign-off attesting
 * to a document that no longer exists — the periodic review exists for that.
 */
function isEditable(base: BaseStatus): boolean {
  return base === 'Draft' || base === 'Rejected';
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
  it('allows a draft — nothing downstream depends on it', () => {
    expect(isEditable('Draft')).toBe(true);
  });

  it('allows a rejected record — revising it is the point of sending it back', () => {
    expect(isEditable('Rejected')).toBe(true);
  });

  it('refuses a record sitting with a validator', () => {
    expect(isEditable('Pending Level 1')).toBe(false);
    expect(isEditable('Pending Level 2')).toBe(false);
  });

  it('refuses every published status — the ID and the sign-off are fixed', () => {
    for (const base of ['Active', 'Extended', 'Expired', 'Closed'] as BaseStatus[]) {
      expect(isEditable(base)).toBe(false);
    }
  });

  it('refuses everything that is not explicitly allowed', () => {
    expect(ALL.filter(isEditable)).toEqual(['Draft', 'Rejected']);
  });
});
