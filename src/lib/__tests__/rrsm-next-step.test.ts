import { describe, expect, it } from 'vitest';
import { nextActions, type NextLine } from '@/lib/rrsm/next-step';

const line = (p: Partial<NextLine> = {}): NextLine => ({
  stage: 'submitted',
  changeStatus: null,
  returnedTo: null,
  opsSentAt: null,
  opsValidator: null,
  prNumber: '',
  prAuto: null,
  poNumber: '',
  ...p,
});
const ALL = { supplier: true, ops: true };
const NONE = { supplier: false, ops: false };
const keys = (l: NextLine[], s = ALL) => nextActions(l, s).map((a) => a.key);

describe('nextActions', () => {
  it('puts what only the buyer can unblock first', () => {
    const k = keys([
      line({ stage: 'returned', returnedTo: 'buyer' }),
      line({ changeStatus: 'pending' }),
      line({ opsValidator: { email: 'a@x' } }),
      line({ stage: 'validated', prNumber: '1', poNumber: '5' }),
    ]);
    expect(k.slice(0, 3)).toEqual(['returned', 'changes', 'send-usual']);
    expect(k).toContain('close');
  });

  it('offers the one-click send when lines have a usual validator', () => {
    const [a] = nextActions([line({ opsValidator: { email: 'a@x' } }), line()], ALL);
    expect(a.key).toBe('send-usual');
    expect(a.do).toEqual({ kind: 'sendUsual' });
    expect(a.detail).toMatch(/1 more need a validator/);
  });

  it('never asks a Kuwait buyer to send to Ops or wait on suppliers', () => {
    const k = keys([line({ stage: 'validated' }), line({ stage: 'awaiting_supplier' })], NONE);
    expect(k).not.toContain('send-usual');
    expect(k).not.toContain('send-pick');
    expect(k).not.toContain('suppliers');
    expect(k[0]).toBe('no-pr');
  });

  it('asks to check uncertain auto-linked PRs before plain missing ones', () => {
    const k = keys(
      [line({ stage: 'validated', prNumber: '1', prAuto: 'near' }), line({ stage: 'validated' })],
      NONE,
    );
    expect(k.indexOf('pr-check')).toBeLessThan(k.indexOf('no-pr'));
  });

  it('says the month is closed when every line is', () => {
    const [a] = nextActions([line({ stage: 'closed' })], ALL);
    expect(a.tone).toBe('done');
  });

  it('lists waiting-on-others last', () => {
    const acts = nextActions(
      [
        line({ stage: 'awaiting_supplier' }),
        line({ opsSentAt: '2026-11-25', prNumber: '1' }),
        line({ stage: 'validated', prNumber: '2' }),
      ],
      ALL,
    );
    const firstWait = acts.findIndex((a) => a.tone === 'wait');
    expect(acts.slice(firstWait).every((a) => a.tone === 'wait')).toBe(true);
  });
});
