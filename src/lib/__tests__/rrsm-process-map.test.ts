import { describe, expect, it } from 'vitest';
import { describeCountry, recurrentSteps, rentalSteps } from '@/lib/rrsm/process-map';

const titles = (s: { supplier: boolean; ops: boolean }) => rentalSteps(s).map((x) => x.title);

describe('rentalSteps', () => {
  it('runs every step where both validations are on (UAE, Oman)', () => {
    expect(titles({ supplier: true, ops: true })).toEqual([
      'Open the month',
      'Invite the suppliers',
      'Confirm the month',
      'Accept or reject rate changes',
      'Send the lines to Ops',
      'Validate what was used',
      'Link each line to its PR',
      'PO, approval and GR fill in',
      'Close the month',
    ]);
  });

  it('goes straight from opening to PR & PO with neither step (Kuwait)', () => {
    const t = titles({ supplier: false, ops: false });
    expect(t).not.toContain('Invite the suppliers');
    expect(t).not.toContain('Send the lines to Ops');
    expect(t[0]).toBe('Open the month');
    expect(t).toContain('Check the quantities');
    expect(t.at(-1)).toBe('Close the month');
    expect(rentalSteps({ supplier: false, ops: false })[0].detail).toContain('"Validated"');
  });

  it('skips the supplier but keeps Ops, opening at Submitted', () => {
    const steps = rentalSteps({ supplier: false, ops: true });
    expect(steps.map((s) => s.title)).toContain('Validate what was used');
    expect(steps.map((s) => s.title)).not.toContain('Confirm the month');
    expect(steps[0].detail).toContain('"Submitted"');
  });

  it('marks the Ops return loop', () => {
    const ops = rentalSteps({ supplier: true, ops: true }).find((s) => s.actor === 'ops');
    expect(ops?.loop).toMatch(/back to the buyer/);
  });
});

describe('recurrentSteps and describeCountry', () => {
  it('says when reminders are off', () => {
    expect(recurrentSteps({ reminders: false })[1].where).toMatch(/off/);
  });

  it('describes each kind of country in one line', () => {
    expect(
      describeCountry({
        supplier: false,
        ops: false,
        rentals: true,
        recurrent: false,
        reminders: false,
      }),
    ).toBe('Rentals: no validation steps, straight to PR & PO');
    expect(
      describeCountry({
        supplier: true,
        ops: true,
        rentals: false,
        recurrent: true,
        reminders: false,
      }),
    ).toBe('Recurrent services, reminders off');
  });
});
