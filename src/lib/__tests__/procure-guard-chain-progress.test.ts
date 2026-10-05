import { describe, expect, it } from 'vitest';
import {
  daysWaiting,
  resolveChainProgress,
  waitingSince,
  type ChainActivityRow,
} from '@/lib/procure-guard/chain-progress';
import { getWorkflowSteps } from '@/lib/procureGuard-utils';

/** The live chain for an advance between the two gates: four reviews, then the milestone. */
const STEPS = getWorkflowSteps('advance', 78_615, 'USD').filter((s) => s.status !== 'Under Review');

const move = (to: string, actor: string, at: string, extra: Partial<ChainActivityRow> = {}) => ({
  action: `Status updated to ${to}`,
  actor_name: actor,
  created_at: at,
  ...extra,
});

describe('resolveChainProgress', () => {
  it('gives the first step the decision that closed it, not the status it waited in', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Adila Harib Al Ismaili', '2026-09-29T17:36:00Z', {
        notes: 'approved',
      }),
    ]);

    expect(STEPS[0].label).toBe('Country Finance Review');
    expect(outcomes.get(0)).toEqual({
      kind: 'approved',
      actor: 'Adila Harib Al Ismaili',
      onBehalfOf: null,
      at: '2026-09-29T17:36:00Z',
      comment: 'approved',
    });
    // The supply chain director has not acted, so their step carries nothing.
    expect(outcomes.has(1)).toBe(false);
  });

  it('walks the whole chain and credits each approver with their own step', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Adila', '2026-09-29T10:00:00Z'),
      move('Approved by Supply Chain Director', 'Nader', '2026-09-30T10:00:00Z'),
      move('Approved by Treasury Director', 'Rami', '2026-10-01T10:00:00Z'),
      move('Approved', 'Corporate Controller', '2026-10-02T10:00:00Z'),
    ]);

    expect([...outcomes.keys()].sort()).toEqual([0, 1, 2, 3]);
    expect(outcomes.get(1)?.actor).toBe('Nader');
    expect(outcomes.get(2)?.actor).toBe('Rami');
    // The last transition closes the corporate controller's step; the milestone is index 4.
    expect(STEPS[3].label).toBe('Corporate Controller Review');
    expect(outcomes.get(3)?.kind).toBe('approved');
  });

  it('reads the log oldest first even when it arrives newest first', () => {
    const newestFirst = [
      move('Approved by Supply Chain Director', 'Nader', '2026-09-30T10:00:00Z'),
      move('Approved by Country Controller', 'Adila', '2026-09-29T10:00:00Z'),
    ];
    const outcomes = resolveChainProgress(STEPS, newestFirst);
    expect(outcomes.get(0)?.actor).toBe('Adila');
    expect(outcomes.get(1)?.actor).toBe('Nader');
  });

  it('stops at a rejection, so later steps read as never reached', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Adila', '2026-09-29T10:00:00Z'),
      move('Rejected', 'Nader', '2026-09-30T10:00:00Z', { notes: 'Funding not available' }),
      // Nothing can follow a rejection, but a stray row must not resurrect the chain.
      move('Approved by Treasury Director', 'Ghost', '2026-10-01T10:00:00Z'),
    ]);

    expect(outcomes.get(1)).toMatchObject({ kind: 'rejected', comment: 'Funding not available' });
    expect(outcomes.has(2)).toBe(false);
  });

  it('starts the chain over when a rejected request is resubmitted', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Adila', '2026-09-29T10:00:00Z'),
      move('Rejected', 'Nader', '2026-09-30T10:00:00Z'),
      move('Submitted', 'Mohammed Kamran', '2026-10-01T09:00:00Z'),
      move('Approved by Country Controller', 'Adila', '2026-10-01T12:00:00Z'),
    ]);

    // The rejection belongs to the previous round and stays in the activity log, not the chain.
    expect(outcomes.get(1)).toBeUndefined();
    expect(outcomes.get(0)).toMatchObject({ kind: 'approved', at: '2026-10-01T12:00:00Z' });
  });

  it('does not treat a legacy move into Under Review as an approval', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Under Review', 'Adila', '2026-09-29T09:00:00Z'),
      move('Approved by Country Controller', 'Adila', '2026-09-29T17:36:00Z'),
    ]);

    expect(outcomes.size).toBe(1);
    expect(outcomes.get(0)?.at).toBe('2026-09-29T17:36:00Z');
  });

  it('keeps the delegation attribution the log recorded', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Said Al Harthi', '2026-09-29T10:00:00Z', {
        on_behalf_of_name: 'Adila Harib Al Ismaili',
      }),
    ]);
    expect(outcomes.get(0)?.onBehalfOf).toBe('Adila Harib Al Ismaili');
  });

  it('falls back to the email, then to Unknown, so a block never renders blank', () => {
    const byEmail = resolveChainProgress(STEPS, [
      {
        action: 'Status updated to Approved by Country Controller',
        actor_name: null,
        actor_email: 'a@nesr.com',
        created_at: '2026-09-29T10:00:00Z',
      },
    ]);
    expect(byEmail.get(0)?.actor).toBe('a@nesr.com');

    const neither = resolveChainProgress(STEPS, [
      {
        action: 'Status updated to Approved by Country Controller',
        created_at: '2026-09-29T10:00:00Z',
      },
    ]);
    expect(neither.get(0)?.actor).toBe('Unknown');
  });

  it('ignores log rows that are not transitions', () => {
    const outcomes = resolveChainProgress(STEPS, [
      { action: 'Attachment uploaded', actor_name: 'Mohammed', created_at: '2026-09-29T09:00:00Z' },
      { action: 'Request edited', actor_name: 'Mohammed', created_at: '2026-09-29T09:30:00Z' },
    ]);
    expect(outcomes.size).toBe(0);
  });

  it('returns nothing for an empty chain or an empty log', () => {
    expect(resolveChainProgress([], [move('Approved', 'X', '2026-01-01T00:00:00Z')]).size).toBe(0);
    expect(resolveChainProgress(STEPS, []).size).toBe(0);
  });
});

describe('waitingSince', () => {
  it('counts from the previous approval', () => {
    const outcomes = resolveChainProgress(STEPS, [
      move('Approved by Country Controller', 'Adila', '2026-09-29T17:36:00Z'),
    ]);
    expect(waitingSince(outcomes, 1, '2026-09-20T08:00:00Z')).toBe('2026-09-29T17:36:00Z');
  });

  it('counts from submission when nobody has acted yet', () => {
    expect(waitingSince(new Map(), 0, '2026-09-20T08:00:00Z')).toBe('2026-09-20T08:00:00Z');
  });

  it('returns null when there is nothing to count from', () => {
    expect(waitingSince(new Map(), 0, null)).toBeNull();
  });
});

describe('daysWaiting', () => {
  it('counts whole days', () => {
    expect(daysWaiting('2026-09-29T17:36:00Z', new Date('2026-10-05T18:00:00Z'))).toBe(6);
    expect(daysWaiting('2026-10-05T08:00:00Z', new Date('2026-10-05T18:00:00Z'))).toBe(0);
  });

  it('never reports a negative wait, and survives an unparseable date', () => {
    expect(daysWaiting('2026-10-09T00:00:00Z', new Date('2026-10-05T00:00:00Z'))).toBe(0);
    expect(daysWaiting('not a date')).toBe(0);
  });
});
