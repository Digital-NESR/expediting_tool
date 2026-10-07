import { describe, expect, it } from 'vitest';
import { REASON_OTHER } from '../constants';
import { reasonLabel } from '../helpers';
import { diffDraft } from '../diff';
import { validateForSubmission } from '../validate';
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
    reason: 'Active contract',
    reasonOther: '',
    justification: 'Sole licensed distributor in country.',
    expiry: '2027-03-15',
    ...over,
  };
}

describe('the Other reason code', () => {
  it('is spelled the one way everything matches on', () => {
    expect(REASON_OTHER).toBe('Other');
  });

  it('blocks submission when Other is picked and nothing is written', () => {
    const missing = validateForSubmission(draft({ reason: REASON_OTHER }));
    expect(missing).toContain('a written reason');
  });

  it('treats a box of spaces as empty', () => {
    const missing = validateForSubmission(draft({ reason: REASON_OTHER, reasonOther: '   ' }));
    expect(missing).toContain('a written reason');
  });

  it('lets the record through once a reason is written', () => {
    const d = draft({ reason: REASON_OTHER, reasonOther: 'Court-ordered single supplier.' });
    expect(validateForSubmission(d)).toEqual([]);
  });

  it('asks for the code before the sentence when neither is set', () => {
    const missing = validateForSubmission(draft({ reason: '', reasonOther: '' }));
    expect(missing).toContain('reason code');
    expect(missing).not.toContain('a written reason');
  });

  it('does not ask for a sentence under a listed code', () => {
    expect(validateForSubmission(draft({ reasonOther: '' }))).toEqual([]);
  });
});

describe('how a reason reads', () => {
  it('shows a listed code as it stands', () => {
    expect(reasonLabel('Active contract', '')).toBe('Active contract');
  });

  it('shows the written reason beside Other', () => {
    expect(reasonLabel(REASON_OTHER, 'Court-ordered single supplier')).toBe(
      'Other — Court-ordered single supplier',
    );
  });

  it('falls back to the bare code when the sentence is missing', () => {
    expect(reasonLabel(REASON_OTHER, '')).toBe(REASON_OTHER);
    expect(reasonLabel(REASON_OTHER, null)).toBe(REASON_OTHER);
    expect(reasonLabel(REASON_OTHER, undefined)).toBe(REASON_OTHER);
  });

  it('never attaches a stray sentence to a listed code', () => {
    expect(reasonLabel('Active contract', 'left over')).toBe('Active contract');
  });
});

describe('a changed written reason on the audit trail', () => {
  it('is recorded like any other field', () => {
    const before = draft({ reason: REASON_OTHER, reasonOther: 'Court order.' });
    const after = draft({ reason: REASON_OTHER, reasonOther: 'Court order, case 12/2027.' });
    expect(diffDraft(before, after)).toEqual([
      'Written reason: Court order. → Court order, case 12/2027.',
    ]);
  });

  it('records the code and the sentence separately when both move', () => {
    const before = draft({ reason: REASON_OTHER, reasonOther: 'Court order.' });
    const after = draft({ reason: 'Active contract', reasonOther: '' });
    expect(diffDraft(before, after)).toEqual([
      'Reason code: Other → Active contract',
      'Written reason: Court order. → (blank)',
    ]);
  });
});
